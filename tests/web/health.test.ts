import { describe, it, expect } from 'vitest';
import { healthBody } from '../../src/web/health.js';

describe('healthBody', () => {
  const base = {
    cases: 6,
    models: true,
    spentTodayUsd: 0.0123456 as number | null,
    dailyCapUsd: 0.5,
    stationsStarted: 3,
    since: '2026-10-22T09:00:00.000Z',
  };

  it("shows today's spend against the cap and the stations started, for someone watching the bill", () => {
    expect(healthBody(base)).toEqual({
      ok: true,
      cases: 6,
      models: true,
      usage: { spentTodayUsd: 0.0123, dailyCapUsd: 0.5, capUsedPercent: 2, stationsStartedSinceRestart: 3, since: '2026-10-22T09:00:00.000Z' },
    });
  });

  it('says the spend is unknown rather than zero when the ledger cannot be read', () => {
    expect(healthBody({ ...base, spentTodayUsd: null }).usage.spentTodayUsd).toBeNull();
    expect(healthBody({ ...base, spentTodayUsd: null }).usage.capUsedPercent).toBeNull();
  });
});
