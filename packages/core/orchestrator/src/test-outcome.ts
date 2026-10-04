import type { AuditEventPayload } from '@lou/audit';
import type { TestResult } from '@lou/test-runner';
import { excerptOf } from './audit-excerpt.ts';

function reasonOf(result: TestResult): { readonly reason?: string } {
  return result.reason === undefined || result.reason === '' ? {} : { reason: result.reason };
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
