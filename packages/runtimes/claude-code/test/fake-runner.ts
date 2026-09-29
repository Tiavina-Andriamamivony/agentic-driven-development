import type { CommandResult, CommandRunner, CommandRunOptions } from '@lou/command-runner';

interface CommandCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: CommandRunOptions;
}

export class FakeRunner implements CommandRunner {
  readonly calls: CommandCall[] = [];
  private readonly resolvers: Array<(value: CommandResult) => void> = [];
  private readonly rejecters: Array<(reason: unknown) => void> = [];

  run(
    command: string,
    args: readonly string[],
    options: CommandRunOptions,
  ): Promise<CommandResult> {
    this.calls.push({ command, args, options });
    return new Promise<CommandResult>((resolve, reject) => {
      this.resolvers.push(resolve);
      this.rejecters.push(reject);
    });
  }

  complete(result: CommandResult): void {
    this.resolveAll((resolve) => {
      resolve(result);
    });
  }

  fail(error: unknown): void {
    this.rejectAll((reject) => {
      reject(error);
    });
  }

  private resolveAll(apply: (resolve: (value: CommandResult) => void) => void): void {
    for (const resolver of this.resolvers.splice(0)) {
      apply(resolver);
    }
  }

  private rejectAll(apply: (reject: (reason: unknown) => void) => void): void {
    for (const rejecter of this.rejecters.splice(0)) {
      apply(rejecter);
    }
  }
}
