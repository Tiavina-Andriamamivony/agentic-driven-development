import type { AuditEventPayload } from '@lou/audit';
import type { ReviewDecision } from '@lou/reviewer';
import { excerptOf } from './audit-excerpt.ts';

export function reviewOutcome(decision: ReviewDecision): Partial<AuditEventPayload> {
  return {
    result: decision.verdict === 'APPROVED' ? 'success' : 'failure',
    reason: decision.reason,
    ...excerptOf(decision.rawOutput),
  };
}
