import type { CommandResult, CommandRunner } from '@lou/command-runner';
import { NodeCommandRunner } from '@lou/command-runner';
import { detectTestScript, readTestScript } from './detect-test-script.ts';
import { nonTestScriptTool } from './non-test-script.ts';
import { runnerWithoutTests } from './no-tests.ts';
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
    const refusal = script === null ? null : refuseScript(options.cwd, script);
    if (refusal !== null) {
      return refusal;
    }
    const command = options.command ?? DEFAULT_COMMAND;
    const args = options.args ?? DEFAULT_ARGS;
    const result = await this.runner.run(command, args, {
      cwd: options.cwd,
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
    });
    return verdict(result, [command, ...args].join(' '));
  }

  private defaultedScript(options: TestRunOptions): string | null {
    if (options.command !== undefined || options.args !== undefined) {
      return null;
    }
    return DEFAULT_SCRIPT;
  }
}

function refuseScript(cwd: string, script: string): TestResult | null {
  const presence = detectTestScript(cwd, script);
  if (presence === 'missing') {
    return refused(cwd, `no test script named "${script}" in package.json`);
  }
  if (presence !== 'declared') {
    return null;
  }
  const declared = readTestScript(cwd, script);
  const tool = declared === null ? null : nonTestScriptTool(declared);
  if (tool === null) {
    return null;
  }
  return refused(cwd, `the "${script}" script only runs \`${tool}\`, which executes no test`);
}

function spoke(result: CommandResult): boolean {
  return result.stdout.trim().length > 0 || result.stderr.trim().length > 0;
}

function verdict(result: CommandResult, command: string): TestResult {
  if (result.interrupted) {
    return withReason(result, false, 'the test run was interrupted', { command });
  }
  if (result.exitCode !== 0) {
    return withReason(result, false, `the test command exited ${result.exitCode}`, { command });
  }
  if (!spoke(result)) {
    return withReason(result, false, 'the test command printed no output, so nothing ran', {
      command,
      retryable: false,
    });
  }
  const empty = runnerWithoutTests(`${result.stdout}\n${result.stderr}`);
  if (empty !== null) {
    return withReason(result, false, `the test command ran no test (${empty})`, {
      command,
      retryable: false,
    });
  }
  return withReason(result, true, '', { command });
}

function withReason(
  result: CommandResult,
  passed: boolean,
  reason: string,
  options: { command: string; retryable?: boolean } = { command: '' },
): TestResult {
  return {
    passed,
    command: options.command,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    interrupted: result.interrupted,
    ...(reason === '' ? {} : { reason }),
    ...(options.retryable === undefined ? {} : { retryable: options.retryable }),
  };
}

function refused(cwd: string, reason: string): TestResult {
  return {
    passed: false,
    command: '',
    exitCode: 1,
    stdout: '',
    stderr: '',
    interrupted: false,
    reason: `${reason} — refusing to report a pass in ${cwd}`,
    retryable: false,
  };
}
