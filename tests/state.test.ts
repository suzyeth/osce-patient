import { describe, it, expect } from 'vitest';
import { applyVerdict, initialSessionState, INITIAL_TRUST } from '../src/state.js';
import { verdict } from './fakes.js';

describe('applyVerdict', () => {
  it('records the first turn a rubric item is covered and ignores unknown ids', () => {
    const s1 = applyVerdict(initialSessionState(), verdict({ rubricItemIds: ['smoking', 'nope'] }), ['smoking']);
    const s2 = applyVerdict(s1, verdict({ rubricItemIds: ['smoking'] }), ['smoking']);
    expect(s2.rubricHits).toEqual({ smoking: 1 });
    expect(s2.turnsUsed).toBe(2);
  });

  it('clamps trust delta to +/-20 and trust to 0..100', () => {
    const s = applyVerdict(initialSessionState(), verdict({ trustDelta: 999 }), []);
    expect(s.trust).toBe(INITIAL_TRUST + 20);
    let low = initialSessionState();
    for (let i = 0; i < 5; i++) low = applyVerdict(low, verdict({ trustDelta: -50 }), []);
    expect(low.trust).toBe(0);
  });

  it('counts interruptions, jargon and empathy', () => {
    const s = applyVerdict(initialSessionState(), verdict({ interrupted: true, jargon: true, empathy: true }), []);
    expect([s.interruptions, s.jargonCount, s.empathyCount]).toEqual([1, 1, 1]);
  });

  it('does not mutate the input state', () => {
    const s0 = initialSessionState();
    applyVerdict(s0, verdict({ rubricItemIds: ['smoking'], trustDelta: 5 }), ['smoking']);
    expect(s0).toEqual(initialSessionState());
  });
});
