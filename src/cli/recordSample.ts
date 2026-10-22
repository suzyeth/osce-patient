/**
 * Records the public sample station against the real Nemotron models and saves it, so the site can
 * replay real replies at no cost per visit (see src/recordedSession.ts).
 * Usage: npm run record-sample   (needs NEBIUS_API_KEY in .env; costs about one US cent)
 *
 * The questions cover the opening, the history and the hidden concern, and deliberately never ask
 * about the legs, so the sample shows a missed critical item as well as earned marks.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { appendTurn, runTurn } from '../orchestrator.js';
import { initialSessionState } from '../state.js';
import { describeConfigError, loadConfig, loadDotEnv } from '../nebius/config.js';
import { createNemotronSession } from '../nebius/session.js';
import { loadCaseFile } from './loadCaseFile.js';
import type { ConversationTurn } from '../llm.js';
import type { RecordedSession } from '../recordedSession.js';

const CASE_FILE = 'cases/case-res0001.json';
const OUT_DIR = 'samples';
const BUDGET_USD = 0.03;
// Each question asks only for what the case holds. Asked "does anything make it better?" or "any
// other medical problems?", the patient answered with denials the case never gives ("nothing makes
// it better"), which is the one thing this tool says it does not do.
const LINES = [
  "Hello, I'm one of the doctors. Is it okay if I ask you a few questions today?",
  "What's brought you in today?",
  'When did this start?',
  'Can you describe the pain for me?',
  'Have you had any operations recently?',
  'Do you smoke or drink at all?',
  "That sounds really worrying. Is there anything in particular you're concerned this could be?",
];

loadDotEnv();
let config;
try {
  config = { ...loadConfig(), sessionBudgetUsd: BUDGET_USD };
} catch (e) {
  console.error(`Recording the sample needs a valid .env (see .env.example): ${describeConfigError(e)}`);
  process.exit(2);
}
const loaded = loadCaseFile(CASE_FILE);
if (!loaded.ok) {
  console.error(loaded.message);
  process.exit(2);
}
const session = createNemotronSession(config);
let state = initialSessionState();
let history: ConversationTurn[] = [];
const turns: RecordedSession['turns'] = [];
for (const line of LINES) {
  const r = await runTurn(loaded.patientCase, state, line, session.judge, session.patient, [...history], session.safety);
  if (r.safetyBlocked || !r.verdict) {
    console.error(`The safety check paused on "${line}"; change the line and record again.`);
    process.exit(1);
  }
  state = r.state;
  history = appendTurn(history, line, r);
  turns.push({ input: line, verdict: r.verdict, reply: r.reply });
  console.log(`You: ${line}\nPatient: ${r.reply}\n`);
}
const recording: RecordedSession = {
  caseId: loaded.patientCase.id,
  recordedAt: new Date().toISOString(),
  models: `judge ${config.judgeModel}, patient ${config.patientModel}`,
  turns,
};
mkdirSync(OUT_DIR, { recursive: true });
const out = `${OUT_DIR}/${loaded.patientCase.id}.json`;
writeFileSync(out, JSON.stringify(recording, null, 2) + '\n');
console.log(`Saved ${out}. About $${session.summary().costUsd.toFixed(5)}.`);
