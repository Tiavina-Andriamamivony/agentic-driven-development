import type { GitAdapter } from '@lou/git';

interface GitSpyOptions {
  readonly visible?: readonly string[];
}

interface GitSpy {
  readonly git: GitAdapter;
  readonly branches: readonly string[];
  readonly staged: readonly string[];
  readonly commits: readonly string[];
  readonly calls: readonly string[];
  readonly pushes: number;
}

export function createGitSpy(options: GitSpyOptions = {}): GitSpy {
  const branches: string[] = [];
  const staged: string[] = [];
  const commits: string[] = [];
  const calls: string[] = [];
  let pushes = 0;
  const git: GitAdapter = {
    createBranch(name: string): Promise<void> {
      branches.push(name);
      calls.push('createBranch');
      return Promise.resolve();
    },
    stage(paths: readonly string[]): Promise<void> {
      staged.push(...paths);
      calls.push('stage');
      return Promise.resolve();
    },
    commit(message: string): Promise<void> {
      commits.push(message);
      calls.push('commit');
      return Promise.resolve();
    },
    push(): Promise<void> {
      pushes += 1;
      calls.push('push');
      return Promise.resolve();
    },
    getCurrentBranch(): Promise<string> {
      return Promise.resolve(branches[0] ?? 'main');
    },
    isClean(): Promise<boolean> {
      return Promise.resolve(true);
    },
    changedPaths(): Promise<readonly string[]> {
      return Promise.resolve(options.visible ?? ['src/index.ts', 'test/feature.spec.ts']);
    },
  };
  return {
    git,
    branches,
    staged,
    commits,
    calls,
    get pushes(): number {
      return pushes;
    },
  };
}
