import { describe, it, expect } from 'vitest';
import { cohenKappa, compareSets, mean, pct, percentile, ratio } from '../../src/eval/metrics.js';

describe('compareSets', () => {
  it('splits ids into hits, extras and misses, ignoring order and duplicates', () => {
    expect(compareSets(['a', 'b'], ['b', 'c', 'c'])).toEqual({
      exact: false,
      truePositives: ['b'],
      falsePositives: ['c'],
      falseNegatives: ['a'],
    });
  });

  it('is exact when both sides hold the same ids, including both empty', () => {
    expect(compareSets(['a', 'b'], ['b', 'a']).exact).toBe(true);
    expect(compareSets([], []).exact).toBe(true);
  });
});

describe('ratio, mean and percentile', () => {
  it('returns null instead of dividing by zero', () => {
    expect(ratio(1, 0)).toBeNull();
    expect(mean([])).toBeNull();
    expect(percentile([], 95)).toBeNull();
  });

  it('computes plain values', () => {
    expect(ratio(1, 4)).toBe(0.25);
    expect(mean([1, 2, 3])).toBe(2);
    expect(percentile([5, 1, 4, 2, 3], 50)).toBe(3);
    expect(percentile([5, 1, 4, 2, 3], 95)).toBe(5);
  });
});

describe('cohenKappa', () => {
  it('is 1 for perfect agreement and 0 for agreement no better than chance', () => {
    expect(cohenKappa([[true, true], [false, false], [true, true], [false, false]])).toBe(1);
    expect(cohenKappa([[true, true], [true, false], [false, true], [false, false]])).toBe(0);
  });

  it('matches a worked example', () => {
    // 20 yes/yes, 5 yes/no, 10 no/yes, 15 no/no: observed 0.7, chance 0.5, kappa 0.4.
    const pairs: Array<[boolean, boolean]> = [
      ...Array.from({ length: 20 }, (): [boolean, boolean] => [true, true]),
      ...Array.from({ length: 5 }, (): [boolean, boolean] => [true, false]),
      ...Array.from({ length: 10 }, (): [boolean, boolean] => [false, true]),
      ...Array.from({ length: 15 }, (): [boolean, boolean] => [false, false]),
    ];
    expect(cohenKappa(pairs)).toBeCloseTo(0.4, 10);
  });

  it('is undefined when both raters always gave the same single answer', () => {
    expect(cohenKappa([[false, false], [false, false]])).toBeNull();
    expect(cohenKappa([])).toBeNull();
  });
});

describe('pct', () => {
  it('rounds to a whole percent and shows n/a for null', () => {
    expect(pct(0.8333)).toBe('83%');
    expect(pct(null)).toBe('n/a');
  });
});
