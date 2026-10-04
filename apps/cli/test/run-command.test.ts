import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GitHubAdapter, GitHubIssue } from '@lou/github';
import type { AgentRunResult } from '@lou/agent-runtime';
import { ClaudeCodeRuntime } from '@lou/claude-code-runtime';
import { OpenCodeRuntime } from '@lou/opencode-runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunEnvironment, RunSummary } from '../src/run/run-command';
import type { GitWorktrees } from '../src/run/run-command';
import {
  createAgentRuntime,
  inWorktree,
  parseRunArguments,
  readIssueNumber,
  runBatch,
  runTicket,
} from '../src/run/run-command';
import {
  createAuditSpy,
  createFakeRuntime,
  createGitHubSpy,
  createGitSpy,
  createTestRunner,
  provingVerifier,
  readyDoctorProbes,
  resultFor,
} from './fakes';

const ISSUE: GitHubIssue = {
  number: 1,
  title: 'Add reset password',
  body: 'User can reset the password.',
  state: 'OPEN',
};

const PLANNER_STDOUT = [
  'SUMMARY: implement the reset password flow',
  'PLAN_TITLE: feat: reset password',
  'PLAN_BRANCH: feature/reset-password',
  'PLAN_COMMIT: feat(auth): add password reset',
  'PLAN_STEP: add the reset endpoint',
].join('\n');

function happyReplies(): readonly AgentRunResult[] {
  return [
    resultFor(PLANNER_STDOUT),
    resultFor('TEST_PLAN: valid token'),
    resultFor('CHANGED: test/reset.spec.ts\nSUMMARY: tests written'),
    resultFor('CHANGED: src/reset.ts\nSUMMARY: implemented'),
    resultFor('VERDICT: APPROVED\nREASON: looks good'),
  ];
}

interface EnvFixture {
  readonly env: RunEnvironment;
  readonly git: ReturnType<typeof createGitSpy>;
  readonly audit: ReturnType<typeof createAuditSpy>;
  readonly github: ReturnType<typeof createGitHubSpy>;
  readonly runtime: ReturnType<typeof createFakeRuntime>;
  readonly out: readonly string[];
}

interface BuildEnvSettings {
  readonly model?: string;
  readonly modelsByAgent?: Readonly<Record<string, string>>;
  readonly mcp?: Readonly<Record<string, string>>;
  readonly maxCostUsd?: number;
  readonly maxMinutes?: number;
}

function settingsFields(settings: BuildEnvSettings): {
  readonly model?: string;
  readonly modelsByAgent?: Readonly<Record<string, string>>;
  readonly mcp?: Readonly<Record<string, string>>;
  readonly maxCostUsd?: number;
  readonly maxMinutes?: number;
} {
  return {
    ...(settings.model !== undefined ? { model: settings.model } : {}),
    ...(settings.modelsByAgent !== undefined ? { modelsByAgent: settings.modelsByAgent } : {}),
    ...(settings.mcp !== undefined ? { mcp: settings.mcp } : {}),
    ...(settings.maxCostUsd !== undefined ? { maxCostUsd: settings.maxCostUsd } : {}),
    ...(settings.maxMinutes !== undefined ? { maxMinutes: settings.maxMinutes } : {}),
  };
}

function buildEnv(
  replies: readonly AgentRunResult[],
  issue: GitHubIssue = ISSUE,
  settings?: BuildEnvSettings,
): EnvFixture {
  const git = createGitSpy();
  const audit = createAuditSpy();
  const github = createGitHubSpy(issue);
  const tests = createTestRunner(true);
  const runtime = createFakeRuntime(replies);
  const out: string[] = [];
  const env: RunEnvironment = {
    issueNumber: issue.number,
    root: '/proj',
    workspace: '/work',
    github: github.github,
    git: git.git,
    tests: tests.runner,
    runtimeName: 'opencode',
    preflightProbes: readyDoctorProbes(),
    verifier: provingVerifier(),
    audit: audit.log,
    runtime,
    conventions: 'conventional commits',
    ask: () => Promise.resolve('y'),
    out: (line: string) => out.push(line),
    dryRun: false,
    ...(settings === undefined ? {} : settingsFields(settings)),
  };
  return { env, git, audit, github, runtime, out };
}

describe('runTicket', () => {
  it('drives the ticket to a pull request', async () => {
    const { env, git, audit, github, runtime, out } = buildEnv(happyReplies());

    const code = await runTicket(env);

    expect(code).toBe(0);
    expect(runtime.runs.map((run) => run.agent)).toEqual([
      'planner',
      'test-designer',
      'test-writer',
      'developer',
      'reviewer',
    ]);
    expect(git.branches).toEqual(['feature/reset-password']);
    expect(git.commits).toEqual(['feat(auth): add password reset']);
    expect(git.pushes).toBe(1);
    expect(github.created).toHaveLength(1);
    const output = out.join('\n');
    expect(output).toContain('Pull request created: https://hub.example/pr/42');
    expect(audit.events().map((event) => event.event)).toEqual(
      expect.arrayContaining(['human_approval', 'review_finished', 'pr_created']),
    );
  });

  it('records the preflight verdict before any agent runs', async () => {
    const { env, audit, runtime } = buildEnv(happyReplies());

    await runTicket(env);

    const recorded = audit.events().map((event) => event.event);
    const preflight = audit.events().find((event) => event.target === 'preflight');
    expect(preflight?.event).toBe('test_finished');
    expect(preflight?.result).toBe('success');
    expect(recorded.indexOf('test_finished')).toBeLessThan(recorded.indexOf('agent_started'));
    expect(runtime.runs.length).toBeGreaterThan(0);
  });

  it('refuses to start the run when the audit trail cannot be written', async () => {
    const { env, runtime } = buildEnv(happyReplies());
    const broken: RunEnvironment = {
      ...env,
      audit: {
        record: () => Promise.reject(new Error('audit disk full')),
        history: () => Promise.resolve([]),
      },
    };

    await expect(runTicket(broken)).rejects.toThrow('audit disk full');
    expect(runtime.runs).toHaveLength(0);
  });

  it('records a failing preflight verdict and runs no agent', async () => {
    const { env, audit, runtime, out } = buildEnv(happyReplies());
    const root = mkdtempSync(join(tmpdir(), 'lou-command-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }));
    const broken: RunEnvironment = {
      ...env,
      root,
      verifier: { run: () => Promise.resolve({ passed: false, reason: 'no test ran' }) },
    };

    const code = await runTicket(broken);

    const preflight = audit.events().find((event) => event.target === 'preflight');
    expect(code).toBe(1);
    expect(preflight?.result).toBe('failure');
    expect(preflight?.reason).toContain('no test ran');
    expect(runtime.runs).toHaveLength(0);
    expect(out.join('\n')).toContain('Preflight failed');
  });

  it('refuses a closed issue', async () => {
    const closed: GitHubIssue = { ...ISSUE, state: 'CLOSED' };
    const { env, out } = buildEnv([], closed);

    const code = await runTicket(env);

    expect(code).toBe(1);
    expect(out.join('\n')).toContain('already closed');
  });

  it('reports a fetch failure', async () => {
    const failing: GitHubAdapter = {
      getIssue: () => Promise.reject(new Error('network down')),
      createPullRequest: () => Promise.reject(new Error('nope')),
    };
    const git = createGitSpy();
    const audit = createAuditSpy();
    const tests = createTestRunner(true);
    const runtime = createFakeRuntime(happyReplies());
    const out: string[] = [];
    const env: RunEnvironment = {
      issueNumber: 1,
      root: '/proj',
      workspace: '/work',
      github: failing,
      git: git.git,
      tests: tests.runner,
      audit: audit.log,
      runtime,
      runtimeName: 'opencode',
      preflightProbes: readyDoctorProbes(),
      verifier: provingVerifier(),
      conventions: 'conventional commits',
      ask: () => Promise.resolve('y'),
      out: (line: string) => out.push(line),
      dryRun: false,
    };

    const code = await runTicket(env);

    expect(code).toBe(1);
    expect(out.join('\n')).toContain('Cannot fetch issue #1: network down');
  });

  it('fails when the reviewer blocks the change', async () => {
    const replies = [
      ...happyReplies().slice(0, 4),
      resultFor('VERDICT: BLOCKED\nREASON: insecure'),
    ];
    const { env, out } = buildEnv(replies);

    const code = await runTicket(env);

    expect(code).toBe(1);
    expect(out.join('\n')).toContain('Blocked by the reviewer');
  });

  it('asks the human before committing and opening the pull request', async () => {
    const asked: string[] = [];
    const { env, out } = buildEnv(happyReplies());
    const envWithPrompts = {
      ...env,
      ask: (question: string) => {
        asked.push(question);
        return Promise.resolve('y');
      },
    };

    const code = await runTicket(envWithPrompts);

    expect(code).toBe(0);
    expect(asked.some((question) => question.includes('Approve plan'))).toBe(true);
    expect(asked.some((question) => question.includes('Approve review'))).toBe(true);
    expect(out.join('\n')).toContain('▸ PLAN GATE');
    expect(out.join('\n')).toContain('▸ REVIEW GATE');
  });

  it('routes the configured model to every agent run', async () => {
    const { env, runtime } = buildEnv(happyReplies(), ISSUE, { model: 'gpt-5' });

    const code = await runTicket(env);

    expect(code).toBe(0);
    expect(runtime.runs).toHaveLength(5);
    for (const run of runtime.runs) {
      expect(run.model).toBe('gpt-5');
    }
  });

  it('prefers the per-agent model over the global model', async () => {
    const { env, runtime } = buildEnv(happyReplies(), ISSUE, {
      model: 'gpt-5',
      modelsByAgent: { planner: 'opus', reviewer: 'flash' },
    });

    const code = await runTicket(env);

    expect(code).toBe(0);
    expect(runtime.runs.map((run) => `${run.agent}:${run.model ?? '(none)'}`)).toEqual([
      'planner:opus',
      'test-designer:gpt-5',
      'test-writer:gpt-5',
      'developer:gpt-5',
      'reviewer:flash',
    ]);
  });

  it('mounts the configured MCP servers on every agent run', async () => {
    const { env, runtime } = buildEnv(happyReplies(), ISSUE, {
      mcp: { sqlite: 'uvx', demo: 'node' },
    });

    const code = await runTicket(env);

    expect(code).toBe(0);
    expect(runtime.runs).toHaveLength(5);
    for (const run of runtime.runs) {
      expect(run.mcp).toEqual({ sqlite: 'uvx', demo: 'node' });
    }
  });

  it('pauses the run for human intervention when the cost limit is exceeded', async () => {
    const firstReply = happyReplies()[0] ?? resultFor('');
    const replies = [
      { ...firstReply, usage: { promptTokens: 1, completionTokens: 1, costUsd: 5 } },
      ...happyReplies().slice(1),
    ];
    const { env, out } = buildEnv(replies, ISSUE, { maxCostUsd: 1 });

    const code = await runTicket(env);

    expect(code).toBe(1);
    expect(out.join('\n')).toContain('Needs human intervention: max cost 1.00 usd exceeded');
  });

  it('lets a run proceed when the cost stays within the limit', async () => {
    const planner = happyReplies()[0] ?? resultFor('');
    const replies = [
      { ...planner, usage: { promptTokens: 1, completionTokens: 1, costUsd: 0.2 } },
      ...happyReplies().slice(1),
    ];
    const { env, out } = buildEnv(replies, ISSUE, { maxCostUsd: 1 });

    const code = await runTicket(env);

    expect(code).toBe(0);
    expect(out.join('\n')).toContain('Pull request created');
  });
});

describe('runTicket in dry-run', () => {
  it('prints the plan and makes no git, github, test or implementation calls', async () => {
    const git = createGitSpy();
    const audit = createAuditSpy();
    const github = createGitHubSpy(ISSUE);
    const tests = createTestRunner(true);
    const runtime = createFakeRuntime([resultFor(PLANNER_STDOUT)]);
    const out: string[] = [];
    const env: RunEnvironment = {
      issueNumber: ISSUE.number,
      root: '/proj',
      workspace: '/work',
      github: github.github,
      git: git.git,
      tests: tests.runner,
      audit: audit.log,
      runtime,
      runtimeName: 'opencode',
      preflightProbes: readyDoctorProbes(),
      verifier: provingVerifier(),
      conventions: 'conventional commits',
      ask: () => Promise.resolve('y'),
      out: (line: string) => out.push(line),
      dryRun: true,
    };

    const code = await runTicket(env);

    expect(code).toBe(0);
    expect(runtime.runs.map((run) => run.agent)).toEqual(['planner']);
    expect(git.branches).toEqual([]);
    expect(git.commits).toEqual([]);
    expect(git.pushes).toBe(0);
    expect(github.created).toHaveLength(0);
    expect(tests.runs).toEqual([]);
    const output = out.join('\n');
    expect(output).toContain('Plan: feat: reset password');
    expect(output).toContain('Branch: feature/reset-password');
    expect(output).toContain('Commit: feat(auth): add password reset');
  });

  it('asks for clarifications and re-plans before printing the plan', async () => {
    const withQuestion = [
      'SUMMARY: implement the reset password flow',
      'QUESTION: auth or not?',
      'PLAN_TITLE: feat: reset password',
      'PLAN_BRANCH: feature/reset-password',
      'PLAN_COMMIT: feat(auth): add password reset',
      'PLAN_STEP: add the reset endpoint',
    ].join('\n');
    const answered: string[] = [];
    const runtime = createFakeRuntime([resultFor(withQuestion), resultFor(PLANNER_STDOUT)]);
    const env: RunEnvironment = {
      issueNumber: ISSUE.number,
      root: '/proj',
      workspace: '/work',
      github: createGitHubSpy(ISSUE).github,
      git: createGitSpy().git,
      tests: createTestRunner(true).runner,
      audit: createAuditSpy().log,
      runtime,
      runtimeName: 'opencode',
      preflightProbes: readyDoctorProbes(),
      verifier: provingVerifier(),
      conventions: 'conventional commits',
      ask: (question: string) => {
        answered.push(question);
        return Promise.resolve('yes, auth');
      },
      out: () => undefined,
      dryRun: true,
    };

    const code = await runTicket(env);

    expect(code).toBe(0);
    expect(answered).toEqual(['auth or not? ']);
    expect(runtime.runs.map((run) => run.agent)).toEqual(['planner', 'planner']);
  });

  it('routes the model to the planner during a dry run', async () => {
    const runtime = createFakeRuntime([resultFor(PLANNER_STDOUT)]);
    const env: RunEnvironment = {
      issueNumber: ISSUE.number,
      root: '/proj',
      workspace: '/work',
      github: createGitHubSpy(ISSUE).github,
      git: createGitSpy().git,
      tests: createTestRunner(true).runner,
      audit: createAuditSpy().log,
      runtime,
      runtimeName: 'opencode',
      preflightProbes: readyDoctorProbes(),
      verifier: provingVerifier(),
      conventions: 'conventional commits',
      ask: () => Promise.resolve('y'),
      out: () => undefined,
      dryRun: true,
      model: 'gpt-5',
    };

    const code = await runTicket(env);

    expect(code).toBe(0);
    expect(runtime.runs).toHaveLength(1);
    expect(runtime.runs[0]?.model).toBe('gpt-5');
  });
});

describe('parseRunArguments', () => {
  it('parses an issue number', () => {
    expect(parseRunArguments(['run', '12'])).toEqual({ issueNumbers: [12], dryRun: false });
  });

  it('parses a --dry-run flag', () => {
    expect(parseRunArguments(['run', '12', '--dry-run'])).toEqual({
      issueNumbers: [12],
      dryRun: true,
    });
  });

  it('parses a --model option', () => {
    expect(parseRunArguments(['run', '12', '--model', 'gpt-5'])).toEqual({
      issueNumbers: [12],
      dryRun: false,
      model: 'gpt-5',
    });
  });

  it('parses --dry-run combined with --model', () => {
    expect(parseRunArguments(['run', '12', '--dry-run', '--model', 'gpt-5'])).toEqual({
      issueNumbers: [12],
      dryRun: true,
      model: 'gpt-5',
    });
  });

  it('parses a --model-by-agent mapping', () => {
    expect(
      parseRunArguments(['run', '12', '--model-by-agent', 'planner=opus,reviewer=flash']),
    ).toEqual({
      issueNumbers: [12],
      dryRun: false,
      modelsByAgent: { planner: 'opus', reviewer: 'flash' },
    });
  });

  it('lets the per-agent mapping override the global --model', () => {
    const parsed = parseRunArguments([
      'run',
      '12',
      '--model',
      'gpt-5',
      '--model-by-agent',
      'planner=opus',
    ]);
    expect(parsed?.modelsByAgent).toEqual({ planner: 'opus' });
  });

  it('rejects malformed --model-by-agent values', () => {
    expect(parseRunArguments(['run', '12', '--model-by-agent', 'planner'])).toBeNull();
    expect(parseRunArguments(['run', '12', '--model-by-agent', 'planner='])).toBeNull();
    expect(parseRunArguments(['run', '12', '--model-by-agent', '=opus'])).toBeNull();
    expect(parseRunArguments(['run', '12', '--model-by-agent', 'planner=opus,'])).toBeNull();
    expect(parseRunArguments(['run', '12', '--model-by-agent'])).toBeNull();
  });

  it('parses repeated --mcp flags and accumulates the servers', () => {
    expect(
      parseRunArguments([
        'run',
        '12',
        '--mcp',
        'sqlite=uvx,demo=node',
        '--mcp',
        'context7=https://mcp.context7.com/mcp',
      ]),
    ).toEqual({
      issueNumbers: [12],
      dryRun: false,
      mcp: {
        sqlite: 'uvx',
        demo: 'node',
        context7: 'https://mcp.context7.com/mcp',
      },
    });
  });

  it('rejects malformed --mcp values', () => {
    expect(parseRunArguments(['run', '12', '--mcp', 'sqlite'])).toBeNull();
    expect(parseRunArguments(['run', '12', '--mcp', '=uvx'])).toBeNull();
    expect(parseRunArguments(['run', '12', '--mcp'])).toBeNull();
  });

  it.each(['run', 'run|12|extra', 'run|abc', 'run|12|--push', 'run|12|--dry-run|extra'])(
    'rejects %j',
    (line) => {
      const args = line.split('|');
      expect(parseRunArguments(args)).toBeNull();
    },
  );

  it('parses --max-cost-usd and --max-time-min', () => {
    expect(
      parseRunArguments(['run', '12', '--max-cost-usd', '1.5', '--max-time-min', '30']),
    ).toEqual({ issueNumbers: [12], dryRun: false, maxCostUsd: 1.5, maxMinutes: 30 });
  });

  it('parses --agent-timeout-min', () => {
    expect(parseRunArguments(['run', '12', '--agent-timeout-min', '20'])).toEqual({
      issueNumbers: [12],
      dryRun: false,
      agentTimeoutMs: 1_200_000,
    });
  });

  it('rejects a non-numeric or non-positive agent timeout', () => {
    expect(parseRunArguments(['run', '12', '--agent-timeout-min', 'abc'])).toBeNull();
    expect(parseRunArguments(['run', '12', '--agent-timeout-min', '0'])).toBeNull();
    expect(parseRunArguments(['run', '12', '--agent-timeout-min'])).toBeNull();
  });

  it('rejects non-numeric or non-positive budget limits', () => {
    expect(parseRunArguments(['run', '12', '--max-cost-usd', 'abc'])).toBeNull();
    expect(parseRunArguments(['run', '12', '--max-cost-usd', '0'])).toBeNull();
    expect(parseRunArguments(['run', '12', '--max-cost-usd', '-1'])).toBeNull();
    expect(parseRunArguments(['run', '12', '--max-time-min', 'abc'])).toBeNull();
    expect(parseRunArguments(['run', '12', '--max-time-min', '0'])).toBeNull();
    expect(parseRunArguments(['run', '12', '--max-time-min'])).toBeNull();
  });

  it.each(['run|12|--model', 'run|12|--model|'])(
    'rejects a missing or empty model value %j',
    (line) => {
      const args = line.split('|');
      expect(parseRunArguments(args)).toBeNull();
    },
  );
});

describe('runBatch', () => {
  it('runs the tickets sequentially and aggregates a full success', async () => {
    const order: number[] = [];
    const code = await runBatch(
      [12, 13],
      () => {},
      (n) => {
        order.push(n);
        return Promise.resolve(0);
      },
    );

    expect(code).toBe(0);
    expect(order).toEqual([12, 13]);
  });

  it('returns 1 and reports the count when some tickets fail', async () => {
    const out: string[] = [];
    const code = await runBatch(
      [1, 2, 3],
      (line) => out.push(line),
      (n) => Promise.resolve(n === 2 ? 1 : 0),
    );

    expect(code).toBe(1);
    expect(out).toEqual(['Batch: 2/3 tickets reached a pull request.']);
  });

  it('keeps single-ticket batches quiet', async () => {
    const out: string[] = [];
    const code = await runBatch(
      [9],
      (line) => out.push(line),
      () => Promise.resolve(0),
    );

    expect(code).toBe(0);
    expect(out).toEqual([]);
  });

  it('runs every ticket once in parallel when given a concurrency limit', async () => {
    const started: number[] = [];
    const code = await runBatch(
      [1, 2, 3],
      () => {},
      (n) => {
        started.push(n);
        return Promise.resolve(n === 2 ? 1 : 0);
      },
      2,
    );

    expect(code).toBe(1);
    expect(started.sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });
});

describe('runTicket summaries', () => {
  it('writes a run summary when a summarizer is wired', async () => {
    const { env } = buildEnv(happyReplies());
    const summaries: RunSummary[] = [];
    const summarize: (summary: RunSummary) => Promise<void> = (summary) => {
      summaries.push(summary);
      return Promise.resolve();
    };

    const code = await runTicket({ ...env, summarize });

    expect(code).toBe(0);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.issueNumber).toBe(1);
    expect(summaries[0]?.status).toBe('pr-created');
    expect(summaries[0]?.pullRequestUrl).toBe('https://hub.example/pr/42');
    expect(summaries[0]?.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(summaries[0]?.finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('carries the failure reason in the summary', async () => {
    const blockedReplies: readonly AgentRunResult[] = [
      resultFor(PLANNER_STDOUT),
      resultFor('TEST_PLAN: valid token'),
      resultFor('CHANGED: test/reset.spec.ts\nSUMMARY: tests written'),
      resultFor('CHANGED: src/reset.ts\nSUMMARY: implemented'),
      resultFor('VERDICT: BLOCKED\nREASON: security risk'),
    ];
    const { env } = buildEnv(blockedReplies);
    const summaries: RunSummary[] = [];
    const summarize: (summary: RunSummary) => Promise<void> = (summary) => {
      summaries.push(summary);
      return Promise.resolve();
    };

    const code = await runTicket({ ...env, summarize });

    expect(code).toBe(1);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.status).toBe('blocked');
    expect(summaries[0]?.reason).toBe('security risk');
  });

  it('writes no summary for a dry run', async () => {
    const { env } = buildEnv(happyReplies());
    const summaries: RunSummary[] = [];
    const summarize: (summary: RunSummary) => Promise<void> = (summary) => {
      summaries.push(summary);
      return Promise.resolve();
    };

    const code = await runTicket({ ...env, dryRun: true, summarize });

    expect(code).toBe(0);
    expect(summaries).toHaveLength(0);
  });
});

describe('parseRunArguments multi-issue', () => {
  it('parses several issue numbers', () => {
    expect(parseRunArguments(['run', '12', '13'])).toEqual({
      issueNumbers: [12, 13],
      dryRun: false,
    });
  });

  it('parses flags after the issue numbers', () => {
    expect(parseRunArguments(['run', '7', '8', '--dry-run', '--model', 'gpt-5'])).toEqual({
      issueNumbers: [7, 8],
      dryRun: true,
      model: 'gpt-5',
    });
  });

  it('rejects a mix of issue numbers and non-numeric tokens', () => {
    expect(parseRunArguments(['run', '12', 'extra'])).toBeNull();
    expect(parseRunArguments(['run', '12', '13', '--dry-run', 'extra'])).toBeNull();
  });

  it('rejects a run without any issue number', () => {
    expect(parseRunArguments(['run'])).toBeNull();
    expect(parseRunArguments(['run', '--dry-run'])).toBeNull();
  });

  it('parses a --max-concurrency option', () => {
    expect(parseRunArguments(['run', '12', '13', '--max-concurrency', '3'])).toEqual({
      issueNumbers: [12, 13],
      dryRun: false,
      maxConcurrency: 3,
    });
  });

  it('rejects non-integer or non-positive --max-concurrency values', () => {
    expect(parseRunArguments(['run', '12', '--max-concurrency', '0'])).toBeNull();
    expect(parseRunArguments(['run', '12', '--max-concurrency', '-2'])).toBeNull();
    expect(parseRunArguments(['run', '12', '--max-concurrency', '2.5'])).toBeNull();
    expect(parseRunArguments(['run', '12', '--max-concurrency', 'abc'])).toBeNull();
    expect(parseRunArguments(['run', '12', '--max-concurrency'])).toBeNull();
  });

  it('parses a --runtime option', () => {
    expect(parseRunArguments(['run', '12', '--runtime', 'claude'])).toEqual({
      issueNumbers: [12],
      dryRun: false,
      runtime: 'claude',
    });
  });

  it('rejects an unknown --runtime value', () => {
    expect(parseRunArguments(['run', '12', '--runtime', 'codex'])).toBeNull();
    expect(parseRunArguments(['run', '12', '--runtime'])).toBeNull();
  });
});

describe('createAgentRuntime', () => {
  it('builds the opencode runtime by default', () => {
    expect(createAgentRuntime('opencode')).toBeInstanceOf(OpenCodeRuntime);
  });

  it('builds the claude runtime when asked for', () => {
    expect(createAgentRuntime('claude')).toBeInstanceOf(ClaudeCodeRuntime);
  });
});

describe('readIssueNumber', () => {
  it('parses a positive integer issue number', () => {
    expect(readIssueNumber('12')).toBe(12);
  });

  it.each(['0', '-3', '1.5', 'abc'])('rejects %j', (value) => {
    expect(readIssueNumber(value)).toBeNull();
  });

  it('rejects no value', () => {
    expect(readIssueNumber(undefined)).toBeNull();
  });
});

describe('inWorktree', () => {
  function worktreeSpy(): {
    readonly worktrees: GitWorktrees;
    readonly added: string[];
    readonly removed: string[];
  } {
    const added: string[] = [];
    const removed: string[] = [];
    return {
      worktrees: {
        add: (path) => {
          added.push(path);
          return Promise.resolve();
        },
        remove: (path) => {
          removed.push(path);
          return Promise.resolve();
        },
      },
      added,
      removed,
    };
  }

  it('adds the worktree before the run and removes it after', async () => {
    const spy = worktreeSpy();
    const events: string[] = [];

    const result = await inWorktree(true, spy.worktrees, '/wt', () => {
      events.push('run');
      return Promise.resolve(7);
    });

    expect(result).toBe(7);
    expect(spy.added).toEqual(['/wt']);
    expect(spy.removed).toEqual(['/wt']);
    expect(events).toEqual(['run']);
  });

  it('removes the worktree when the run fails and rethrows the error', async () => {
    const spy = worktreeSpy();

    await expect(
      inWorktree(true, spy.worktrees, '/wt', () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    expect(spy.removed).toEqual(['/wt']);
  });

  it('runs in place without touching the worktrees for a single ticket', async () => {
    const spy = worktreeSpy();

    const result = await inWorktree(false, spy.worktrees, '/wt', () => Promise.resolve(0));

    expect(result).toBe(0);
    expect(spy.added).toEqual([]);
    expect(spy.removed).toEqual([]);
  });

  it('tolerates a failing worktree cleanup', async () => {
    const worktrees: GitWorktrees = {
      add: () => Promise.resolve(),
      remove: () => Promise.reject(new Error('locked')),
    };

    const result = await inWorktree(true, worktrees, '/wt', () => Promise.resolve(3));

    expect(result).toBe(3);
  });
});

describe('reviewer observability', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'lou-reviewer-log-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function reviewerLog(): string {
    return join(root, '.lou', 'runs', 'run-1', 'agents', 'reviewer-run-1.log');
  }

  it('writes a log file for the reviewer like every other agent', async () => {
    const { env } = buildEnv(happyReplies());

    await runTicket({ ...env, root });

    expect(existsSync(reviewerLog())).toBe(true);
  });

  it('asks a human instead of crashing when the reviewer verdict is unreadable', async () => {
    const replies = [...happyReplies()];
    replies[replies.length - 1] = resultFor('Looks fine, but I forgot the label.');
    const { env, out } = buildEnv(replies);

    const code = await runTicket({ ...env, root });

    expect(code).toBe(1);
    expect(out.join('\n')).toContain('Needs human intervention');
    expect(out.join('\n')).not.toContain('Run failed');
  });
});

describe('audit invocation ids', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'lou-invocation-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('gives two invocations of the same issue distinct ids', async () => {
    const { env, audit } = buildEnv(happyReplies());

    await runTicket({ ...env, root });
    await runTicket({ ...env, root });

    const ids = audit
      .events()
      .map((event) => event.invocation)
      .filter(Boolean);
    expect(new Set(ids).size).toBeGreaterThan(1);
  });

  it('stamps the preflight event too, so a refusal is still attributable', async () => {
    const { env, audit } = buildEnv(happyReplies());
    const failing: RunEnvironment = {
      ...env,
      verifier: { run: () => Promise.resolve({ passed: false, reason: 'no test ran' }) },
    };

    await runTicket({ ...failing, root });

    const preflight = audit.events().find((event) => event.target === 'preflight');
    expect(preflight?.invocation).toMatch(/^\d{14,}$/);
  });

  it('stamps every event of one invocation with the same id', async () => {
    const { env, audit } = buildEnv(happyReplies());

    await runTicket({ ...env, root });

    const ids = audit.events().map((event) => event.invocation);
    expect(new Set(ids).size).toBe(1);
  });
});
