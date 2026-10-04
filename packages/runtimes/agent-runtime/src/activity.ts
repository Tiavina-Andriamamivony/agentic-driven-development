export interface ThinkingActivity {
  readonly kind: 'thinking';
  readonly text: string;
}

export interface ToolActivity {
  readonly kind: 'tool';
  readonly tool: string;
  readonly detail: string;
  readonly ok: boolean;
}

export interface TextActivity {
  readonly kind: 'text';
  readonly text: string;
}

export interface UsageActivity {
  readonly kind: 'usage';
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly cachedTokens: number;
  readonly costUsd: number;
}

export type AgentActivity = ThinkingActivity | ToolActivity | TextActivity | UsageActivity;

export type ActivityHandler = (activity: AgentActivity) => void;
