import type { AuditEventPayload, AuditEventType } from '@lou/audit';
import { humanDuration } from './trace-render.ts';
import type { TraceTone } from './trace-render.ts';

export type { TraceTone };

export type TraceStep =
  | { readonly kind: 'section'; readonly phase: string }
  | { readonly kind: 'note'; readonly text: string; readonly tone: TraceTone }
  | { readonly kind: 'open'; readonly label: string }
  | {
      readonly kind: 'close';
      readonly label: string;
      readonly detail: string;
      readonly tone: TraceTone;
    }
  | { readonly kind: 'quiet' };

interface TraceContext {
  readonly busySince: number | undefined;
  readonly now: number;
  readonly phase: string | undefined;
  readonly afterCode: boolean;
}

type Handler = (
  payload: AuditEventPayload,
  context: TraceContext,
) => TraceStep | readonly TraceStep[];

const QUIET: TraceStep = { kind: 'quiet' };
const TESTS = 'tests';
const VERIFY = 'verify';

const AGENT_PHASES: Readonly<Record<string, string>> = {
  planner: 'plan',
  'test-designer': 'tests',
  'test-writer': 'tests',
  developer: 'code',
  reviewer: 'review',
};

const TOOL_PHASES: Readonly<Record<string, string>> = {
  'git.createBranch': 'branch',
  'git.stage': 'push',
};

const EVENT_PHASES: Readonly<Partial<Record<AuditEventType, string>>> = {
  review_started: 'review',
  git_commit: 'push',
  git_push: 'push',
  pr_created: 'pull request',
  human_approval: 'approval',
  human_rejection: 'approval',
  tool_denied: 'policy',
};

function phaseOf(payload: AuditEventPayload, context: TraceContext): string | undefined {
  const agent = payload.agent;
  if (agent !== undefined && AGENT_PHASES[agent] !== undefined) {
    return AGENT_PHASES[agent];
  }
  const tool = payload.tool;
  if (tool !== undefined && TOOL_PHASES[tool] !== undefined) {
    return TOOL_PHASES[tool];
  }
  if (isTestEvent(payload.event)) {
    return context.afterCode ? VERIFY : TESTS;
  }
  return EVENT_PHASES[payload.event];
}

function isTestEvent(event: AuditEventType): boolean {
  return event === 'test_started' || event === 'test_finished';
}

function elapsed(context: TraceContext): string {
  return context.busySince === undefined ? '' : humanDuration(context.now - context.busySince);
}

function withDuration(text: string, context: TraceContext): string {
  const duration = elapsed(context);
  return duration === '' ? text : `${text} ${duration}`;
}

function note(text: string, tone: TraceTone = 'info'): TraceStep {
  return { kind: 'note', text, tone };
}

function close(label: string, detail: string, tone: TraceTone): TraceStep {
  return { kind: 'close', label, detail, tone };
}

function target(payload: AuditEventPayload, fallback: string): string {
  return payload.target === undefined ? fallback : `${fallback} ${payload.target}`;
}

function agentFinished(payload: AuditEventPayload, context: TraceContext): TraceStep {
  const who = payload.agent ?? 'agent';
  if (payload.result === 'failure') {
    return close(who, '', 'bad');
  }
  return close(who, elapsed(context), 'info');
}

function reviewFinished(payload: AuditEventPayload): TraceStep {
  const approved = payload.result === 'success';
  const detail = approved ? 'approved' : 'changes requested';
  return close('review', detail, approved ? 'good' : 'bad');
}

function testsFinished(
  payload: AuditEventPayload,
  context: TraceContext,
): TraceStep | readonly TraceStep[] {
  const passed = payload.result === 'success';
  const verdict = `${payload.target ?? ''} ${passed ? 'passed' : 'failed'}`.trim();
  const settled = close(TESTS, withDuration(verdict, context), passed ? 'good' : 'bad');
  const reason = payload.reason;
  if (passed || reason === undefined || reason === '') {
    return settled;
  }
  return [settled, note(reason, 'bad')];
}

function fromTool(payload: AuditEventPayload): TraceStep {
  if (payload.tool === 'git.createBranch') {
    return note(target(payload, 'branch'));
  }
  if (payload.tool === 'git.stage') {
    return note(`staged ${payload.target ?? '0'} files`);
  }
  return QUIET;
}

const HANDLERS: Readonly<Record<AuditEventType, Handler>> = {
  agent_started: (payload) => ({ kind: 'open', label: payload.agent ?? 'agent' }),
  agent_finished: agentFinished,
  tool_called: fromTool,
  tool_denied: (payload) => note(target(payload, `denied ${payload.tool ?? 'command'}`), 'bad'),
  permission_requested: () => QUIET,
  human_approval: () => note('you approved', 'good'),
  human_rejection: () => note('you rejected', 'bad'),
  file_changed: () => QUIET,
  command_executed: () => QUIET,
  test_started: (payload) => ({ kind: 'open', label: target(payload, TESTS) }),
  test_finished: testsFinished,
  review_started: () => ({ kind: 'open', label: 'review' }),
  review_finished: reviewFinished,
  git_commit: (payload) => note(target(payload, 'commit')),
  git_push: () => note('pushed'),
  pr_created: (payload) => note(`pull request #${payload.target ?? '?'}`, 'good'),
};

function asSteps(value: TraceStep | readonly TraceStep[]): readonly TraceStep[] {
  return 'kind' in value ? [value] : value;
}

export function translate(payload: AuditEventPayload, context: TraceContext): readonly TraceStep[] {
  const [head, ...rest] = asSteps(HANDLERS[payload.event](payload, context));
  if (head === undefined) {
    return [];
  }
  const phase = phaseOf(payload, context);
  if (phase === undefined || phase === context.phase || head.kind === 'quiet') {
    return [head, ...rest];
  }
  return [{ kind: 'section', phase }, head, ...rest];
}
