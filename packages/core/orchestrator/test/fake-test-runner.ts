import type { TestResult, TestRunner, TestRunOptions } from '@lou/test-runner';

export interface TestRunScript {
  readonly passed: boolean;
  readonly stdout?: string;
  readonly reason?: string;
  readonly retryable?: boolean;
}

interface TestRunnerSpy {
  readonly runner: TestRunner;
  readonly runs: readonly TestRunOptions[];
}

export function createTestRunner(
  scripts: readonly TestRunScript[] = [{ passed: true }],
): TestRunnerSpy {
  const runs: TestRunOptions[] = [];
  let index = 0;
  const runner: TestRunner = {
    run(options: TestRunOptions): Promise<TestResult> {
      runs.push(options);
      const script = scripts[index] ?? scripts[scripts.length - 1] ?? { passed: true };
      index += 1;
      return Promise.resolve({
        passed: script.passed,
        exitCode: script.passed ? 0 : 1,
        stdout: script.stdout ?? '',
        stderr: script.passed ? '' : 'boom',
        interrupted: false,
        command: 'pnpm test',
        ...(script.reason !== undefined ? { reason: script.reason } : {}),
        ...(script.retryable !== undefined ? { retryable: script.retryable } : {}),
      });
    },
  };
  return { runner, runs };
}
