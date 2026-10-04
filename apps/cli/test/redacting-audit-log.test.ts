import { describe, expect, it } from 'vitest';
import type { AuditEvent, AuditEventPayload, AuditLog } from '@lou/audit';
import { event } from '@lou/audit';
import { RedactingAuditLog } from '../src/run/redacting-audit-log.ts';

class FakeAudit implements AuditLog {
  readonly written: AuditEventPayload[] = [];

  record(payload: AuditEventPayload): Promise<void> {
    this.written.push(payload);
    return Promise.resolve();
  }

  history(): Promise<readonly AuditEvent[]> {
    return Promise.resolve([]);
  }
}

describe('RedactingAuditLog', () => {
  it('keeps a secret out of the audit trail', async () => {
    const inner = new FakeAudit();
    const audit = new RedactingAuditLog(inner);

    await audit.record(
      event('run-1', 'command_executed', {
        command: 'curl -H "Authorization: Bearer sk-abc123def456"',
      }),
    );

    expect(JSON.stringify(inner.written)).not.toContain('sk-abc123def456');
    expect(JSON.stringify(inner.written)).toContain('[redacted]');
  });

  it('leaves a harmless event readable', async () => {
    const inner = new FakeAudit();
    const audit = new RedactingAuditLog(inner);

    await audit.record({ runId: 'run-1', event: 'git_commit' } as unknown as AuditEventPayload);

    expect(inner.written[0]).toMatchObject({ event: 'git_commit' });
  });

  it('redacts a secret nested in the payload', async () => {
    const inner = new FakeAudit();
    const audit = new RedactingAuditLog(inner);

    await audit.record({
      runId: 'run-1',
      event: 'test_finished',
      stdout: 'export TOKEN=ghp_0123456789abcdefghij',
    } as unknown as AuditEventPayload);

    expect(JSON.stringify(inner.written)).not.toContain('ghp_0123456789abcdefghij');
  });

  it('reads history from the log it wraps', async () => {
    const audit = new RedactingAuditLog(new FakeAudit());

    await expect(audit.history()).resolves.toEqual([]);
  });
});
