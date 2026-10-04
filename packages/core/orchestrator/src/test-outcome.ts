import type { AuditEventPayload } from '@lou/audit';
import type { TestResult } from '@lou/test-runner';

const OUTPUT_LIMIT = 2_000;

function reasonOf(result: TestResult): { readonly reason?: string } {
  return result.reason === undefined || result.reason === '' ? {} : { reason: result.reason };
}

function excerptOf(output: string): { readonly excerpt: string } | Record<string, never> {
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    return {};
  }
  const clipped = trimmed.length > OUTPUT_LIMIT;
  const head = clipped ? trimmed.slice(0, OUTPUT_LIMIT) : trimmed;
  return { excerpt: clipped ? `${head}... [truncated]` : head };
}

export function testOutcome(kind: string, result: TestResult): Partial<AuditEventPayload> {
  const command = result.command === '' ? {} : { command: result.command };
  const excerpt = excerptOf(`${result.stdout}\n${result.stderr}`);
  return {
    result: result.passed ? 'success' : 'failure',
    target: kind,
    exitCode: result.exitCode,
    ...reasonOf(result),
    ...command,
    ...excerpt,
  };
}
