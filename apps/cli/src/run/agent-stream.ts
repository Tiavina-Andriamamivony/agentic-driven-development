import type { AgentActivity } from '@lou/agent-runtime';

export interface StreamView {
  readonly activity: string;
  readonly summary: string;
  readonly thoughts: number;
  readonly tools: number;
  readonly tokens: number;
  readonly costUsd: number;
}

export const EMPTY_STREAM: StreamView = {
  activity: '',
  summary: '',
  thoughts: 0,
  tools: 0,
  tokens: 0,
  costUsd: 0,
};

const MAX_ACTIVITY = 160;
const SUMMARY_PATTERN = /^SUMMARY\s*:\s*(.+)$/i;
const PROTOCOL_PATTERN =
  /^(SUMMARY|CHANGED|TEST_PLAN|QUESTION|PLAN_[A-Z]+|APPROVED|CHANGES_REQUESTED|BLOCKED)\s*:/i;
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const OSC_PATTERN = new RegExp(`${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)`, 'g');
const CSI_PATTERN = new RegExp(`${ESC}\\[[0-9;?]*[a-zA-Z]`, 'g');

export function stripAnsi(text: string): string {
  return text.replace(OSC_PATTERN, '').replace(CSI_PATTERN, '');
}

export function feedStream(previous: StreamView, chunk: string): StreamView {
  const lines = stripAnsi(afterLastReturn(chunk)).split('\n');
  const current = lastMeaningful(lines);
  return {
    ...previous,
    activity: current === undefined ? previous.activity : truncate(current, MAX_ACTIVITY),
    summary: lines.reduce(readSummary, previous.summary),
  };
}

export function feedActivity(previous: StreamView, activity: AgentActivity): StreamView {
  if (activity.kind === 'tool') {
    return { ...previous, activity: toolLabel(activity), tools: previous.tools + 1 };
  }
  if (activity.kind === 'usage') {
    return countUsage(previous, activity);
  }
  const spoken = feedStream(previous, activity.text);
  return activity.kind === 'thinking' ? { ...spoken, thoughts: previous.thoughts + 1 } : spoken;
}

export function toolLabel(activity: Extract<AgentActivity, { kind: 'tool' }>): string {
  const detail = oneline(activity.detail);
  return detail === '' ? activity.tool : `${activity.tool} ${detail}`;
}

function countUsage(
  previous: StreamView,
  activity: Extract<AgentActivity, { kind: 'usage' }>,
): StreamView {
  return {
    ...previous,
    tokens: activity.inputTokens + activity.outputTokens,
    costUsd: activity.costUsd,
  };
}

function oneline(text: string): string {
  return stripAnsi(text)
    .split('\n')
    .map((line) => line.trim())
    .join(' ')
    .trim();
}

function afterLastReturn(chunk: string): string {
  const cut = chunk.lastIndexOf('\r');
  return cut < 0 ? chunk : chunk.slice(cut + 1);
}

function lastMeaningful(lines: readonly string[]): string | undefined {
  return [...lines].reverse().find(isActivity)?.trim();
}

function isActivity(line: string): boolean {
  return line.trim().length > 0 && !PROTOCOL_PATTERN.test(line.trim());
}

function readSummary(current: string, line: string): string {
  const match = SUMMARY_PATTERN.exec(line.trim());
  return match?.[1]?.trim() ?? current;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `…${text.slice(text.length - max + 1)}`;
}
