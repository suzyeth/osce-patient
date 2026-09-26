import { describe, it, expect } from 'vitest';
import { computeReport } from '../src/report.js';
import { formatReport } from '../src/formatReport.js';
import { registerPack } from '../src/domains/index.js';
import { NO_EXTRA_DISCLOSURE_RULES } from '../src/safety.js';
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

/** A session where something was said, so statements are judged rather than left unassessed. */
const spoken = (over: Partial<SessionState> = {}): SessionState => ({
  ...initialSessionState(),
  turnsUsed: 1,
  transcript: [record()],
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

describe('what the report refuses to claim without evidence', () => {
  // Every one of these was a real defect: an empty or partial session came back as "no concern",
  // telling the learner they had done something they had not. Nothing is worse than that here.
  it('judges nothing at all when nobody said anything', () => {
    const r = computeReport(c, initialSessionState());
    expect(r.statements.every((s) => s.outcome === 'not_assessed')).toBe(true);
    for (const s of r.statements) expect(s.evidence.length, s.key).toBeGreaterThan(20);
    const assessable = r.statements.filter((s) => s.key === 'listening' || s.key === 'time' || s.key === 'jargon');
    for (const s of assessable) expect(s.evidence, s.key).toContain('did not ask anything');
  });

  it('never tells a silent learner they let the patient finish or kept to plain words', () => {
    const text = formatReport(computeReport(c, initialSessionState()));
    expect(text).not.toContain('You let the patient finish');
    expect(text).not.toContain('You kept to plain words');
    expect(text).not.toContain('You opened before narrowing down');
    expect(text).not.toContain('[ok]');
  });

  it('will not judge order when the learner neither opened nor closed', () => {
    // Three gathering items covered, but the opening and closing items never were.
    const s = statement(spoken({ rubricHits: { onset_duration: 1, smoking: 2, haemoptysis: 3 }, turnsUsed: 3 }), 'consultation');
    expect(s.outcome).toBe('not_assessed');
    expect(s.evidence).toContain('neither opened nor closed');
  });

  it('only claims the part of the order it can actually see', () => {
    const opened = statement(spoken({ rubricHits: { open_question: 1, smoking: 2 }, turnsUsed: 2 }), 'consultation');
    expect(opened.outcome).toBe('no_concern');
    expect(opened.evidence).toContain('you opened before narrowing down');
    // It did not also claim the learner summarised, because they did not.
    expect(opened.evidence).not.toContain('after summarising');
  });

  it('says which item is missing when a statement needs one the case does not have', () => {
    const noClosing = { ...c, rubric: c.rubric.filter((r) => r.id !== 'closing') };
    const s = computeReport(noClosing, spoken({ turnsUsed: 2 })).statements.find((x) => x.key === 'language');
    expect(s?.outcome).toBe('not_assessed');
    expect(s?.evidence).toContain('no item for closing');
  });

  it('loses one statement, not the whole report, when a pack throws', () => {
    const broken = registerPack({
      id: 'test-throwing-pack',
      label: 'Throwing',
      personNoun: 'person',
      learnerNoun: 'learner',
      caveat: 'A pack whose assess function is wrong.',
      persona: { roleLine: 'You are someone.', factsHeading: 'What you may share', inventionBan: 'Invent nothing.', smallTalkLine: 'Small talk is fine.' },
      safety: { disclosure: NO_EXTRA_DISCLOSURE_RULES, signposting: { practiceOnly: 'This is a test. ' } },
      domains: [{ id: 'asking', label: 'Asking' }],
      gatheringDomainId: 'asking',
      rubric: [{ id: 'a', domain: 'asking', label: 'Asks', critical: false, exampleQuestion: 'Well?', offlineCues: ['well'] }],
      sources: { a: 'somewhere published' },
      statements: [
        {
          key: 'boom',
          label: 'Boom',
          text: 'Did not.',
          authority: 'ours',
          source: 'x',
          assessable: true,
          notAssessableBecause: '',
          assess: () => {
            throw new Error('assess blew up');
          },
        },
      ],
    });
    const brokenCase = { ...c, pack: broken.id, rubric: [broken.rubric[0]!] };
    const r = computeReport(brokenCase, spoken({ turnsUsed: 1 }));
    expect(r.statements[0]?.outcome).toBe('not_assessed');
    expect(r.statements[0]?.evidence).toContain('assess blew up');
    // The rest of the report survived.
    expect(r.items).toHaveLength(1);
  });
});

describe('a quote and its question number', () => {
  it('names the question a quote came from, so it cannot be read against another', () => {
    const state = spoken({
      turnsUsed: 3,
      transcript: [
        record({ turn: 1, studentInput: 'What brings you in?' }),
        record({ turn: 2, studentInput: 'Any haemoptysis?', jargon: true }),
        record({ turn: 3, studentInput: 'Any dyspnoea either?', jargon: true }),
      ],
    });
    const s = statement(state, 'language');
    expect(s.quotes).toEqual([
      { turn: 2, text: 'Any haemoptysis?' },
      { turn: 3, text: 'Any dyspnoea either?' },
    ]);
    expect(formatReport(computeReport(c, state))).toContain('You wrote at question 2: "Any haemoptysis?"');
  });

  it('says the words were not kept rather than shifting the next quote up into their place', () => {
    // Turn 2's words were dropped to fit the cookie; turn 3's were kept. Without the question
    // number, the report would have shown turn 3's words against "question 2, question 3".
    const state = spoken({
      turnsUsed: 3,
      transcript: [
        record({ turn: 1, studentInput: 'What brings you in?' }),
        record({ turn: 2, studentInput: '', jargon: true }),
        record({ turn: 3, studentInput: 'Any dyspnoea either?', jargon: true }),
      ],
    });
    expect(statement(state, 'language').quotes).toEqual([
      { turn: 2, text: '' },
      { turn: 3, text: 'Any dyspnoea either?' },
    ]);
    const text = formatReport(computeReport(c, state));
    expect(text).toContain('Question 2: the words were not kept, so this part cannot be checked.');
    expect(text).toContain('You wrote at question 3: "Any dyspnoea either?"');
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
    const s = statement(spoken(), 'issues');
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
    expect(s.quotes).toEqual([{ turn: 2, text: 'Any haemoptysis or dyspnoea?' }]);
  });

  it('flags an interruption under Listening and says non-verbal cues are out of reach', () => {
    const state: SessionState = { ...initialSessionState(), turnsUsed: 1, transcript: [record({ interrupted: true })] };
    const s = statement(state, 'listening');
    expect(s.outcome).toBe('concern');
    expect(s.evidence).toContain('Non-verbal');
  });

  it('flags asking specific questions before opening the consultation under Consultation', () => {
    const late = statement(spoken({ rubricHits: { smoking: 1, open_question: 4 } }), 'consultation');
    expect(late.outcome).toBe('concern');
    expect(late.evidence).toContain('question 4');
    const inOrder = statement(spoken({ rubricHits: { open_question: 1, smoking: 3 } }), 'consultation');
    expect(inOrder.outcome).toBe('no_concern');
  });

  it('puts the Time boundary where the arithmetic says, not one either side of it', () => {
    // demo-cough is 8 minutes, so there is room for about 16 questions. Only the far ends were ever
    // tested, so an off-by-one here would not have been caught.
    expect(statement(spoken({ turnsUsed: 16 }), 'time').outcome).toBe('no_concern');
    expect(statement(spoken({ turnsUsed: 17 }), 'time').outcome).toBe('concern');
  });

  it('flags more questions than the station has room for under Time, and says typing is not timed', () => {
    const over = statement(spoken({ turnsUsed: 999 }), 'time');
    expect(over.outcome).toBe('concern');
    expect(over.evidence).toContain('not timed');
    const within = statement(spoken({ turnsUsed: 4 }), 'time');
    expect(within.outcome).toBe('no_concern');
    expect(within.evidence).toContain('not timed');
  });

  it('treats a missed concern as a rapport problem, and empathy as evidence against one', () => {
    expect(statement(spoken(), 'rapport').outcome).toBe('concern');
    const kind: SessionState = spoken({
      unlockedFactIds: ['f_concern'],
      transcript: [record({ studentInput: 'That sounds frightening.', empathy: true })],
    });
    const s = statement(kind, 'rapport');
    expect(s.outcome).toBe('no_concern');
    expect(s.quotes).toEqual([{ turn: 1, text: 'That sounds frightening.' }]);
    expect(s.evidence).toContain('voice and manner');
  });
});
