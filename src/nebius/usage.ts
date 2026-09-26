import { priceOf } from './config.js';

/** What one model call used and cost. */
export interface CallUsage {
  label: 'judge' | 'patient' | 'grader' | 'safety' | 'extract';
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

export interface UsageSummary {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export function costOf(model: string, inputTokens: number, outputTokens: number): number {
  const price = priceOf(model);
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/** Rough token count for the budget check before a call: about four characters per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function summarise(usages: readonly CallUsage[]): UsageSummary {
  return usages.reduce<UsageSummary>(
    (sum, u) => ({
      calls: sum.calls + 1,
      inputTokens: sum.inputTokens + u.inputTokens,
      outputTokens: sum.outputTokens + u.outputTokens,
      costUsd: sum.costUsd + u.costUsd,
    }),
    { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
  );
}
