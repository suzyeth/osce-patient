import { describe, it, expect } from 'vitest';
import { FALLBACK_PRICE, loadConfig, MODELS, priceOf } from '../../src/nebius/config.js';

describe('loadConfig', () => {
  it('uses safe defaults when only the key is set', () => {
    const c = loadConfig({ NEBIUS_API_KEY: 'test-key' });
    expect(c.baseUrl).toBe('https://api.tokenfactory.nebius.com/v1');
    expect(c.judgeModel).toBe(MODELS.lightning);
    expect(c.patientModel).toBe(MODELS.super);
    expect(c.sessionBudgetUsd).toBe(0.05);
    expect(c.dailyBudgetUsd).toBe(0.5);
    expect(c.budgetFile).toBe('.osce-budget.json');
    expect(c.judgeThinking).toBe(false);
    expect(c.patientThinking).toBe(false);
  });

  it('reads reasoning switches as on or off and rejects anything else', () => {
    expect(loadConfig({ NEBIUS_API_KEY: 'k', OSCE_JUDGE_THINKING: 'on' }).judgeThinking).toBe(true);
    expect(loadConfig({ NEBIUS_API_KEY: 'k', OSCE_PATIENT_THINKING: 'OFF' }).patientThinking).toBe(false);
    expect(() => loadConfig({ NEBIUS_API_KEY: 'k', OSCE_JUDGE_THINKING: 'maybe' })).toThrow();
  });

  it('reads overrides from the environment', () => {
    const c = loadConfig({
      NEBIUS_API_KEY: 'k',
      OSCE_PATIENT_MODEL: MODELS.lightning,
      OSCE_DAILY_BUDGET_USD: '1.5',
      OSCE_MAX_RETRIES: '0',
    });
    expect(c.patientModel).toBe(MODELS.lightning);
    expect(c.dailyBudgetUsd).toBe(1.5);
    expect(c.maxRetries).toBe(0);
  });

  it('explains a missing key', () => {
    expect(() => loadConfig({})).toThrow(/NEBIUS_API_KEY/);
  });

  it('never puts the key into an error message', () => {
    let message = '';
    try {
      loadConfig({ NEBIUS_API_KEY: 'secret-key-123', OSCE_TIMEOUT_MS: 'soon' });
    } catch (e) {
      message = String(e);
    }
    expect(message).not.toBe('');
    expect(message).not.toContain('secret-key-123');
  });
});

describe('priceOf', () => {
  it('prices catalogue models and charges unknown ones at the highest rate', () => {
    expect(priceOf(MODELS.nano)).toEqual({ input: 0.06, output: 0.24 });
    expect(priceOf(MODELS.super)).toEqual({ input: 0.3, output: 0.9 });
    expect(priceOf('someone/else')).toEqual(FALLBACK_PRICE);
  });
});
