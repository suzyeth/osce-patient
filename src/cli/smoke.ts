/**
 * Plays three scripted turns of the demo case against the real Nemotron models, with a tight cap.
 * Usage: npm run smoke   (needs NEBIUS_API_KEY in .env; costs well under one US cent)
 */
import { appendTurn, runTurn } from '../orchestrator.js';
import { initialSessionState } from '../state.js';
import { describeConfigError, loadConfig, loadDotEnv, type NebiusConfig } from '../nebius/config.js';
import { createNemotronSession } from '../nebius/session.js';
import { loadCaseFile } from './loadCaseFile.js';
import type { ConversationTurn } from '../llm.js';

const SMOKE_BUDGET_USD = 0.02;
const LINES = [
  "Hello, I'm one of the doctors. Is it okay if I ask you some questions?",
  'What brings you in today?',
  'Do you smoke?',
];

function smokeConfig(): NebiusConfig {
  loadDotEnv();
  try {
    return { ...loadConfig(), sessionBudgetUsd: SMOKE_BUDGET_USD };
  } catch (e) {
    console.error(`The smoke test needs a valid .env (see .env.example): ${describeConfigError(e)}`);
    process.exit(2);
  }
}

const loaded = loadCaseFile('cases/demo-cough.json');
if (!loaded.ok) {
  console.error(loaded.message);
  process.exit(2);
}
const config = smokeConfig();
const session = createNemotronSession(config);
console.log(`Judge ${config.judgeModel}, patient ${config.patientModel}, cap $${SMOKE_BUDGET_USD}\n`);

let state = initialSessionState();
let history: readonly ConversationTurn[] = [];
for (const line of LINES) {
  const r = await runTurn(loaded.patientCase, state, line, session.judge, session.patient, [...history]);
  state = r.state;
  history = appendTurn(history, line, r);
  console.log(`You: ${line}\nPatient: ${r.reply}`);
  console.log(
    `  covered: ${r.verdict?.rubricItemIds.join(', ') || '-'} | unlocked: ${r.newlyUnlocked.join(', ') || '-'} | guard: ${r.guardTriggered}\n`,
  );
}
const s = session.summary();
const slowest = Math.max(...session.usage().map((u) => u.latencyMs));
console.log(`${s.calls} calls, ${s.inputTokens} input / ${s.outputTokens} output tokens, about $${s.costUsd.toFixed(5)}; slowest call ${slowest} ms`);
