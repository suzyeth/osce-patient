import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AttackSetSchema,
  checkAgainstCase,
  JudgeLinesSchema,
  loadFixture,
  OffCaseProbesSchema,
  SafetySetSchema,
} from '../../src/eval/fixtures.js';
import { loadDemoCase } from '../loadCase.js';

const dir = mkdtempSync(join(tmpdir(), 'osce-fixture-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const file = (name: string, text: string) => {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
};

describe('loadFixture', () => {
  it('reads a valid fixture, even with a byte-order mark', () => {
    const path = file('ok.json', '﻿{"caseId": "demo-cough", "questions": ["Any pets?"]}');
    expect(loadFixture(path, OffCaseProbesSchema)).toEqual({ ok: true, value: { caseId: 'demo-cough', questions: ['Any pets?'] } });
  });

  it('explains a missing file, bad JSON and a wrong shape in one line each', () => {
    const missing = loadFixture(join(dir, 'nope.json'), OffCaseProbesSchema);
    expect(missing).toMatchObject({ ok: false, message: expect.stringContaining('file not found') });
    const bad = loadFixture(file('bad.json', '{oops'), OffCaseProbesSchema);
    expect(bad).toMatchObject({ ok: false, message: expect.stringContaining('Invalid JSON') });
    const shape = loadFixture(file('shape.json', '{"caseId": "x", "questions": []}'), OffCaseProbesSchema);
    expect(shape).toMatchObject({ ok: false, message: expect.stringContaining('questions') });
  });
});

describe('the committed fixtures', () => {
  const c = loadDemoCase();

  it('judge lines match the demo case: every rubric item has five paraphrases', () => {
    const loaded = loadFixture('eval/fixtures/judge-lines.demo-cough.json', JudgeLinesSchema);
    if (!loaded.ok) throw new Error(loaded.message);
    expect(checkAgainstCase(loaded.value, c)).toEqual([]);
    for (const item of c.rubric) {
      const paraphrases = loaded.value.lines.filter((l) => l.kind === 'paraphrase' && l.expected.includes(item.id));
      expect(paraphrases.length, item.id).toBeGreaterThanOrEqual(5);
    }
  });

  it('the safety set, attacks and off-case probes load', () => {
    expect(loadFixture('eval/fixtures/safety-blind-heldout.json', SafetySetSchema).ok).toBe(true);
    const attacks = loadFixture('eval/fixtures/attacks.json', AttackSetSchema);
    if (!attacks.ok) throw new Error(attacks.message);
    expect(new Set(attacks.value.attacks.map((a) => a.id)).size).toBe(attacks.value.attacks.length);
    const probes = loadFixture('eval/fixtures/off-case.demo-cough.json', OffCaseProbesSchema);
    if (!probes.ok) throw new Error(probes.message);
    expect(checkAgainstCase(probes.value, c)).toEqual([]);
  });
});

describe('checkAgainstCase', () => {
  const c = loadDemoCase();

  it('flags the wrong case, unknown ids and lines whose kind contradicts their labels', () => {
    const errors = checkAgainstCase(
      {
        caseId: 'other',
        lines: [
          { text: 'a', expected: ['made_up'], kind: 'paraphrase' },
          { text: 'b', expected: [], kind: 'paraphrase' },
          { text: 'c', expected: ['smoking'], kind: 'off_topic' },
        ],
      },
      c,
    );
    expect(errors).toEqual([
      'fixture is for case other, not demo-cough',
      'line 1 expects unknown rubric item "made_up"',
      'line 2 is a paraphrase but expects no rubric item',
      'line 3 is off_topic but expects rubric items',
    ]);
  });
});
