import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BudgetError, createBudget } from '../../src/nebius/budget.js';

const dir = mkdtempSync(join(tmpdir(), 'osce-budget-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let count = 0;
const freshFile = () => join(dir, `budget-${(count += 1)}.json`);
const limits = (budgetFile: string, sessionBudgetUsd = 0.05, dailyBudgetUsd = 0.5) => ({
  sessionBudgetUsd,
  dailyBudgetUsd,
  budgetFile,
});
const day = (iso: string) => () => new Date(iso);

describe('createBudget', () => {
  it('allows spending under both caps and records it', () => {
    const b = createBudget(limits(freshFile()));
    expect(() => b.check(0.01)).not.toThrow();
    b.record(0.004);
    expect(b.sessionSpentUsd()).toBeCloseTo(0.004, 10);
    expect(b.daySpentUsd()).toBeCloseTo(0.004, 10);
  });

  it('refuses a call that would pass the session cap', () => {
    const b = createBudget(limits(freshFile(), 0.01));
    b.record(0.009);
    expect(() => b.check(0.002)).toThrow(BudgetError);
    expect(() => b.check(0.002)).toThrow(/session/);
  });

  it('keeps the daily cap across sessions on the same day', () => {
    const file = freshFile();
    const morning = day('2026-09-21T09:00:00Z');
    createBudget(limits(file, 1, 0.02), morning).record(0.015);
    const later = createBudget(limits(file, 1, 0.02), day('2026-09-21T18:00:00Z'));
    expect(later.daySpentUsd()).toBeCloseTo(0.015, 10);
    expect(() => later.check(0.01)).toThrow(/today/);
  });

  it('starts a new day at zero', () => {
    const file = freshFile();
    createBudget(limits(file, 1, 0.02), day('2026-09-21T09:00:00Z')).record(0.015);
    const tomorrow = createBudget(limits(file, 1, 0.02), day('2026-09-22T09:00:00Z'));
    expect(tomorrow.daySpentUsd()).toBe(0);
    expect(() => tomorrow.check(0.01)).not.toThrow();
  });

  it('stops spending when the budget file is corrupt', () => {
    const file = freshFile();
    writeFileSync(file, '{oops');
    expect(() => createBudget(limits(file)).check(0.001)).toThrow(/corrupt/);
  });

  it('treats a ledger holding JSON null as corrupt, not as a crash', () => {
    const file = freshFile();
    writeFileSync(file, 'null');
    expect(() => createBudget(limits(file)).check(0.001)).toThrow(BudgetError);
  });

  it.each([
    ['an empty object', '{}'],
    ['an array', '[]'],
    ['no day', '{"spentUsd": 0.4}'],
    ['a mangled day', '{"day": "21/09/2026", "spentUsd": 0.4}'],
    ['a negative spend', '{"day": "2026-09-21", "spentUsd": -1}'],
    ['a day in the future', '{"day": "2026-09-22", "spentUsd": 0.1}'],
    ['an old day with no spend', '{"day": "2026-09-20"}'],
  ])('treats a ledger with %s as corrupt instead of starting from zero', (_label, text) => {
    const file = freshFile();
    writeFileSync(file, text);
    expect(() => createBudget(limits(file), day('2026-09-21T09:00:00Z')).check(0.001)).toThrow(/corrupt/);
  });

  it('stops when the spend cannot be saved', () => {
    const unwritable = join(dir, 'no-such-folder', 'budget.json');
    expect(() => createBudget(limits(unwritable)).record(0.001)).toThrow(/could not save/);
  });

  it('refuses to record a cost that is not a real amount', () => {
    const b = createBudget(limits(freshFile()));
    expect(() => b.record(Number.NaN)).toThrow(BudgetError);
    expect(() => b.record(-1)).toThrow(BudgetError);
  });
});
