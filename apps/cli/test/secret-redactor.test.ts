import { describe, expect, it } from 'vitest';
import { SecretRedactor } from '../src/run/secret-redactor.ts';

describe('SecretRedactor', () => {
  it('redacts an api key assignment', () => {
    expect(new SecretRedactor().redact('ANTHROPIC_API_KEY=sk-ant-abcdefghij1234567890')).toBe(
      'ANTHROPIC_API_KEY=[redacted]',
    );
  });

  it('redacts a quoted json secret', () => {
    expect(new SecretRedactor().redact('{"password": "hunter2"}')).toBe(
      '{"password": "[redacted]"}',
    );
  });

  it('redacts a bearer token', () => {
    expect(new SecretRedactor().redact('Authorization: Bearer abc123def456ghi')).toBe(
      'Authorization: Bearer [redacted]',
    );
  });

  it('redacts credentials embedded in a url', () => {
    expect(new SecretRedactor().redact('postgres://admin:s3cret@db.internal/app')).toBe(
      'postgres://[redacted]@db.internal/app',
    );
  });

  it('redacts a json web token', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1g';
    expect(new SecretRedactor().redact(`token ${jwt}`)).toBe('token [redacted]');
  });

  it('redacts a bare cloud access key id', () => {
    expect(new SecretRedactor().redact('AKIAIOSFODNN7EXAMPLE is the key')).toBe(
      '[redacted] is the key',
    );
  });

  it('keeps the opencode usage counters readable', () => {
    const usage = '{"type":"step_finish","tokens":{"input":120,"output":45,"reasoning":10}}';

    expect(new SecretRedactor().redact(usage)).toBe(usage);
  });

  it('keeps max_tokens and cache_tokens readable', () => {
    const usage = '{"max_tokens": 4096, "cache_tokens": 128}';

    expect(new SecretRedactor().redact(usage)).toBe(usage);
  });

  it('redacts a private key delivered across several chunks', () => {
    const redactor = new SecretRedactor();

    const head = redactor.redact('before\n-----BEGIN RSA PRIVATE KEY-----\n');
    const body = redactor.redact(
      'MIIEowIBAAKCAQEAy8Dbv8prpJ/0kKhlGeJYozo2t60EG8L0561g13R29LvMR5hyvGZlGJpmn65+Ackx13B\n',
    );
    const tail = redactor.redact('-----END RSA PRIVATE KEY-----\nafter\n');

    expect(head).toContain('before');
    expect(head).toContain('[redacted]');
    expect(body).toBe('');
    expect(tail).toContain('[redacted]');
    expect(tail).toContain('after');
  });

  it('redacts a private key that arrives whole', () => {
    const pem = [
      '-----BEGIN OPENSSH PRIVATE KEY-----',
      'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAt',
      '-----END OPENSSH PRIVATE KEY-----',
      'done',
    ].join('\n');

    const redacted = new SecretRedactor().redact(pem);

    expect(redacted).toContain('[redacted]');
    expect(redacted).toContain('done');
    expect(redacted).not.toContain('b3BlbnNzaC1rZXktdjEA');
  });

  it('keeps scrubbing after a private key closes', () => {
    const redactor = new SecretRedactor();

    redactor.redact('-----BEGIN RSA PRIVATE KEY-----\nAAAA\n');
    const after = redactor.redact('-----END RSA PRIVATE KEY-----\ntoken=abcdef123456\n');

    expect(after).toContain('[redacted]');
  });

  it('leaves ordinary agent output untouched', () => {
    const output = '{"type":"text","part":{"text":"add the reset endpoint"}}';

    expect(new SecretRedactor().redact(output)).toBe(output);
  });
});
