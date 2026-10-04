import { describe, expect, it } from 'vitest';
import { testOutcome } from '../src/test-outcome.ts';
import type { TestResult } from '@lou/test-runner';

const PASSED: TestResult = {
  passed: true,
  exitCode: 0,
  stdout: '1 passed',
  stderr: '',
  interrupted: false,
  command: 'pnpm test',
};

const FAILED: TestResult = {
  passed: false,
  exitCode: 1,
  stdout: '',
  stderr: 'boom',
  interrupted: false,
  command: 'pnpm test',
  reason: 'the test command exited 1',
};

describe('testOutcome', () => {
  it('records the command and output of a successful test', () => {
    const outcome = testOutcome('integration', PASSED);

    expect(outcome).toMatchObject({
      result: 'success',
      target: 'integration',
      command: 'pnpm test',
      exitCode: 0,
      excerpt: '1 passed',
    });
  });

  it('records the reason and exit code of a failing test', () => {
    const outcome = testOutcome('lint', FAILED);

    expect(outcome).toMatchObject({
      result: 'failure',
      target: 'lint',
      reason: 'the test command exited 1',
      exitCode: 1,
      excerpt: 'boom',
    });
  });

  it('keeps both streams in the excerpt', () => {
    const outcome = testOutcome('unit', { ...PASSED, stderr: 'a warning' });

    expect(outcome.excerpt).toBe('1 passed\na warning');
  });

  it('truncates a runaway output instead of writing it whole', () => {
    const outcome = testOutcome('unit', { ...PASSED, stdout: 'x'.repeat(9_000) });

    expect(outcome.excerpt).toHaveLength(2_000 + '... [truncated]'.length);
    expect(outcome.excerpt?.endsWith('... [truncated]')).toBe(true);
  });

  it('does not leak an empty excerpt', () => {
    const outcome = testOutcome('smoke', { ...PASSED, stdout: '   ', stderr: '' });

    expect(outcome).not.toHaveProperty('excerpt');
  });
});
