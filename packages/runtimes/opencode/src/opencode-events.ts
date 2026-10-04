import type { AgentActivity, TextActivity, ThinkingActivity } from '@lou/agent-runtime';

const REASONING = 'reasoning';
const TEXT = 'text';
const TOOL_USE = 'tool_use';
const STEP_FINISH = 'step_finish';

type Record_ = Record<string, unknown>;
type SpokenActivity = TextActivity | ThinkingActivity;

export function parseOpenCodeEvent(line: string): AgentActivity | undefined {
  const event = asRecord(safeParse(line));
  const type = event === undefined ? undefined : readString(event, 'type');
  const part = event === undefined ? undefined : asRecord(event['part']);
  if (type === undefined || part === undefined) {
    return undefined;
  }
  return toActivity(type, part);
}

function safeParse(line: string): unknown {
  try {
    const parsed: unknown = JSON.parse(line);
    return parsed;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record_ | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record_;
}

function readString(record: Record_, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function readNumber(record: Record_, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toActivity(type: string, part: Record_): AgentActivity | undefined {
  if (type === REASONING) {
    return spoken({ kind: 'thinking', text: readString(part, 'text') ?? '' });
  }
  if (type === TEXT) {
    return spoken({ kind: 'text', text: readString(part, 'text') ?? '' });
  }
  if (type === TOOL_USE) {
    return tool(part);
  }
  if (type === STEP_FINISH) {
    return usage(part);
  }
  return undefined;
}

function spoken<T extends SpokenActivity>(activity: T): T | undefined {
  return activity.text.trim() === '' ? undefined : activity;
}

function tool(part: Record_): AgentActivity | undefined {
  const name = readString(part, 'tool');
  const state = asRecord(part['state']);
  if (name === undefined || state === undefined) {
    return undefined;
  }
  return {
    kind: 'tool',
    tool: name,
    detail: detail(state),
    ok: readString(state, 'status') !== 'error',
  };
}

function detail(state: Record_): string {
  const title = readString(state, 'title');
  if (title !== undefined && title.trim() !== '') {
    return title.trim();
  }
  return readString(asRecord(state['metadata']) ?? {}, 'preview') ?? '';
}

function usage(part: Record_): AgentActivity | undefined {
  const tokens = asRecord(part['tokens']);
  if (tokens === undefined) {
    return undefined;
  }
  const cache = asRecord(tokens['cache']);
  return {
    kind: 'usage',
    inputTokens: readNumber(tokens, 'input') ?? 0,
    outputTokens: readNumber(tokens, 'output') ?? 0,
    reasoningTokens: readNumber(tokens, 'reasoning') ?? 0,
    cachedTokens: cache === undefined ? 0 : (readNumber(cache, 'read') ?? 0),
    costUsd: readNumber(part, 'cost') ?? 0,
  };
}
