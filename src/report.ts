import type { PatientCase, SessionState, TurnRecord } from './types.js';
import { packFor } from './domains/index.js';
import {
  type DomainPack,
  type FeedbackStatement,
  type ItemResult,
  type Observations,
  type Quote,
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
function sessionOrder(items: ItemResult[], pack: DomainPack): { ordered: boolean | null; detail: string } {
  const turnOf = (id: string | undefined): number | null =>
    (id === undefined ? undefined : items.find((i) => i.id === id)?.turn) ?? null;
  const opened = turnOf(pack.openingItemId);
  const closed = turnOf(pack.closingItemId);
  const gatheringId = pack.gatheringDomainId;
  const gatheringTurns = items
    .filter((i) => i.domain === gatheringId && i.turn !== null)
    .map((i) => i.turn as number);
  if (gatheringTurns.length === 0) {
    return { ordered: null, detail: 'You did not cover enough of the conversation to say anything about its order.' };
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
  // Only claim the parts that actually happened. Saying "you opened before narrowing down" to
  // someone who never opened the conversation is the failure this whole report exists to avoid.
  const held: string[] = [];
  if (opened !== null) held.push('you opened before narrowing down');
  if (closed !== null) held.push('you did not go back to gathering details after summarising');
  if (held.length === 0) {
    return {
      ordered: null,
      detail: 'You neither opened nor closed the conversation, so there is no order here to judge.',
    };
  }
  return { ordered: true, detail: `As far as this session can see, ${held.join(', and ')}.` };
}

function observe(items: ItemResult[], state: SessionState, patientCase: PatientCase, pack: DomainPack, concernElicited: boolean | null): Observations {
  const turns = state.transcript;
  const minutes = Math.max(1, Math.round(patientCase.durationSeconds / 60));
  // Every turn asked for is returned, in the order asked for, so a quote is always readable against
  // the question number beside it. A turn whose words were not kept comes back with an empty text.
  const quotesFrom = (wanted: readonly number[]): Quote[] =>
    wanted.map((turn) => ({ turn, text: turns.find((t) => t.turn === turn)?.studentInput ?? '' }));
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
    const notAssessed = (evidence: string): StatementResult => ({ ...base, outcome: 'not_assessed', evidence, quotes: [] });
    if (!statement.assessable || !statement.assess) return notAssessed(statement.notAssessableBecause);
    // Three ways there is no evidence either way. Each one used to come out as no concern, which
    // told the learner they had done something they had not: the worst thing this report can do.
    if (obs.turnsUsed === 0) return notAssessed('You did not ask anything, so there is nothing here to judge.');
    const missing = (statement.needsItems ?? []).filter((id) => obs.itemById(id) === undefined);
    if (missing.length > 0) {
      return notAssessed(`This case has no item for ${missing.join(', ')}, so this station cannot judge it.`);
    }
    try {
      return { ...base, ...statement.assess(obs) };
    } catch (e) {
      // A pack's own mistake must cost one statement, not the whole report.
      const why = e instanceof Error ? e.message : String(e);
      return notAssessed(`This could not be worked out: ${why}. Please report it on the repository's issue tracker.`);
    }
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
