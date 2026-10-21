import { describe, it, expect } from 'vitest';
import {
  fromSampleTranscript,
  linkableTurn,
  openingEntry,
  orderStatements,
  recordTurn,
  STATEMENT_WORDING,
  summarise,
} from '../../public/reportModel.js';
import type { SessionReport } from '../../src/report.js';

function item(over: Partial<SessionReport['items'][number]> = {}): SessionReport['items'][number] {
  return {
    id: 'x',
    label: 'Some item',
    domain: 'data_gathering',
    critical: false,
    covered: false,
    turn: null,
    quote: null,
    source: null,
    exampleQuestion: 'Ask it?',
    ...over,
  } as SessionReport['items'][number];
}

function report(items: SessionReport['items'], concernElicited: boolean | null): SessionReport {
  return { items, concernElicited } as unknown as SessionReport;
}

describe('recordTurn', () => {
  it('numbers a counted turn and leaves the input alone', () => {
    const log = [openingEntry('Hi')];
    const next = recordTurn(log, { turnsUsed: 1, candidate: 'How long?', reply: 'Six weeks.', paused: false });
    expect(next.at(-1)).toEqual({ turn: 1, candidate: 'How long?', reply: 'Six weeks.', paused: false });
    expect(log).toHaveLength(1);
  });

  it('leaves a paused or repeated turn unnumbered, so it never takes another line’s number', () => {
    let log = [openingEntry('Hi')];
    log = recordTurn(log, { turnsUsed: 1, candidate: 'a', reply: 'A', paused: false });
    log = recordTurn(log, { turnsUsed: 2, candidate: 'b', reply: 'B', paused: false });
    log = recordTurn(log, { turnsUsed: 2, candidate: 'I have chest pain myself', reply: 'Paused', paused: true });
    expect(log.at(-1)!.turn).toBeNull();
    log = recordTurn(log, { turnsUsed: 3, candidate: 'c', reply: 'C', paused: false });
    expect(log.at(-1)!.turn).toBe(3);
  });
});

describe('fromSampleTranscript', () => {
  it('numbers the sample from 1', () => {
    const log = fromSampleTranscript([
      { student: 'q1', patient: 'a1' },
      { student: 'q2', patient: 'a2' },
    ]);
    expect(log.map((e) => e.turn)).toEqual([1, 2]);
    expect(log[0]).toEqual({ turn: 1, candidate: 'q1', reply: 'a1', paused: false });
  });
});

describe('linkableTurn', () => {
  const log = [openingEntry('Hi'), { turn: 2, candidate: 'q', reply: 'r', paused: false }];

  it('links a covered, quoted item whose turn is on the page', () => {
    expect(linkableTurn(log, { covered: true, turn: 2, quote: 'q' })).toBe(2);
  });

  it('does not link a turn the page no longer has (reloaded mid-station)', () => {
    expect(linkableTurn(log, { covered: true, turn: 5, quote: 'q' })).toBeNull();
  });

  it('does not link a mark whose words were not kept', () => {
    expect(linkableTurn(log, { covered: true, turn: 2, quote: null })).toBeNull();
  });

  it('does not link an uncovered item', () => {
    expect(linkableTurn(log, { covered: false, turn: null, quote: null })).toBeNull();
  });
});

describe('summarise', () => {
  it('says a case has no critical items rather than that none were missed', () => {
    const s = summarise(report([item({ covered: true }), item()], null));
    expect(s.critical.kind).toBe('none-defined');
    expect(s.concern).toBeNull();
    expect([s.covered, s.total]).toEqual([1, 2]);
  });

  it('names a missed critical item and reports the concern came out', () => {
    const s = summarise(report([item({ critical: true, label: 'Asks about calf pain' }), item({ covered: true })], true));
    expect(s.critical).toEqual({ kind: 'missed', labels: ['Asks about calf pain'] });
    expect(s.concern).toBe('elicited');
  });

  it('says none missed only when every critical item was covered', () => {
    const s = summarise(report([item({ critical: true, covered: true })], false));
    expect(s.critical).toEqual({ kind: 'none-missed', labels: [] });
    expect(s.concern).toBe('not-elicited');
  });
});

describe('statements', () => {
  it('words outcomes instead of ticking a fault', () => {
    expect(STATEMENT_WORDING).toEqual({
      concern: 'Needs attention',
      no_concern: 'No concern raised',
      not_assessed: 'Not assessed here',
    });
  });

  it('orders concerns first and not-assessed last, stable within each group', () => {
    const input = [
      { key: 'a', outcome: 'not_assessed' },
      { key: 'b', outcome: 'no_concern' },
      { key: 'c', outcome: 'concern' },
      { key: 'd', outcome: 'no_concern' },
    ];
    expect(orderStatements(input).map((s) => s.key)).toEqual(['c', 'b', 'd', 'a']);
    expect(input[0]!.key).toBe('a');
  });
});
