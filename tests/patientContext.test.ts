import { describe, it, expect } from 'vitest';
import { buildPatientContext } from '../src/patientContext.js';
import { forbiddenTerms, guardReply } from '../src/patientGuard.js';
import { initialSessionState } from '../src/state.js';
import { loadDemoCase } from './loadCase.js';

const c = loadDemoCase();

describe('buildPatientContext', () => {
  it('includes public facts but never the text of a locked fact', () => {
    const ctx = buildPatientContext(c, initialSessionState());
    expect(ctx).toContain("I've had a cough that just won't go away.");
    for (const f of c.facts.filter((x) => x.kind !== 'presenting')) expect(ctx).not.toContain(f.text);
  });

  it('contains no guarded term of any locked fact, anywhere in the prompt', () => {
    const state = initialSessionState();
    const ctx = buildPatientContext(c, state);
    expect(guardReply(ctx, forbiddenTerms(c, state)).leaked).toEqual([]);
  });

  it('includes a fact once it is unlocked', () => {
    const ctx = buildPatientContext(c, { ...initialSessionState(), unlockedFactIds: ['f_smoking'] });
    expect(ctx).toContain('I smoke about twenty a day');
  });

  it('changes openness with trust', () => {
    expect(buildPatientContext(c, { ...initialSessionState(), trust: 80 })).toContain('talk openly');
    expect(buildPatientContext(c, { ...initialSessionState(), trust: 10 })).toContain('minimal answers');
  });
});
