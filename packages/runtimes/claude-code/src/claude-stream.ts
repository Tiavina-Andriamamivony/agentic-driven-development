const MAX_STATUS = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function parseLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(trimmed);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function statusActivity(record: Record<string, unknown>): string | null {
  const status = readString(record['status']);
  return status === null ? null : status.slice(0, MAX_STATUS);
}

function retryActivity(record: Record<string, unknown>): string | null {
  const attempt = readNumber(record['attempt']);
  const total = readNumber(record['max_retries']);
  const cause = readString(record['error']);
  if (attempt === null || total === null) {
    return null;
  }
  return cause === null
    ? `retrying ${attempt}/${total}`
    : `retrying ${attempt}/${total} · ${cause}`;
}

function initActivity(record: Record<string, unknown>): string | null {
  const model = readString(record['model']);
  return model === null ? null : `model ${model}`;
}

const SYSTEM_ACTIVITIES: Readonly<
  Record<string, (record: Record<string, unknown>) => string | null>
> = {
  status: statusActivity,
  api_retry: retryActivity,
  init: initActivity,
};

export function activityFor(record: Record<string, unknown>): string | null {
  if (record['type'] !== 'system') {
    return null;
  }
  const read = SYSTEM_ACTIVITIES[readString(record['subtype']) ?? ''];
  return read === undefined ? null : read(record);
}

export function finalResult(stdout: string): Record<string, unknown> | null {
  let found: Record<string, unknown> | null = null;
  for (const line of stdout.split('\n')) {
    const record = parseLine(line);
    if (record !== null && record['type'] === 'result') {
      found = record;
    }
  }
  return found;
}

export class ClaudeStreamReader {
  private buffer = '';
  private envelope: Record<string, unknown> | null = null;

  push(chunk: string): string[] {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    return this.readLines(lines);
  }

  result(): Record<string, unknown> | null {
    return this.envelope;
  }

  private readLines(lines: readonly string[]): string[] {
    const activities: string[] = [];
    for (const line of lines) {
      const record = parseLine(line);
      if (record === null) {
        continue;
      }
      if (record['type'] === 'result') {
        this.envelope = record;
        continue;
      }
      const activity = activityFor(record);
      if (activity !== null) {
        activities.push(activity);
      }
    }
    return activities;
  }
}
