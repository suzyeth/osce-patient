import { describe, it, expect } from 'vitest';
import { checkAccess, checkTurn, loadWebLimits, WEB_LIMIT_DEFAULTS, type WebLimits } from '../../src/web/limits.js';

const limits: WebLimits = {
  accessCode: 'plab-2026',
  sessionBudgetUsd: 0.05,
  dailyBudgetUsd: 2,
  maxTurns: 40,
  maxInputChars: 500,
};
const allowance = { secondsLeft: 300, turnsUsed: 3, spentUsd: 0.01, input: 'Do you smoke?' };

describe('loadWebLimits', () => {
  it('needs an access code and fills the rest with defaults', () => {
    const l = loadWebLimits({ OSCE_ACCESS_CODE: 'plab-2026' } as NodeJS.ProcessEnv);
    expect(l).toEqual({ accessCode: 'plab-2026', ...WEB_LIMIT_DEFAULTS });
    expect(() => loadWebLimits({} as NodeJS.ProcessEnv)).toThrow();
    expect(() => loadWebLimits({ OSCE_ACCESS_CODE: 'abc' } as NodeJS.ProcessEnv)).toThrow();
  });

  it('reads the caps from the environment', () => {
    const l = loadWebLimits({ OSCE_ACCESS_CODE: 'plab-2026', OSCE_WEB_DAILY_BUDGET_USD: '0.5', OSCE_WEB_MAX_TURNS: '25' } as NodeJS.ProcessEnv);
    expect(l).toMatchObject({ dailyBudgetUsd: 0.5, maxTurns: 25 });
  });
});

describe('checkTurn', () => {
  it('lets an ordinary turn through', () => {
    expect(checkTurn(limits, allowance)).toBeNull();
  });

  it('stops an empty or over-long line before any model call', () => {
    expect(checkTurn(limits, { ...allowance, input: '   ' })?.reason).toBe('empty');
    expect(checkTurn(limits, { ...allowance, input: 'x'.repeat(501) })?.reason).toBe('input_too_long');
  });

  it('stops a line of punctuation alone, which left the patient model to carry on the conversation by itself', () => {
    for (const input of ['？', '?', '。。', '...', '!?', '— —']) {
      expect(checkTurn(limits, { ...allowance, input })?.reason).toBe('empty');
    }
    // Anything with a letter or a digit is for the judge to read, in any script.
    for (const input of ['nb', '7', '你好', 'Hi?']) expect(checkTurn(limits, { ...allowance, input })).toBeNull();
  });

  it('stops a station that is out of time, out of turns or out of budget', () => {
    expect(checkTurn(limits, { ...allowance, secondsLeft: 0 })?.reason).toBe('time_up');
    expect(checkTurn(limits, { ...allowance, turnsUsed: 40 })?.reason).toBe('too_many_turns');
    expect(checkTurn(limits, { ...allowance, spentUsd: 0.05 })?.reason).toBe('session_budget');
  });

  it('never tells the candidate about money', () => {
    const refusal = checkTurn(limits, { ...allowance, spentUsd: 1 });
    expect(refusal?.message).not.toMatch(/\$|cost|budget|credit/i);
  });
});

describe('checkAccess', () => {
  it('needs the exact code', () => {
    expect(checkAccess(limits, 'plab-2026')).toBeNull();
    expect(checkAccess(limits, 'PLAB-2026')?.reason).toBe('no_code');
    expect(checkAccess(limits, undefined)?.reason).toBe('no_code');
    expect(checkAccess(limits, '')?.reason).toBe('no_code');
  });
});
