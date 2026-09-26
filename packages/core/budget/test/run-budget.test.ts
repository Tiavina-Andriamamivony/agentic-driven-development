import { describe, expect, it } from 'vitest';
import { RunBudget } from '../src/run-budget.ts';

describe('RunBudget', () => {
  it('accumulates usage across runs', () => {
    const budget = new RunBudget({});
    budget.record({ promptTokens: 10, completionTokens: 5, costUsd: 0.25, elapsedMs: 1000 });
    budget.record({ promptTokens: 1, completionTokens: 2 });

    expect(budget.totals).toEqual({
      totalTokens: 18,
      totalCostUsd: 0.25,
      totalElapsedMs: 1000,
      runCount: 2,
    });
  });

  it('reports nothing while within the cost limit', () => {
    const budget = new RunBudget({ maxCostUsd: 1 });
    budget.record({ promptTokens: 0, completionTokens: 0, costUsd: 0.8 });

    expect(budget.exhausted()).toBeNull();
  });

  it('reports the cost limit once it is exceeded', () => {
    const budget = new RunBudget({ maxCostUsd: 1 });
    budget.record({ promptTokens: 0, completionTokens: 0, costUsd: 0.8 });
    budget.record({ promptTokens: 0, completionTokens: 0, costUsd: 0.5 });

    expect(budget.exhausted()?.name).toBe('cost');
  });

  it('reports the runtime minutes limit once it is exceeded', () => {
    const budget = new RunBudget({ maxMinutes: 1 });
    budget.record({ promptTokens: 0, completionTokens: 0, elapsedMs: 60_001 });

    expect(budget.exhausted()?.name).toBe('minutes');
  });

  it('stays within the minutes limit at the boundary', () => {
    const budget = new RunBudget({ maxMinutes: 1 });
    budget.record({ promptTokens: 0, completionTokens: 0, elapsedMs: 60_000 });

    expect(budget.exhausted()).toBeNull();
  });

  it('reports the run count limit once it is exceeded', () => {
    const budget = new RunBudget({ maxRuns: 2 });
    budget.record({ promptTokens: 0, completionTokens: 0 });
    budget.record({ promptTokens: 0, completionTokens: 0 });

    expect(budget.exhausted()).toBeNull();

    budget.record({ promptTokens: 0, completionTokens: 0 });

    expect(budget.exhausted()?.name).toBe('runs');
  });
});
