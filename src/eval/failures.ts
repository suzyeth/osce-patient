import { ZodError } from 'zod';
import { BudgetError } from '../nebius/budget.js';

/**
 * One line of an evaluation failed: returns a short reason to record, so the run can go on.
 * A spending cap is not a line failure: it is rethrown so the whole run stops at once.
 */
export function failureReason(e: unknown): string {
  if (e instanceof BudgetError) throw e;
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
  const message = e instanceof Error ? e.message : String(e);
  return message.split('\n')[0] ?? 'unknown error';
}
