import type { AuditEvent, AuditEventPayload, AuditLog } from '@lou/audit';
import { SecretRedactor } from './secret-redactor.ts';

export class RedactingAuditLog implements AuditLog {
  private readonly inner: AuditLog;

  constructor(inner: AuditLog) {
    this.inner = inner;
  }

  async record(payload: AuditEventPayload): Promise<void> {
    await this.inner.record(this.redactPayload(payload));
  }

  async history(): Promise<readonly AuditEvent[]> {
    return this.inner.history();
  }

  private redactPayload(payload: AuditEventPayload): AuditEventPayload {
    const redactor = new SecretRedactor();
    const redacted = redactor.redactValue(payload);
    if (isPayload(redacted)) {
      return redacted;
    }
    return payload;
  }
}

function isPayload(value: unknown): value is AuditEventPayload {
  return typeof value === 'object' && value !== null && 'event' in value;
}
