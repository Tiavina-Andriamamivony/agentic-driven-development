export class AgentRunFailedError extends Error {
  readonly runId: string;
  readonly reason: string;

  constructor(runId: string, reason: string) {
    super(`agent run ${runId} failed: ${reason}`);
    this.name = 'AgentRunFailedError';
    this.runId = runId;
    this.reason = reason;
  }
}
