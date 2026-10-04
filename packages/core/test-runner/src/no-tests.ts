interface NoTestSignal {
  readonly pattern: RegExp;
  readonly runner: string;
}

const SIGNALS: readonly NoTestSignal[] = [
  { pattern: /No test files found/, runner: 'vitest' },
  { pattern: /No tests found/, runner: 'jest' },
  { pattern: /^# tests 0$/m, runner: 'node:test' },
  { pattern: /no tests ran/i, runner: 'pytest' },
  { pattern: /collected 0 items/i, runner: 'pytest' },
  { pattern: /test result: ok\. 0 passed/, runner: 'cargo' },
  { pattern: /\[no tests to run\]/, runner: 'go' },
];

export function runnerWithoutTests(output: string): string | null {
  for (const signal of SIGNALS) {
    if (signal.pattern.test(output)) {
      return signal.runner;
    }
  }
  return null;
}
