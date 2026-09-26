import type { BudgetLimits, ExhaustedLimit, RunUsage } from './types.ts';

export interface BudgetTotals {
  readonly totalTokens: number;
  readonly totalCostUsd: number;
  readonly totalElapsedMs: number;
  readonly runCount: number;
}

export class RunBudget {
  private readonly limits: BudgetLimits;
  private totalTokens = 0;
  private totalCostUsd = 0;
  private totalElapsedMs = 0;
  private runCount = 0;

  constructor(limits: BudgetLimits) {
    this.limits = limits;
  }

  get totals(): BudgetTotals {
    return {
      totalTokens: this.totalTokens,
      totalCostUsd: this.totalCostUsd,
      totalElapsedMs: this.totalElapsedMs,
      runCount: this.runCount,
    };
  }

  record(usage: RunUsage): void {
    this.totalTokens += usage.promptTokens + usage.completionTokens;
    this.totalCostUsd += usage.costUsd ?? 0;
    this.totalElapsedMs += usage.elapsedMs ?? 0;
    this.runCount += 1;
  }

  exhausted(): ExhaustedLimit | null {
    const maxCostUsd = this.limits.maxCostUsd;
    if (maxCostUsd !== undefined && this.totalCostUsd > maxCostUsd) {
      return {
        name: 'cost',
        details: `max cost ${maxCostUsd.toFixed(2)} usd exceeded (${this.totalCostUsd.toFixed(2)} usd)`,
      };
    }
    const maxMinutes = this.limits.maxMinutes;
    if (maxMinutes !== undefined && this.totalElapsedMs > maxMinutes * 60_000) {
      return {
        name: 'minutes',
        details: `max runtime ${maxMinutes} minutes exceeded`,
      };
    }
    const maxRuns = this.limits.maxRuns;
    if (maxRuns !== undefined && this.runCount > maxRuns) {
      return {
        name: 'runs',
        details: `max ${maxRuns} agent runs exceeded`,
      };
    }
    return null;
  }
}
