import { describe, expect, it } from 'vitest';
import type { AgentActivity } from '@lou/agent-runtime';
import { OpenCodeRuntime } from '../src/opencode-runtime.ts';
import { FakeRunner } from './fake-runner.ts';

const INPUT = {
  runId: 'RUN-001',
  agent: 'developer',
  instructions: 'implement password reset',
  workspace: '/tmp/add-demo',
};

const SUCCESS = { exitCode: 0, stdout: 'ok', stderr: '', interrupted: false };
const ABORTED = { exitCode: -1, stdout: '', stderr: '', interrupted: true };

describe('OpenCodeRuntime', () => {
  it('invokes the opencode binary with the run command, agent and instructions', async () => {
    const runner = new FakeRunner();
    const runtime = new OpenCodeRuntime({ runner });

    const pending = runtime.run(INPUT);
    runner.complete(SUCCESS);
    const result = await pending;

    expect(result.runId).toBe('RUN-001');
    expect(result.exitCode).toBe(0);
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]?.command).toBe('opencode');
    expect(runner.calls[0]?.args).toEqual([
      'run',
      '--format',
      'json',
      '--thinking',
      '--dir',
      INPUT.workspace,
      '--agent',
      'developer',
      '--print-logs',
      'implement password reset',
    ]);
  });

  it('forwards an explicit timeout to the command runner', async () => {
    const runner = new FakeRunner();
    const runtime = new OpenCodeRuntime({ runner, timeoutMs: 1_200_000 });

    const pending = runtime.run(INPUT);
    runner.complete(SUCCESS);
    await pending;

    expect(runner.calls[0]?.options.timeoutMs).toBe(1_200_000);
  });

  it('tells opencode which directory to work in', async () => {
    const runner = new FakeRunner();
    const runtime = new OpenCodeRuntime({ runner });

    const pending = runtime.run(INPUT);
    runner.complete(SUCCESS);
    await pending;

    const args = runner.calls[0]?.args ?? [];
    const flag = args.indexOf('--dir');

    expect(flag).toBeGreaterThan(-1);
    expect(args[flag + 1]).toBe(INPUT.workspace);
  });

  it('passes the workspace as working directory and a default timeout', async () => {
    const runner = new FakeRunner();
    const runtime = new OpenCodeRuntime({ runner });

    const pending = runtime.run(INPUT);
    runner.complete(SUCCESS);
    await pending;

    expect(runner.calls[0]?.options.cwd).toBe(INPUT.workspace);
    expect(runner.calls[0]?.options.timeoutMs).toBe(1_800_000);
  });

  it('honours a custom binary and model', async () => {
    const runner = new FakeRunner();
    const runtime = new OpenCodeRuntime({ runner, binary: 'opencode-next' });

    const pending = runtime.run({ ...INPUT, model: 'gpt-5' });
    runner.complete(SUCCESS);
    await pending;

    expect(runner.calls[0]?.command).toBe('opencode-next');
    expect(runner.calls[0]?.args).toContain('--model');
  });

  it('mounts MCP servers through the OPENCODE_CONFIG_CONTENT env var', async () => {
    const runner = new FakeRunner();
    const runtime = new OpenCodeRuntime({ runner });

    const pending = runtime.run({ ...INPUT, mcp: { sqlite: 'uvx', demo: 'node' } });
    runner.complete(SUCCESS);
    await pending;

    const content = runner.calls[0]?.options.env?.OPENCODE_CONFIG_CONTENT;
    expect(content).toContain('"sqlite"');
    expect(content).toContain('"command"');
    expect(content).toContain('"uvx"');
    const config = JSON.parse(content ?? '{}') as { readonly mcp: Record<string, unknown> };
    expect(config.mcp.sqlite).toEqual({ type: 'local', command: ['uvx'], enabled: true });
  });

  it('records a running status while the run is in flight', async () => {
    const runner = new FakeRunner();
    const runtime = new OpenCodeRuntime({ runner });

    const pending = runtime.run(INPUT);
    const running = await runtime.getStatus(INPUT.runId);
    runner.complete(SUCCESS);
    await pending;

    expect(running.running).toBe(true);
    expect(running.finished).toBe(false);
    const done = await runtime.getStatus(INPUT.runId);
    expect(done.running).toBe(false);
    expect(done.finished).toBe(true);
    expect(done.exitCode).toBe(0);
  });

  it('returns a default status for an unknown run', async () => {
    const runtime = new OpenCodeRuntime({ runner: new FakeRunner() });

    const status = await runtime.getStatus('UNKNOWN');

    expect(status.running).toBe(false);
    expect(status.finished).toBe(false);
  });

  it('aborts the run through the abort signal when interrupted', async () => {
    const runner = new FakeRunner();
    const runtime = new OpenCodeRuntime({ runner });

    const pending = runtime.run(INPUT);
    const signal = runner.calls[0]?.options.signal;
    expect(signal?.aborted).toBe(false);
    await runtime.interrupt(INPUT.runId);
    expect(signal?.aborted).toBe(true);
    runner.complete(ABORTED);
    const result = await pending;

    expect(result.interrupted).toBe(true);
  });

  it('clears the running flag when the runner fails', async () => {
    const runner = new FakeRunner();
    const runtime = new OpenCodeRuntime({ runner });

    const pending = runtime.run(INPUT);
    runner.fail(new Error('spawn failed'));
    await expect(pending).rejects.toThrow('spawn failed');

    const status = await runtime.getStatus(INPUT.runId);
    expect(status.running).toBe(false);
  });

  it('rejects an empty instruction set', async () => {
    const runtime = new OpenCodeRuntime({ runner: new FakeRunner() });

    await expect(runtime.run({ ...INPUT, instructions: '' })).rejects.toThrow('instructions');
  });

  it('rejects an empty workspace', async () => {
    const runtime = new OpenCodeRuntime({ runner: new FakeRunner() });

    await expect(runtime.run({ ...INPUT, workspace: '' })).rejects.toThrow('workspace');
  });

  it('rejects an empty run id', async () => {
    const runtime = new OpenCodeRuntime({ runner: new FakeRunner() });

    await expect(runtime.run({ ...INPUT, runId: '' })).rejects.toThrow('runId');
  });
  it('forwards live agent output to the caller as stdout arrives', async () => {
    const runner = new FakeRunner();
    const runtime = new OpenCodeRuntime({ runner });
    const chunks: string[] = [];

    const pending = runtime.run({ ...INPUT, onOutput: (chunk) => chunks.push(chunk) });
    runner.emitStdout('reading ');
    runner.emitStdout('files');
    runner.complete(SUCCESS);
    await pending;

    expect(chunks).toEqual(['reading ', 'files']);
  });

  it('omits the stderr callback when the caller does not ask for raw output', async () => {
    const runner = new FakeRunner();
    const runtime = new OpenCodeRuntime({ runner });

    const pending = runtime.run(INPUT);
    runner.complete(SUCCESS);
    await pending;

    expect(runner.calls[0]?.options.onStderr).toBeUndefined();
  });

  it('emits structured activities from the event stream', async () => {
    const runner = new FakeRunner();
    const runtime = new OpenCodeRuntime({ runner });
    const events: AgentActivity[] = [];

    const pending = runtime.run({ ...INPUT, onActivity: (a) => events.push(a) });
    runner.emitStdout('{"type":"reasoning","part":{"type":"reasoning","text":"pondering"}}\n');
    runner.emitStdout(
      '{"type":"tool_use","part":{"type":"tool","tool":"read","state":{"status":"completed","title":"a.ts"}}}\n',
    );
    runner.emitStdout('{"type":"text","part":{"type":"text","text":"SUMMARY: done"}}\n');
    runner.complete(SUCCESS);
    await pending;

    expect(events).toEqual([
      { kind: 'thinking', text: 'pondering' },
      { kind: 'tool', tool: 'read', detail: 'a.ts', ok: true },
      { kind: 'text', text: 'SUMMARY: done' },
    ]);
  });

  it('returns the joined text parts as stdout so protocol parsing still works', async () => {
    const runner = new FakeRunner();
    const runtime = new OpenCodeRuntime({ runner });

    const pending = runtime.run(INPUT);
    runner.emitStdout('{"type":"step_start","part":{"type":"step-start"}}\n');
    runner.emitStdout('{"type":"text","part":{"type":"text","text":"SUMMARY: done"}}\n');
    runner.emitStdout('{"type":"text","part":{"type":"text","text":"QUESTIONS: none"}}\n');
    runner.complete({ ...SUCCESS, stdout: 'raw json noise' });
    const result = await pending;

    expect(result.stdout).toBe('SUMMARY: done\nQUESTIONS: none');
  });

  it('forwards the raw stream to onOutput for diagnostics', async () => {
    const runner = new FakeRunner();
    const runtime = new OpenCodeRuntime({ runner });
    const chunks: string[] = [];

    const pending = runtime.run({ ...INPUT, onOutput: (chunk) => chunks.push(chunk) });
    runner.emitStdout('{"type":"text",');
    runner.emitStdout('"part":{"type":"text","text":"hi"}}\n');
    runner.complete(SUCCESS);
    await pending;

    expect(chunks).toEqual(['{"type":"text",', '"part":{"type":"text","text":"hi"}}\n']);
  });

  it('routes stderr to diagnostics only', async () => {
    const runner = new FakeRunner();
    const runtime = new OpenCodeRuntime({ runner });
    const events: AgentActivity[] = [];

    const pending = runtime.run({
      ...INPUT,
      onOutput: () => undefined,
      onActivity: (a) => events.push(a),
    });
    runner.emitStderr('INFO service ready\n');
    runner.complete(SUCCESS);
    await pending;

    expect(events).toEqual([]);
  });
});
