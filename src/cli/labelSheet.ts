/**
 * Builds a labelling sheet for the agreement evaluation, from a real published consultation.
 *
 * Cohen's kappa between the judge and a person is the one number in the evaluation table that says
 * whether the marking can be trusted, and it is the one that needs someone's hours rather than
 * credit. This makes those hours as cheap as possible, and makes the result worth more than a
 * synthetic set would: the candidate lines are a real doctor's questions from a published
 * transcript, and the replies are the real patient's answers, so nothing in the conversation was
 * written by whoever is being measured.
 *
 * Usage: npm run label-sheet -- cases/case-res0001.json data/raw/transcripts/RES0001.txt
 *        npm run label-sheet -- cases/case-primock-01.json <a PriMock57 patient TextGrid>
 *        [--turns 8] [--max 4]   turns per conversation, and how many conversations
 *
 * It writes eval/labels/<caseId>.todo.json with every items list empty, and a sheet beside it
 * listing the item ids with their labels and example questions. Nothing is pre-filled, not even a
 * keyword guess: a starting point from the tool would bias the labels towards the thing being
 * measured.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { loadCaseFile } from './loadCaseFile.js';
import { parseTranscript, patientTurns, type Transcript } from '../cases/transcript.js';
import { parseConsultation } from '../cases/textgrid.js';
import type { PatientCase } from '../types.js';

const DEFAULT_TURNS = 8;
const DEFAULT_MAX = 4;

function usage(message: string): never {
  console.error(`${message}\n\nUsage: npm run label-sheet -- <case.json> <transcript> [--turns 8] [--max 4]`);
  process.exit(1);
}

function numberAfter(argv: readonly string[], flag: string, fallback: number): number {
  const i = argv.indexOf(flag);
  if (i < 0) return fallback;
  const value = Number(argv[i + 1]);
  if (!Number.isInteger(value) || value < 1) usage(`${flag} needs a whole number above 0.`);
  return value;
}

/** A PriMock57 consultation is a pair of TextGrids; a Fareez transcript is one text file. */
function readTranscript(path: string): Transcript {
  if (!path.endsWith('.TextGrid')) return parseTranscript(basename(path), readFileSync(path, 'utf8'));
  const ref = basename(path).replace(/_(doctor|patient)\.TextGrid$/, '');
  return parseConsultation(
    ref,
    readFileSync(path.replace('_patient.TextGrid', '_doctor.TextGrid'), 'utf8'),
    readFileSync(path.replace('_doctor.TextGrid', '_patient.TextGrid'), 'utf8'),
  );
}

interface SheetTurn {
  student: string;
  patient: string;
  items: string[];
}

/**
 * Pairs each doctor turn with the patient's reply to it. A doctor turn with no reply after it is
 * dropped: the judge is given the reply as history, so a pair without one is not a turn a real
 * session would produce.
 */
function pairs(transcript: Transcript): SheetTurn[] {
  const out: SheetTurn[] = [];
  transcript.turns.forEach((turn, i) => {
    if (turn.speaker !== 'doctor') return;
    const reply = transcript.turns[i + 1];
    if (reply?.speaker !== 'patient') return;
    out.push({ student: turn.text, patient: reply.text, items: [] });
  });
  return out;
}

function chunk(turns: readonly SheetTurn[], size: number, max: number): SheetTurn[][] {
  const out: SheetTurn[][] = [];
  for (let i = 0; i + size <= turns.length && out.length < max; i += size) out.push(turns.slice(i, i + size));
  return out;
}

function sheet(patientCase: PatientCase, transcript: Transcript, conversations: SheetTurn[][]): string {
  const total = conversations.reduce((n, c) => n + c.length, 0);
  return [
    `# Labelling sheet: ${patientCase.id}`,
    '',
    `Source: ${transcript.ref}. ${conversations.length} conversations, ${total} candidate lines in total.`,
    '',
    'Open `eval/labels/' + patientCase.id + '.todo.json` and, for each line, put the ids of the rubric',
    'items that line covers into its `items` list. Most lines cover one; some cover none, and `[]` is',
    'the right answer for those. Judge only what that line asks for, not what the conversation has',
    'covered by then, because that is what the judge is asked to do.',
    '',
    'When it is done, rename it to drop `.todo`, put your name in `labelledBy`, and run:',
    '',
    '```bash',
    `npm run eval -- agreement --online --case cases/${patientCase.id}.json --labels eval/labels/${patientCase.id}.json`,
    '```',
    '',
    '## The items in this case',
    '',
    '| id | what it is | an example question |',
    '|---|---|---|',
    ...patientCase.rubric.map((r) => `| \`${r.id}\` | ${r.label}${r.critical ? ' **(critical)**' : ''} | ${r.exampleQuestion} |`),
    '',
    '## Why the lines look like this',
    '',
    'They are a real doctor’s questions from a published consultation, with the real patient’s replies,',
    'so the conversation was not written by the tool being measured. Transcriber marks and filler are',
    'left as they were recorded.',
    '',
  ].join('\n');
}

const argv = process.argv.slice(2);
const [casePath, transcriptPath] = argv.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
if (casePath === undefined || transcriptPath === undefined) usage('Give a case file and a transcript.');

const loaded = loadCaseFile(casePath);
if (!loaded.ok) {
  console.error(loaded.message);
  process.exit(1);
}
const patientCase = loaded.patientCase;
const transcript = readTranscript(transcriptPath);
const all = pairs(transcript);
const conversations = chunk(all, numberAfter(argv, '--turns', DEFAULT_TURNS), numberAfter(argv, '--max', DEFAULT_MAX));
if (conversations.length === 0) {
  console.error(`${transcript.ref} has ${all.length} doctor-and-reply pairs, too few for one conversation.`);
  process.exit(1);
}

const labels = {
  caseId: patientCase.id,
  labelledBy: 'TODO: your name, before running the agreement evaluation',
  conversations: conversations.map((turns, i) => ({ id: `${transcript.ref}-${i + 1}`, turns })),
};

mkdirSync('eval/labels', { recursive: true });
mkdirSync('docs/case-reviews', { recursive: true });
const jsonPath = join('eval/labels', `${patientCase.id}.todo.json`);
const sheetPath = join('docs/case-reviews', `${patientCase.id}.labels.md`);
writeFileSync(jsonPath, `${JSON.stringify(labels, null, 2)}\n`);
writeFileSync(sheetPath, sheet(patientCase, transcript, conversations));

const lines = conversations.reduce((n, c) => n + c.length, 0);
console.log(`Wrote ${jsonPath} and ${sheetPath}.`);
console.log(`${conversations.length} conversations, ${lines} candidate lines to label, from ${transcript.ref}.`);
console.log(`${patientTurns(transcript).length} patient turns were available; ${all.length} made a doctor-and-reply pair.`);
