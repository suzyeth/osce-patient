import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { failureReason } from '../../src/eval/failures.js';
import { BudgetError } from '../../src/nebius/budget.js';

describe('failureReason', () => {
  it('keeps the first line of an error message', () => {
    expect(failureReason(new Error('timed out\nstack detail'))).toBe('timed out');
  });

  it('turns a schema error into readable field messages', () => {
    const parsed = z.object({ trustDelta: z.number() }).safeParse({ trustDelta: 'high' });
    if (parsed.success) throw new Error('expected a schema error');
    expect(failureReason(parsed.error)).toBe('trustDelta: Expected number, received string');
  });

  it('rethrows a spending cap so the run stops', () => {
    expect(() => failureReason(new BudgetError('cap'))).toThrow(BudgetError);
  });
});
