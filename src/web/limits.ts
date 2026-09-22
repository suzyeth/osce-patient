import { z } from 'zod';
import { codeMatches } from './sessionCookie.js';

/**
 * What a public page is allowed to cost. Token Factory has no hard limit of its own, so the
 * station's own caps are the only thing between a public URL and an empty credit balance.
 */
export const WebLimitsSchema = z.object({
  /** The code a judge or tester types to practise; anyone without it sees the sample report. */
  accessCode: z.string().min(4),
  /** A whole station, including the report: refused once reached. */
  sessionBudgetUsd: z.number().positive(),
  /** Everything the site spends in a day, across all visitors. */
  dailyBudgetUsd: z.number().positive(),
  /** Turns one station may take, so a single visitor cannot hold the day's budget open. */
  maxTurns: z.number().int().positive(),
  /** Characters accepted in one line; longer input is refused before any model call. */
  maxInputChars: z.number().int().positive(),
});
export type WebLimits = z.infer<typeof WebLimitsSchema>;

export const WEB_LIMIT_DEFAULTS = {
  sessionBudgetUsd: 0.05,
  dailyBudgetUsd: 2,
  maxTurns: 40,
  maxInputChars: 500,
} as const;

export function loadWebLimits(env: NodeJS.ProcessEnv = process.env): WebLimits {
  const num = (value: string | undefined, fallback: number) => (value === undefined || value.trim() === '' ? fallback : Number(value));
  return WebLimitsSchema.parse({
    accessCode: env.OSCE_ACCESS_CODE ?? '',
    sessionBudgetUsd: num(env.OSCE_WEB_SESSION_BUDGET_USD, WEB_LIMIT_DEFAULTS.sessionBudgetUsd),
    dailyBudgetUsd: num(env.OSCE_WEB_DAILY_BUDGET_USD, WEB_LIMIT_DEFAULTS.dailyBudgetUsd),
    maxTurns: num(env.OSCE_WEB_MAX_TURNS, WEB_LIMIT_DEFAULTS.maxTurns),
    maxInputChars: num(env.OSCE_WEB_MAX_INPUT_CHARS, WEB_LIMIT_DEFAULTS.maxInputChars),
  });
}

export type RefusalReason = 'no_code' | 'time_up' | 'too_many_turns' | 'input_too_long' | 'session_budget' | 'empty';

export interface Refusal {
  reason: RefusalReason;
  /** What the candidate is told; never mentions money or internals. */
  message: string;
}

const MESSAGES: Record<RefusalReason, string> = {
  no_code: 'This practice station needs an access code. Judges and testers: the code is in the submission.',
  time_up: 'Time is up for this station. Finish to see your report.',
  too_many_turns: 'This station has reached its limit of questions. Finish to see your report.',
  input_too_long: 'That message is too long for one question. Please shorten it.',
  session_budget: 'This station has reached its usage limit. Finish to see your report.',
  empty: 'Type a question for the patient.',
};

export function refuse(reason: RefusalReason): Refusal {
  return { reason, message: MESSAGES[reason] };
}

export interface TurnAllowance {
  secondsLeft: number;
  turnsUsed: number;
  spentUsd: number;
  input: string;
}

/**
 * Everything that can stop a turn before a model is called, in the order a candidate would meet
 * it. The spending cap is last because the others cost nothing to check.
 */
export function checkTurn(limits: WebLimits, allowance: TurnAllowance): Refusal | null {
  const input = allowance.input.trim();
  if (input === '') return refuse('empty');
  if (input.length > limits.maxInputChars) return refuse('input_too_long');
  if (allowance.secondsLeft <= 0) return refuse('time_up');
  if (allowance.turnsUsed >= limits.maxTurns) return refuse('too_many_turns');
  if (allowance.spentUsd >= limits.sessionBudgetUsd) return refuse('session_budget');
  return null;
}

/** The access code gate. An empty code in the environment means nobody can practise. */
export function checkAccess(limits: WebLimits, given: string | undefined): Refusal | null {
  if (given === undefined || !codeMatches(given, limits.accessCode)) return refuse('no_code');
  return null;
}
