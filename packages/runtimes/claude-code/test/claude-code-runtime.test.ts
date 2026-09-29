import { describe, expect, it } from 'vitest';
import { ClaudeCodeRuntime } from '../src/claude-code-runtime.ts';
import { FakeRunner } from './fake-runner.ts';

const INPUT = {
  runId: 'RUN-001',
  instructions: 'implement password reset',
  workspace: '/tmp/lou-demo',
};

const JSON_OUTPUT = JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 3,
  result: 'Implemented the reset flow.',
  total_cost_usd: 0.42,
  usage: { input_tokens: 1200, output_tokens: 340 },
});

function result(stdout = JSON_OUTPUT, interrupted = false) {
  return { exitCode: interrupted ? -1 : 0, stdout, stderr: '', interrupted };
}

describe('ClaudeCodeRuntime', () => {
  it('invokes claude in print mode with the instructions on stdin', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });

    const pending = runtime.run(INPUT);
    runner.complete(result());

    await pending;
    const [call] = runner.calls;
    expect(call?.command).toBe('claude');
    expect(call?.args).toContain('-p');
    expect(call?.options.stdin).toBe('implement password reset');
  });

  it('requests json output so cost and usage can be recorded', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });

    const pending = runtime.run(INPUT);
    runner.complete(result());

    await pending;
    expect(runner.calls[0]?.args).toContain('--output-format');
    expect(runner.calls[0]?.args.join(' ')).toContain('json');
  });

  it('runs in the workspace of the run', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });

    const pending = runtime.run(INPUT);
    runner.complete(result());

    await pending;
    expect(runner.calls[0]?.options.cwd).toBe('/tmp/lou-demo');
  });

  it('passes the model when the run requests one', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });

    const pending = runtime.run({ ...INPUT, model: 'opus' });
    runner.complete(result());

    await pending;
    const args = runner.calls[0]?.args ?? [];
    expect(args[args.indexOf('--model') + 1]).toBe('opus');
  });

  it('omits the model flag when no model is requested', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });

    const pending = runtime.run(INPUT);
    runner.complete(result());

    await pending;
    expect(runner.calls[0]?.args).not.toContain('--model');
  });

  it('maps mcp servers onto a strict mcp config', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });

    const pending = runtime.run({ ...INPUT, mcp: { docs: 'docs-server --port 1' } });
    runner.complete(result());

    await pending;
    const args = runner.calls[0]?.args ?? [];
    const config = args[args.indexOf('--mcp-config') + 1] ?? '';
    expect(args).toContain('--strict-mcp-config');
    expect(config).toContain('docs');
    expect(config).toContain('docs-server --port 1');
  });

  it('omits the mcp flags when the run declares no server', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });

    const pending = runtime.run(INPUT);
    runner.complete(result());

    await pending;
    expect(runner.calls[0]?.args).not.toContain('--mcp-config');
  });

  it('records cost and token usage from the json result', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });

    const pending = runtime.run(INPUT);
    runner.complete(result());

    const outcome = await pending;
    expect(outcome.usage).toEqual({
      promptTokens: 1200,
      completionTokens: 340,
      costUsd: 0.42,
    });
  });

  it('omits usage when the cli prints no parsable json', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });

    const pending = runtime.run(INPUT);
    runner.complete(result('not json at all'));

    const outcome = await pending;
    expect(outcome.usage).toBeUndefined();
    expect(outcome.stdout).toBe('not json at all');
  });

  it('reports the run as finished with the exit code of the cli', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });

    const pending = runtime.run(INPUT);
    runner.complete({ exitCode: 2, stdout: '', stderr: 'boom', interrupted: false });

    await pending;
    expect(await runtime.getStatus('RUN-001')).toEqual({
      runId: 'RUN-001',
      running: false,
      finished: true,
      exitCode: 2,
    });
  });

  it('reports a running status while the cli is still working', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });

    const pending = runtime.run(INPUT);
    expect(await runtime.getStatus('RUN-001')).toEqual({
      runId: 'RUN-001',
      running: true,
      finished: false,
    });

    runner.complete(result());
    await pending;
  });

  it('interrupts an in-flight run through the abort signal', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });

    const pending = runtime.run(INPUT);
    await runtime.interrupt('RUN-001');
    runner.complete(result(JSON_OUTPUT, true));

    const outcome = await pending;
    expect(outcome.interrupted).toBe(true);
    expect(runner.calls[0]?.options.signal?.aborted).toBe(true);
  });

  it('ignores an interrupt for an unknown run', async () => {
    const runtime = new ClaudeCodeRuntime({ runner: new FakeRunner() });
    await expect(runtime.interrupt('nope')).resolves.toBeUndefined();
  });

  it('rejects an empty runId', async () => {
    const runtime = new ClaudeCodeRuntime({ runner: new FakeRunner() });
    await expect(runtime.run({ ...INPUT, runId: '' })).rejects.toThrow('runId must not be empty');
  });

  it('rejects empty instructions', async () => {
    const runtime = new ClaudeCodeRuntime({ runner: new FakeRunner() });
    await expect(runtime.run({ ...INPUT, instructions: '' })).rejects.toThrow(
      'instructions must not be empty',
    );
  });

  it('rejects an empty workspace', async () => {
    const runtime = new ClaudeCodeRuntime({ runner: new FakeRunner() });
    await expect(runtime.run({ ...INPUT, workspace: '' })).rejects.toThrow(
      'workspace must not be empty',
    );
  });

  it('uses a custom binary when one is configured', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner, binary: '/opt/bin/claude' });

    const pending = runtime.run(INPUT);
    runner.complete(result());

    await pending;
    expect(runner.calls[0]?.command).toBe('/opt/bin/claude');
  });

  it('uses a configurable timeout', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner, timeoutMs: 1234 });

    const pending = runtime.run(INPUT);
    runner.complete(result());

    await pending;
    expect(runner.calls[0]?.options.timeoutMs).toBe(1234);
  });
});
