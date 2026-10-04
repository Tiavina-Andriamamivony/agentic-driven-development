import type { CommandResult, OutputHandler } from '@lou/command-runner';
import type { ActivityHandler } from './activity.ts';

export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly costUsd?: number;
}

export interface AgentRunInput {
  readonly runId: string;
  readonly agent?: string;
  readonly model?: string;
  readonly mcp?: Readonly<Record<string, string>>;
  readonly instructions: string;
  readonly workspace: string;
  readonly onOutput?: OutputHandler;
  readonly onActivity?: ActivityHandler;
}

export interface AgentRunResult extends CommandResult {
  readonly runId: string;
  readonly usage?: TokenUsage;
}

export interface AgentStatus {
  readonly runId: string;
  readonly running: boolean;
  readonly finished: boolean;
  readonly interrupted?: boolean;
  readonly exitCode?: number;
}
