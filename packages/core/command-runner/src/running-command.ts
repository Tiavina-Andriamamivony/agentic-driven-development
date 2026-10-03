import type { ChildProcess } from 'node:child_process';
import type { CommandResult, CommandRunOptions } from './command-runner.ts';

export class RunningCommand {
  private stdoutChunks: string[] = [];
  private stderrChunks: string[] = [];
  private didInterrupt = false;
  private readonly timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly child: ChildProcess,
    options: CommandRunOptions,
  ) {
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    const onStdout = options.onStdout;
    const onStderr = options.onStderr;
    child.stdout?.on('data', (chunk: string) => {
      this.stdoutChunks.push(chunk);
      onStdout?.(chunk);
    });
    child.stderr?.on('data', (chunk: string) => {
      this.stderrChunks.push(chunk);
      onStderr?.(chunk);
    });
    if (options.timeoutMs !== undefined) {
      this.timer = setTimeout(() => {
        this.interrupt();
      }, options.timeoutMs);
    }
    options.signal?.addEventListener(
      'abort',
      () => {
        this.interrupt();
      },
      { once: true },
    );
  }

  result(exitCode: number): CommandResult {
    return {
      exitCode,
      stdout: this.stdoutChunks.join(''),
      stderr: this.stderrChunks.join(''),
      interrupted: this.didInterrupt,
    };
  }

  dispose(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
  }

  private interrupt(): void {
    this.didInterrupt = true;
    this.child.kill('SIGTERM');
  }
}
