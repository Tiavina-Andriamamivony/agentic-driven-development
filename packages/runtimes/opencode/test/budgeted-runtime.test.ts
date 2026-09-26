import { describe, expect, it } from 'vitest';
import { RunBudget } from '@lou/budget';
import { BudgetExceededError } from '@lou/budget';
import type { AgentRuntime } from '../src/runtime.ts';
import type { AgentRunInput, AgentRunResult, TokenUsage } from '../src/types.ts';
import { BudgetedAgentRuntime } from '../src/budgeted-runtime.ts';

function okResult(usage?: TokenUsage): AgentRunResult {
  return {
    runId: 'r',
    exitCode: 0,
    stdout: 'ok',
    stderr: '',
    interrupted: false,
    ...(usage !== undefined ? { usage } : {}),
  };
}

function innerRuntime(reply: AgentRunResult): AgentRuntime {
  return {
    run(): Promise<AgentRunResult> {
      return Promise.resolve(reply);
    },
    getStatus(runId: string) {
      return Promise.resolve({ runId, running: true, finished: true });
    },
    interrupt() {
      return Promise.resolve();
    },
  };
}

const INPUT: AgentRunInput = { runId: 'r', instructions: 'work', workspace: '/work' };

describe('BudgetedAgentRuntime', () => {
  it('delegates to the inner runtime and returns its result unchanged', async () => {
    const runtime = new BudgetedAgentRuntime({
      inner: innerRuntime(okResult()),
      budget: new RunBudget({}),
      now: () => 0,
    });

    const result = await runtime.run(INPUT);

    expect(result.stdout).toBe('ok');
  });

  it('records reported usage and elapsed time in the budget', async () => {
    let clock = 0;
    const inner: AgentRuntime = {
      run(): Promise<AgentRunResult> {
        clock += 500;
        return Promise.resolve(okResult({ promptTokens: 10, completionTokens: 5, costUsd: 0.3 }));
      },
      getStatus(runId: string) {
        return Promise.resolve({ runId, running: true, finished: true });
      },
      interrupt() {
        return Promise.resolve();
      },
    };
    const budget = new RunBudget({});
    const runtime = new BudgetedAgentRuntime({ inner, budget, now: () => clock });

    await runtime.run(INPUT);

    expect(budget.totals).toEqual({
      totalTokens: 15,
      totalCostUsd: 0.3,
      totalElapsedMs: 500,
      runCount: 1,
    });
  });

  it('records zero usage when the inner runtime reports none', async () => {
    const budget = new RunBudget({});
    const runtime = new BudgetedAgentRuntime({
      inner: innerRuntime(okResult()),
      budget,
      now: () => 0,
    });

    await runtime.run(INPUT);

    expect(budget.totals.totalTokens).toBe(0);
    expect(budget.totals.totalCostUsd).toBe(0);
  });

  it('throws BudgetExceededError once a limit is reached', async () => {
    const budget = new RunBudget({ maxRuns: 1 });
    const runtime = new BudgetedAgentRuntime({
      inner: innerRuntime(okResult()),
      budget,
      now: () => 0,
    });

    await runtime.run(INPUT);
    await expect(runtime.run(INPUT)).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it('delegates getStatus and interrupt to the inner runtime', async () => {
    const runtime = new BudgetedAgentRuntime({
      inner: innerRuntime(okResult()),
      budget: new RunBudget({}),
      now: () => 0,
    });

    await expect(runtime.getStatus('r')).resolves.toEqual({
      runId: 'r',
      running: true,
      finished: true,
    });
    await expect(runtime.interrupt('r')).resolves.toBeUndefined();
  });
});
