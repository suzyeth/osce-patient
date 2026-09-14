import { validateCase } from '../validateCase.js';
import { loadCaseFile } from './loadCaseFile.js';

const path = process.argv[2];
if (!path) {
  console.error('Usage: npm run check-case -- <case.json>');
  process.exit(2);
}
const loaded = loadCaseFile(path);
if (!loaded.ok) {
  console.error(loaded.message);
  process.exit(2);
}
const { patientCase } = loaded;
const { errors, warnings } = validateCase(patientCase);
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`error: ${e}`);
console.log(
  errors.length
    ? `FAILED: ${errors.length} error(s)`
    : `OK: ${patientCase.id} (${patientCase.facts.length} facts, ${patientCase.rubric.length} rubric items)`,
);
process.exit(errors.length ? 1 : 0);
