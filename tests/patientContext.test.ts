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

  it('tells the patient the exact words for a question the case cannot answer', () => {
    const prompt = buildPatientContext(c, initialSessionState());
    // The measured failure was inventing an answer, half as a symptom and half as a denial, so
    // the prompt gives the wording rather than the principle.
    expect(prompt).toContain('not a summary');
    expect(prompt).toContain("I'm not sure");
    expect(prompt).toContain('never do that');
    // The reason and the consequence, not just the ban: the ban alone was ignored 40% of the time.
    expect(prompt).toContain('even when the answer looks obviously no');
    expect(prompt).toContain('write it down as if you had ruled it out');
    // Small talk is not a health question, and must not be answered with a hedge.
    expect(prompt).toContain('ordinary conversation');
  });

  it('says the person speaks only as themselves, with no narration', () => {
    // Seen live: the model wrote the doctor's lines, asked their questions, and added "(Emma glances up)".
    const prompt = buildPatientContext(c, initialSessionState());
    expect(prompt).toContain(
      "You only ever speak as yourself. Never write the other person's lines or ask their questions for them, and never add narration or stage directions, such as actions in brackets or between asterisks.",
    );
  });

  it('changes openness with trust', () => {
    expect(buildPatientContext(c, { ...initialSessionState(), trust: 80 })).toContain('talk openly');
    expect(buildPatientContext(c, { ...initialSessionState(), trust: 10 })).toContain('minimal answers');
  });

  it.each([
    [70, 'talk openly'],
    [69, 'answer fully'],
    [45, 'answer fully'],
    [44, 'keep your answers short'],
    [25, 'keep your answers short'],
    [24, 'minimal answers'],
    [100, 'talk openly'],
    [0, 'minimal answers'],
  ])('trust boundary: trust %i includes phrase %s', (trust, phrase) => {
    const ctx = buildPatientContext(c, { ...initialSessionState(), trust });
    expect(ctx).toContain(phrase);
  });

  it('worst-case leak: no locked fact leaks even when all other facts are unlocked', () => {
    const nonPresenting = c.facts.filter((f) => f.kind !== 'presenting');
    for (const lockedFact of nonPresenting) {
      const allOtherIds = c.facts
        .filter((f) => f.id !== lockedFact.id)
        .map((f) => f.id);
      for (const trust of [0, 30, 50, 80]) {
        const state = { ...initialSessionState(), unlockedFactIds: allOtherIds, trust };
        const ctx = buildPatientContext(c, state);
        const leaked = guardReply(ctx, lockedFact.guardedTerms).leaked;
        expect(leaked).toEqual([]);
      }
    }
  });

  it('renders empty list as single line when no fact is shareable', () => {
    const emptyCase = {
      ...c,
      facts: c.facts.filter((f) => f.kind !== 'presenting'),
    };
    const ctx = buildPatientContext(emptyCase, initialSessionState());
    expect(ctx).toContain('- (nothing yet)');
  });
});
