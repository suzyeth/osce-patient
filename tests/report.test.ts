import { describe, it, expect } from 'vitest';
import { computeReport } from '../src/report.js';
import { initialSessionState } from '../src/state.js';
import type { SessionState, TurnRecord } from '../src/types.js';
import { loadDemoCase } from './loadCase.js';

const c = loadDemoCase();

const record = (over: Partial<TurnRecord> = {}): TurnRecord => ({
  turn: 1,
  studentInput: 'When did the cough start?',
  creditedItemIds: [],
  questionStyle: 'open',
  empathy: false,
  interrupted: false,
  jargon: false,
  ...over,
});

const statement = (state: SessionState, key: string) => {
  const found = computeReport(c, state).statements.find((s) => s.key === key);
  if (!found) throw new Error(`no statement ${key}`);
  return found;
};

describe('computeReport', () => {
  it('marks covered items with the turn they were first covered', () => {
    const r = computeReport(c, { ...initialSessionState(), rubricHits: { smoking: 3 }, turnsUsed: 5 });
    expect(r.items.find((i) => i.id === 'smoking')).toMatchObject({ covered: true, turn: 3 });
    expect(r.items.find((i) => i.id === 'haemoptysis')).toMatchObject({ covered: false, turn: null });
    expect(r.turnsUsed).toBe(5);
  });

  it('quotes the words that earned a mark, so the candidate can check it', () => {
    const r = computeReport(c, {
      ...initialSessionState(),
      rubricHits: { smoking: 2 },
      turnsUsed: 2,
      transcript: [record(), record({ turn: 2, studentInput: 'Do you smoke at all?', creditedItemIds: ['smoking'] })],
    });
    expect(r.items.find((i) => i.id === 'smoking')?.quote).toBe('Do you smoke at all?');
    // A missed item has nothing to quote, and neither has a hit with no turn record behind it.
    expect(r.items.find((i) => i.id === 'haemoptysis')?.quote).toBeNull();
    const noRecord = computeReport(c, { ...initialSessionState(), rubricHits: { smoking: 2 } });
    expect(noRecord.items.find((i) => i.id === 'smoking')?.quote).toBeNull();
  });

  it('names a published source where there is one, and null where there is not', () => {
    // The demo case uses its own item ids, so only ids in the standard list carry a source.
    for (const i of computeReport(c, initialSessionState()).items) {
      expect(i.source === null || i.source.length > 10, i.id).toBe(true);
    }
  });

  it('lists critical misses without turning them into a verdict', () => {
    const allButBlood = Object.fromEntries(
      c.rubric.filter((x) => x.id !== 'haemoptysis').map((x, i) => [x.id, i + 1]),
    );
    const r = computeReport(c, { ...initialSessionState(), rubricHits: allButBlood });
    expect(r.criticalMisses).toEqual(['haemoptysis']);
    // There is no pass, fail, Good or Borderline anywhere in the report.
    expect(JSON.stringify(r)).not.toMatch(/Borderline|Satisfactory|Unsatisfactory/);
  });

  it('reports whether the hidden concern was elicited', () => {
    expect(computeReport(c, initialSessionState()).concernElicited).toBe(false);
    expect(computeReport(c, { ...initialSessionState(), unlockedFactIds: ['f_concern'] }).concernElicited).toBe(true);
  });

  it('counts each of the pack domains, in the pack order, with no ratio', () => {
    const r = computeReport(c, initialSessionState());
    expect(r.domains.map((d) => d.id)).toEqual(['data_gathering', 'management', 'interpersonal']);
    expect(r.domains.find((d) => d.id === 'management')).toMatchObject({ covered: 0, total: 0 });
    // The pack, not the engine, says what is left unscored.
    expect(r.caveat).toContain('Clinical management is not scored');
    expect(r.strayDomains).toEqual([]);
  });
});

describe('the GMC feedback statements', () => {
  it('reports all ten, in the GMC order, quoting the GMC wording', () => {
    const r = computeReport(c, initialSessionState());
    expect(r.statements.map((s) => s.key)).toEqual([
      'consultation',
      'issues',
      'time',
      'findings',
      'examination',
      'diagnosis',
      'management',
      'rapport',
      'listening',
      'language',
    ]);
    expect(r.statements.find((s) => s.key === 'management')?.text).toContain('including follow up and safety netting');
  });

  it('says outright that the ones it cannot see are not assessed, rather than staying silent', () => {
    const r = computeReport(c, initialSessionState());
    for (const key of ['findings', 'examination', 'diagnosis', 'management']) {
      const s = r.statements.find((x) => x.key === key);
      expect(s?.outcome, key).toBe('not_assessed');
    }
    // And every statement carries a reason, whatever the outcome.
    for (const s of r.statements) expect(s.evidence.length, s.key).toBeGreaterThan(20);
  });

  it('flags a missed red flag under Issues, naming it', () => {
    const s = statement(initialSessionState(), 'issues');
    expect(s.outcome).toBe('concern');
    expect(s.evidence).toContain('You did not cover "Asks about coughing up blood"');
  });

  it('flags jargon and a missing check of understanding under Language, and quotes the jargon', () => {
    const state: SessionState = {
      ...initialSessionState(),
      turnsUsed: 2,
      transcript: [record(), record({ turn: 2, studentInput: 'Any haemoptysis or dyspnoea?', jargon: true })],
    };
    const s = statement(state, 'language');
    expect(s.outcome).toBe('concern');
    expect(s.evidence).toContain('question 2');
    expect(s.quotes).toEqual(['Any haemoptysis or dyspnoea?']);
  });

  it('flags an interruption under Listening and says non-verbal cues are out of reach', () => {
    const state: SessionState = { ...initialSessionState(), turnsUsed: 1, transcript: [record({ interrupted: true })] };
    const s = statement(state, 'listening');
    expect(s.outcome).toBe('concern');
    expect(s.evidence).toContain('Non-verbal');
  });

  it('flags asking specific questions before opening the consultation under Consultation', () => {
    const late = statement({ ...initialSessionState(), rubricHits: { smoking: 1, open_question: 4 } }, 'consultation');
    expect(late.outcome).toBe('concern');
    expect(late.evidence).toContain('question 4');
    const inOrder = statement({ ...initialSessionState(), rubricHits: { open_question: 1, smoking: 3 } }, 'consultation');
    expect(inOrder.outcome).toBe('no_concern');
  });

  it('flags more questions than the station has room for under Time, and says typing is not timed', () => {
    const over = statement({ ...initialSessionState(), turnsUsed: 999 }, 'time');
    expect(over.outcome).toBe('concern');
    expect(over.evidence).toContain('not timed');
    const within = statement({ ...initialSessionState(), turnsUsed: 4 }, 'time');
    expect(within.outcome).toBe('no_concern');
    expect(within.evidence).toContain('not timed');
  });

  it('treats a missed concern as a rapport problem, and empathy as evidence against one', () => {
    expect(statement(initialSessionState(), 'rapport').outcome).toBe('concern');
    const kind: SessionState = {
      ...initialSessionState(),
      unlockedFactIds: ['f_concern'],
      turnsUsed: 1,
      transcript: [record({ studentInput: 'That sounds frightening.', empathy: true })],
    };
    const s = statement(kind, 'rapport');
    expect(s.outcome).toBe('no_concern');
    expect(s.quotes).toEqual(['That sounds frightening.']);
    expect(s.evidence).toContain('voice and manner');
  });
});
