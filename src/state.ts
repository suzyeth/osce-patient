import type { JudgeVerdict, SessionState } from './types.js';

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
  };
}

/** Pure: returns a new state with this turn's verdict applied. */
export function applyVerdict(
  state: SessionState,
  verdict: JudgeVerdict,
  knownRubricIds: readonly string[],
): SessionState {
  const turn = state.turnsUsed + 1;
  const rubricHits = { ...state.rubricHits };
  for (const id of verdict.rubricItemIds) {
    if (knownRubricIds.includes(id) && rubricHits[id] === undefined) rubricHits[id] = turn;
  }
  const delta = clamp(Math.round(verdict.trustDelta), -MAX_TRUST_DELTA, MAX_TRUST_DELTA);
  return {
    ...state,
    trust: clamp(state.trust + delta, 0, 100),
    rubricHits,
    turnsUsed: turn,
    interruptions: state.interruptions + (verdict.interrupted ? 1 : 0),
    jargonCount: state.jargonCount + (verdict.jargon ? 1 : 0),
    empathyCount: state.empathyCount + (verdict.empathy ? 1 : 0),
  };
}
