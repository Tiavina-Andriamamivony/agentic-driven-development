import { describe, expect, it } from 'vitest';
import { BudgetExceededError } from '../src/budget-exceeded-error.ts';

describe('BudgetExceededError', () => {
  it('carries the exhausted limit and a readable message', () => {
    const error = new BudgetExceededError({
      name: 'cost',
      details: 'max cost 1.00 usd exceeded (1.30 usd)',
    });

    expect(error.name).toBe('BudgetExceededError');
    expect(error.limit).toEqual({ name: 'cost', details: 'max cost 1.00 usd exceeded (1.30 usd)' });
    expect(error.message).toBe('run budget exceeded: max cost 1.00 usd exceeded (1.30 usd)');
  });
});
