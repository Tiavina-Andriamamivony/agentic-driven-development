import type { AuditEventPayload } from '@lou/audit';
import type { Styler } from '../ux/style.ts';
import { humanDuration, translate } from './trace-steps.ts';
import type { TraceStep, TraceTone } from './trace-steps.ts';

export interface TraceTicket {
  readonly issueNumber: number;
  readonly title: string;
}

interface RunTraceOptions {
  readonly out: (line: string) => void;
  readonly write: (text: string) => void;
  readonly isTty: boolean;
  readonly now: () => number;
  readonly style?: Styler;
}

export interface RunTrace {
  begin(ticket: TraceTicket): void;
  event(payload: AuditEventPayload): void;
  note(text: string): void;
  work<T>(label: string, run: () => Promise<T>): Promise<T>;
  close(): void;
}

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPIN_MS = 120;
const BEAT_MS = 30_000;
const CLEAR = '\r\x1b[2K';
const ICONS: Readonly<Record<TraceTone, string>> = { info: '·', good: '✔', bad: '✖' };

class LiveTrace implements RunTrace {
  private readonly period: number;
  private readonly style: Styler | undefined;
  private readonly ticker: () => void;
  private timer: ReturnType<typeof setInterval> | undefined;
  private busySince: number | undefined;
  private busyLabel: string | undefined;
  private frame = 0;
  private files = 0;

  constructor(private readonly options: RunTraceOptions) {
    this.period = options.isTty ? SPIN_MS : BEAT_MS;
    this.style = options.style;
    this.ticker = (): void => {
      this.refresh();
    };
  }

  begin(ticket: TraceTicket): void {
    this.options.out(`lou run · ticket #${ticket.issueNumber} · ${ticket.title}`);
  }

  event(payload: AuditEventPayload): void {
    if (payload.event === 'file_changed') {
      this.files += 1;
      return;
    }
    this.apply(translate(payload, { busySince: this.busySince, now: this.options.now() }));
  }

  note(text: string): void {
    this.write(`${ICONS.info} ${text}`);
  }

  async work<T>(label: string, run: () => Promise<T>): Promise<T> {
    this.open(label);
    const since = this.busySince ?? this.options.now();
    try {
      const value = await run();
      this.erase();
      this.stop();
      this.write(`${ICONS.info} ${label} finished in ${humanDuration(this.elapsed(since))}`);
      return value;
    } catch (error) {
      this.erase();
      this.write(`${ICONS.bad} ${label} failed`);
      throw error;
    }
  }

  close(): void {
    this.flushFiles();
    this.stop();
  }

  private apply(step: TraceStep): void {
    if (step.kind === 'open') {
      this.open(step.label);
      return;
    }
    if (step.kind === 'close') {
      this.erase();
      this.stop();
      this.write(this.paint(`${ICONS[step.tone]} ${step.text}`));
      return;
    }
    if (step.kind === 'line') {
      this.write(this.paint(`${ICONS[step.tone]} ${step.text}`));
    }
  }

  private open(label: string): void {
    this.stop();
    this.busyLabel = label;
    this.busySince = this.options.now();
    this.timer = setInterval(this.ticker, this.period);
    this.timer.unref();
    if (this.options.isTty) {
      this.refresh();
    }
  }

  private refresh(): void {
    if (this.busyLabel === undefined || this.busySince === undefined) {
      return;
    }
    this.spinner(this.options.now() - this.busySince);
  }

  private elapsed(since: number): number {
    return Math.max(0, this.options.now() - since);
  }

  private spinner(since: number): void {
    const body = `${this.busyLabel} · ${humanDuration(since)}`;
    if (!this.options.isTty) {
      this.write(`${ICONS.info} ${body}`);
      return;
    }
    const frame = FRAMES[this.frame % FRAMES.length] ?? ICONS.info;
    this.frame += 1;
    this.options.write(`${CLEAR}${frame} ${body}`);
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
    this.busyLabel = undefined;
    this.busySince = undefined;
  }

  private flushFiles(): void {
    if (this.files === 0) {
      return;
    }
    this.note(`${this.files} files changed`);
    this.files = 0;
  }

  private write(text: string): void {
    this.options.out(text);
  }

  private paint(text: string): string {
    if (this.style === undefined) {
      return text;
    }
    return text.startsWith(`✔`) ? this.style.green(text) : text;
  }
}

export function createRunTrace(options: RunTraceOptions): RunTrace {
  return new LiveTrace(options);
}
