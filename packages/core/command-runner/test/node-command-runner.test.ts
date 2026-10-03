import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeCommandRunner } from '../src/node-command-runner.ts';

const runner = new NodeCommandRunner();
const cwd = process.cwd();

describe('NodeCommandRunner', () => {
  it('captures stdout of a successful command', async () => {
    const result = await runner.run('node', ['-e', 'process.stdout.write("hi")'], { cwd });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hi');
    expect(result.interrupted).toBe(false);
  });

  it('captures stderr and a non-zero exit code', async () => {
    const result = await runner.run(
      'node',
      ['-e', 'process.stderr.write("boom"); process.exit(3)'],
      { cwd },
    );

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('boom');
  });

  it('marks the run as interrupted when the timeout expires', async () => {
    const result = await runner.run('node', ['-e', 'setTimeout(() => {}, 10_000)'], {
      cwd,
      timeoutMs: 40,
    });

    expect(result.interrupted).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });

  it('rejects when the binary does not exist', async () => {
    await expect(runner.run('no-such-binary-xyz', [], { cwd })).rejects.toBeInstanceOf(Error);
  });

  it('passes extra environment variables to the child process', async () => {
    const result = await runner.run(
      'node',
      ['-e', 'process.stdout.write(process.env.LOU_SMOKE_ENV ?? "absent")'],
      { cwd, env: { LOU_SMOKE_ENV: 'present' } },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('present');
  });
});

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe('NodeCommandRunner live output', () => {
  it('reports stdout chunks before the command exits', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lou-stream-'));
    scratch.push(dir);
    const gate = join(dir, 'go');
    const seen: string[] = [];

    const pending = runner.run('node', ['-e', WAIT_FOR_GATE, gate], {
      cwd: dir,
      onStdout: (chunk) => {
        seen.push(chunk);
      },
    });
    await waitFor(() => seen.join('').includes('first'));
    const beforeExit = seen.join('');

    writeFileSync(gate, 'go');
    await pending;

    expect(beforeExit).toContain('first');
    expect(seen.join('')).toContain('second');
  });

  it('reports stderr chunks separately from stdout', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    await runner.run('node', ['-e', 'process.stdout.write("o"); process.stderr.write("e")'], {
      cwd,
      onStdout: (chunk) => stdout.push(chunk),
      onStderr: (chunk) => stderr.push(chunk),
    });

    expect(stdout.join('')).toBe('o');
    expect(stderr.join('')).toBe('e');
  });

  it('runs without any live callback', async () => {
    const result = await runner.run('node', ['-e', 'process.stdout.write("quiet")'], { cwd });

    expect(result.stdout).toBe('quiet');
  });
});

const WAIT_FOR_GATE = [
  'const fs = require("node:fs");',
  'const gate = process.argv[1];',
  'process.stdout.write("first\\n");',
  'let tries = 0;',
  'const tick = () => {',
  '  if (fs.existsSync(gate) || tries >= 200) {',
  '    process.stdout.write("second\\n");',
  '    return;',
  '  }',
  '  tries += 1;',
  '  setTimeout(tick, 20);',
  '};',
  'tick();',
].join('');

async function waitFor(reached: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (reached()) {
      return;
    }
    await sleep(25);
  }
  throw new Error('the command never produced its first chunk');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
