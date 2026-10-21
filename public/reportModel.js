// The report page's decisions, kept apart from the DOM so they can be tested. Every function returns
// a new value and leaves its arguments alone.

/**
 * One line of the conversation as the page saw it. `turn` is the server's question number: 0 for
 * the opening line, null for a line the server did not count (a safety pause, a refused turn).
 * @typedef {{ turn: number | null, candidate: string | null, reply: string, paused: boolean }} LogEntry
 */

/** @param {string} reply @returns {LogEntry} */
export function openingEntry(reply) {
  return { turn: 0, candidate: null, reply, paused: false };
}

/**
 * Adds a line. It takes the server's count only when that count moved on: a paused turn, or a
 * station too large to save, comes back with the previous count, and must not take its number.
 * @param {LogEntry[]} log
 * @param {{ turnsUsed: number, candidate: string, reply: string, paused: boolean }} entry
 * @returns {LogEntry[]}
 */
export function recordTurn(log, { turnsUsed, candidate, reply, paused }) {
  const highest = Math.max(-1, ...log.map((e) => e.turn ?? -1));
  return [...log, { turn: turnsUsed > highest ? turnsUsed : null, candidate, reply, paused }];
}

/**
 * The sample report's conversation. Paused turns never reach it, so its order is its numbering.
 * @param {{ student: string, patient: string }[]} transcript
 * @returns {LogEntry[]}
 */
export function fromSampleTranscript(transcript) {
  return transcript.map((t, i) => ({ turn: i + 1, candidate: t.student, reply: t.patient, paused: false }));
}

/**
 * The question a mark can open, or null when there is nothing on the page to show: the item was
 * not covered, its words were not kept, or the page was reloaded and no longer has that line.
 * @param {LogEntry[]} log
 * @param {{ covered: boolean, turn: number | null, quote: string | null }} item
 * @returns {number | null}
 */
export function linkableTurn(log, item) {
  if (!item.covered || item.turn === null || !item.quote) return null;
  return log.some((e) => e.turn === item.turn) ? item.turn : null;
}

/**
 * What the first screen says. A case with no critical item says so, rather than "none missed",
 * which would claim a check that never happened.
 * @param {{ items: { covered: boolean, critical: boolean, label: string }[], concernElicited: boolean | null }} report
 */
export function summarise(report) {
  const critical = report.items.filter((i) => i.critical);
  const missed = critical.filter((i) => !i.covered).map((i) => i.label);
  const kind = critical.length === 0 ? 'none-defined' : missed.length > 0 ? 'missed' : 'none-missed';
  return {
    covered: report.items.filter((i) => i.covered).length,
    total: report.items.length,
    critical: { kind, labels: missed },
    concern: report.concernElicited === null ? null : report.concernElicited ? 'elicited' : 'not-elicited',
  };
}

/** The statements are written as faults, so an outcome is said in words, never ticked. */
export const STATEMENT_WORDING = Object.freeze({
  concern: 'Needs attention',
  no_concern: 'No concern raised',
  not_assessed: 'Not assessed here',
});

const STATEMENT_ORDER = ['concern', 'no_concern', 'not_assessed'];

/**
 * @template {{ outcome: string }} T
 * @param {T[]} statements
 * @returns {T[]}
 */
export function orderStatements(statements) {
  const rank = (s) => {
    const i = STATEMENT_ORDER.indexOf(s.outcome);
    return i === -1 ? STATEMENT_ORDER.length : i;
  };
  return [...statements].sort((a, b) => rank(a) - rank(b));
}
