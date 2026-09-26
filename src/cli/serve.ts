/**
 * The practice station as a web page. Serves public/ and the API from src/web/router.ts.
 * Usage: npm run serve            (needs NEBIUS_API_KEY, OSCE_ACCESS_CODE and OSCE_SESSION_SECRET in .env)
 * The key never leaves this process: the browser only ever sends the candidate's line.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { readdirSync } from 'node:fs';
import { createBudget } from '../nebius/budget.js';
import { createChat } from '../nebius/chat.js';
import { describeConfigError, loadConfig, loadDotEnv, type NebiusConfig } from '../nebius/config.js';
import { createNemotronJudge } from '../nebius/judgeClient.js';
import { createNemotronPatient } from '../nebius/patientClient.js';
import { createNemotronSafety } from '../nebius/safetyClient.js';
import { offlineJudge, offlinePatient } from '../offline.js';
import { computeReport } from '../report.js';
import { initialSessionState } from '../state.js';
import { validateCase } from '../validateCase.js';
import { loadWebLimits } from '../web/limits.js';
import { handleApi, type StationClients, type WebDeps } from '../web/router.js';
import { loadCaseFile } from './loadCaseFile.js';
import type { PatientCase } from '../types.js';

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_DIR = 'public';
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

loadDotEnv();

function config(): NebiusConfig | null {
  try {
    return loadConfig();
  } catch (e) {
    console.warn(`No models: ${describeConfigError(e)}. The sample report still works.`);
    return null;
  }
}

function cases(): Record<string, PatientCase> {
  const found: Record<string, PatientCase> = {};
  for (const name of readdirSync('cases').filter((n) => n.endsWith('.json'))) {
    const loaded = loadCaseFile(join('cases', name));
    if (!loaded.ok) {
      console.error(loaded.message);
      process.exit(2);
    }
    const { errors } = validateCase(loaded.patientCase);
    if (errors.length) {
      console.error(`Case ${loaded.patientCase.id} failed validation; run npm run check-case.`);
      process.exit(1);
    }
    found[loaded.patientCase.id] = loaded.patientCase;
  }
  return found;
}

/** A finished station for anyone without a code: real scoring, from a fixed set of covered items. */
function sampleReport(all: Record<string, PatientCase>) {
  const patientCase = Object.values(all)[0]!;
  const covered = ['intro_consent', 'open_question', 'onset_duration', 'smoking', 'closing'];
  const state = {
    ...initialSessionState(),
    trust: 62,
    turnsUsed: 9,
    empathyCount: 2,
    rubricHits: Object.fromEntries(patientCase.rubric.filter((r) => covered.includes(r.id)).map((r, i) => [r.id, i + 1])),
  };
  return { caseTitle: patientCase.title, report: computeReport(patientCase, state), transcript: [] };
}

function stationClients(nebius: NebiusConfig, remainingUsd: number, dailyBudgetUsd: number): StationClients {
  // A budget per station: what is left of this station's cap, under the site's daily cap.
  const budget = createBudget({ ...nebius, sessionBudgetUsd: Math.max(remainingUsd, 0.000001), dailyBudgetUsd });
  let spent = 0;
  const chat = createChat({ config: nebius, budget, onUsage: (u) => (spent += u.costUsd) });
  return {
    judge: createNemotronJudge(chat, { model: nebius.judgeModel, maxTokens: nebius.judgeMaxTokens, thinking: nebius.judgeThinking }),
    patient: createNemotronPatient(chat, { model: nebius.patientModel, maxTokens: nebius.patientMaxTokens, thinking: nebius.patientThinking }),
    safety: createNemotronSafety(chat, { model: nebius.safetyModel, maxTokens: nebius.safetyMaxTokens, thinking: nebius.safetyThinking }),
    spentUsd: () => spent,
  };
}

// A free mode for development and for a demo that must not depend on the network.
const offline = (process.env.OSCE_WEB_OFFLINE ?? '').toLowerCase() === 'on';
const nebius = offline ? null : config();
const limits = loadWebLimits();
const all = cases();
const deps: WebDeps = {
  limits,
  secret: process.env.OSCE_SESSION_SECRET ?? '',
  cases: all,
  clientsFor: nebius
    ? (remaining) => stationClients(nebius, remaining, limits.dailyBudgetUsd)
    : offline
      ? () => ({ judge: offlineJudge(), patient: offlinePatient(), spentUsd: () => 0 })
      : null,
  now: () => Date.now(),
  sampleReport: () => sampleReport(all),
};
if (deps.secret.length < 16) {
  console.error('OSCE_SESSION_SECRET must be at least 16 characters: it seals each station in a cookie.');
  process.exit(2);
}

/** Only files that exist under public/, never a path that climbs out of it. */
function serveFile(path: string, res: ServerResponse): void {
  const wanted = normalize(join(PUBLIC_DIR, path === '/' ? 'index.html' : path));
  if (!wanted.startsWith(normalize(PUBLIC_DIR))) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const file = readFileSync(wanted);
    res.writeHead(200, { 'content-type': TYPES[extname(wanted)] ?? 'application/octet-stream' }).end(file);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const url = `http://localhost:${PORT}${req.url ?? '/'}`;
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value);
  return new Request(url, {
    method: req.method,
    headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  });
}

createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0] ?? '/';
  if (!path.startsWith('/api/')) {
    serveFile(path, res);
    return;
  }
  void (async () => {
    const response = await handleApi(await toRequest(req), deps);
    const headers: Record<string, string | string[]> = {};
    response.headers.forEach((value, name) => {
      // Cookies are marked Secure; over plain http on localhost the browser still keeps them.
      headers[name] = name === 'set-cookie' && !req.headers.host?.startsWith('localhost') ? value : value.replace('; Secure', '');
    });
    res.writeHead(response.status, headers).end(Buffer.from(await response.arrayBuffer()));
  })();
}).listen(PORT, () => {
  console.log(`Station at http://localhost:${PORT}`);
  const models = nebius ? `${nebius.judgeModel} / ${nebius.patientModel}` : offline ? 'offline doubles (no cost, no safety model)' : 'none (sample report only)';
  console.log(`Cases: ${Object.keys(all).join(', ')}. Models: ${models}.`);
  console.log(`Caps: $${limits.sessionBudgetUsd} a station, $${limits.dailyBudgetUsd} a day, ${limits.maxTurns} turns.`);
});
