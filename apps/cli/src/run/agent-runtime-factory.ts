import { ClaudeCodeRuntime } from '@lou/claude-code-runtime';
import type { AgentRuntime } from '@lou/agent-runtime';
import { OpenCodeRuntime } from '@lou/opencode-runtime';

export const AGENT_RUNTIME_NAMES = ['opencode', 'claude'] as const;

export type AgentRuntimeName = (typeof AGENT_RUNTIME_NAMES)[number];

export const DEFAULT_AGENT_RUNTIME: AgentRuntimeName = 'opencode';

export function readAgentRuntimeName(value: string): AgentRuntimeName | null {
  const found = AGENT_RUNTIME_NAMES.find((name) => name === value);
  return found ?? null;
}

export function createAgentRuntime(name: AgentRuntimeName): AgentRuntime {
  return name === 'claude' ? new ClaudeCodeRuntime() : new OpenCodeRuntime();
}
