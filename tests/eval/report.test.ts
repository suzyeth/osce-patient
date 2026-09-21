import { describe, it, expect } from 'vitest';
import { costOfCalls, formatAttackReport, formatHonestyReport, formatJudgeReport, formatSafetyReport } from '../../src/eval/report.js';
import type { CallUsage } from '../../src/nebius/usage.js';
import { loadDemoCase } from '../loadCase.js';

const c = loadDemoCase();
const call = (costUsd: number, latencyMs: number): CallUsage => ({ label: 'judge', model: 'm', inputTokens: 1, outputTokens: 1, costUsd, latencyMs });

describe('costOfCalls', () => {
  it('adds cost and summarises latency', () => {
    expect(costOfCalls([call(0.001, 400), call(0.002, 600), call(0.001, 2000)])).toEqual({
      calls: 3,
      costUsd: 0.004,
      meanLatencyMs: 1000,
      p95LatencyMs: 2000,
    });
    expect(costOfCalls([])).toEqual({ calls: 0, costUsd: 0, meanLatencyMs: null, p95LatencyMs: null });
  });
});

describe('report tables', () => {
  const cost = costOfCalls([call(0.01, 500)]);

  it('puts each judge setting on a row and each fact in the unlock table', () => {
    const summary = {
      lines: 50,
      failures: 1,
      exactRate: 0.9,
      precision: 0.95,
      recall: 0.875,
      factUnlock: c.facts.map((f) => ({ factId: f.id, rubricItemId: f.rubricItemId, rate: 0.8 })),
      falseUnlockRate: 0,
      meanLatencyMs: 450,
      p95LatencyMs: 1200,
    };
    const md = formatJudgeReport(c, [{ setting: 'Lightning, reasoning off (default)', summary, cost }]);
    expect(md).toContain('| Lightning, reasoning off (default) | 90% | 95% | 88% | 0% | 1 | $0.0100 | 0.5 s / 1.2 s |');
    for (const f of c.facts) expect(md).toContain(`| ${f.id} | 80% |`);
  });

  it('labels which direction is good in the safety table', () => {
    const g = { lines: 10, failures: 0, regexRate: 0.5, judgeRate: 0.9, blockedRate: 1 };
    const md = formatSafetyReport({ candidate: g, borderline: g, disclosure: g }, cost);
    expect(md).toContain('recall, higher is better');
    expect(md).toContain('false pauses, lower is better');
  });

  it('shows the control version next to the engine, and says leaks are counted literally', () => {
    const md = formatAttackReport(
      {
        attacks: 24,
        failures: 0,
        manipulatedUnlocks: 0,
        guardTriggers: 2,
        safetyBlocks: 0,
        rawLeaksPerAttack: 0.1,
        shownLeaksPerAttack: 0,
        shownLeaksViaUnlock: 0,
        controlLeaksPerAttack: 0.75,
        attacksWithRawLeak: 0.1,
        attacksWithShownLeak: 0,
        attacksWithControlLeak: 0.4,
      },
      cost,
    );
    expect(md).toContain('| Control (all facts in the prompt, told not to volunteer) | 0.75 | 40% |');
    expect(md).toContain('| This engine, as shown to the candidate | 0.00 | 0% |');
    expect(md).toContain('| This engine, patient model before the output guard | 0.10 | 10% |');
    expect(md).toContain('only through a judge talked into unlocking');
    expect(md).toContain('includes denials');
  });

  it('names the grader and the sample behind each honesty rate, stated rate first', () => {
    const offCase = { answers: 20, failures: 0, inventedRate: 0.2, deniedRate: 0.7, unsureRate: 0.1 };
    const faith = { probes: 10, failures: 0, notUnlocked: 0, graded: 10, noContradictionRate: 1, statedRate: 0.9, contradictions: 0 };
    const md = formatHonestyReport(offCase, faith, cost, { grader: 'the offline keyword grader', repeat: 2, questions: 10, facts: 5 });
    expect(md).toContain('graded by the offline keyword grader');
    expect(md).toContain('| 20% | 20 (10 questions x 2) |');
    expect(md.indexOf('actually stated')).toBeLessThan(md.indexOf('without contradiction'));
  });
});
