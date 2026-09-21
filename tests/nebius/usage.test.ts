import { describe, it, expect } from 'vitest';
import { MODELS } from '../../src/nebius/config.js';
import { costOf, estimateTokens, summarise, type CallUsage } from '../../src/nebius/usage.js';

describe('costOf', () => {
  it('uses per-million prices for input and output', () => {
    expect(costOf(MODELS.nano, 1_000_000, 0)).toBeCloseTo(0.06, 10);
    expect(costOf(MODELS.super, 0, 1_000_000)).toBeCloseTo(0.9, 10);
    expect(costOf(MODELS.super, 1000, 100)).toBeCloseTo((1000 * 0.3 + 100 * 0.9) / 1_000_000, 12);
  });
});

describe('estimateTokens', () => {
  it('rounds up at about four characters per token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('summarise', () => {
  it('adds up calls, tokens and cost', () => {
    const u = (costUsd: number): CallUsage => ({
      label: 'judge',
      model: MODELS.nano,
      inputTokens: 10,
      outputTokens: 5,
      costUsd,
      latencyMs: 1,
    });
    expect(summarise([u(0.001), u(0.002)])).toEqual({ calls: 2, inputTokens: 20, outputTokens: 10, costUsd: 0.003 });
    expect(summarise([])).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
  });
});
