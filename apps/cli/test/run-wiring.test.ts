import type { AgentRunResult, AgentRuntime, AgentRunInput, AgentStatus } from '@lou/agent-runtime';
import type { GitHubIssue } from '@lou/github';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildRunEnvironment, runTicket } from '../src/run/run-command.ts';
import { createGitHubSpy, resultFor } from './fakes.ts';

const SLOW = 30_000;

const ISSUE: GitHubIssue = {
  number: 1,
  title: 'Add reset password',
  body: 'User can request a reset token.',
  state: 'OPEN',
};

const PLANNER_STDOUT = [
  'SUMMARY: implement the reset password flow',
  'PLAN_TITLE: feat: reset password',
  'PLAN_BRANCH: feature/reset-password',
  'PLAN_COMMIT: feat(auth): add password reset',
  'PLAN_STEP: add the reset endpoint',
].join('\n');

const REPLIES: readonly string[] = [
  PLANNER_STDOUT,
  'TEST_PLAN: valid token',
  'CHANGED: test/reset.spec.ts\nSUMMARY: tests written',
  'CHANGED: src/reset.ts\nSUMMARY: implemented',
  'VERDICT: APPROVED\nREASON: looks good',
];

let dir: string;
let bare: string;
let lines: string[];

const git = (args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

function seedPackageJson(testScript: string): void {
  const manifest = { name: 'fixture', private: true, scripts: { test: testScript } };
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function createEditingRuntime(workspace: string): AgentRuntime {
  let index = 0;
  return {
    run(input: AgentRunInput): Promise<AgentRunResult> {
      const stdout = REPLIES[Math.min(index, REPLIES.length - 1)] ?? '';
      index += 1;
      applyReportedEdits(workspace, stdout);
      return Promise.resolve({ ...resultFor(stdout), runId: input.runId });
    },
    getStatus(runId: string): Promise<AgentStatus> {
      return Promise.resolve({ runId, running: true, finished: true });
    },
    interrupt(): Promise<void> {
      return Promise.resolve();
    },
  };
}

function applyReportedEdits(workspace: string, stdout: string): void {
  for (const line of stdout.split('\n')) {
    const match = /^CHANGED:\s*(.+)$/.exec(line);
    const relative = match?.[1]?.trim();
    if (relative === undefined || relative.length === 0) {
      continue;
    }
    const file = join(workspace, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, '// written by the agent\n');
  }
}

function auditEvents(): readonly string[] {
  const file = join(dir, '.lou', 'runs', 'run-1.jsonl');
  if (!existsSync(file)) {
    return [];
  }
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => (JSON.parse(line) as { readonly event: string }).event);
}

function committedFiles(): string {
  return git(['show', '--name-only', '--pretty=format:', 'HEAD']);
}

async function runWithRealAdapters(
  testScript = 'node -e "process.exit(0)"',
): Promise<ReturnType<typeof createGitHubSpy>> {
  seedPackageJson(testScript);
  const github = createGitHubSpy(ISSUE);
  const env = buildRunEnvironment({
    options: {
      issueNumbers: [1],
      cwd: dir,
      out: (line) => lines.push(line),
      dryRun: false,
      runtime: 'opencode',
    },
    issueNumber: 1,
    workspace: dir,
    many: false,
    wiring: {
      github: github.github,
      runtime: createEditingRuntime(dir),
      ask: () => Promise.resolve('yes'),
    },
  });
  await runTicket(env);
  return github;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lou-wiring-'));
  bare = mkdtempSync(join(tmpdir(), 'lou-wiring-bare-'));
  lines = [];
  execFileSync('git', ['init', '--bare', '-b', 'main'], { cwd: bare, encoding: 'utf8' });
  git(['init', '-b', 'main']);
  git(['config', 'user.email', 'agent@lou.dev']);
  git(['config', 'user.name', 'Lou Test']);
  git(['remote', 'add', 'origin', bare]);
  writeFileSync(join(dir, 'README.md'), '# fixture\n');
  git(['add', '.']);
  git(['commit', '-m', 'chore: seed']);
  git(['push', '-u', 'origin', 'main']);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(bare, { recursive: true, force: true });
});

describe('the real run wiring', () => {
  it(
    'carries an issue to a pull request with real git',
    async () => {
      const github = await runWithRealAdapters();

      expect(github.created).toHaveLength(1);
      expect(github.created[0]?.title).toBe('feat: reset password');
    },
    SLOW,
  );

  it(
    'really checks out the branch the planner named',
    async () => {
      await runWithRealAdapters();

      expect(git(['branch', '--show-current'])).toBe('feature/reset-password');
    },
    SLOW,
  );

  it(
    'really commits the work the developer agent reported',
    async () => {
      await runWithRealAdapters();

      expect(git(['log', '-1', '--pretty=%s'])).toBe('feat(auth): add password reset');
      expect(committedFiles()).toContain('src/reset.ts');
      expect(committedFiles()).toContain('test/reset.spec.ts');
    },
    SLOW,
  );

  it(
    'really pushes the branch to origin',
    async () => {
      await runWithRealAdapters();

      const remoteHeads = execFileSync('git', ['ls-remote', '--heads', bare], { encoding: 'utf8' });
      expect(remoteHeads).toContain('refs/heads/feature/reset-password');
    },
    SLOW,
  );

  it(
    'leaves the audit trail on disk',
    async () => {
      await runWithRealAdapters();

      const events = auditEvents();
      expect(events).toContain('file_changed');
      expect(events).toContain('test_finished');
      expect(events).toContain('git_commit');
      expect(events).toContain('git_push');
      expect(events).toContain('pr_created');
    },
    SLOW,
  );

  it(
    'never commits the audit trail into the pull request',
    async () => {
      await runWithRealAdapters();

      expect(committedFiles()).not.toContain('.lou');
    },
    SLOW,
  );

  it(
    'opens no pull request when the real test command fails',
    async () => {
      const github = await runWithRealAdapters('node -e "process.exit(1)"');

      expect(github.created).toHaveLength(0);
      expect(git(['log', '-1', '--pretty=%s'])).toBe('chore: seed');
    },
    SLOW,
  );

  it(
    'says why it stopped when the tests fail',
    async () => {
      await runWithRealAdapters('node -e "process.exit(1)"');

      expect(lines.join('\n')).toMatch(/test/i);
    },
    SLOW,
  );

  it(
    'builds the runtime the flags selected',
    () => {
      const env = buildRunEnvironment({
        options: { issueNumbers: [1], cwd: dir, out: () => {}, dryRun: true, runtime: 'claude' },
        issueNumber: 1,
        workspace: dir,
        many: false,
      });

      expect(env.runtime.constructor.name).toBe('ClaudeCodeRuntime');
    },
    SLOW,
  );
});
