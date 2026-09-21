/** Pure scoring helpers shared by every evaluation. None of them call a model. */

export interface SetComparison {
  exact: boolean;
  truePositives: string[];
  falsePositives: string[];
  falseNegatives: string[];
}

/** Compares the ids a model returned with the expected ids, ignoring order and duplicates. */
export function compareSets(expected: readonly string[], actual: readonly string[]): SetComparison {
  const want = new Set(expected);
  const got = new Set(actual);
  const truePositives = [...got].filter((id) => want.has(id));
  const falsePositives = [...got].filter((id) => !want.has(id));
  const falseNegatives = [...want].filter((id) => !got.has(id));
  return { exact: falsePositives.length === 0 && falseNegatives.length === 0, truePositives, falsePositives, falseNegatives };
}

/** part / whole, or null when there is nothing to divide by (shown as "n/a", never as 0%). */
export function ratio(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

export function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

/** Nearest-rank percentile, p in (0, 100]. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? null;
}

/**
 * Cohen's kappa for two raters making yes/no decisions on the same items.
 * Null when chance agreement is total (both raters always said the same single answer), where
 * kappa is undefined.
 */
export function cohenKappa(pairs: ReadonlyArray<readonly [boolean, boolean]>): number | null {
  if (pairs.length === 0) return null;
  const n = pairs.length;
  const agree = pairs.filter(([a, b]) => a === b).length / n;
  const yesA = pairs.filter(([a]) => a).length / n;
  const yesB = pairs.filter(([, b]) => b).length / n;
  const chance = yesA * yesB + (1 - yesA) * (1 - yesB);
  return chance === 1 ? null : (agree - chance) / (1 - chance);
}

/** "83%" or "n/a". */
export function pct(value: number | null): string {
  return value === null ? 'n/a' : `${Math.round(value * 100)}%`;
}
