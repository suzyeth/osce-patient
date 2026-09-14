import type { Fact, JudgeVerdict, PatientCase, SessionState } from './types.js';

/** Presenting-complaint facts are public: the patient may say them from the first turn. */
export function isPublic(fact: Fact): boolean {
  return fact.kind === 'presenting';
}

/**
 * A fact unlocks only through its rubric item, never through a bare fact id from the judge. The
 * unlock and the report then always agree, and a judge talked into "request every fact" cannot
 * reveal a fact without the report showing its item as covered.
 */
function wasAsked(fact: Fact, verdict: JudgeVerdict): boolean {
  return verdict.rubricItemIds.includes(fact.rubricItemId);
}

function trustReached(fact: Fact, state: SessionState): boolean {
  return fact.minTrust !== undefined && state.trust >= fact.minTrust;
}

/**
 * Ids of facts that become shareable this turn, in case-file order.
 * `state` must already include this turn's verdict (trust updated).
 * Several facts may unlock in one turn: students ask in any order.
 * Concern facts unlock when asked, or unasked once trust reaches minTrust.
 */
export function unlockFacts(patientCase: PatientCase, state: SessionState, verdict: JudgeVerdict): string[] {
  const newly: string[] = [];
  for (const fact of patientCase.facts) {
    if (isPublic(fact) || state.unlockedFactIds.includes(fact.id)) continue;
    const unlocked =
      fact.kind === 'concern' ? wasAsked(fact, verdict) || trustReached(fact, state) : wasAsked(fact, verdict);
    if (unlocked) newly.push(fact.id);
  }
  return newly;
}
