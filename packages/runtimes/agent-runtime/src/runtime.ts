import type { AgentRunInput, AgentRunResult, AgentStatus } from './types.ts';

export interface AgentRuntime {
  run(input: AgentRunInput): Promise<AgentRunResult>;
  getStatus(runId: string): Promise<AgentStatus>;
  interrupt(runId: string): Promise<void>;
}
