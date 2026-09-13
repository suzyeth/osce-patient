import { describe, it, expect } from 'vitest';
import { isPublic, unlockFacts } from '../src/gates.js';
import { initialSessionState } from '../src/state.js';
import { loadDemoCase } from './loadCase.js';
import { verdict } from './fakes.js';

const c = loadDemoCase();

describe('unlockFacts', () => {
  it('treats presenting facts as public and never returns them', () => {
    expect(isPublic(c.facts.find((f) => f.id === 'f_presenting')!)).toBe(true);
    expect(unlockFacts(c, initialSessionState(), verdict({ rubricItemIds: ['open_question'] }))).toEqual([]);
  });

  it('unlocks every fact whose rubric item was addressed, in one turn', () => {
    expect(unlockFacts(c, initialSessionState(), verdict({ rubricItemIds: ['onset_duration', 'smoking'] }))).toEqual([
      'f_duration',
      'f_smoking',
    ]);
  });

  it('unlocks a fact requested by id even if no rubric item matched', () => {
    expect(unlockFacts(c, initialSessionState(), verdict({ requestedFactIds: ['f_blood'] }))).toEqual(['f_blood']);
  });

  it('does not return facts that are already unlocked', () => {
    const s = { ...initialSessionState(), unlockedFactIds: ['f_smoking'] };
    expect(unlockFacts(c, s, verdict({ rubricItemIds: ['smoking'] }))).toEqual([]);
  });

  it('unlocks the concern when asked, even at low trust', () => {
    expect(unlockFacts(c, initialSessionState(), verdict({ rubricItemIds: ['ice_concerns'] }))).toEqual(['f_concern']);
  });

  it('volunteers the concern unasked once trust reaches its threshold', () => {
    const s = { ...initialSessionState(), trust: 60 };
    expect(unlockFacts(c, s, verdict())).toEqual(['f_concern']);
    expect(unlockFacts(c, { ...s, trust: 59 }, verdict())).toEqual([]);
  });

  it('never unlocks a red flag through trust alone, even with a stray minTrust', () => {
    const withStray = {
      ...c,
      facts: c.facts.map((f) => (f.id === 'f_blood' ? { ...f, minTrust: 0 } : f)),
    };
    const highTrust = { ...initialSessionState(), trust: 100 };
    expect(unlockFacts(withStray, highTrust, verdict())).not.toContain('f_blood');
    expect(unlockFacts(withStray, highTrust, verdict({ rubricItemIds: ['haemoptysis'] }))).toContain('f_blood');
  });
});
