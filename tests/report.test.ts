import { describe, it, expect } from 'vitest';
import { computeReport, globalJudgement } from '../src/report.js';
import { initialSessionState } from '../src/state.js';
import type { GlobalJudgement } from '../src/types.js';
import { loadDemoCase } from './loadCase.js';

const c = loadDemoCase();

describe('computeReport', () => {
  it('marks covered items with the turn they were first covered', () => {
    const r = computeReport(c, { ...initialSessionState(), rubricHits: { smoking: 3 }, turnsUsed: 5 });
    expect(r.items.find((i) => i.id === 'smoking')).toMatchObject({ covered: true, turn: 3 });
    expect(r.items.find((i) => i.id === 'haemoptysis')).toMatchObject({ covered: false, turn: null });
    expect(r.turnsUsed).toBe(5);
  });

  it('lists critical misses and caps the global judgement at Borderline', () => {
    const allButBlood = Object.fromEntries(
      c.rubric.filter((x) => x.id !== 'haemoptysis').map((x, i) => [x.id, i + 1]),
    );
    const r = computeReport(c, { ...initialSessionState(), rubricHits: allButBlood });
    expect(r.criticalMisses).toEqual(['haemoptysis']);
    expect(r.global).toBe('Borderline');
  });

  it('gives Good when everything is covered', () => {
    const all = Object.fromEntries(c.rubric.map((x, i) => [x.id, i + 1]));
    expect(computeReport(c, { ...initialSessionState(), rubricHits: all }).global).toBe('Good');
  });

  it('reports whether the hidden concern was elicited', () => {
    expect(computeReport(c, initialSessionState()).concernElicited).toBe(false);
    expect(computeReport(c, { ...initialSessionState(), unlockedFactIds: ['f_concern'] }).concernElicited).toBe(true);
  });

  it('gives an empty domain no ratio and always flags management as incomplete', () => {
    const r = computeReport(c, initialSessionState());
    expect(r.domains.management).toEqual({ covered: 0, total: 0, ratio: null });
    expect(r.managementIncomplete).toBe(true);
  });
});

describe('globalJudgement', () => {
  const cases: Array<[number | null, number | null, number, GlobalJudgement]> = [
    [0.9, 0.9, 0, 'Good'],
    [0.7, 0.9, 0, 'Satisfactory'],
    [0.5, 0.9, 0, 'Borderline'],
    [0.2, 0.9, 0, 'Unsatisfactory'],
    [0.9, 0.9, 1, 'Borderline'],
    [0.2, 0.2, 1, 'Unsatisfactory'],
    // 11/13 is 0.846: it would round to 0.85, but it is below the Good threshold.
    [11 / 13, 0.9, 0, 'Satisfactory'],
    [null, 0.9, 0, 'Good'],
    [null, null, 0, 'Unsatisfactory'],
  ];
  it.each(cases)('data gathering %s, interpersonal %s, %s critical misses -> %s', (dg, ip, cm, expected) => {
    expect(globalJudgement(dg, ip, cm)).toBe(expected);
  });
});
