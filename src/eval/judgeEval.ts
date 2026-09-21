import type { JudgeClient } from '../llm.js';
import type { PatientCase } from '../types.js';
import { initialSessionState } from '../state.js';
import type { JudgeLines } from './fixtures.js';
import { failureReason } from './failures.js';
import { compareSets, mean, percentile, ratio } from './metrics.js';

export interface JudgeLineResult {
  text: string;
  kind: JudgeLines['lines'][number]['kind'];
  expected: string[];
  /** Null when the judge failed on this line. */
  actual: string[] | null;
  exact: boolean;
  missed: string[];
  extra: string[];
  /** Time to a verdict for this line, including any repair call and retry backoff. */
  latencyMs: number;
  failure: string | null;
}

export interface FactUnlockRate {
  factId: string;
  rubricItemId: string;
  /** Share of this item's paraphrases that the judge credited, which is what unlocks the fact. */
  rate: number | null;
}

export interface JudgeEvalSummary {
  lines: number;
  failures: number;
  exactRate: number | null;
  precision: number | null;
  recall: number | null;
  factUnlock: FactUnlockRate[];
  /** Off-topic and injection lines that would have unlocked at least one fact; failed lines left out. */
  falseUnlockRate: number | null;
  /** Per judged line, which is what a candidate waits for. */
  meanLatencyMs: number | null;
  p95LatencyMs: number | null;
}

/** Judges each line on its own, from a fresh session with no history, so lines cannot help each other. */
export async function runJudgeEval(
  patientCase: PatientCase,
  fixture: JudgeLines,
  judge: JudgeClient,
  clock: () => number = Date.now,
): Promise<JudgeLineResult[]> {
  const results: JudgeLineResult[] = [];
  for (const line of fixture.lines) {
    const started = clock();
    try {
      const v = await judge.evaluate({ patientCase, state: initialSessionState(), studentInput: line.text, history: [] });
      const cmp = compareSets(line.expected, v.rubricItemIds);
      results.push({
        text: line.text,
        kind: line.kind,
        expected: line.expected,
        actual: v.rubricItemIds,
        exact: cmp.exact,
        missed: cmp.falseNegatives,
        extra: cmp.falsePositives,
        latencyMs: clock() - started,
        failure: null,
      });
    } catch (e) {
      const failure = failureReason(e);
      const latencyMs = clock() - started;
      results.push({ text: line.text, kind: line.kind, expected: line.expected, actual: null, exact: false, missed: [], extra: [], latencyMs, failure });
    }
  }
  return results;
}

/** A failed line counts against exact match, and its expected items count as missed. */
export function summariseJudgeEval(patientCase: PatientCase, results: readonly JudgeLineResult[]): JudgeEvalSummary {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const r of results) {
    const actual = r.actual ?? [];
    const cmp = compareSets(r.expected, actual);
    tp += cmp.truePositives.length;
    fp += cmp.falsePositives.length;
    fn += cmp.falseNegatives.length;
  }
  const paraphrases = results.filter((r) => r.kind === 'paraphrase');
  const factUnlock = patientCase.facts.map((f) => {
    const asked = paraphrases.filter((r) => r.expected.includes(f.rubricItemId));
    const credited = asked.filter((r) => (r.actual ?? []).includes(f.rubricItemId));
    return { factId: f.id, rubricItemId: f.rubricItemId, rate: ratio(credited.length, asked.length) };
  });
  const factItems = new Set(patientCase.facts.map((f) => f.rubricItemId));
  const negatives = results.filter((r) => r.kind !== 'paraphrase' && r.actual !== null);
  const falseUnlocks = negatives.filter((r) => (r.actual ?? []).some((id) => factItems.has(id)));
  return {
    lines: results.length,
    failures: results.filter((r) => r.failure !== null).length,
    exactRate: ratio(results.filter((r) => r.exact).length, results.length),
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    factUnlock,
    falseUnlockRate: ratio(falseUnlocks.length, negatives.length),
    meanLatencyMs: mean(results.filter((r) => r.failure === null).map((r) => r.latencyMs)),
    p95LatencyMs: percentile(results.filter((r) => r.failure === null).map((r) => r.latencyMs), 95),
  };
}
