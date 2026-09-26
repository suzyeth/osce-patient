import type { JudgeVerdict, SessionState, TurnRecord } from './types.js';

export const INITIAL_TRUST = 30;
export const MAX_TRUST_DELTA = 20;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export function initialSessionState(): SessionState {
  return {
    trust: INITIAL_TRUST,
    unlockedFactIds: [],
    rubricHits: {},
    turnsUsed: 0,
    interruptions: 0,
    jargonCount: 0,
    empathyCount: 0,
    transcript: [],
  };
}

/**
 * Pure: returns a new state with this turn's verdict applied. The student's words are kept with the
 * turn, because the report has to be able to show which sentence earned which mark.
 */
export function applyVerdict(
  state: SessionState,
  verdict: JudgeVerdict,
  knownRubricIds: readonly string[],
  /** Required: a turn stored without the words is a mark the report cannot show evidence for. */
  studentInput: string,
): SessionState {
  const turn = state.turnsUsed + 1;
  const rubricHits = { ...state.rubricHits };
  const creditedItemIds: string[] = [];
  for (const id of verdict.rubricItemIds) {
    if (knownRubricIds.includes(id) && rubricHits[id] === undefined) {
      rubricHits[id] = turn;
      creditedItemIds.push(id);
    }
  }
  const record: TurnRecord = {
    turn,
    studentInput,
    creditedItemIds,
    questionStyle: verdict.questionStyle,
    empathy: verdict.empathy,
    interrupted: verdict.interrupted,
    jargon: verdict.jargon,
  };
  const delta = clamp(Math.round(verdict.trustDelta), -MAX_TRUST_DELTA, MAX_TRUST_DELTA);
  return {
    ...state,
    trust: clamp(state.trust + delta, 0, 100),
    rubricHits,
    turnsUsed: turn,
    interruptions: state.interruptions + (verdict.interrupted ? 1 : 0),
    jargonCount: state.jargonCount + (verdict.jargon ? 1 : 0),
    empathyCount: state.empathyCount + (verdict.empathy ? 1 : 0),
    transcript: [...state.transcript, record],
  };
}
