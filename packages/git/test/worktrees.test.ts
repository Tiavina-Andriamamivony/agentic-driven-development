import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodeGitAdapter } from '../src/node-git-adapter.ts';

let dir: string;
let other: string;
let adapter: NodeGitAdapter;

const git = (args: string[], cwd = dir): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lou-git-'));
  git(['init', '-b', 'main']);
  git(['config', 'user.email', 'agent@lou.dev']);
  git(['config', 'user.name', 'Lou Test']);
  writeFileSync(join(dir, 'file.txt'), 'root');
  git(['add', '.']);
  git(['commit', '-m', 'chore: seed']);
  other = `${dir}-wt`;
  adapter = new NodeGitAdapter({ root: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(other, { recursive: true, force: true });
});

describe('NodeGitAdapter worktrees', () => {
  it('adds a detached worktree at the requested path', async () => {
    await adapter.addWorktree(other);

    expect(existsSync(join(other, 'file.txt'))).toBe(true);
    expect(git(['rev-parse', '--abbrev-ref', 'HEAD'], other)).toBe('HEAD');
    expect(git(['worktree', 'list'])).toContain(other);
  });

  it('branches and commits inside the worktree without touching the main tree', async () => {
    await adapter.addWorktree(other);
    const inner = new NodeGitAdapter({ root: other });
    await inner.createBranch('feature/island');
    writeFileSync(join(other, 'file.txt'), 'island change');
    git(['add', '.'], other);
    await inner.commit('feat: island change');

    expect(git(['rev-parse', '--abbrev-ref', 'HEAD'], other)).toBe('feature/island');
    expect(git(['rev-parse', '--abbrev-ref', 'HEAD'], dir)).toBe('main');
    expect(git(['log', '--format=%s', '-1'], other)).toBe('feat: island change');
    expect(git(['log', '--format=%s', '-1'], dir)).toBe('chore: seed');
  });

  it('removes an added worktree', async () => {
    await adapter.addWorktree(other);
    await adapter.removeWorktree(other);

    expect(existsSync(other)).toBe(false);
    expect(git(['worktree', 'list'])).not.toContain(other);
  });

  it('refuses an empty worktree path', async () => {
    await expect(adapter.addWorktree('   ')).rejects.toThrow('worktree path');
    await expect(adapter.removeWorktree('   ')).rejects.toThrow('worktree path');
  });
});
