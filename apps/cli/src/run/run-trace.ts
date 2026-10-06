import type { AgentActivity } from '@lou/agent-runtime';
import type { AuditEventPayload } from '@lou/audit';
import type { Styler } from '../ux/style.ts';
import { EMPTY_STREAM, feedActivity, toolLabel } from './agent-stream.ts';
import type { StreamView } from './agent-stream.ts';
import {
  countLabel,
  detailLine,
  doneLine,
  headerLines,
  humanDuration,
  liveLine,
  noteLine,
  sectionLine,
  statsLine,
  hasActivity,
  toolLine,
} from './trace-render.ts';
import { translate } from './trace-steps.ts';
import type { TraceStep, TraceTone } from './trace-steps.ts';

export interface TraceTicket {
  readonly issueNumber: number;
  readonly title: string;
  readonly workspace: string;
}

interface RunTraceOptions {
  readonly out: (line: string) => void;
  readonly write: (text: string) => void;
  readonly isTty: boolean;
  readonly now: () => number;
  readonly columns?: () => number;
  readonly style: Styler;
}

export interface RunTrace {
  begin(ticket: TraceTicket): void;
  event(payload: AuditEventPayload): void;
  note(text: string): void;
  activity(activity: AgentActivity): void;
  work<T>(label: string, run: () => Promise<T>): Promise<T>;
  close(): void;
}

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const QUIET_FLOOR_MS = 15_000;
const SPIN_MS = 120;
const BEAT_MS = 30_000;
const TIMER_FLOOR_MS = 5_000;
const CLEAR = '\r\x1b[2K';
const DEFAULT_COLUMNS = 80;
const CODE = 'code';

class LiveTrace implements RunTrace {
  private readonly period: number;
  private readonly ticker: () => void;
  private timer: ReturnType<typeof setInterval> | undefined;
  private label: string | undefined;
  private since = 0;
  private lastEvent = 0;
  private phase: string | undefined;
  private readonly phases = new Set<string>();
  private stream: StreamView = EMPTY_STREAM;
  private frame = 0;
  private files = 0;
  private readonly options: RunTraceOptions;

  constructor(options: RunTraceOptions) {
    this.options = options;
    this.period = options.isTty ? SPIN_MS : BEAT_MS;
    this.ticker = (): void => {
      this.refresh();
    };
  }

  begin(ticket: TraceTicket): void {
    this.options.out('');
    for (const line of headerLines({
      issueNumber: ticket.issueNumber,
      title: ticket.title,
      workspace: ticket.workspace,
      style: this.options.style,
    })) {
      this.options.out(line);
    }
    this.options.out('');
  }

  event(payload: AuditEventPayload): void {
    if (payload.event === 'file_changed') {
      this.files += 1;
      return;
    }
    const context = {
      busySince: this.since,
      now: this.options.now(),
      phase: this.phase,
      afterCode: this.phases.has(CODE),
    };
    for (const step of translate(payload, context)) {
      this.apply(step);
    }
  }

  note(text: string): void {
    this.options.out(noteLine({ text, tone: 'info', style: this.options.style }));
  }

  activity(activity: AgentActivity): void {
    if (this.label === undefined) {
      return;
    }
    if (activity.kind === 'tool') {
      this.recordTool(activity);
    }
    this.stream = feedActivity(this.stream, activity);
    this.lastEvent = this.options.now();
    this.refresh();
  }

  async work<T>(label: string, run: () => Promise<T>): Promise<T> {
    this.open(label);
    try {
      const value = await run();
      this.settle(label, 'info');
      return value;
    } catch (error) {
      this.settle(label, 'bad');
      throw error;
    }
  }

  close(): void {
    this.flushFiles();
    this.stop();
  }

  private apply(step: TraceStep): void {
    if (step.kind === 'quiet') {
      return;
    }
    if (step.kind === 'section') {
      this.section(step.phase);
      return;
    }
    if (step.kind === 'note') {
      this.options.out(noteLine({ text: step.text, tone: step.tone, style: this.options.style }));
      return;
    }
    if (step.kind === 'open') {
      this.open(step.label);
      return;
    }
    this.settle(step.label, step.tone, step.detail);
  }

  private section(phase: string): void {
    this.phase = phase;
    this.phases.add(phase);
    this.write(sectionLine(phase, this.options.style));
  }

  private open(label: string): void {
    this.stop();
    this.label = label;
    this.since = this.options.now();
    this.lastEvent = this.since;
    this.stream = EMPTY_STREAM;
    this.timer = setInterval(this.ticker, this.period);
    this.timer.unref();
    if (this.options.isTty) {
      this.refresh();
    }
  }

  private settle(label: string, tone: TraceTone, detail = ''): void {
    const since = this.since;
    this.erase();
    this.stop();
    this.write(
      doneLine({
        ok: tone !== 'bad',
        label,
        detail: detail === '' ? humanDuration(this.elapsed(since)) : detail,
        style: this.options.style,
      }),
    );
    if (this.stream.summary !== '') {
      this.write(detailLine({ text: this.stream.summary, style: this.options.style }));
    }
    this.writeStats();
  }

  private writeStats(): void {
    const stats = {
      thoughts: this.stream.thoughts,
      tools: this.stream.tools,
      tokens: this.stream.tokens,
      style: this.options.style,
      ...(this.stream.costUsd > 0 ? { costUsd: this.stream.costUsd } : {}),
    };
    if (hasActivity(stats)) {
      this.write(statsLine(stats));
    }
  }

  private recordTool(activity: Extract<AgentActivity, { kind: 'tool' }>): void {
    this.erase();
    this.write(
      toolLine({ label: toolLabel(activity), ok: activity.ok, style: this.options.style }),
    );
  }

  private refresh(): void {
    if (this.label === undefined) {
      return;
    }
    const elapsedMs = this.elapsed(this.since);
    this.frame += 1;
    this.paint(elapsedMs);
  }

  private elapsed(since: number): number {
    return Math.max(0, this.options.now() - since);
  }

  private paint(elapsedMs: number): void {
    const label = this.label ?? '';
    const body = liveLine({
      frame: FRAMES[this.frame % FRAMES.length] ?? '·',
      label,
      activity: this.stream.activity,
      duration: elapsedMs >= TIMER_FLOOR_MS ? humanDuration(elapsedMs) : '',
      silentFor: this.quietFor(),
      columns: this.width(),
      style: this.options.style,
    });
    if (this.options.isTty) {
      this.options.write(`${CLEAR}${body}`);
      return;
    }
    this.options.out(body);
  }

  private quietFor(): string {
    const quietMs = this.elapsed(this.lastEvent);
    return quietMs >= QUIET_FLOOR_MS ? humanDuration(quietMs) : '';
  }

  private width(): number {
    return this.options.columns?.() || process.stdout.columns || DEFAULT_COLUMNS;
  }

  private erase(): void {
    if (this.options.isTty) {
      this.options.write(CLEAR);
    }
  }

  private stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.label = undefined;
  }

  private flushFiles(): void {
    if (this.files === 0) {
      return;
    }
    this.options.out(
      noteLine({
        text: countLabel(this.files, 'file changed', 'files changed'),
        tone: 'info',
        style: this.options.style,
      }),
    );
    this.files = 0;
  }

  private write(text: string): void {
    this.options.out(text);
  }
}

export function createRunTrace(options: RunTraceOptions): RunTrace {
  return new LiveTrace(options);
}
