import type { CommandResult, CommandRunner } from '@lou/command-runner';
import { NodeCommandRunner } from '@lou/command-runner';
import { detectTestScript } from './detect-test-script.ts';
import type { TestResult, TestRunner, TestRunOptions } from './test-runner.ts';

const DEFAULT_COMMAND = 'pnpm';
const DEFAULT_ARGS: readonly string[] = ['test'];
const DEFAULT_SCRIPT = 'test';

export interface NodeTestRunnerOptions {
  readonly runner?: CommandRunner;
}

export class NodeTestRunner implements TestRunner {
  private readonly runner: CommandRunner;

  constructor(options: NodeTestRunnerOptions = {}) {
    this.runner = options.runner ?? new NodeCommandRunner();
  }

  async run(options: TestRunOptions): Promise<TestResult> {
    const script = this.defaultedScript(options);
    if (script !== null && detectTestScript(options.cwd, script) === 'missing') {
      return refused(options.cwd, `no test script named "${script}" in package.json`);
    }
    const result = await this.runner.run(
      options.command ?? DEFAULT_COMMAND,
      options.args ?? DEFAULT_ARGS,
      {
        cwd: options.cwd,
        ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
      },
    );
    return verdict(result);
  }

  private defaultedScript(options: TestRunOptions): string | null {
    if (options.command !== undefined || options.args !== undefined) {
      return null;
    }
    return DEFAULT_SCRIPT;
  }
}

function spoke(result: CommandResult): boolean {
  return result.stdout.trim().length > 0 || result.stderr.trim().length > 0;
}

function verdict(result: CommandResult): TestResult {
  if (result.interrupted) {
    return withReason(result, false, 'the test run was interrupted');
  }
  if (result.exitCode !== 0) {
    return withReason(result, false, `the test command exited ${result.exitCode}`);
  }
  if (!spoke(result)) {
    return withReason(result, false, 'the test command printed no output, so nothing ran', false);
  }
  return withReason(result, true, '');
}

function withReason(
  result: CommandResult,
  passed: boolean,
  reason: string,
  retryable?: boolean,
): TestResult {
  return {
    passed,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    interrupted: result.interrupted,
    ...(reason === '' ? {} : { reason }),
    ...(retryable === undefined ? {} : { retryable }),
  };
}

function refused(cwd: string, reason: string): TestResult {
  return {
    passed: false,
    exitCode: 1,
    stdout: '',
    stderr: '',
    interrupted: false,
    reason: `${reason} — refusing to report a pass in ${cwd}`,
    retryable: false,
  };
}
