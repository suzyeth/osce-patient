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
import { appendTurn, runTurn } from '../orchestrator.js';
import type { ConversationTurn } from '../llm.js';
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

/**
 * A finished station for anyone without a code, and the only thing most visitors will see.
 *
 * It is a real session, played offline against the keyword doubles, not a hand-made state. The old
 * version set rubricHits directly with an empty transcript, so every covered item in the sample came
 * back with no quote: the public demonstration of a tool whose whole claim is that a mark carries the
 * words that earned it was a page full of marks with nothing behind them. It also hard-coded clinical
 * item ids, so a non-clinical case would have shown nothing covered at all.
 *
 * The questions are the case's own example questions, so this works for any domain pack, and it
 * deliberately leaves the later items unasked so the sample shows misses as well as hits.
 */
async function sampleReport(all: Record<string, PatientCase>) {
  const patientCase = Object.values(all)[0]!;
  const judge = offlineJudge();
  const patient = offlinePatient();
  let state = initialSessionState();
  let history: ConversationTurn[] = [];
  for (const item of patientCase.rubric.slice(0, 5)) {
    const result = await runTurn(patientCase, state, item.exampleQuestion, judge, patient, history);
    state = result.state;
    history = appendTurn(history, item.exampleQuestion, result);
  }
  return { caseTitle: patientCase.title, report: computeReport(patientCase, state), transcript: history };
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
// Played once at startup, so every visitor sees the same session and no request pays for it.
const sample = await sampleReport(all);
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
  sampleReport: () => sample,
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

// Node's default request-header limit is 16 KB, and the session can legitimately use several
// cookies. Raising it here is the difference between a long station working and every request
// failing with 431; MAX_COOKIE_CHUNKS keeps the state inside this.
const MAX_HEADER_BYTES = 32 * 1024;

createServer({ maxHeaderSize: MAX_HEADER_BYTES }, (req, res) => {
  const path = (req.url ?? '/').split('?')[0] ?? '/';
  if (!path.startsWith('/api/')) {
    serveFile(path, res);
    return;
  }
  void (async () => {
    const response = await handleApi(await toRequest(req), deps);
    const headers: Record<string, string | string[]> = {};
    response.headers.forEach((value, name) => {
      if (name === 'set-cookie') return;
      headers[name] = value;
    });
    // The state does not fit in one cookie, so a response can set several. They have to stay
    // separate headers: forEach() joins them with a comma, which the browser then reads as one
    // malformed cookie and drops, and the station silently fails to resume.
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) {
      // Cookies are marked Secure; over plain http on localhost the browser would refuse them.
      const local = req.headers.host?.startsWith('localhost') ?? false;
      headers['set-cookie'] = local ? cookies.map((c) => c.replace('; Secure', '')) : cookies;
    }
    res.writeHead(response.status, headers).end(Buffer.from(await response.arrayBuffer()));
  })().catch((e: unknown) => {
    // Without this, anything escaping a handler was an unhandled rejection, which takes the whole
    // process down and with it every other station in progress. One request must not do that.
    console.error('Request failed:', e);
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Something went wrong on the server. Please start again.' }));
    } else {
      res.end();
    }
  });
}).listen(PORT, () => {
  console.log(`Station at http://localhost:${PORT}`);
  const models = nebius ? `${nebius.judgeModel} / ${nebius.patientModel}` : offline ? 'offline doubles (no cost, no safety model)' : 'none (sample report only)';
  console.log(`Cases: ${Object.keys(all).join(', ')}. Models: ${models}.`);
  console.log(`Caps: $${limits.sessionBudgetUsd} a station, $${limits.dailyBudgetUsd} a day, ${limits.maxTurns} turns.`);
});
