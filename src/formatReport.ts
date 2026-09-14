import type { SessionReport } from './report.js';

const DOMAIN_LABEL = {
  data_gathering: 'Data gathering',
  interpersonal: 'Interpersonal skills',
  management: 'Clinical management',
} as const;

export function formatReport(r: SessionReport): string {
  const lines: string[] = [`Case: ${r.caseId}  |  Global judgement: ${r.global}`];
  if (r.reviewStatus === 'unreviewed') lines.push('Note: this case has not been reviewed by a clinician.');
  for (const d of ['data_gathering', 'interpersonal'] as const) {
    const s = r.domains[d];
    lines.push(`${DOMAIN_LABEL[d]}: ${s.covered}/${s.total}`);
  }
  if (r.managementIncomplete) lines.push(`${DOMAIN_LABEL.management}: only generic items are scored in this version.`);
  lines.push('');
  for (const i of r.items) {
    const mark = i.covered ? `[x] turn ${i.turn}` : i.critical ? '[!] MISSED (critical)' : '[ ] missed';
    lines.push(`${mark}  ${i.label}`);
    if (!i.covered) lines.push(`      Try: "${i.exampleQuestion}"`);
  }
  if (r.concernElicited !== null) {
    lines.push(
      '',
      r.concernElicited
        ? 'You found out what the patient was worried about.'
        : 'You did not find out what the patient was worried about.',
    );
  }
  return lines.join('\n');
}
