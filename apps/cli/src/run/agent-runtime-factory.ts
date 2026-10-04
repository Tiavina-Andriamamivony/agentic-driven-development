import { ClaudeCodeRuntime } from '@lou/claude-code-runtime';
import type { AgentRuntime } from '@lou/agent-runtime';
import type { CommandRunner } from '@lou/command-runner';
import { OpenCodeRuntime } from '@lou/opencode-runtime';

export const AGENT_RUNTIME_NAMES = ['opencode', 'claude'] as const;

export type AgentRuntimeName = (typeof AGENT_RUNTIME_NAMES)[number];

export const DEFAULT_AGENT_RUNTIME: AgentRuntimeName = 'opencode';

export function readAgentRuntimeName(value: string): AgentRuntimeName | null {
  const found = AGENT_RUNTIME_NAMES.find((name) => name === value);
  return found ?? null;
}

interface AgentRuntimeBuildOptions {
  readonly runner?: CommandRunner;
  readonly timeoutMs?: number;
}

export function createAgentRuntime(
  name: AgentRuntimeName,
  options?: AgentRuntimeBuildOptions,
): AgentRuntime {
  const settings = {
    ...(options?.runner !== undefined ? { runner: options.runner } : {}),
    ...(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  };
  return name === 'claude' ? new ClaudeCodeRuntime(settings) : new OpenCodeRuntime(settings);
}
