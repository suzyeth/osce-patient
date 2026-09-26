import type { PatientCase, SessionState, TurnRecord } from './types.js';
import { packFor } from './domains/index.js';
import {
  type DomainPack,
  type FeedbackStatement,
  type ItemResult,
  type Observations,
  type StatementJudgement,
} from './domains/pack.js';

export type { ItemResult, Observations } from './domains/pack.js';

export interface DomainScore {
  id: string;
  /** The field's own name for this domain, from the pack. */
  label: string;
  covered: number;
  total: number;
}

/** One of the pack's feedback statements, as far as this session can speak to it. */
export interface StatementResult extends StatementJudgement {
  key: string;
  label: string;
  /** The wording, verbatim from the source below. */
  text: string;
  /** 'regulator' when the assessing body publishes this wording; 'ours' when we wrote it. */
  authority: FeedbackStatement['authority'];
  source: string;
}

export interface SessionReport {
  caseId: string;
  /** The domain pack this session was marked against. */
  packId: string;
  packLabel: string;
  /** What the simulated person is called in this field, for the report's own wording. */
  personNoun: string;
  /** What the pack says this kind of session cannot measure. */
  caveat: string;
  reviewStatus: PatientCase['reviewStatus'];
  items: ItemResult[];
  /** One entry per domain the pack marks in, in the pack's order. */
  domains: DomainScore[];
  /** Items whose domain the pack does not declare: a case built against a different pack. */
  strayDomains: string[];
  criticalMisses: string[];
  /** Null when the case has no concern fact. */
  concernElicited: boolean | null;
  statements: StatementResult[];
  turnsUsed: number;
  interruptions: number;
  jargonCount: number;
}

function domainScore(items: ItemResult[], domain: { id: string; label: string }): DomainScore {
  const inDomain = items.filter((i) => i.domain === domain.id);
  return { id: domain.id, label: domain.label, covered: inDomain.filter((i) => i.covered).length, total: inDomain.length };
}

/** Items in no domain the pack declares: a case built against another pack, or a typo. */
function strayDomains(items: ItemResult[], pack: DomainPack): string[] {
  const known = new Set(pack.domains.map((d) => d.id));
  return [...new Set(items.map((i) => i.domain).filter((d) => !known.has(d)))];
}

/**
 * Whether the session ran in a logical order, in the only sense a typed session can check: the
 * opening item before the first narrow one, and no return to gathering after the closing item.
 * Which items those are is the pack's business. Anything subtler is a human judgement and is not
 * guessed at here.
 */
function sessionOrder(items: ItemResult[], pack: DomainPack): { ordered: boolean; detail: string } {
  const turnOf = (id: string | undefined): number | null =>
    (id === undefined ? undefined : items.find((i) => i.id === id)?.turn) ?? null;
  const opened = turnOf(pack.openingItemId);
  const closed = turnOf(pack.closingItemId);
  const gatheringId = pack.gatheringDomainId;
  const gatheringTurns = items
    .filter((i) => i.domain === gatheringId && i.turn !== null)
    .map((i) => i.turn as number);
  if (gatheringTurns.length === 0) {
    return { ordered: true, detail: 'Too little was covered to say anything about structure.' };
  }
  const first = Math.min(...gatheringTurns);
  const last = Math.max(...gatheringTurns);
  if (opened !== null && opened > first) {
    return {
      ordered: false,
      detail: `You began asking specific questions at question ${first}, and only opened the conversation at question ${opened}.`,
    };
  }
  if (closed !== null && closed < last) {
    return {
      ordered: false,
      detail: `You summarised at question ${closed} and then went back to asking for details at question ${last}.`,
    };
  }
  return {
    ordered: true,
    detail: 'You opened before narrowing down, and did not go back to gathering details after summarising.',
  };
}

function observe(items: ItemResult[], state: SessionState, patientCase: PatientCase, pack: DomainPack, concernElicited: boolean | null): Observations {
  const turns = state.transcript;
  const minutes = Math.max(1, Math.round(patientCase.durationSeconds / 60));
  const quotesFrom = (wanted: readonly number[]): string[] =>
    turns.filter((t) => wanted.includes(t.turn)).map((t) => t.studentInput).filter((s) => s.trim() !== '');
  const turnsWith = (flag: (t: TurnRecord) => boolean): number[] => turns.filter(flag).map((t) => t.turn);
  return {
    items,
    missedCritical: items.filter((i) => i.critical && !i.covered),
    hasCritical: items.some((i) => i.critical),
    turnsUsed: state.turnsUsed,
    minutes,
    // Someone speaking gets through roughly two questions a minute. It is a yardstick for whether
    // the conversation would have fitted, not a measurement of anyone's pace.
    roomForTurns: Math.max(1, minutes * 2),
    interruptedTurns: turnsWith((t) => t.interrupted),
    jargonTurns: turnsWith((t) => t.jargon),
    empathyTurns: turnsWith((t) => t.empathy),
    order: sessionOrder(items, pack),
    concernElicited,
    itemById: (id) => items.find((i) => i.id === id),
    quotesFrom,
    list: (wanted) => wanted.map((t) => `question ${t}`).join(', '),
  };
}

/**
 * What this session can honestly say about each of the pack's feedback statements. A statement the
 * session cannot see says so outright, because silence on a statement reads as a pass.
 */
function judgeStatements(pack: DomainPack, obs: Observations): StatementResult[] {
  return pack.statements.map((statement) => {
    const base = {
      key: statement.key,
      label: statement.label,
      text: statement.text,
      authority: statement.authority,
      source: statement.source,
    };
    if (!statement.assessable || !statement.assess) {
      return { ...base, outcome: 'not_assessed' as const, evidence: statement.notAssessableBecause, quotes: [] };
    }
    return { ...base, ...statement.assess(obs) };
  });
}

export function computeReport(patientCase: PatientCase, state: SessionState): SessionReport {
  const pack = packFor(patientCase.pack);
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
      source: pack.sources[r.id] ?? null,
      exampleQuestion: r.exampleQuestion,
    };
  });
  const concernFacts = patientCase.facts.filter((f) => f.kind === 'concern');
  const concernElicited =
    concernFacts.length === 0 ? null : concernFacts.some((f) => state.unlockedFactIds.includes(f.id));
  const obs = observe(items, state, patientCase, pack, concernElicited);
  return {
    caseId: patientCase.id,
    packId: pack.id,
    packLabel: pack.label,
    personNoun: pack.personNoun,
    caveat: pack.caveat,
    reviewStatus: patientCase.reviewStatus,
    items,
    domains: pack.domains.map((d) => domainScore(items, d)),
    strayDomains: strayDomains(items, pack),
    criticalMisses: items.filter((i) => i.critical && !i.covered).map((i) => i.id),
    concernElicited,
    statements: judgeStatements(pack, obs),
    turnsUsed: state.turnsUsed,
    interruptions: state.interruptions,
    jargonCount: state.jargonCount,
  };
}
