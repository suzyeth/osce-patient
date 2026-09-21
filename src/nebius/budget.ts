import { readFileSync, writeFileSync } from 'node:fs';

export class BudgetError extends Error {
  constructor(message: string) {
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
  /** Adds what a finished call actually cost to the session and to today's file. */
  record(costUsd: number): void;
  sessionSpentUsd(): number;
  daySpentUsd(): number;
}

function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
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
  let parsed: { day?: unknown; spentUsd?: unknown };
  try {
    parsed = JSON.parse(text) as { day?: unknown; spentUsd?: unknown };
  } catch {
    throw new BudgetError(`the budget file ${file} is corrupt; check today's spend before deleting it`);
  }
  if (parsed.day !== day) return 0;
  if (typeof parsed.spentUsd !== 'number' || !Number.isFinite(parsed.spentUsd)) {
    throw new BudgetError(`the budget file ${file} is corrupt; check today's spend before deleting it`);
  }
  return parsed.spentUsd;
}

/**
 * The one stateful module: a spend ledger. The session total lives in this closure and the daily
 * total in a small JSON file, so the daily cap holds across runs on the same day.
 */
export function createBudget(limits: BudgetLimits, now: () => Date = () => new Date()): Budget {
  let session = 0;
  const today = () => dayOf(now());
  return {
    check(estimateUsd) {
      if (session + estimateUsd > limits.sessionBudgetUsd) {
        throw new BudgetError(`this session has reached its $${limits.sessionBudgetUsd} cap`);
      }
      if (readSpent(limits.budgetFile, today()) + estimateUsd > limits.dailyBudgetUsd) {
        throw new BudgetError(`today's $${limits.dailyBudgetUsd} cap has been reached`);
      }
    },
    record(costUsd) {
      session += costUsd;
      const day = today();
      writeFileSync(limits.budgetFile, JSON.stringify({ day, spentUsd: readSpent(limits.budgetFile, day) + costUsd }));
    },
    sessionSpentUsd: () => session,
    daySpentUsd: () => readSpent(limits.budgetFile, today()),
  };
}
