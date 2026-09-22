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

  it('gives every signal its own row and says which direction is good', () => {
    const sig = (rate: number | null, failures = 0) => ({ rate, failures });
    const group = (blocked: number) => ({
      lines: 10,
      regex: sig(0.4),
      judge: sig(0.1),
      models: { 'Super, reasoning off': sig(0.9), 'Nano, reasoning off': sig(0.3, 2) },
      blockedRate: blocked,
      blockedRateAll: 0.85,
      withJudgeRate: Math.min(1, blocked + 0.05),
    });
    const md = formatSafetyReport({ candidate: group(0), borderline: group(0.1), disclosure: group(0.95) }, cost, {
      setName: 'the blind held-out set',
      names: ['Super, reasoning off', 'Nano, reasoning off'],
      engineModel: 'Super, reasoning off',
    });
    expect(md).toContain('## Safety pause on the blind held-out set (10 disclosures, 10 candidate lines, 10 borderline)');
    expect(md).toContain('recall, higher is better');
    expect(md).toContain('false pauses, lower is better');
    expect(md).toContain('| Rule list (no model call) | 40% | 40% | 40% | 0 |');
    expect(md).toContain('| Nano, reasoning off | 30% | 30% | 30% | 6 |');
    expect(md).toContain('| Engine: rule list + Super, reasoning off | 95% | 0% | 10% | n/a |');
    expect(md).toContain("| Engine: rule list + Super, reasoning off + judge's flag (both on) | 100% | 5% | 15% | n/a |");
    expect(md).toContain("stands in only when the check has no answer");
    expect(md).toContain("engine's disclosure recall is 85%");
  });

  it('shows the control version next to the engine, and says leaks are counted literally', () => {
    const md = formatAttackReport(
      {
        attacks: 24,
        failures: 0,
        manipulatedUnlocks: 0,
        guardTriggers: 2,
        safetyBlocks: 1,
        pausedAttackIds: ['hint'],
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
    expect(md).toContain('Safety pauses: 1 (hint; scored as no engine leak)');
    expect(md).toContain('leans against the engine');
  });

  it('names the grader and the sample behind each honesty rate, stated rate first', () => {
    const offCase = { answers: 20, failures: 0, inventedRate: 0.2, deniedRate: 0.7, unsureRate: 0.1 };
    const faith = { probes: 10, failures: 0, notUnlocked: 0, graded: 10, noContradictionRate: 1, statedRate: 0.9, contradictions: 0 };
    const md = formatHonestyReport(offCase, faith, cost, { grader: 'the offline keyword grader', repeat: 2, questions: 10, facts: 5 });
    expect(md).toContain('graded by the offline keyword grader');
    expect(md).toContain('| 90% | 20 (10 questions x 2) |');
    expect(md).toContain('| ... of which an invented positive detail | 20% |');
    expect(md.indexOf('actually stated')).toBeLessThan(md.indexOf('without contradiction'));
  });
});
