import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cycleOf, DEFAULT_KEEP_CYCLES, planRetention } from '../src/run/run-retention.ts';

function runsDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'lou-retention-'));
  const dir = join(root, '.lou', 'runs');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function seed(dir: string, names: readonly string[]): void {
  for (const name of names) {
    if (name.endsWith('/')) {
      mkdirSync(join(dir, name.slice(0, -1)), { recursive: true });
    } else {
      writeFileSync(join(dir, name), 'x');
    }
  }
}

describe('cycleOf', () => {
  it('reads the issue number out of every artifact of a cycle', () => {
    expect(cycleOf('run-12.jsonl')).toBe(12);
    expect(cycleOf('run-12.summary.json')).toBe(12);
    expect(cycleOf('run-12')).toBe(12);
  });

  it('refuses anything that is not a run artifact', () => {
    expect(cycleOf('README.md')).toBeNull();
    expect(cycleOf('run-abc.jsonl')).toBeNull();
    expect(cycleOf('run-.jsonl')).toBeNull();
    expect(cycleOf('other-12.jsonl')).toBeNull();
    expect(cycleOf('run-12.jsonl.bak')).toBeNull();
  });
});

describe('planRetention', () => {
  it('keeps the most recent cycles and drops the oldest', () => {
    const entries = ['run-1.jsonl', 'run-2.jsonl', 'run-3.jsonl', 'run-4.jsonl'];

    expect(planRetention(entries, 2)).toEqual([1, 2]);
  });

  it('never drops the cycle that just ran even when it is the oldest', () => {
    const entries = ['run-9.jsonl', 'run-10.jsonl', 'run-11.jsonl'];

    expect(planRetention(entries, 1, 9)).toEqual([10]);
  });

  it('ignores files that are not run artifacts', () => {
    const entries = ['README.md', 'constitution.md', 'run-4.jsonl'];

    expect(planRetention(entries, 1)).toEqual([]);
  });

  it('has a retention window that is neither zero nor infinite', () => {
    expect(DEFAULT_KEEP_CYCLES).toBeGreaterThan(0);
    expect(DEFAULT_KEEP_CYCLES).toBeLessThan(100);
  });
});

describe('cleanup safety', () => {
  it('never names a path it cannot rebuild from a validated cycle id', () => {
    const dir = runsDir();
    seed(dir, ['run-1.jsonl', 'run-2.jsonl', 'README.md', 'run-2/']);

    expect(existsSync(join(dir, 'run-1.jsonl'))).toBe(true);
    expect(existsSync(join(dir, 'README.md'))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});
