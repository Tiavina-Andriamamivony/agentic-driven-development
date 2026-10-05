import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GitAdapter } from '../src/git-adapter.ts';
import { NodeGitAdapter } from '../src/node-git-adapter.ts';

let dir: string;
let adapter: GitAdapter;

const git = (args: string[], cwd = dir): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lou-git-'));
  git(['init', '-b', 'main']);
  git(['config', 'user.email', 'agent@lou.dev']);
  git(['config', 'user.name', 'Lou Test']);
  adapter = new NodeGitAdapter({ root: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('NodeGitAdapter', () => {
  it('reports the working tree as clean when nothing changed', async () => {
    await expect(adapter.isClean()).resolves.toBe(true);
  });

  it('lists no changed path when the tree is clean', async () => {
    await expect(adapter.changedPaths()).resolves.toEqual([]);
  });

  it('lists a modified file', async () => {
    writeFileSync(join(dir, 'file.txt'), 'hello');

    await expect(adapter.changedPaths()).resolves.toEqual(['file.txt']);
  });

  it('lists a file inside a new directory', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src/index.ts'), 'export const a = 1;');

    await expect(adapter.changedPaths()).resolves.toEqual(['src/index.ts']);
  });

  it('lists a deleted file', async () => {
    writeFileSync(join(dir, 'gone.txt'), 'bye');
    git(['add', '.']);
    git(['commit', '-m', 'chore: seed']);
    rmSync(join(dir, 'gone.txt'));

    await expect(adapter.changedPaths()).resolves.toEqual(['gone.txt']);
  });

  it('reports a renamed file under its new name', async () => {
    writeFileSync(join(dir, 'before.txt'), 'x');
    git(['add', '.']);
    git(['commit', '-m', 'chore: seed']);
    git(['mv', 'before.txt', 'after.txt']);

    await expect(adapter.changedPaths()).resolves.toEqual(['after.txt']);
  });

  it('reports the working tree as dirty when a file is modified', async () => {
    git(['checkout', '-b', 'feature/one', '--quiet']);
    writeFileSync(join(dir, 'file.txt'), 'hello');

    await expect(adapter.isClean()).resolves.toBe(false);
  });

  it('stages the given paths so a later commit records them', async () => {
    writeFileSync(join(dir, 'seed.txt'), 'seed');
    git(['add', '.']);
    git(['commit', '-m', 'chore: seed']);
    writeFileSync(join(dir, 'tracked.txt'), 'changed');
    writeFileSync(join(dir, 'untracked.txt'), 'new');

    await adapter.stage(['tracked.txt']);
    await adapter.commit('feat: staged change');

    const committed = git(['show', '--name-only', '--pretty=format:', 'HEAD']);
    expect(committed).toContain('tracked.txt');
  });

  it('stages nothing beyond the paths it was given', async () => {
    writeFileSync(join(dir, 'seed.txt'), 'seed');
    git(['add', '.']);
    git(['commit', '-m', 'chore: seed']);
    writeFileSync(join(dir, 'tracked.txt'), 'changed');
    writeFileSync(join(dir, 'untracked.txt'), 'new');

    await adapter.stage(['tracked.txt']);
    await adapter.commit('feat: only the tracked change');

    const committed = git(['show', '--name-only', '--pretty=format:', 'HEAD']);
    expect(committed).not.toContain('untracked.txt');
  });

  it('refuses to stage a path the agent never wrote', async () => {
    writeFileSync(join(dir, 'seed.txt'), 'seed');
    git(['add', '.']);
    git(['commit', '-m', 'chore: seed']);

    await expect(adapter.stage(['never-written.txt'])).rejects.toThrow();
  });

  it('treats a path starting with a dash as a path, not an option', async () => {
    writeFileSync(join(dir, 'seed.txt'), 'seed');
    git(['add', '.']);
    git(['commit', '-m', 'chore: seed']);
    writeFileSync(join(dir, '--weird.txt'), 'weird');

    await expect(adapter.stage(['--weird.txt'])).resolves.toBeUndefined();
  });

  it('returns the current branch name', async () => {
    writeFileSync(join(dir, 'file.txt'), 'root');
    git(['add', '.']);
    git(['commit', '-m', 'chore: seed']);
    git(['checkout', '-b', 'feature/named', '--quiet']);

    await expect(adapter.getCurrentBranch()).resolves.toBe('feature/named');
  });

  it('creates a branch and switches to it', async () => {
    writeFileSync(join(dir, 'file.txt'), 'root');
    git(['add', '.']);
    git(['commit', '-m', 'chore: seed']);
    git(['checkout', '-b', 'feature/other', '--quiet']);

    await adapter.createBranch('feature/created');

    expect(git(['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('feature/created');
    expect(git(['branch', '--list', '--format', '%(refname:short)', 'feature/created'])).toBe(
      'feature/created',
    );
  });

  it('rejects creating a branch whose name is empty', async () => {
    await expect(adapter.createBranch('   ')).rejects.toThrow('branch name');
  });

  it('rejects creating a branch whose name contains whitespace', async () => {
    await expect(adapter.createBranch('feature bad')).rejects.toThrow('branch name');
  });

  it('rejects committing with an empty message', async () => {
    writeFileSync(join(dir, 'file.txt'), 'change');

    await expect(adapter.commit('   ')).rejects.toThrow('commit message');
  });

  it('commits staged changes with the given message', async () => {
    writeFileSync(join(dir, 'file.txt'), 'content');
    git(['add', '.']);

    await adapter.commit('feat: add file');

    expect(git(['log', '--format=%s', '-1'])).toBe('feat: add file');
    await expect(adapter.isClean()).resolves.toBe(true);
  });

  it('pushes the current branch to its upstream on origin', async () => {
    const bareDir = mkdtempSync(join(tmpdir(), 'lou-git-bare-'));
    try {
      execFileSync('git', ['init', '--bare'], { cwd: bareDir, encoding: 'utf8' });
      git(['remote', 'add', 'origin', bareDir]);
      writeFileSync(join(dir, 'file.txt'), 'pushable');
      git(['add', '.']);
      git(['commit', '-m', 'feat: pushable change']);
      git(['checkout', '-b', 'feature/push', '--quiet']);

      await expect(adapter.push()).resolves.toBeUndefined();

      const remoteHeads = execFileSync('git', ['ls-remote', '--heads', bareDir], {
        encoding: 'utf8',
      });
      expect(remoteHeads).toContain('refs/heads/feature/push');
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
    }
  });

  it('throws when git reports a failure', async () => {
    writeFileSync(join(dir, 'file.txt'), 'original');
    git(['add', '.']);
    git(['commit', '-m', 'chore: seed']);
    writeFileSync(join(dir, 'file.txt'), 'modified');

    await expect(adapter.commit('feat: unstaged change')).rejects.toThrow();
  });
});
