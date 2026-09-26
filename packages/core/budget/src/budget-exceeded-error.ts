import type { ExhaustedLimit } from './types.ts';

export class BudgetExceededError extends Error {
  readonly limit: ExhaustedLimit;

  constructor(limit: ExhaustedLimit) {
    super(`run budget exceeded: ${limit.details}`);
    this.name = 'BudgetExceededError';
    this.limit = limit;
  }
}
