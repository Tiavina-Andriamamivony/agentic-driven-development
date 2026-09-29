import { describe, expect, it } from 'vitest';
import { AgentRunFailedError } from '../src/agent-run-failed-error.ts';

describe('AgentRunFailedError', () => {
  it('names the run and the reason in the message', () => {
    const error = new AgentRunFailedError('RUN-001', 'model overloaded');

    expect(error.message).toBe('agent run RUN-001 failed: model overloaded');
  });

  it('exposes the run id and the reason', () => {
    const error = new AgentRunFailedError('RUN-001', 'model overloaded');

    expect(error.runId).toBe('RUN-001');
    expect(error.reason).toBe('model overloaded');
  });

  it('is an Error, so existing catch blocks keep working', () => {
    expect(new AgentRunFailedError('RUN-001', 'x')).toBeInstanceOf(Error);
  });

  it('carries the spend so a failed run can still be charged', () => {
    const error = new AgentRunFailedError('RUN-001', 'model overloaded', {
      promptTokens: 900,
      completionTokens: 120,
      costUsd: 0.3,
    });

    expect(error.usage).toEqual({ promptTokens: 900, completionTokens: 120, costUsd: 0.3 });
  });

  it('reports no cost when the runtime could not tell', () => {
    const error = new AgentRunFailedError('RUN-001', 'truncated output');

    expect(error.usage).toBeNull();
  });
});
