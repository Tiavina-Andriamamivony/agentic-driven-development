import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectTestScript } from '@lou/test-runner';
import { describe, expect, it } from 'vitest';
import { EMPTY_STREAM, feedActivity, feedStream } from '../src/run/agent-stream.ts';
import { AgentLogSink } from '../src/run/agent-log.ts';
import { SecretRedactor } from '../src/run/secret-redactor.ts';
import { translate } from '../src/run/trace-steps.ts';

const WARMUP = 50;
const CHUNK =
  JSON.stringify({
    type: 'tool_use',
    properties: {
      part: { type: 'tool', tool: 'read', state: { status: 'completed', title: 'src/index.ts' } },
    },
  }) + '\n';

function perOpMicros(iterations: number, work: () => void): number {
  for (let index = 0; index < WARMUP; index += 1) {
    work();
  }
  const started = process.hrtime.bigint();
  for (let index = 0; index < iterations; index += 1) {
    work();
  }
  return Number(process.hrtime.bigint() - started) / 1e3 / iterations;
}

function observedMicros(work: () => void): number {
  return Number(perOpMicros(2000, work).toFixed(1));
}

describe('hot path responsiveness', () => {
  it('redacts a streamed chunk far under a millisecond', () => {
    const redactor = new SecretRedactor();

    const observed = observedMicros(() => {
      redactor.redact(CHUNK);
    });

    expect(observed, 'SecretRedactor.redact us/op').toBeLessThan(150);
  });

  it('updates the live stream view well inside a frame', () => {
    let view = EMPTY_STREAM;

    const observed = observedMicros(() => {
      view = feedStream(view, 'thinking about the ticket\n');
    });

    expect(observed, 'feedStream us/op').toBeLessThan(60);
  });

  it('folds one agent activity in well inside a frame', () => {
    let view = EMPTY_STREAM;

    const observed = observedMicros(() => {
      view = feedActivity(view, { kind: 'text', text: 'adding the endpoint' });
    });

    expect(observed, 'feedActivity us/op').toBeLessThan(60);
  });

  it('turns an audit event into trace steps without delaying the stream', () => {
    const context = { busySince: undefined, now: 0, phase: 'code', afterCode: false };
    const payload = {
      timestamp: 'now',
      runId: 'run-1',
      event: 'agent_finished' as const,
      agent: 'developer',
      result: 'success' as const,
    };

    const observed = observedMicros(() => {
      translate(payload, context);
    });

    expect(observed, 'translate us/op').toBeLessThan(30);
  });

  it('reads the manifest fast enough to stay off the critical path', () => {
    const root = mkdtempSync(join(tmpdir(), 'lou-perf-'));

    const observed = observedMicros(() => {
      detectTestScript(root, 'test');
    });

    expect(observed, 'detectTestScript us/op').toBeLessThan(600);
  });

  it('does not grow super-linearly when the stream gets much longer', () => {
    const redactor = new SecretRedactor();
    const build = (chunks: number): string => CHUNK.repeat(chunks);

    const small = perOpMicros(200, () => {
      redactor.redact(build(4));
    });
    const large = perOpMicros(200, () => {
      redactor.redact(build(16));
    });

    expect(large / small).toBeLessThan(8);
  });

  it('keeps the per-chunk log cost linear in the number of chunks', () => {
    const root = mkdtempSync(join(tmpdir(), 'lou-perf-'));
    const sink = new AgentLogSink({ directory: join(root, 'small') });
    sink.begin('planner', 'RUN-1');
    const other = new AgentLogSink({ directory: join(root, 'large') });
    other.begin('planner', 'RUN-2');

    const small = perOpMicros(200, () => {
      sink.write(CHUNK);
    });
    const large = perOpMicros(50, () => {
      for (let index = 0; index < 4; index += 1) {
        other.write(CHUNK);
      }
    });

    expect(large / small).toBeLessThan(8);
  });
});
