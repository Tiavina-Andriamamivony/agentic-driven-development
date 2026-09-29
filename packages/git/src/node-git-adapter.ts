import type { CommandResult, CommandRunner } from '@lou/command-runner';
import { NodeCommandRunner } from '@lou/command-runner';
import type { GitAdapter } from './git-adapter.ts';

export interface NodeGitAdapterOptions {
  readonly root: string;
  readonly runner?: CommandRunner;
}

export class NodeGitAdapter implements GitAdapter {
  private readonly root: string;
  private readonly runner: CommandRunner;

  constructor(options: NodeGitAdapterOptions) {
    this.root = options.root;
    this.runner = options.runner ?? new NodeCommandRunner();
  }

  async createBranch(name: string): Promise<void> {
    assertNonEmpty(name, 'branch name');
    assertNoWhitespace(name, 'branch name');
    await this.git(['checkout', '-b', name]);
  }

  async commit(message: string): Promise<void> {
    assertNonEmpty(message, 'commit message');
    await this.git(['commit', '-m', message]);
  }

  async push(): Promise<void> {
    await this.git(['push', '-u', 'origin', 'HEAD']);
  }

  async getCurrentBranch(): Promise<string> {
    const result = await this.git(['rev-parse', '--abbrev-ref', 'HEAD']);
    return result.stdout.trim();
  }

  async isClean(): Promise<boolean> {
    const result = await this.git(['status', '--porcelain']);
    return result.stdout.length === 0;
  }

  async addWorktree(path: string): Promise<void> {
    assertNonEmpty(path, 'worktree path');
    await this.git(['worktree', 'add', '--detach', path]);
  }

  async removeWorktree(path: string): Promise<void> {
    assertNonEmpty(path, 'worktree path');
    await this.git(['worktree', 'remove', '--force', path]);
  }

  private async git(args: readonly string[]): Promise<CommandResult> {
    const result = await this.runner.run('git', args, { cwd: this.root });
    if (result.exitCode !== 0) {
      throw new Error(`git ${args[0] ?? 'command'} failed: ${result.stderr.trim()}`);
    }
    return result;
  }
}

function assertNonEmpty(value: string, what: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${what} must not be empty`);
  }
}

function assertNoWhitespace(value: string, what: string): void {
  if (/\s/.test(value)) {
    throw new Error(`${what} must not contain whitespace`);
  }
}
