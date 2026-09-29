import { BudgetExceededError } from '@lou/budget';
import type { RunBudget } from '@lou/budget';
import type { AgentRuntime } from './runtime.ts';
import type { AgentRunInput, AgentRunResult, AgentStatus } from './types.ts';

export interface BudgetedRuntimeOptions {
  readonly inner: AgentRuntime;
  readonly budget: RunBudget;
  readonly now?: () => number;
}

export class BudgetedAgentRuntime implements AgentRuntime {
  private readonly inner: AgentRuntime;
  private readonly budget: RunBudget;
  private readonly now: () => number;

  constructor(options: BudgetedRuntimeOptions) {
    this.inner = options.inner;
    this.budget = options.budget;
    this.now = options.now ?? Date.now;
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const startedAt = this.now();
    const result = await this.inner.run(input);
    this.budget.record({
      promptTokens: result.usage?.promptTokens ?? 0,
      completionTokens: result.usage?.completionTokens ?? 0,
      elapsedMs: this.now() - startedAt,
      ...(result.usage?.costUsd !== undefined ? { costUsd: result.usage.costUsd } : {}),
    });
    const exceeded = this.budget.exhausted();
    if (exceeded !== null) {
      throw new BudgetExceededError(exceeded);
    }
    return result;
  }

  getStatus(runId: string): Promise<AgentStatus> {
    return this.inner.getStatus(runId);
  }

  interrupt(runId: string): Promise<void> {
    return this.inner.interrupt(runId);
  }
}
