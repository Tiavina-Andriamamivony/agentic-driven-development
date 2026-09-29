import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { CommandResult, CommandRunner, CommandRunOptions } from './command-runner.ts';
import { RunningCommand } from './running-command.ts';

export class NodeCommandRunner implements CommandRunner {
  async run(
    command: string,
    args: readonly string[],
    options: CommandRunOptions,
  ): Promise<CommandResult> {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: false,
      stdio: [stdinMode(options.stdin), 'pipe', 'pipe'],
    });
    writeStdin(child, options.stdin);
    const running = new RunningCommand(child, options);
    try {
      const exitCode = await waitForExit(child);
      running.dispose();
      return running.result(exitCode);
    } catch (error) {
      running.dispose();
      throw error;
    }
  }
}

function stdinMode(stdin: string | undefined): 'pipe' | 'ignore' {
  return stdin === undefined ? 'ignore' : 'pipe';
}

function writeStdin(child: ChildProcess, stdin: string | undefined): void {
  if (stdin === undefined) {
    return;
  }
  child.stdin?.on('error', () => undefined);
  child.stdin?.end(stdin);
}

function waitForExit(child: ChildProcess): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      resolve(code ?? -1);
    });
  });
}
