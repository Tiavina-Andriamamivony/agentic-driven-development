const REDACTED = '[redacted]';

const PRIVATE_KEY_BEGIN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;
const PRIVATE_KEY_END = /-----END [A-Z0-9 ]*PRIVATE KEY-----/;

const BENIGN_KEYS: ReadonlySet<string> = new Set([
  'tokens',
  'max_tokens',
  'min_tokens',
  'token_count',
  'cache_tokens',
  'cache_read',
  'cache_write',
  'reasoning_tokens',
]);

const SECRET_KEY = String.raw`(?:secret|passwd|password|api[_-]?key|access[_-]?key|private[_-]?key|credentials?|bearer|token)`;
const ASSIGNMENT = new RegExp(
  String.raw`([A-Za-z0-9_.-]*${SECRET_KEY}[A-Za-z0-9_.-]*"?|'[A-Za-z0-9_.-]*${SECRET_KEY}[A-Za-z0-9_.-]*')(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;)}\]]+)`,
  'gi',
);

const PROVIDER_TOKEN =
  /\b(?:sk-ant-[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9_-]{20,}|gho_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g;

const BEARER = /\b(Bearer)(\s+)[A-Za-z0-9._~+/=-]{8,}/gi;

const JSON_WEB_TOKEN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

const URL_CREDENTIALS = /:\/\/[^/\s:@]+:[^/\s:@]+@/g;

function isBenignKey(key: string): boolean {
  return BENIGN_KEYS.has(key.toLowerCase());
}

function unquote(value: string): string {
  if (value.startsWith('"')) {
    return `"${REDACTED}"`;
  }
  if (value.startsWith("'")) {
    return `'${REDACTED}'`;
  }
  return REDACTED;
}

function unquoteKey(key: string): string {
  return key.replace(/^['"]|['"]$/g, '');
}

function redactAssignments(text: string): string {
  return text.replace(ASSIGNMENT, (match, key: string, separator: string, value: string) =>
    isBenignKey(unquoteKey(key)) ? match : `${key}${separator}${unquote(value)}`,
  );
}

function scrub(text: string): string {
  return redactAssignments(text)
    .replace(BEARER, `$1$2${REDACTED}`)
    .replace(JSON_WEB_TOKEN, REDACTED)
    .replace(PROVIDER_TOKEN, REDACTED)
    .replace(URL_CREDENTIALS, `://${REDACTED}@`);
}

export class SecretRedactor {
  private insidePrivateKey = false;

  redact(chunk: string): string {
    return this.insidePrivateKey ? this.resume(chunk) : this.strip(chunk);
  }

  reset(): void {
    this.insidePrivateKey = false;
  }

  private resume(chunk: string): string {
    const end = chunk.search(PRIVATE_KEY_END);
    if (end === -1) {
      return '';
    }
    this.insidePrivateKey = false;
    const after = chunk.slice(end).replace(PRIVATE_KEY_END, '');
    return after.length === 0 ? REDACTED : `${REDACTED}${scrub(after)}`;
  }

  private strip(chunk: string): string {
    const start = chunk.search(PRIVATE_KEY_BEGIN);
    if (start === -1) {
      return scrub(chunk);
    }
    const before = scrub(chunk.slice(0, start));
    const rest = chunk.slice(start);
    const end = rest.search(PRIVATE_KEY_END);
    this.insidePrivateKey = end === -1;
    const head = before.length === 0 ? REDACTED : `${before}${REDACTED}`;
    return end === -1 ? head : `${head}${scrub(rest.slice(end).replace(PRIVATE_KEY_END, ''))}`;
  }
}
