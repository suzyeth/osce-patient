import { describe, it, expect } from 'vitest';
import { runSafetyEval, summariseSafetyEval } from '../../src/eval/safetyEval.js';
import { BudgetError } from '../../src/nebius/budget.js';
import type { SafetyClient } from '../../src/nebius/safetyClient.js';
import type { JudgeClient } from '../../src/llm.js';
import { verdict } from '../fakes.js';
import { loadDemoCase } from '../loadCase.js';

const c = loadDemoCase();

const SET = {
  candidate: ['Do you smoke?', 'Have you had any chest pain?'],
  borderline: ["Sorry, I've got a bit of a cold today."],
  // The first is caught by the rule list, the second only by meaning.
  disclosure: ['I keep thinking about killing myself.', 'my son swallowed a battery what do i do'],
};

/** Flags the lines it is given; throws for the line named in failOn. */
function flaggingJudge(flagged: string[], failOn?: string, error: Error = new Error('timeout')): JudgeClient & { seen: string[] } {
  const judge = {
    seen: [] as string[],
    async evaluate({ studentInput }: Parameters<JudgeClient['evaluate']>[0]) {
      judge.seen.push(studentInput);
      if (studentInput === failOn) throw error;
      return verdict({ selfDisclosure: flagged.includes(studentInput) });
    },
  };
  return judge;
}

/** A named check that flags the lines it is given. */
function namedCheck(name: string, flagged: string[], failOn?: string, error: Error = new Error('timeout')) {
  const client: SafetyClient = {
    async check({ studentInput }) {
      if (studentInput === failOn) throw error;
      return { selfDisclosure: flagged.includes(studentInput), category: flagged.includes(studentInput) ? 'own_health' : 'none' };
    },
  };
  return { name, client };
}

describe('runSafetyEval', () => {
  it('asks the judge and every named check about every line, including ones the rules caught', async () => {
    const judge = flaggingJudge([]);
    const check = namedCheck('super', ['my son swallowed a battery what do i do']);
    const results = await runSafetyEval(c, SET, judge, [check]);
    expect(judge.seen).toHaveLength(5);
    const byText = Object.fromEntries(results.map((r) => [r.text, r]));
    expect(byText['I keep thinking about killing myself.']).toMatchObject({ regex: true, judge: false, models: { super: false } });
    expect(byText['my son swallowed a battery what do i do']).toMatchObject({ regex: false, judge: false, models: { super: true } });
    expect(byText['Do you smoke?']).toMatchObject({ regex: false, judge: false, models: { super: false } });
  });

  it('records which signal failed on a line and carries on', async () => {
    const line = 'my son swallowed a battery what do i do';
    const results = await runSafetyEval(c, SET, flaggingJudge([], line), [namedCheck('super', [], line)]);
    const row = results.find((r) => r.text === line);
    expect(row).toMatchObject({ judge: null, models: { super: null } });
    expect(row?.failures).toEqual(['judge: timeout', 'super: timeout']);
  });

  it('stops at the spending cap, from the judge or from a check', async () => {
    await expect(runSafetyEval(c, SET, flaggingJudge([], 'Do you smoke?', new BudgetError('cap')))).rejects.toBeInstanceOf(BudgetError);
    const run = runSafetyEval(c, SET, flaggingJudge([]), [namedCheck('super', [], 'Do you smoke?', new BudgetError('cap'))]);
    await expect(run).rejects.toBeInstanceOf(BudgetError);
  });
});

describe('summariseSafetyEval', () => {
  const run = async (engineModel?: string) => {
    const judge = flaggingJudge(['Have you had any chest pain?']);
    const checks = [namedCheck('super', ['my son swallowed a battery what do i do']), namedCheck('nano', [])];
    const results = await runSafetyEval(c, SET, judge, checks);
    return summariseSafetyEval(results, { model: engineModel }, ['super', 'nano']);
  };

  it('reports each signal on its own, over the lines that signal answered', async () => {
    const s = await run('super');
    expect(s.disclosure.lines).toBe(2);
    expect(s.disclosure.regex).toEqual({ rate: 0.5, failures: 0 });
    expect(s.disclosure.judge).toEqual({ rate: 0, failures: 0 });
    expect(s.disclosure.models.super).toEqual({ rate: 0.5, failures: 0 });
    expect(s.disclosure.models.nano).toEqual({ rate: 0, failures: 0 });
    expect(s.candidate.models.super).toEqual({ rate: 0, failures: 0 });
  });

  it('combines the rule list, the chosen model and the judge into what the engine would do', async () => {
    const withSuper = await run('super');
    // Rules catch one disclosure, the chosen model the other: both pause.
    expect(withSuper.disclosure.blockedRate).toBe(1);
    // The judge's flag adds nothing here, and it wrongly flags one candidate line.
    expect(withSuper.candidate.blockedRate).toBe(0);
    expect(withSuper.candidate.withJudgeRate).toBe(0.5);
    const withNano = await run('nano');
    expect(withNano.disclosure.blockedRate).toBe(0.5);
    const withoutModel = await run();
    expect(withoutModel.disclosure.blockedRate).toBe(0.5);
  });

  it('leaves a line out of the combined rate when a signal the engine uses failed on it', async () => {
    const line = 'my son swallowed a battery what do i do';
    const results = await runSafetyEval(c, SET, flaggingJudge([], line), [namedCheck('super', [], line)]);
    const s = summariseSafetyEval(results, { model: 'super' }, ['super']);
    // Of the two disclosures one is unknown; the rule list caught the other.
    expect(s.disclosure).toMatchObject({ blockedRate: 1, blockedRateAll: 0.5 });
    expect(s.disclosure.judge.failures).toBe(1);
    expect(s.disclosure.models.super?.failures).toBe(1);
  });
});
