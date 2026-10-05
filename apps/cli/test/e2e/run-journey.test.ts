import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const BIN = fileURLToPath(new URL('../../bin/lou.js', import.meta.url));
const PTY = '/usr/bin/script';
const SLOW = 60_000;

const OPENCODE_SOURCE = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};
const agent = flag('--agent') || '';
const dir = flag('--dir') || process.cwd();
const emit = (text) =>
  process.stdout.write(JSON.stringify({ type: 'text', part: { type: 'text', text } }) + '\\n');
const write = (rel, body) => {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
};
if (agent === 'planner') {
  emit('SUMMARY: implement the reset password flow');
  emit('QUESTION: is the token single-use?');
  emit('PLAN_TITLE: feat: reset password');
  emit('PLAN_BRANCH: feature/reset-password');
  emit('PLAN_COMMIT: feat(auth): add password reset');
  emit('PLAN_STEP: add the reset endpoint');
} else if (agent === 'test-designer') {
  emit('TEST_PLAN: a valid token resets the password');
} else if (agent === 'test-writer') {
  write('tests/reset.test.js', 'test("reset", () => {});\\n');
  emit('CHANGED: tests/reset.test.js');
  emit('SUMMARY: wrote the failing spec');
} else if (agent === 'developer') {
  write('src/reset.js', 'export const reset = () => true;\\n');
  emit('CHANGED: src/reset.js');
  emit('SUMMARY: implemented the reset endpoint');
} else if (agent === 'reviewer') {
  emit('VERDICT: APPROVED');
  emit('REASON: the change matches the plan');
}
`;

const GH_SOURCE = `#!/bin/sh
case "$1 $2" in
  "auth status") exit 0 ;;
  "issue view")
    printf '%s\\n' '{"number":1,"title":"Add reset password","body":"A user can request a reset token.","state":"OPEN"}'
    exit 0 ;;
  "pr create")
    printf '%s\\n' 'https://github.com/acme/app/pull/42'
    exit 0 ;;
esac
exit 0
`;

interface JourneyResult {
  readonly code: number | null;
  readonly output: string;
}

let repo: string;
let bare: string;
let fakeBin: string;

function git(args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd: repo, encoding: 'utf8' }).trim();
}

function writeExecutable(dir: string, name: string, source: string): void {
  const file = join(dir, name);
  writeFileSync(file, source);
  chmodSync(file, 0o755);
}

function installFakeBin(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lou-e2e-bin-'));
  writeExecutable(dir, 'opencode', OPENCODE_SOURCE);
  writeExecutable(dir, 'gh', GH_SOURCE);
  return dir;
}

function seedRepo(): void {
  execFileSync('git', ['init', '--bare', '-b', 'main'], { cwd: bare, encoding: 'utf8' });
  git(['init', '-b', 'main']);
  git(['config', 'user.email', 'agent@lou.dev']);
  git(['config', 'user.name', 'Lou E2E']);
  git(['remote', 'add', 'origin', bare]);
  writeFileSync(
    join(repo, 'package.json'),
    `${JSON.stringify(
      {
        name: 'fixture',
        private: true,
        scripts: { test: 'node -e "console.log(\'3 passed\')"' },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(repo, 'README.md'), '# fixture\n');
  git(['add', '.']);
  git(['commit', '-m', 'chore: seed']);
  git(['push', '-u', 'origin', 'main']);
}

const ESC = String.fromCharCode(27);

function clean(text: string): string {
  return text.replace(new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, 'g'), '').replace(/\r/g, '');
}

const PROMPTS = ['is the token single-use?', 'Approve plan?', 'Approve review?'];

function answerPendingPrompts(
  child: ReturnType<typeof spawn>,
  output: string,
  answered: Set<string>,
): void {
  for (const prompt of PROMPTS) {
    if (!answered.has(prompt) && output.includes(prompt)) {
      answered.add(prompt);
      child.stdin?.write('yes\n');
    }
  }
}

function runLou(): Promise<JourneyResult> {
  return new Promise((resolve, reject) => {
    const command = `'${process.execPath}' '${BIN}' run 1`;
    const child = spawn(PTY, ['-qec', command, '/dev/null'], {
      cwd: repo,
      env: { ...process.env, PATH: `${fakeBin}:${process.env['PATH'] ?? ''}`, CI: '1' },
    });
    let output = '';
    const answered = new Set<string>();
    const onData = (chunk: Buffer): void => {
      output += chunk.toString('utf8');
      answerPendingPrompts(child, output, answered);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, output: clean(output) });
    });
  });
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'lou-e2e-repo-'));
  bare = mkdtempSync(join(tmpdir(), 'lou-e2e-bare-'));
  fakeBin = installFakeBin();
  seedRepo();
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(bare, { recursive: true, force: true });
  rmSync(fakeBin, { recursive: true, force: true });
});

describe('the lou binary, end to end', () => {
  it.skipIf(!existsSync(PTY))(
    'carries a GitHub issue to a pull request, approving both gates',
    async () => {
      const result = await runLou();

      expect(result.output).toContain('Pull request created: https://github.com/acme/app/pull/42');
      expect(result.code).toBe(0);
      expect(git(['log', '-1', '--pretty=%s'])).toBe('feat(auth): add password reset');
      const committed = git(['show', '--name-only', '--pretty=format:', 'HEAD']);
      expect(committed).toContain('src/reset.js');
      expect(committed).toContain('tests/reset.test.js');
      const heads = execFileSync('git', ['ls-remote', '--heads', bare], { encoding: 'utf8' });
      expect(heads).toContain('refs/heads/feature/reset-password');
      const trail = readFileSync(join(repo, '.lou', 'runs', 'run-1.jsonl'), 'utf8');
      for (const event of [
        'human_approval',
        'file_changed',
        'test_finished',
        'git_commit',
        'git_push',
        'pr_created',
      ]) {
        expect(trail).toContain(`"event":"${event}"`);
      }
      expect(committed).not.toContain('.lou');
    },
    SLOW,
  );
});
