import type { AuditEventPayload, AuditEventType } from '@lou/audit';

export type TraceTone = 'info' | 'good' | 'bad';

export type TraceStep =
  | { readonly kind: 'line'; readonly text: string; readonly tone: TraceTone }
  | { readonly kind: 'open'; readonly label: string }
  | { readonly kind: 'close'; readonly text: string; readonly tone: TraceTone }
  | { readonly kind: 'quiet' };

interface TraceContext {
  readonly busySince: number | undefined;
  readonly now: number;
}

type Handler = (payload: AuditEventPayload, context: TraceContext) => TraceStep;

const QUIET: TraceStep = { kind: 'quiet' };

export function humanDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
}

function elapsed(context: TraceContext): string {
  return context.busySince === undefined ? '' : humanDuration(context.now - context.busySince);
}

function suffix(duration: string): string {
  return duration === '' ? '' : ` in ${duration}`;
}

function name(payload: AuditEventPayload): string {
  return payload.agent ?? 'agent';
}

function deny(target: string | undefined, fallback: string): string {
  return target === undefined ? fallback : `${fallback} — ${target}`;
}

function withTarget(text: string, target: string | undefined): string {
  return target === undefined ? text : `${text} ${target}`;
}

function stage(payload: AuditEventPayload, context: TraceContext): string {
  return `tests ${payload.target ?? ''}`.trim().concat(suffix(elapsed(context)));
}

function agentFinished(payload: AuditEventPayload, context: TraceContext): TraceStep {
  const who = name(payload);
  if (payload.result === 'failure') {
    return { kind: 'close', text: `${who} failed`, tone: 'bad' };
  }
  return { kind: 'close', text: `${who} finished${suffix(elapsed(context))}`, tone: 'info' };
}

function reviewFinished(payload: AuditEventPayload): TraceStep {
  const approved = payload.result === 'success';
  return {
    kind: 'close',
    text: approved ? 'review approved' : 'review requested changes',
    tone: approved ? 'good' : 'bad',
  };
}

function testsFinished(payload: AuditEventPayload, context: TraceContext): TraceStep {
  const passed = payload.result === 'success';
  return {
    kind: 'close',
    text: stage(payload, context),
    tone: passed ? 'good' : 'bad',
  };
}

function fromCommit(payload: AuditEventPayload): TraceStep {
  return line(withTarget('commit', payload.target ?? 'recorded'));
}

function opened(label: string): TraceStep {
  return { kind: 'open', label };
}

function line(text: string, tone: TraceTone = 'info'): TraceStep {
  return { kind: 'line', text, tone };
}

function fromTool(payload: AuditEventPayload): TraceStep {
  if (payload.tool === 'git.createBranch') {
    return line(withTarget('branch', payload.target ?? 'created'));
  }
  if (payload.tool === 'git.stage') {
    return line(`staged ${payload.target ?? '0'} files`);
  }
  return QUIET;
}

const HANDLERS: Readonly<Record<AuditEventType, Handler>> = {
  agent_started: (payload) => opened(name(payload)),
  agent_finished: agentFinished,
  tool_called: fromTool,
  tool_denied: (payload) =>
    line(deny(payload.target, `denied ${payload.tool ?? 'command'}`), 'bad'),
  permission_requested: () => QUIET,
  human_approval: () => line('you approved', 'good'),
  human_rejection: () => line('you rejected', 'bad'),
  file_changed: () => QUIET,
  command_executed: () => QUIET,
  test_started: (payload) => opened(stage(payload, { busySince: undefined, now: 0 })),
  test_finished: testsFinished,
  review_started: () => opened('review'),
  review_finished: reviewFinished,
  git_commit: fromCommit,
  git_push: () => line('pushed'),
  pr_created: (payload) => line(`pull request #${payload.target ?? '?'}`, 'good'),
};

export function translate(payload: AuditEventPayload, context: TraceContext): TraceStep {
  return HANDLERS[payload.event](payload, context);
}
