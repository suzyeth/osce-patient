import { describe, it, expect } from 'vitest';
import {
  runFaithfulnessEval,
  runOffCaseEval,
  summariseFaithfulness,
  summariseOffCase,
} from '../../src/eval/honestyEval.js';
import { offlineGrader, type Grader } from '../../src/eval/grader.js';
import { BudgetError } from '../../src/nebius/budget.js';
import { offlineJudge, offlinePatient } from '../../src/offline.js';
import { fakeJudge, scriptedPatient, verdict } from '../fakes.js';
import { loadDemoCase } from '../loadCase.js';

const c = loadDemoCase();
const PROBES = { caseId: 'demo-cough', questions: ['Any pets?', 'Any chest pain?'] };

describe('runOffCaseEval', () => {
  it('plays each question through the engine, repeat times, and grades what was shown', async () => {
    const patient = scriptedPatient("I'm not sure.", 'Yes, a cat.', 'No.', 'Not sure.');
    const results = await runOffCaseEval(c, PROBES, { judge: fakeJudge(verdict()), patient, grader: offlineGrader() }, 2);
    expect(results.map((r) => [r.question, r.label])).toEqual([
      ['Any pets?', 'unsure'],
      ['Any chest pain?', 'invented'],
      ['Any pets?', 'denied'],
      ['Any chest pain?', 'unsure'],
    ]);
    expect(summariseOffCase(results)).toEqual({ answers: 4, failures: 0, inventedRate: 0.25, deniedRate: 0.25, unsureRate: 0.5 });
  });

  it('records a question the safety check paused as a failure, not as an answer', async () => {
    const results = await runOffCaseEval(
      c,
      { caseId: 'demo-cough', questions: ['Any pets?'] },
      { judge: fakeJudge(verdict({ selfDisclosure: true })), patient: scriptedPatient('x'), grader: offlineGrader() },
    );
    expect(results[0]).toMatchObject({ label: null, failure: expect.stringContaining('safety') });
  });

  it('stops at the spending cap, including one reached by the grader', async () => {
    const broke: Grader = {
      ...offlineGrader(),
      async offCase() {
        throw new BudgetError('cap');
      },
    };
    const run = runOffCaseEval(c, PROBES, { judge: fakeJudge(verdict()), patient: scriptedPatient('No.'), grader: broke });
    await expect(run).rejects.toBeInstanceOf(BudgetError);
  });
});

describe('runFaithfulnessEval', () => {
  it('asks each fact its example question and grades only facts that unlocked', async () => {
    // The offline judge credits rubric items by keyword and the offline patient says the unlocked
    // facts word for word, so every fact that unlocks is graded consistent.
    const results = await runFaithfulnessEval(c, { judge: offlineJudge(), patient: offlinePatient(), grader: offlineGrader() });
    expect(results.map((r) => r.factId)).toEqual(c.facts.map((f) => f.id));
    expect(results.find((r) => r.factId === 'f_smoking')).toMatchObject({
      question: 'Do you smoke, or have you ever smoked?',
      unlocked: true,
      label: 'consistent',
    });
    const s = summariseFaithfulness(results);
    expect(s.failures).toBe(0);
    expect(s.graded + s.notUnlocked).toBe(c.facts.length);
    expect(s.noContradictionRate).toBe(1);
  });

  it('marks a fact the judge did not credit as not unlocked and leaves it ungraded', async () => {
    const results = await runFaithfulnessEval(c, { judge: fakeJudge(verdict()), patient: scriptedPatient('Hmm.'), grader: offlineGrader() });
    const blood = results.find((r) => r.factId === 'f_blood');
    expect(blood).toMatchObject({ unlocked: false, label: null, failure: null });
    // The presenting complaint is public, so it is graded even without credit.
    expect(results.find((r) => r.factId === 'f_presenting')).toMatchObject({ unlocked: true, label: 'omits' });
  });

  it('counts contradictions against the no-contradiction rate', () => {
    const row = (label: 'consistent' | 'omits' | 'contradicts') => ({ factId: 'f', question: 'q', reply: 'r', unlocked: true, label, failure: null });
    const s = summariseFaithfulness([row('consistent'), row('omits'), row('contradicts'), row('consistent')]);
    expect(s).toMatchObject({ graded: 4, noContradictionRate: 0.75, statedRate: 0.5, contradictions: 1 });
  });
});
