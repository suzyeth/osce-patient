import type { ItemResult, SessionReport } from './report.js';

/** Said once, at the top, because a practice report that reads like a result is worse than none. */
const PREAMBLE = 'This is practice feedback, not a mark, and nothing here predicts an outcome.';

const OUTCOME_MARK = {
  concern: '[!]',
  no_concern: '[ok]',
  not_assessed: '[--]',
} as const;

function itemLine(i: ItemResult): string[] {
  if (!i.covered) {
    const lines = [`[ ] ${i.label}${i.critical ? ' (critical)' : ''}`, `      Try: "${i.exampleQuestion}"`];
    if (i.source) lines.push(`      Source: ${i.source}`);
    return lines;
  }
  const lines = [`[x] ${i.label}${i.critical ? ' (critical)' : ''} - question ${i.turn}`];
  // The quote is the whole point: the learner can see exactly which sentence earned the mark.
  if (i.quote) lines.push(`      You asked: "${i.quote}"`);
  return lines;
}

export function formatReport(r: SessionReport): string {
  const lines: string[] = [`Case: ${r.caseId}  (${r.packLabel})`, '', PREAMBLE, '', r.caveat];
  if (r.strayDomains.length > 0) {
    lines.push('', `Warning: this case has items in domains this pack does not mark: ${r.strayDomains.join(', ')}.`);
  }
  if (r.reviewStatus === 'unreviewed') {
    lines.push('', 'Note: this case has not been reviewed by anyone qualified in the field.');
  }

  const regulator = r.statements.some((s) => s.authority === 'regulator');
  lines.push(
    '',
    'WHAT A REVIEWER WOULD COMMENT ON',
    regulator
      ? 'Statements published by the body that assesses this, in its own words.'
      : 'Nobody publishes a feedback list for this kind of conversation, so these statements are ours.',
    '',
  );
  for (const s of r.statements) {
    lines.push(`${OUTCOME_MARK[s.outcome]} ${s.label}: ${s.text}`);
    lines.push(`      ${s.evidence}`);
    lines.push(`      ${s.authority === 'regulator' ? 'Published wording' : 'Our wording'}, from: ${s.source}`);
    for (const q of s.quotes.slice(0, 2)) lines.push(`      You wrote: "${q}"`);
  }

  lines.push('', 'CONTENT YOU COVERED', 'Our list. Counts, not a score.', '');
  for (const d of r.domains) {
    if (d.total === 0) continue;
    lines.push(`${d.label}: ${d.covered} of ${d.total}`);
  }
  lines.push('');
  for (const i of r.items) lines.push(...itemLine(i));

  if (r.concernElicited !== null) {
    lines.push(
      '',
      r.concernElicited
        ? `You found out what the ${r.personNoun} was worried about.`
        : `You did not find out what the ${r.personNoun} was worried about.`,
    );
  }
  return lines.join('\n');
}
