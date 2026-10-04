import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SOURCE = `#!/usr/bin/env node
const { writeFileSync } = require('node:fs');

const args = process.argv.slice(2);
const flag = args.indexOf('--dir');
const record = {
  cwd: process.cwd(),
  dir: flag === -1 ? null : args[flag + 1],
  args,
};

if (process.env.FAKE_AGENT_RECORD) {
  writeFileSync(process.env.FAKE_AGENT_RECORD, JSON.stringify(record));
}

const emit = (part) => process.stdout.write(JSON.stringify(part) + '\\n');

emit({ type: 'step_start', part: { type: 'step-start' } });
emit({
  type: 'tool_use',
  part: { type: 'tool', tool: 'read', state: { status: 'completed', input: {}, output: 'ok' } },
});
emit({ type: 'text', part: { type: 'text', text: 'done' } });
emit({
  type: 'step_finish',
  part: { type: 'step-finish', reason: 'stop', tokens: { total: 100, input: 80, output: 20 } },
});
`;

export interface FakeAgentRecord {
  readonly cwd: string;
  readonly dir: string | null;
  readonly args: readonly string[];
}

export function installFakeAgent(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lou-fake-agent-'));
  const binary = join(dir, 'opencode');
  writeFileSync(binary, SOURCE);
  chmodSync(binary, 0o755);
  return binary;
}

export function recordPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lou-fake-agent-log-'));
  return join(dir, 'record.json');
}
