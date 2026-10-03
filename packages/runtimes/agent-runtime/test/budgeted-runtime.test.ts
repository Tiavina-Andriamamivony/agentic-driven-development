import { describe, expect, it } from 'vitest';
import { RunBudget } from '@lou/budget';
import { BudgetExceededError } from '@lou/budget';
import type { AgentRuntime } from '../src/runtime.ts';
import type { AgentRunInput, AgentRunResult, TokenUsage } from '../src/types.ts';
import { BudgetedAgentRuntime } from '../src/budgeted-runtime.ts';
import { AgentRunFailedError } from '../src/agent-run-failed-error.ts';

function failingRuntime(error: AgentRunFailedError): AgentRuntime {
  return {
    run(): Promise<AgentRunResult> {
      return Promise.reject(error);
    },
    getStatus(runId: string) {
      return Promise.resolve({ runId, running: true, finished: true });
    },
    interrupt() {
      return Promise.resolve();
    },
  };
}

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
  it('charges the budget for a run that failed', async () => {
    const budget = new RunBudget({ maxCostUsd: 1 });
    const runtime = new BudgetedAgentRuntime({
      inner: failingRuntime(
        new AgentRunFailedError('r', 'boom', {
          promptTokens: 120,
          completionTokens: 30,
          costUsd: 0.25,
        }),
      ),
      budget,
      now: () => 0,
    });

    await expect(runtime.run(INPUT)).rejects.toBeInstanceOf(AgentRunFailedError);

    expect(budget.totals.totalCostUsd).toBe(0.25);
  });

  it('charges the tokens a failed run reported', async () => {
    const budget = new RunBudget({});
    const runtime = new BudgetedAgentRuntime({
      inner: failingRuntime(
        new AgentRunFailedError('r', 'boom', {
          promptTokens: 120,
          completionTokens: 30,
          costUsd: 0,
        }),
      ),
      budget,
      now: () => 0,
    });

    await runtime.run(INPUT).catch(() => undefined);

    expect(budget.totals.totalTokens).toBe(150);
  });

  it('keeps the original failure, not a budget error, when both happen', async () => {
    const runtime = new BudgetedAgentRuntime({
      inner: failingRuntime(
        new AgentRunFailedError('r', 'boom', { promptTokens: 10, completionTokens: 5, costUsd: 5 }),
      ),
      budget: new RunBudget({ maxCostUsd: 1 }),
      now: () => 0,
    });

    await expect(runtime.run(INPUT)).rejects.toBeInstanceOf(AgentRunFailedError);
  });

  it('stops the next run once a failed run exhausted the budget', async () => {
    const budget = new RunBudget({ maxCostUsd: 1 });
    const runtime = new BudgetedAgentRuntime({
      inner: failingRuntime(
        new AgentRunFailedError('r', 'boom', { promptTokens: 10, completionTokens: 5, costUsd: 5 }),
      ),
      budget,
      now: () => 0,
    });

    await runtime.run(INPUT).catch(() => undefined);

    const next = new BudgetedAgentRuntime({
      inner: innerRuntime(okResult()),
      budget,
      now: () => 0,
    });
    await expect(next.run(INPUT)).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it('refuses to start a run once the budget is already exhausted', async () => {
    const budget = new RunBudget({ maxCostUsd: 1 });
    let calls = 0;
    const inner: AgentRuntime = {
      run(): Promise<AgentRunResult> {
        calls += 1;
        return Promise.resolve(okResult({ promptTokens: 0, completionTokens: 0, costUsd: 5 }));
      },
      getStatus(runId: string) {
        return Promise.resolve({ runId, running: true, finished: true });
      },
      interrupt() {
        return Promise.resolve();
      },
    };
    const runtime = new BudgetedAgentRuntime({ inner, budget, now: () => 0 });

    await runtime.run(INPUT).catch(() => undefined);
    await expect(runtime.run(INPUT)).rejects.toBeInstanceOf(BudgetExceededError);

    expect(calls).toBe(1);
  });

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
  it('passes the live output callback through to the wrapped runtime', async () => {
    let received: AgentRunInput | undefined;
    const runtime = new BudgetedAgentRuntime({
      inner: recordingRuntime((input) => {
        received = input;
      }),
      budget: new RunBudget({ maxCostUsd: 1 }),
    });
    const onOutput = (): void => undefined;

    await runtime.run({ ...INPUT, onOutput });

    expect(received?.onOutput).toBe(onOutput);
  });
});

function recordingRuntime(capture: (input: AgentRunInput) => void): AgentRuntime {
  return {
    run(input: AgentRunInput): Promise<AgentRunResult> {
      capture(input);
      return Promise.resolve(okResult());
    },
    getStatus(runId: string) {
      return Promise.resolve({ runId, running: false, finished: true });
    },
    interrupt() {
      return Promise.resolve();
    },
  };
}
