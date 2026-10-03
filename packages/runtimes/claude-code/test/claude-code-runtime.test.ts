import { describe, expect, it } from 'vitest';
import { AgentRunFailedError } from '@lou/agent-runtime';
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

function streamResult(): string {
  return (
    '{"type":"system","subtype":"status","status":"requesting"}\n' +
    '{"type":"result","is_error":false,"total_cost_usd":0.25,' +
    '"usage":{"input_tokens":10,"output_tokens":4}}\n'
  );
}

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

  it('raises when the payload reports a failed run', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });
    const failed = JSON.stringify({
      is_error: true,
      subtype: 'error_during_execution',
      result: null,
      errors: ['model overloaded'],
      total_cost_usd: 0,
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const pending = runtime.run(INPUT);
    runner.complete(result(failed));

    await expect(pending).rejects.toBeInstanceOf(AgentRunFailedError);
  });

  it('carries the cli error text on the failure', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });
    const failed = JSON.stringify({
      is_error: true,
      subtype: 'error_during_execution',
      errors: ['model overloaded'],
    });

    const pending = runtime.run(INPUT);
    runner.complete(result(failed));

    await expect(pending).rejects.toThrow('model overloaded');
  });

  it('names the failure subtype when the cli gives no error text', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });
    const failed = JSON.stringify({ is_error: true, subtype: 'error_max_turns' });

    const pending = runtime.run(INPUT);
    runner.complete(result(failed));

    await expect(pending).rejects.toThrow('error_max_turns');
  });

  it('records the run as finished when the payload reports a failure', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });
    const failed = JSON.stringify({ is_error: true, subtype: 'error_during_execution' });

    const pending = runtime.run(INPUT);
    runner.complete(result(failed));
    await pending.catch(() => undefined);

    expect(await runtime.getStatus('RUN-001')).toEqual({
      runId: 'RUN-001',
      running: false,
      finished: true,
      exitCode: 0,
    });
  });

  it('carries the cost of a failed run on the error', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });
    const failed = JSON.stringify({
      is_error: true,
      subtype: 'error_during_execution',
      total_cost_usd: 0.42,
      usage: { input_tokens: 1200, output_tokens: 300 },
    });

    const pending = runtime.run(INPUT);
    runner.complete(result(failed));

    await expect(pending).rejects.toMatchObject({
      usage: { promptTokens: 1200, completionTokens: 300, costUsd: 0.42 },
    });
  });

  it('reports no cost on the error when the payload omits it', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });
    const failed = JSON.stringify({ is_error: true, subtype: 'error_during_execution' });

    const pending = runtime.run(INPUT);
    runner.complete(result(failed));

    await expect(pending).rejects.toMatchObject({ usage: null });
  });

  it('accepts a successful payload with is_error false', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });
    const ok = JSON.stringify({
      is_error: false,
      subtype: 'success',
      result: 'done',
      total_cost_usd: 0.1,
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const pending = runtime.run(INPUT);
    runner.complete(result(ok));

    const outcome = await pending;
    expect(outcome.exitCode).toBe(0);
    expect(outcome.usage?.costUsd).toBe(0.1);
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
  it('forwards live agent activity to the caller as stdout arrives', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });
    const chunks: string[] = [];

    const pending = runtime.run({ ...INPUT, onOutput: (chunk) => chunks.push(chunk) });
    runner.emitStdout('{"type":"system","subtype":"status","status":"thinking"}\n');
    runner.complete(result(streamResult()));
    await pending;

    expect(chunks).toEqual(['thinking', 'requesting']);
    expect(runner.calls[0]?.args).toContain('stream-json');
    expect(runner.calls[0]?.args).toContain('--verbose');
  });

  it('asks Claude for the realtime stream only when the caller wants it live', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });

    const pending = runtime.run(INPUT);
    runner.complete(result());
    await pending;

    expect(runner.calls[0]?.args).toContain('json');
    expect(runner.calls[0]?.args).not.toContain('--verbose');
  });

  it('never shows a hook payload to the caller', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });
    const chunks: string[] = [];
    const hook =
      '{"type":"system","subtype":"hook_response","output":"' + 'x'.repeat(2000) + '"}\n';

    const pending = runtime.run({ ...INPUT, onOutput: (chunk) => chunks.push(chunk) });
    runner.emitStdout(hook);
    runner.complete(result(streamResult()));
    await pending;

    expect(chunks.join('')).not.toContain('hook_response');
    expect(chunks.every((chunk) => chunk.length <= 60)).toBe(true);
  });

  it('reads the cost and tokens out of the stream envelope', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });

    const pending = runtime.run({ ...INPUT, onOutput: () => undefined });
    runner.complete(result(streamResult()));
    const finished = await pending;

    expect(finished.usage?.promptTokens).toBe(10);
    expect(finished.usage?.costUsd).toBe(0.25);
  });

  it('still fails the run when the stream reports an error envelope', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });

    const pending = runtime.run({ ...INPUT, onOutput: () => undefined });
    runner.complete(
      result(
        '{"type":"result","is_error":true,"errors":["quota exhausted"],' +
          '"total_cost_usd":0,"usage":{"input_tokens":3,"output_tokens":0}}\n',
      ),
    );

    await expect(pending).rejects.toThrow('quota exhausted');
  });

  it('omits the live callback entirely when the caller does not ask for it', async () => {
    const runner = new FakeRunner();
    const runtime = new ClaudeCodeRuntime({ runner });

    const pending = runtime.run(INPUT);
    runner.complete(result());
    await pending;

    expect(runner.calls[0]?.options.onStdout).toBeUndefined();
  });
});
