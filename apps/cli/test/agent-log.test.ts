import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgentLogSink } from '../src/run/agent-log.ts';

function workspace(): string {
  return mkdtempSync(join(tmpdir(), 'lou-agent-log-'));
}

function agentsDir(root: string): string {
  return join(root, '.lou', 'runs', 'run-7', 'agents');
}

function names(root: string): readonly string[] {
  return readdirSync(agentsDir(root));
}

describe('AgentLogSink', () => {
  it('appends every raw chunk of the running agent', () => {
    const root = workspace();

    const sink = new AgentLogSink({ directory: agentsDir(root) });
    sink.begin('planner', 'RUN-1');
    sink.write('{"type":"reasoning"}\n');
    sink.write('{"type":"text"}\n');

    expect(readFileSync(join(agentsDir(root), 'planner-RUN-1.log'), 'utf8')).toBe(
      '{"type":"reasoning"}\n{"type":"text"}\n',
    );
    rmSync(root, { recursive: true, force: true });
  });

  it('creates the run directory and the log on demand', () => {
    const root = workspace();

    new AgentLogSink({ directory: agentsDir(root) }).begin('developer', 'RUN-2');

    expect(names(root)).toEqual(['developer-RUN-2.log']);
    rmSync(root, { recursive: true, force: true });
  });

  it('leaves an empty log proving the agent ran', () => {
    const root = workspace();
    const sink = new AgentLogSink({ directory: agentsDir(root) });

    sink.begin('developer', 'RUN-7');

    expect(readFileSync(join(agentsDir(root), 'developer-RUN-7.log'), 'utf8')).toBe('');
    rmSync(root, { recursive: true, force: true });
  });

  it('routes each agent to its own file', () => {
    const root = workspace();
    const sink = new AgentLogSink({ directory: agentsDir(root) });

    sink.begin('planner', 'RUN-3');
    sink.write('plan\n');
    sink.end();
    sink.begin('reviewer', 'RUN-4');
    sink.write('review\n');

    expect(readFileSync(join(agentsDir(root), 'planner-RUN-3.log'), 'utf8')).toBe('plan\n');
    expect(readFileSync(join(agentsDir(root), 'reviewer-RUN-4.log'), 'utf8')).toBe('review\n');
    rmSync(root, { recursive: true, force: true });
  });

  it('drops output that arrives outside an agent run', () => {
    const root = workspace();
    const sink = new AgentLogSink({ directory: agentsDir(root) });

    sink.write('stray output\n');

    expect(() => readdirSync(agentsDir(root))).toThrow();
    rmSync(root, { recursive: true, force: true });
  });

  it('never lets a logging failure break the run', () => {
    const root = workspace();
    const errors: unknown[] = [];
    writeFileSync(join(root, 'blocked'), 'not a directory');
    const sink = new AgentLogSink({
      directory: join(root, 'blocked', 'agents'),
      onError: (error) => errors.push(error),
    });

    sink.begin('planner', 'RUN-5');
    expect(() => {
      sink.write('data\n');
    }).not.toThrow();
    sink.write('still fine\n');

    expect(errors.length).toBeGreaterThan(0);
    rmSync(root, { recursive: true, force: true });
  });

  it('never writes a secret to disk', () => {
    const root = workspace();
    const sink = new AgentLogSink({ directory: agentsDir(root) });

    sink.begin('developer', 'RUN-8');
    sink.write('ANTHROPIC_API_KEY=sk-ant-abcdefghij1234567890\n');
    sink.write('postgres://admin:s3cret@db.internal/app\n');

    const log = readFileSync(join(agentsDir(root), 'developer-RUN-8.log'), 'utf8');
    expect(log).not.toContain('sk-ant-abcdefghij1234567890');
    expect(log).not.toContain('s3cret');
    expect(log).toContain('[redacted]');
    rmSync(root, { recursive: true, force: true });
  });

  it('keeps the usage counters in the log so the run stays diagnosable', () => {
    const root = workspace();
    const sink = new AgentLogSink({ directory: agentsDir(root) });

    sink.begin('planner', 'RUN-9');
    sink.write('{"tokens":{"input":120,"output":45}}\n');

    expect(readFileSync(join(agentsDir(root), 'planner-RUN-9.log'), 'utf8')).toContain(
      '"input":120',
    );
    rmSync(root, { recursive: true, force: true });
  });

  it('strips path separators so a hostile agent name cannot escape', () => {
    const root = workspace();

    const sink = new AgentLogSink({ directory: agentsDir(root) });
    sink.begin('../../escape', 'RUN-6');

    expect(names(root)).toEqual(['.._.._escape-RUN-6.log']);
    rmSync(root, { recursive: true, force: true });
  });
});
