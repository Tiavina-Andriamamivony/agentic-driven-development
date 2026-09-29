import { BudgetExceededError } from '@lou/budget';
import type { RunBudget } from '@lou/budget';
import { AgentRunFailedError } from './agent-run-failed-error.ts';
import type { AgentRuntime } from './runtime.ts';
import type { AgentRunInput, AgentRunResult, AgentStatus, TokenUsage } from './types.ts';

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
    this.assertWithinBudget();
    const startedAt = this.now();
    try {
      const result = await this.inner.run(input);
      this.chargeSuccess(result, startedAt);
      return result;
    } catch (error) {
      this.chargeFailed(error, startedAt);
      throw error;
    }
  }

  getStatus(runId: string): Promise<AgentStatus> {
    return this.inner.getStatus(runId);
  }

  interrupt(runId: string): Promise<void> {
    return this.inner.interrupt(runId);
  }

  private assertWithinBudget(): void {
    const exceeded = this.budget.exhausted();
    if (exceeded !== null) {
      throw new BudgetExceededError(exceeded);
    }
  }

  private chargeSuccess(result: AgentRunResult, startedAt: number): void {
    this.charge(result.usage, startedAt);
    this.assertWithinBudget();
  }

  private chargeFailed(error: unknown, startedAt: number): void {
    if (!(error instanceof AgentRunFailedError)) {
      return;
    }
    this.charge(
      error.costUsd === null
        ? undefined
        : { promptTokens: 0, completionTokens: 0, costUsd: error.costUsd },
      startedAt,
    );
  }

  private charge(usage: TokenUsage | undefined, startedAt: number): void {
    this.budget.record({
      promptTokens: usage?.promptTokens ?? 0,
      completionTokens: usage?.completionTokens ?? 0,
      elapsedMs: this.now() - startedAt,
      ...(usage?.costUsd !== undefined ? { costUsd: usage.costUsd } : {}),
    });
  }
}
