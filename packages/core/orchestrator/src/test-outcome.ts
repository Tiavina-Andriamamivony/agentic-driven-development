import type { AuditEventPayload } from '@lou/audit';
import type { TestResult } from '@lou/test-runner';

function reasonOf(result: TestResult): { readonly reason?: string } {
  return result.reason === undefined || result.reason === '' ? {} : { reason: result.reason };
}

export function testOutcome(kind: string, result: TestResult): Partial<AuditEventPayload> {
  return {
    result: result.passed ? 'success' : 'failure',
    target: kind,
    ...reasonOf(result),
  };
}
