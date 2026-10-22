import { readFileSync, renameSync, writeFileSync } from 'node:fs';

/** Which cap stopped the call: one session's, the day's, or the ledger itself (unreadable or unsavable). */
export type BudgetScope = 'session' | 'day' | 'ledger';

export class BudgetError extends Error {
  constructor(message: string, readonly scope: BudgetScope = 'ledger') {
    super(message);
    this.name = 'BudgetError';
  }
}

export interface BudgetLimits {
  sessionBudgetUsd: number;
  dailyBudgetUsd: number;
  budgetFile: string;
}

export interface Budget {
  /** Throws BudgetError when a call costing up to estimateUsd would pass the session or daily cap. */
  check(estimateUsd: number): void;
  /** Adds what a call cost to the session and to today's file; throws BudgetError if it cannot be saved. */
  record(costUsd: number): void;
  sessionSpentUsd(): number;
  daySpentUsd(): number;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function corrupt(file: string): BudgetError {
  return new BudgetError(`the budget file ${file} is corrupt; check today's spend before deleting it`);
}

/** Today's recorded spend. A missing file means nothing spent; an unreadable one stops spending. */
function readSpent(file: string, day: string): number {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw new BudgetError(`cannot read the budget file ${file}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw corrupt(file);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw corrupt(file);
  const record = parsed as { day?: unknown; spentUsd?: unknown };
  // Validate the whole record before comparing days, so a damaged file never counts as a new day.
  // A day after today means the clock went back, which is also treated as damage.
  if (typeof record.day !== 'string' || !DAY_PATTERN.test(record.day) || record.day > day) throw corrupt(file);
  const spent = record.spentUsd;
  if (typeof spent !== 'number' || !Number.isFinite(spent) || spent < 0) throw corrupt(file);
  return record.day === day ? spent : 0;
}

/** Writes a temporary file and renames it, so a crash never leaves a half-written ledger. */
function writeSpent(file: string, day: string, spentUsd: number): void {
  const temporary = `${file}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify({ day, spentUsd }));
    renameSync(temporary, file);
  } catch {
    throw new BudgetError(`could not save today's spend to ${file}, so no more calls are made`);
  }
}

/**
 * The one stateful module: a spend ledger. The session total lives in this closure and the daily
 * total in a small JSON file, so the daily cap holds across runs on the same day. Two sessions
 * running at the same moment can each overshoot by one call; that is acceptable for a single-user CLI.
 */
export function createBudget(limits: BudgetLimits, now: () => Date = () => new Date()): Budget {
  let session = 0;
  const today = () => dayOf(now());
  return {
    check(estimateUsd) {
      if (session + estimateUsd > limits.sessionBudgetUsd) {
        throw new BudgetError(`this session has reached its $${limits.sessionBudgetUsd} cap`, 'session');
      }
      if (readSpent(limits.budgetFile, today()) + estimateUsd > limits.dailyBudgetUsd) {
        throw new BudgetError(`today's $${limits.dailyBudgetUsd} cap has been reached`, 'day');
      }
    },
    record(costUsd) {
      if (!Number.isFinite(costUsd) || costUsd < 0) throw new BudgetError(`refusing to record an invalid cost (${costUsd})`);
      session += costUsd;
      const day = today();
      writeSpent(limits.budgetFile, day, readSpent(limits.budgetFile, day) + costUsd);
    },
    sessionSpentUsd: () => session,
    daySpentUsd: () => readSpent(limits.budgetFile, today()),
  };
}
