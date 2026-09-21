import { describe, it, expect } from 'vitest';
import {
  AgreementLabelsSchema,
  checkLabels,
  runAgreementEval,
  summariseAgreement,
  type AgreementLabels,
} from '../../src/eval/agreementEval.js';
import { loadFixture } from '../../src/eval/fixtures.js';
import { BudgetError } from '../../src/nebius/budget.js';
import type { JudgeClient, JudgeInput } from '../../src/llm.js';
import { verdict } from '../fakes.js';
import { loadDemoCase } from '../loadCase.js';

const c = loadDemoCase();

const LABELS: AgreementLabels = {
  caseId: 'demo-cough',
  labelledBy: 'test',
  conversations: [
    {
      id: 'a',
      turns: [
        { student: 'Hello, may I ask some questions?', patient: 'Yes.', items: ['intro_consent'] },
        { student: 'Do you smoke?', patient: 'Yes.', items: ['smoking'] },
        { student: 'Any blood?', patient: 'Some.', items: ['haemoptysis'] },
      ],
    },
  ],
};

/** Answers from a table and records what it was shown. */
function tableJudge(table: Record<string, string[]>) {
  const inputs: JudgeInput[] = [];
  const judge: JudgeClient = {
    async evaluate(input) {
      inputs.push(input);
      const ids = table[input.studentInput];
      if (!ids) throw new Error('no verdict');
      return verdict({ rubricItemIds: ids, trustDelta: 5 });
    },
  };
  return { judge, inputs };
}

describe('the example labels file', () => {
  it('loads and matches the demo case', () => {
    const loaded = loadFixture('eval/labels/example.demo-cough.json', AgreementLabelsSchema);
    if (!loaded.ok) throw new Error(loaded.message);
    expect(checkLabels(loaded.value, c)).toEqual([]);
  });
});

describe('checkLabels', () => {
  it('flags the wrong case and unknown rubric items', () => {
    const bad = { ...LABELS, caseId: 'other', conversations: [{ id: 'x', turns: [{ student: 's', patient: 'p', items: ['nope'] }] }] };
    expect(checkLabels(bad, c)).toEqual(['labels are for case other, not demo-cough', 'x turn 1: unknown rubric item "nope"']);
  });
});

describe('runAgreementEval', () => {
  it('replays each conversation with growing history and the state moved by earlier verdicts', async () => {
    const { judge, inputs } = tableJudge({
      'Hello, may I ask some questions?': ['intro_consent'],
      'Do you smoke?': ['smoking'],
      'Any blood?': [],
    });
    const results = await runAgreementEval(c, LABELS, judge);
    expect(inputs.map((i) => i.history.length)).toEqual([0, 1, 2]);
    expect(inputs.map((i) => i.state.trust)).toEqual([30, 35, 40]);
    expect(results.map((r) => r.judge)).toEqual([['intro_consent'], ['smoking'], []]);
  });

  it('records a failed turn, keeps its history for later turns, and stops at the spending cap', async () => {
    const { judge, inputs } = tableJudge({ 'Hello, may I ask some questions?': ['intro_consent'], 'Any blood?': ['haemoptysis'] });
    const results = await runAgreementEval(c, LABELS, judge);
    expect(results[1]).toMatchObject({ judge: null, failure: 'no verdict' });
    expect(inputs[2]?.history).toHaveLength(2);
    const broke: JudgeClient = {
      async evaluate() {
        throw new BudgetError('cap');
      },
    };
    await expect(runAgreementEval(c, LABELS, broke)).rejects.toBeInstanceOf(BudgetError);
  });
});

describe('summariseAgreement', () => {
  it('pools kappa over every turn and rubric item, and gives turn-level agreement', async () => {
    const { judge } = tableJudge({
      'Hello, may I ask some questions?': ['intro_consent'],
      'Do you smoke?': ['smoking'],
      'Any blood?': [],
    });
    const s = summariseAgreement(c, await runAgreementEval(c, LABELS, judge));
    expect(s.turns).toBe(3);
    expect(s.failures).toBe(0);
    expect(s.turnAgreement).toBeCloseTo(2 / 3);
    // 21 decisions (3 turns x 7 items): human says yes 3 times, the judge 2, agreeing on 20.
    // Observed 20/21; chance (3/21)(2/21) + (18/21)(19/21); kappa about 0.77.
    expect(s.kappa).toBeCloseTo(0.7742, 3);
    expect(s.perItem.find((p) => p.rubricItemId === 'smoking')).toEqual({ rubricItemId: 'smoking', kappa: 1, humanTicks: 1, judgeTicks: 1 });
    expect(s.perItem.find((p) => p.rubricItemId === 'haemoptysis')).toMatchObject({ humanTicks: 1, judgeTicks: 0 });
    // Nobody ticked closing on any turn: kappa is undefined, not perfect.
    expect(s.perItem.find((p) => p.rubricItemId === 'closing')?.kappa).toBeNull();
  });
});
