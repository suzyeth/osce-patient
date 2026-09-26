/**
 * Turns one Fareez et al. 2022 transcript into a draft case and a review sheet.
 * Usage: npm run build-case -- data/raw/transcripts/RES0001.txt --id res-chest-pain
 *        npm run build-case -- <transcript> --id <id> --draft docs/case-reviews/<id>.draft.json
 * The model only proposes; every quote is checked against the transcript before it is kept, and
 * the case is written with reviewStatus "unreviewed" because no clinician has seen it.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createBudget } from '../nebius/budget.js';
import { createChat } from '../nebius/chat.js';
import { describeConfigError, loadConfig, loadDotEnv, MODELS } from '../nebius/config.js';
import { buildCase, reviewSheet } from '../cases/buildCase.js';
import { extractDraftCase, type DraftCase } from '../cases/extract.js';
import { parseTranscript } from '../cases/transcript.js';
import { parseConsultation } from '../cases/textgrid.js';

const EXTRACT_MAX_TOKENS = 6000;
const CAP_USD = 0.1;

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith('--'));
const value = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!path) {
  console.error('Usage: npm run build-case -- <transcript.txt> --id <case-id> [--draft <draft.json>] [--out cases]');
  process.exit(2);
}
const caseId = value('--id') ?? basename(path, '.txt').toLowerCase();
const outDir = value('--out') ?? 'cases';
const sheetDir = value('--sheets') ?? 'docs/case-reviews';

/**
 * Two shapes of source: a Fareez text transcript, or a PriMock57 consultation, which is a pair of
 * Praat TextGrid files named <consultation>_doctor.TextGrid and <consultation>_patient.TextGrid.
 */
const primock = path.endsWith('.TextGrid');
const dataset = primock ? 'primock57' : 'fareez2022';
const transcript = primock
  ? parseConsultation(
      basename(path).replace(/_(doctor|patient)\.TextGrid$/, ''),
      readFileSync(path.replace('_patient.TextGrid', '_doctor.TextGrid'), 'utf8'),
      readFileSync(path.replace('_doctor.TextGrid', '_patient.TextGrid'), 'utf8'),
    )
  : parseTranscript(basename(path), readFileSync(path, 'utf8'));
const patientCount = transcript.turns.filter((t) => t.speaker === 'patient').length;
console.log(`${transcript.ref}: ${transcript.turns.length} turns, ${patientCount} from the patient.`);

/** A draft from a file (a re-run, or a hand-edited one) or from the model. */
async function draftCase(): Promise<{ draft: DraftCase; unusable: string[] }> {
  const fromFile = value('--draft');
  if (fromFile) return { draft: JSON.parse(readFileSync(fromFile, 'utf8')) as DraftCase, unusable: [] };
  loadDotEnv();
  try {
    const config = { ...loadConfig(), sessionBudgetUsd: CAP_USD };
    const chat = createChat({
      config,
      budget: createBudget(config),
      onUsage: (u) => console.log(`  ${u.model}: ${u.inputTokens} in, ${u.outputTokens} out, $${u.costUsd.toFixed(4)}, ${u.latencyMs} ms`),
    });
    const extraction = await extractDraftCase(chat, transcript, { model: MODELS.super, maxTokens: EXTRACT_MAX_TOKENS, thinking: false });
    return {
      draft: extraction.draft,
      unusable: extraction.malformed.map((m) => `${JSON.stringify(m.raw).slice(0, 90)}: ${m.reason}`),
    };
  } catch (e) {
    console.error(`Could not extract a case: ${describeConfigError(e)}`);
    process.exit(1);
  }
}

const { draft, unusable } = await draftCase();
for (const note of unusable) console.log(`  unusable entry: ${note}`);
mkdirSync(outDir, { recursive: true });
mkdirSync(sheetDir, { recursive: true });
// The draft is kept so a build can be repeated, and edited, without paying for the model again.
writeFileSync(join(sheetDir, `${caseId}.draft.json`), `${JSON.stringify(draft, null, 2)}\n`);

const result = buildCase(draft, transcript, caseId, dataset);
if ('ok' in result) {
  console.error(result.message);
  for (const { fact, reason } of result.rejected) console.error(`  dropped: ${fact.text} (${reason})`);
  process.exit(1);
}

writeFileSync(join(outDir, `${caseId}.json`), `${JSON.stringify(result.patientCase, null, 2)}\n`);
writeFileSync(join(sheetDir, `${caseId}.md`), reviewSheet(result, transcript, unusable));
console.log(`\n${result.patientCase.facts.length} facts kept, ${result.rejected.length} dropped, ${result.warnings.length} to look at.`);
for (const { fact, reason } of result.rejected) console.log(`  dropped: ${fact.text} (${reason})`);
for (const warning of result.warnings) console.log(`  look at: ${warning}`);
console.log(`\nWrote ${join(outDir, `${caseId}.json`)} and ${join(sheetDir, `${caseId}.md`)}.`);
console.log('The case is marked unreviewed. Read the sheet against the transcript before using it.');
