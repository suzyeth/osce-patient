import { describe, it, expect } from 'vitest';
import { validateCase } from '../src/validateCase.js';
import { loadDemoCase } from './loadCase.js';

describe('validateCase', () => {
  it('passes the demo case with no errors', () => {
    expect(validateCase(loadDemoCase()).errors).toEqual([]);
  });

  it('flags unknown rubric references and duplicate fact ids', () => {
    const bad = loadDemoCase();
    bad.facts[1]!.rubricItemId = 'nope';
    bad.facts.push({ ...bad.facts[2]! });
    const r = validateCase(bad);
    expect(r.errors).toContain('fact f_duration points to unknown rubric item nope');
    expect(r.errors).toContain('duplicate fact id: f_blood');
  });

  it('flags a guarded term that the persona would put in the patient prompt', () => {
    const bad = loadDemoCase();
    bad.patient.persona += ' He mentions blood a lot.';
    expect(validateCase(bad).errors).toContain(
      'guarded term "blood" of f_blood is in the patient prompt while f_blood is locked',
    );
  });

  it('flags a guarded term that another fact would reveal once unlocked', () => {
    const bad = loadDemoCase();
    bad.facts[3]!.text += ' I do worry about cancer.';
    expect(validateCase(bad).errors).toContain(
      'guarded term "cancer" of f_concern is in the patient prompt while f_concern is locked',
    );
  });

  it('flags a guarded term that collides with the fixed patient instructions', () => {
    const bad = loadDemoCase();
    bad.facts[1]!.guardedTerms = ['medicines'];
    expect(validateCase(bad).errors.some((e) => e.includes('"medicines" of f_duration'))).toBe(true);
  });

  it('uses the same matching as the output guard, including terms ending in punctuation', () => {
    const bad = loadDemoCase();
    bad.facts[1]!.guardedTerms = ['C.O.P.D.'];
    bad.patient.persona += ' He has C.O.P.D.';
    expect(validateCase(bad).errors.some((e) => e.includes('"C.O.P.D."'))).toBe(true);
  });

  it('flags a guarded term in the opening line', () => {
    const bad = loadDemoCase();
    bad.patient.openingLine += ' There was a bit of blood.';
    expect(validateCase(bad).errors).toContain(
      'guarded term "blood" of f_blood appears in the opening line or candidate brief',
    );
  });

  it('flags blank offline cues and blank guarded terms', () => {
    const bad = loadDemoCase();
    bad.rubric[3]!.offlineCues = ['blood', ' '];
    bad.facts[1]!.guardedTerms = ['six weeks', ''];
    const r = validateCase(bad);
    expect(r.errors).toContain('rubric item haemoptysis has a blank offline cue, which would match every question');
    expect(r.errors).toContain('fact f_duration has a blank guarded term');
  });

  it('flags a rubric with no interpersonal items', () => {
    const bad = loadDemoCase();
    bad.rubric = bad.rubric.map((r) => ({ ...r, domain: r.domain === 'interpersonal' ? 'data_gathering' : r.domain }));
    expect(validateCase(bad).errors).toContain('rubric has no interpersonal items, so the global judgement cannot score it');
  });

  it('flags a concern that the first turn could unlock', () => {
    for (const minTrust of [20, 32, 50]) {
      const bad = loadDemoCase();
      bad.facts[4]!.minTrust = minTrust;
      expect(validateCase(bad).errors).toContain(
        `concern fact f_concern has minTrust ${minTrust}, which the starting trust of 30 plus one turn (up to +20) can reach, so it can unlock on the first turn`,
      );
    }
  });

  it('accepts a concern that needs more than one turn of rapport', () => {
    const ok = loadDemoCase();
    ok.facts[4]!.minTrust = 51;
    expect(validateCase(ok).errors.some((e) => e.includes('f_concern has minTrust'))).toBe(false);
  });

  it('warns about a concern fact without minTrust', () => {
    const bad = loadDemoCase();
    delete bad.facts[4]!.minTrust;
    expect(validateCase(bad).warnings).toContain('concern fact f_concern has no minTrust, so it only unlocks when asked');
  });

  it('warns about settings that have no effect', () => {
    const bad = loadDemoCase();
    bad.facts[1]!.minTrust = 50;
    bad.facts[0]!.guardedTerms = ['cough'];
    const w = validateCase(bad).warnings;
    expect(w).toContain('minTrust on non-concern fact f_duration has no effect');
    expect(w).toContain(
      'guarded terms on presenting fact f_presenting have no effect, because presenting facts are always public',
    );
  });
});
