import type { TokenUsage } from './types.ts';

export class AgentRunFailedError extends Error {
  readonly runId: string;
  readonly reason: string;
  readonly usage: TokenUsage | null;

  constructor(runId: string, reason: string, usage?: TokenUsage) {
    super(`agent run ${runId} failed: ${reason}`);
    this.name = 'AgentRunFailedError';
    this.runId = runId;
    this.reason = reason;
    this.usage = usage ?? null;
  }
}
