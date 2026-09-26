import type { ItemResult, SessionReport } from './report.js';
import { DOMAIN_LABEL } from './feedback.js';

/**
 * What the exam actually tells a candidate, and what this tool is: said once, at the top, because
 * a practice report that reads like a result is worse than no report.
 */
const PREAMBLE = [
  'This is practice feedback, not a mark. The GMC marks each station in three domains and the',
  'examiner picks from ten set feedback statements; it does not publish an item-by-item mark scheme',
  'and does not give candidates a score out of a checklist. The list of things to cover below is',
  'ours, built from published sources named against each item. Nothing here predicts a pass.',
].join('\n');

const OUTCOME_MARK = {
  concern: '[!]',
  no_concern: '[ok]',
  not_assessed: '[--]',
} as const;

function itemLine(i: ItemResult): string[] {
  if (!i.covered) {
    const lines = [`[ ] ${i.label}${i.critical ? ' (red flag)' : ''}`, `      Try: "${i.exampleQuestion}"`];
    if (i.source) lines.push(`      Source: ${i.source}`);
    return lines;
  }
  const lines = [`[x] ${i.label}${i.critical ? ' (red flag)' : ''} - question ${i.turn}`];
  // The quote is the whole point: the candidate can see exactly which sentence earned the mark.
  if (i.quote) lines.push(`      You asked: "${i.quote}"`);
  return lines;
}

export function formatReport(r: SessionReport): string {
  const lines: string[] = [`Case: ${r.caseId}`, '', PREAMBLE];
  if (r.reviewStatus === 'unreviewed') {
    lines.push('', 'Note: this case has not been reviewed by a clinician.');
  }

  lines.push('', 'WHAT AN EXAMINER WOULD COMMENT ON', 'The GMC’s ten feedback statements, in its own words.', '');
  for (const s of r.statements) {
    lines.push(`${OUTCOME_MARK[s.outcome]} ${s.label}: ${s.text}`);
    lines.push(`      ${s.evidence}`);
    for (const q of s.quotes.slice(0, 2)) lines.push(`      You wrote: "${q}"`);
  }

  lines.push('', 'CONTENT YOU COVERED', 'Our list, not the exam’s. Counts, not a score.', '');
  for (const d of ['data_gathering', 'interpersonal', 'management'] as const) {
    const s = r.domains[d];
    if (s.total === 0) continue;
    lines.push(`${DOMAIN_LABEL[d]}: ${s.covered} of ${s.total}`);
  }
  if (r.managementIncomplete) {
    lines.push('Clinical management skills: not scored in this version; only safety netting is looked at.');
  }
  lines.push('');
  for (const i of r.items) lines.push(...itemLine(i));

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
