import { createInterface } from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { initialSessionState } from '../state.js';
import { appendTurn, runTurn } from '../orchestrator.js';
import { offlineJudge, offlinePatient } from '../offline.js';
import { computeReport } from '../report.js';
import { formatReport } from '../formatReport.js';
import { validateCase } from '../validateCase.js';
import { loadCaseFile } from './loadCaseFile.js';
import type { ConversationTurn } from '../llm.js';
import type { SessionState } from '../types.js';

const path = process.argv[2] ?? 'cases/demo-cough.json';
const loaded = loadCaseFile(path);
if (!loaded.ok) {
  console.error(loaded.message);
  process.exit(2);
}
const patientCase = loaded.patientCase;
const { errors } = validateCase(patientCase);
if (errors.length) {
  console.error(`Case ${patientCase.id} failed validation (run npm run check-case for details):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

const judge = offlineJudge();
const patient = offlinePatient();
// The async line iterator buffers input, so piped lines are never dropped while a turn runs.
const rl = createInterface({ input, output });

console.log(patientCase.candidateBrief);
console.log('(offline mode; type /end to finish)\n');
console.log(`${patientCase.patient.name}: ${patientCase.patient.openingLine}`);

const started = Date.now();
let state: SessionState = initialSessionState();
let history: readonly ConversationTurn[] = [];

function secondsLeft(): number {
  return patientCase.durationSeconds - Math.floor((Date.now() - started) / 1000);
}

function promptWithClock(): void {
  const left = secondsLeft();
  rl.setPrompt(`[${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}] You: `);
  rl.prompt();
}

/** One turn. A model or network error is reported and leaves the session unchanged. */
async function playTurn(line: string): Promise<void> {
  try {
    const r = await runTurn(patientCase, state, line, judge, patient, [...history]);
    state = r.state;
    history = appendTurn(history, line, r);
    // The safety message comes from the tool, not the patient, so it is not shown as their line.
    console.log(r.safetyBlocked ? `\n[Practice paused] ${r.reply}\n` : `${patientCase.patient.name}: ${r.reply}`);
  } catch (e) {
    const firstLine = (e as Error).message.split('\n')[0] ?? '';
    console.error(`(Something went wrong with the model, so nothing was recorded. Please ask again.) ${firstLine}`);
  }
}

let timeUp = secondsLeft() <= 0;
try {
  if (!timeUp) {
    promptWithClock();
    for await (const raw of rl) {
      const line = raw.trim();
      if (line === '/end') break;
      // Check the clock before judging, so a question typed after time is up is not scored.
      timeUp = secondsLeft() <= 0;
      if (timeUp) break;
      if (line) await playTurn(line);
      timeUp = secondsLeft() <= 0;
      if (timeUp) break;
      promptWithClock();
    }
  }
} finally {
  rl.close();
  if (timeUp) console.log('\nTime is up.');
  console.log('\n' + formatReport(computeReport(patientCase, state)));
}
