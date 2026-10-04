export interface TestRunOptions {
  readonly cwd: string;
  readonly command?: string;
  readonly args?: readonly string[];
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface TestResult {
  readonly passed: boolean;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly interrupted: boolean;
  readonly reason?: string;
  readonly retryable?: boolean;
}

export interface TestRunner {
  run(options: TestRunOptions): Promise<TestResult>;
}
