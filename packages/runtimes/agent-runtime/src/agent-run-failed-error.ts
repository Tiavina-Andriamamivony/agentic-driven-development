export class AgentRunFailedError extends Error {
  readonly runId: string;
  readonly reason: string;
  readonly costUsd: number | null;

  constructor(runId: string, reason: string, cost?: { readonly costUsd: number }) {
    super(`agent run ${runId} failed: ${reason}`);
    this.name = 'AgentRunFailedError';
    this.runId = runId;
    this.reason = reason;
    this.costUsd = cost?.costUsd ?? null;
  }
}
