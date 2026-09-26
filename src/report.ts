import { DOMAINS, type Domain, type PatientCase, type SessionState, type TurnRecord } from './types.js';
import { FEEDBACK_STATEMENTS, type FeedbackStatementKey } from './feedback.js';
import { RUBRIC_SOURCES } from './cases/rubric.js';

export interface ItemResult {
  id: string;
  label: string;
  domain: Domain;
  critical: boolean;
  covered: boolean;
  /** 1-based turn where the item was first covered, or null. */
  turn: number | null;
  /** The student's own words that earned it, so the mark can be checked. Null when not covered. */
  quote: string | null;
  /** Where the item comes from, or null when nothing published backs it. */
  source: string | null;
  exampleQuestion: string;
}

export interface DomainScore {
  covered: number;
  total: number;
}

/** One of the GMC's ten feedback statements, as far as this station can speak to it. */
export interface StatementResult {
  key: FeedbackStatementKey;
  label: string;
  /** The GMC's wording, verbatim. */
  text: string;
  /**
   * 'not_assessed' when a typed history station gives no evidence either way; 'concern' when what
   * happened here is the kind of thing the statement describes; 'no_concern' when it is not.
   */
  outcome: 'concern' | 'no_concern' | 'not_assessed';
  /** Plain-English reason, naming the questions it rests on. Always present. */
  evidence: string;
  /** The student's own words the judgement rests on, if any. */
  quotes: string[];
}

export interface SessionReport {
  caseId: string;
  reviewStatus: PatientCase['reviewStatus'];
  items: ItemResult[];
  domains: Record<Domain, DomainScore>;
  criticalMisses: string[];
  /** Null when the case has no concern fact. */
  concernElicited: boolean | null;
  statements: StatementResult[];
  /** Clinical management is only partly scored in this version. */
  managementIncomplete: boolean;
  turnsUsed: number;
  interruptions: number;
  jargonCount: number;
}

function domainScore(items: ItemResult[], domain: Domain): DomainScore {
  const inDomain = items.filter((i) => i.domain === domain);
  return { covered: inDomain.filter((i) => i.covered).length, total: inDomain.length };
}

/** The student's own words from the turns matching a predicate, for quoting evidence back. */
function quotesFor(transcript: readonly TurnRecord[], predicate: (t: TurnRecord) => boolean): string[] {
  return transcript.filter(predicate).map((t) => t.studentInput).filter((s) => s.trim() !== '');
}

const list = (turns: readonly number[]): string => turns.map((t) => `question ${t}`).join(', ');

/**
 * Whether the consultation ran in a logical order, in the only sense a typed station can check:
 * the open question before the narrow ones, and no return to history taking after summarising.
 * Anything subtler is a human judgement and is not guessed at here.
 */
function consultationOrder(items: ItemResult[]): { ordered: boolean; detail: string } {
  const turnOf = (id: string): number | null => items.find((i) => i.id === id)?.turn ?? null;
  const opened = turnOf('open_question');
  const closed = turnOf('closing');
  const historyTurns = items
    .filter((i) => i.domain === 'data_gathering' && i.turn !== null)
    .map((i) => i.turn as number);
  if (historyTurns.length === 0) {
    return { ordered: true, detail: 'Too little of the history was covered to say anything about structure.' };
  }
  const first = Math.min(...historyTurns);
  const last = Math.max(...historyTurns);
  if (opened !== null && opened > first) {
    return {
      ordered: false,
      detail: `You began asking specific questions at question ${first}, and only opened the consultation at question ${opened}.`,
    };
  }
  if (closed !== null && closed < last) {
    return {
      ordered: false,
      detail: `You summarised at question ${closed} and then went back to history taking at question ${last}.`,
    };
  }
  return {
    ordered: true,
    detail: 'You opened before narrowing down, and did not return to history taking after summarising.',
  };
}

/**
 * What this station can honestly say about each of the GMC's ten feedback statements. Six of the
 * ten are out of reach in typed history taking, and saying so is the point: silence on a statement
 * must not read as a pass. Where a statement is half visible, the evidence line says which half.
 */
function buildStatements(
  items: ItemResult[],
  state: SessionState,
  patientCase: PatientCase,
  concernElicited: boolean | null,
): StatementResult[] {
  const turns = state.transcript;
  const missedCritical = items.filter((i) => i.critical && !i.covered);
  const order = consultationOrder(items);
  const interruptedTurns = turns.filter((t) => t.interrupted).map((t) => t.turn);
  const jargonTurns = turns.filter((t) => t.jargon).map((t) => t.turn);
  const empathyTurns = turns.filter((t) => t.empathy).map((t) => t.turn);
  const closing = items.find((i) => i.id === 'closing');
  const minutes = Math.max(1, Math.round(patientCase.durationSeconds / 60));
  // A candidate speaking to a patient gets through roughly two questions a minute. It is a rough
  // yardstick for whether the consultation would have fitted, not a measurement of anyone's pace.
  const roomFor = Math.max(1, minutes * 2);

  const decide = (key: FeedbackStatementKey): StatementResult => {
    const statement = FEEDBACK_STATEMENTS.find((s) => s.key === key);
    if (!statement) throw new Error(`unknown feedback statement: ${key}`);
    const base = { key, label: statement.label, text: statement.text };
    if (!statement.assessable) {
      return { ...base, outcome: 'not_assessed', evidence: statement.notAssessableBecause, quotes: [] };
    }
    switch (key) {
      case 'consultation':
        return { ...base, outcome: order.ordered ? 'no_concern' : 'concern', evidence: order.detail, quotes: [] };
      case 'issues': {
        if (missedCritical.length > 0) {
          const missed = missedCritical.map((i) => i.label.toLowerCase()).join('; ');
          return {
            ...base,
            outcome: 'concern',
            evidence: `You did not ask about ${missed}. In this case that is what decides what has to happen to the patient next.`,
            quotes: [],
          };
        }
        return {
          ...base,
          outcome: 'no_concern',
          evidence: items.some((i) => i.critical)
            ? 'You asked about everything in this case that would change what happens next.'
            : 'This case has no single overriding priority, so there was nothing here to miss.',
          quotes: [],
        };
      }
      case 'time':
        return state.turnsUsed > roomFor
          ? {
              ...base,
              outcome: 'concern',
              evidence: `You asked ${state.turnsUsed} questions. ${minutes} minutes of talking leaves room for roughly ${roomFor}, so in the exam this consultation would not have fitted. Typing here is not timed, so this is about how much you asked, not how fast you speak.`,
              quotes: [],
            }
          : {
              ...base,
              outcome: 'no_concern',
              evidence: `You asked ${state.turnsUsed} questions, within the ${roomFor} or so that ${minutes} minutes of talking allows. Typing here is not timed, so this says nothing about your pace when speaking.`,
              quotes: [],
            };
      case 'rapport':
        if (concernElicited === false) {
          return {
            ...base,
            outcome: 'concern',
            evidence:
              'You did not find out what the patient was worried about. That is the part of rapport a typed station can see; warmth of voice and manner is not.',
            quotes: [],
          };
        }
        return empathyTurns.length > 0
          ? {
              ...base,
              outcome: 'no_concern',
              evidence: `You acknowledged how the patient felt at ${list(empathyTurns)}.${
                concernElicited === true ? ' You also found out what they were worried about.' : ''
              } Warmth of voice and manner is not visible here.`,
              quotes: quotesFor(turns, (t) => t.empathy),
            }
          : {
              ...base,
              outcome: 'concern',
              evidence:
                'Nothing you wrote acknowledged how the patient felt. The exam judges this partly from voice and manner, which a typed station cannot see at all.',
              quotes: [],
            };
      case 'listening':
        return interruptedTurns.length > 0
          ? {
              ...base,
              outcome: 'concern',
              evidence: `You moved on before the patient had finished at ${list(interruptedTurns)}. Non-verbal cues are the other half of this statement and cannot be judged from typing.`,
              quotes: quotesFor(turns, (t) => t.interrupted),
            }
          : {
              ...base,
              outcome: 'no_concern',
              evidence:
                'You let the patient finish, and picked up what they said. Non-verbal cues are the other half of this statement and cannot be judged from typing.',
              quotes: [],
            };
      case 'language': {
        const problems: string[] = [];
        if (jargonTurns.length > 0) problems.push(`you used medical words the patient may not know at ${list(jargonTurns)}`);
        if (closing && !closing.covered) problems.push('you did not check the patient had understood, or invite their questions');
        return problems.length > 0
          ? {
              ...base,
              outcome: 'concern',
              evidence: `In this consultation ${problems.join(', and ')}. Speaking too quickly is also part of this statement and cannot be judged from typing.`,
              quotes: quotesFor(turns, (t) => t.jargon),
            }
          : {
              ...base,
              outcome: 'no_concern',
              evidence:
                'You kept to plain words and checked the patient had understood. Speaking too quickly is also part of this statement and cannot be judged from typing.',
              quotes: [],
            };
      }
      default:
        return { ...base, outcome: 'not_assessed', evidence: 'Not looked at in this version.', quotes: [] };
    }
  };

  return FEEDBACK_STATEMENTS.map((s) => decide(s.key));
}

export function computeReport(patientCase: PatientCase, state: SessionState): SessionReport {
  const quoteFor = (id: string): string | null => {
    const turn = state.transcript.find((t) => t.creditedItemIds.includes(id));
    return turn && turn.studentInput.trim() !== '' ? turn.studentInput : null;
  };
  const items: ItemResult[] = patientCase.rubric.map((r) => {
    const turn = state.rubricHits[r.id] ?? null;
    return {
      id: r.id,
      label: r.label,
      domain: r.domain,
      critical: r.critical,
      covered: turn !== null,
      turn,
      quote: turn === null ? null : quoteFor(r.id),
      source: RUBRIC_SOURCES[r.id] ?? null,
      exampleQuestion: r.exampleQuestion,
    };
  });
  const domains = Object.fromEntries(DOMAINS.map((d) => [d, domainScore(items, d)])) as Record<Domain, DomainScore>;
  const criticalMisses = items.filter((i) => i.critical && !i.covered).map((i) => i.id);
  const concernFacts = patientCase.facts.filter((f) => f.kind === 'concern');
  const concernElicited =
    concernFacts.length === 0 ? null : concernFacts.some((f) => state.unlockedFactIds.includes(f.id));
  return {
    caseId: patientCase.id,
    reviewStatus: patientCase.reviewStatus,
    items,
    domains,
    criticalMisses,
    concernElicited,
    statements: buildStatements(items, state, patientCase, concernElicited),
    managementIncomplete: true,
    turnsUsed: state.turnsUsed,
    interruptions: state.interruptions,
    jargonCount: state.jargonCount,
  };
}
