/**
 * What /healthz says. The keep-warm ping reads it every ten minutes, so putting today's spend here
 * gives whoever pays the bill a running record without a dashboard or a login. Nothing in it is
 * secret: no code, no key, no case content, only totals.
 */
export interface HealthInput {
  cases: number;
  models: boolean;
  /** Null when the ledger cannot be read: unknown, which is not the same as nothing spent. */
  spentTodayUsd: number | null;
  dailyCapUsd: number;
  /** Counted in memory, so it starts again from zero whenever the instance restarts. */
  stationsStarted: number;
  since: string;
}

export function healthBody(input: HealthInput) {
  const spent = input.spentTodayUsd === null ? null : Math.round(input.spentTodayUsd * 10_000) / 10_000;
  return {
    ok: true,
    cases: input.cases,
    models: input.models,
    usage: {
      spentTodayUsd: spent,
      dailyCapUsd: input.dailyCapUsd,
      capUsedPercent: spent === null ? null : Math.round((spent / input.dailyCapUsd) * 100),
      stationsStartedSinceRestart: input.stationsStarted,
      since: input.since,
    },
  };
}
