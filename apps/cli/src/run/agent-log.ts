import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SecretRedactor } from './secret-redactor.ts';

interface AgentLogSinkOptions {
  readonly directory: string;
  readonly onError?: (error: unknown) => void;
}

export class AgentLogSink {
  private readonly directory: string;
  private readonly onError: (error: unknown) => void;
  private readonly redactor = new SecretRedactor();
  private open: string | undefined;

  constructor(options: AgentLogSinkOptions) {
    this.directory = options.directory;
    this.onError = options.onError ?? (() => undefined);
  }

  begin(agent: string, runId: string): void {
    const file = join(this.directory, `${safe(agent)}-${safe(runId)}.log`);
    this.open = file;
    this.redactor.reset();
    this.attempt(() => mkdirSync(this.directory, { recursive: true }));
    this.attempt(() => {
      writeFileSync(file, '', { flag: 'a' });
    });
  }

  end(): void {
    this.open = undefined;
  }

  write(chunk: string): void {
    const file = this.open;
    if (file === undefined || chunk === '') {
      return;
    }
    const safeText = this.redactor.redact(chunk);
    if (safeText === '') {
      return;
    }
    this.attempt(() => {
      appendFileSync(file, safeText, 'utf8');
    });
  }

  private attempt(action: () => void): void {
    try {
      action();
    } catch (error) {
      this.onError(error);
    }
  }
}

function safe(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_');
}
