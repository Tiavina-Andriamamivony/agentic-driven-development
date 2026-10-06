import type { CommandResult, CommandRunner, CommandRunOptions } from '@lou/command-runner';

interface RecordedCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

export class RecordingRunner implements CommandRunner {
  readonly calls: RecordedCall[] = [];
  private readonly result: CommandResult;

  constructor(result: CommandResult) {
    this.result = result;
  }

  run(
    command: string,
    args: readonly string[],
    options: CommandRunOptions,
  ): Promise<CommandResult> {
    this.calls.push({ command, args, cwd: options.cwd });
    return Promise.resolve(this.result);
  }
}
