import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OpenCodeRuntime } from '../src/opencode-runtime.ts';
import type { FakeAgentRecord } from './fake-agent-binary.ts';
import { installFakeAgent, recordPath } from './fake-agent-binary.ts';

const INPUT = {
  runId: 'RUN-REAL',
  agent: 'developer',
  instructions: 'do the thing',
};

let workspace: string;
let binary: string;
let record: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'lou-workspace-'));
  binary = installFakeAgent();
  record = recordPath();
  process.env['FAKE_AGENT_RECORD'] = record;
});

afterEach(() => {
  delete process.env['FAKE_AGENT_RECORD'];
});

async function runAgent(): Promise<FakeAgentRecord> {
  const runtime = new OpenCodeRuntime({ binary, timeoutMs: 30_000 });
  await runtime.run({ ...INPUT, workspace });
  return JSON.parse(readFileSync(record, 'utf8')) as FakeAgentRecord;
}

describe('OpenCodeRuntime against a real process', () => {
  it('makes the agent work in the workspace it was given', async () => {
    const seen = await runAgent();

    expect(seen.dir).toBe(workspace);
  });

  it('runs the agent process inside the workspace directory', async () => {
    const seen = await runAgent();

    expect(seen.cwd).toBe(workspace);
  });

  it.skipIf(process.env['LOU_REAL_AGENT_TESTS'] !== '1')(
    'makes the real opencode binary work in the workspace it was given',
    async () => {
      const runtime = new OpenCodeRuntime({ timeoutMs: 180_000 });
      const result = await runtime.run({
        runId: 'RUN-CANARY',
        instructions: 'Use the bash tool to run `pwd` and reply with only its output.',
        workspace,
      });

      expect(result.stdout.trim().split('\n').pop()).toBe(workspace);
    },
    180_000,
  );

  it('reads the real event stream of the agent', async () => {
    const runtime = new OpenCodeRuntime({ binary, timeoutMs: 30_000 });
    const result = await runtime.run({ ...INPUT, workspace });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('done');
  });
});
