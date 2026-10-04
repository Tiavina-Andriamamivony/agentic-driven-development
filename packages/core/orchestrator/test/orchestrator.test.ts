import type { AgentRuntime } from '@lou/agent-runtime';
import { EVENT_TYPES } from '@lou/audit';
import type { GitHubIssue } from '@lou/github';
import { ReviewerAgent } from '@lou/reviewer';
import { PHASES, Workflow } from '@lou/state-machine';
import { describe, expect, it } from 'vitest';
import { Orchestrator } from '../src/orchestrator.ts';
import type { PlanDraft } from '../src/types.ts';
import { createAuditSpy } from './fake-audit.ts';
import { createGitHubSpy } from './fake-github.ts';
import { createGitSpy } from './fake-git.ts';
import { createKeeper } from './fake-keeper.ts';
import { createSteps } from './fake-steps.ts';
import { createTestRunner, TestRunScript } from './fake-test-runner.ts';
import { RuntimeRecorder, RuntimeReply } from './runtime-recorder.ts';

const ISSUE: GitHubIssue = {
  number: 1,
  title: 'Add reset password',
  body: 'User can reset the password.',
  state: 'OPEN',
};

const PLAN: PlanDraft = {
  title: 'feat: reset password',
  branchName: 'feature/reset-password',
  commitMessage: 'feat(auth): add password reset',
  steps: ['add endpoint', 'add ui'],
};

const APPROVED_STDOUT = 'VERDICT: APPROVED\nREASON: clear and tested';

function reviewerReply(stdout: string): RuntimeReply {
  return { exitCode: 0, stdout, stderr: '', interrupted: false };
}

const APPROVED_STDOUT_REPLIES: readonly RuntimeReply[] = [reviewerReply(APPROVED_STDOUT)];

const CRASHING_REVIEWER_RUNTIME: AgentRuntime = {
  run: () => Promise.reject(new Error('opencode run failed: exit 1')),
  getStatus: () => Promise.resolve({ runId: '', running: false, finished: true }),
  interrupt: () => Promise.resolve(),
};

interface HarnessOptions {
  readonly plan?: PlanDraft;
  readonly questions?: readonly string[];
  readonly planDecisions?: readonly boolean[];
  readonly reviewDecisions?: readonly boolean[];
  readonly testScripts?: readonly TestRunScript[];
  readonly reviewerReplies?: readonly RuntimeReply[];
  readonly reviewer?: ReviewerAgent;
  readonly keeperAnswers?: readonly string[];
  readonly changedFiles?: {
    readonly tests: readonly string[];
    readonly implementation: readonly string[];
  };
}

function buildHarness(options: HarnessOptions = {}) {
  const plan = options.plan ?? PLAN;
  const workflow = new Workflow();
  const git = createGitSpy();
  const github = createGitHubSpy(ISSUE);
  const runner = createTestRunner(options.testScripts);
  const audit = createAuditSpy();
  const keeper = createKeeper({
    plan: options.planDecisions ?? [],
    review: options.reviewDecisions ?? [],
    answers: options.keeperAnswers ?? [],
  });
  const steps = createSteps(plan, options.questions, 'implemented', options.changedFiles);
  const runtime = new RuntimeRecorder(options.reviewerReplies ?? APPROVED_STDOUT_REPLIES);
  const reviewer = options.reviewer ?? new ReviewerAgent({ runtime });
  const orchestrator = new Orchestrator({
    runId: 'RUN-002',
    issue: ISSUE,
    workspace: '/work',
    workflow,
    steps: steps.steps,
    keeper: keeper.keeper,
    reviewer,
    tests: runner.runner,
    git: git.git,
    github: github.github,
    audit: audit.log,
    conventions: 'conventional commits',
  });
  return { orchestrator, workflow, plan, git, github, steps, keeper, runtime, audit, runner };
}

describe('Orchestrator', () => {
  it('runs the happy path to a created pull request', async () => {
    const { orchestrator, git, github, steps } = buildHarness();

    const outcome = await orchestrator.run();

    expect(outcome.status).toBe('pr-created');
    expect(outcome.finalPhase).toBe(PHASES.PR_CREATED);
    expect(git.branches).toEqual(['feature/reset-password']);
    expect(git.commits).toEqual(['feat(auth): add password reset']);
    expect(git.pushes).toBe(1);
    expect(github.created[0]?.title).toBe(PLAN.title);
    expect(steps.state.understandCalls).toHaveLength(1);
  });

  it('stages every file the agents reported before committing', async () => {
    const { orchestrator, git } = buildHarness();

    await orchestrator.run();

    expect(git.staged).toEqual(['test/feature.spec.ts', 'src/index.ts']);
  });

  it('stages before it commits', async () => {
    const { orchestrator, git } = buildHarness();

    await orchestrator.run();

    expect(git.calls.indexOf('stage')).toBeLessThan(git.calls.indexOf('commit'));
  });

  it('refuses to open a pull request when the agents reported no change', async () => {
    const { orchestrator, git, github } = buildHarness({
      changedFiles: { tests: [], implementation: [] },
    });

    const outcome = await orchestrator.run();

    expect(git.staged).toEqual([]);
    expect(git.commits).toEqual([]);
    expect(git.pushes).toBe(0);
    expect(github.created).toHaveLength(0);
    expect(outcome.status).toBe('failed');
  });

  it('creates the feature branch before tests are written', async () => {
    const { orchestrator, git, audit } = buildHarness();

    await orchestrator.run();

    expect(git.branches[0]).toBe('feature/reset-password');
    const types = audit.types();
    expect(types.indexOf('tool_called')).toBeLessThan(types.indexOf('test_started'));
    expect(types.indexOf('tool_called')).toBeLessThan(types.indexOf('file_changed'));
  });

  it('requests the human at the plan approval gate', async () => {
    const { orchestrator, keeper } = buildHarness();

    await orchestrator.run();

    expect(keeper.state.planRequests).toHaveLength(1);
    expect(keeper.state.planRequests[0]?.kind).toBe('plan');
    expect(keeper.state.planRequests[0]?.subject).toBe(PLAN.title);
    expect(keeper.state.planRequests[0]?.details).toContain('2. add ui');
  });

  it('requests the human at the review approval gate', async () => {
    const { orchestrator, keeper } = buildHarness();

    await orchestrator.run();

    expect(keeper.state.reviewRequests).toHaveLength(1);
    expect(keeper.state.reviewRequests[0]?.kind).toBe('review');
  });

  it('re-plans after the human rejects the plan once', async () => {
    const { orchestrator, steps, audit } = buildHarness({ planDecisions: [false, true] });

    const outcome = await orchestrator.run();

    expect(outcome.status).toBe('pr-created');
    expect(steps.state.understandCalls).toHaveLength(2);
    expect(steps.state.understandCalls[1]?.feedback).toContain('(no comment)');
    expect(audit.types()).toContain('human_rejection');
  });

  it('re-implements after the reviewer requests changes', async () => {
    const { orchestrator, steps, runtime } = buildHarness({
      reviewerReplies: [
        reviewerReply('VERDICT: CHANGES_REQUESTED\nREASON: add more tests'),
        reviewerReply(APPROVED_STDOUT),
      ],
    });

    const outcome = await orchestrator.run();

    expect(outcome.status).toBe('pr-created');
    expect(steps.state.implementations).toBe(2);
    expect(runtime.runs).toHaveLength(2);
  });

  it('stops blocked when the reviewer blocks the run', async () => {
    const { orchestrator, git, github, workflow } = buildHarness({
      reviewerReplies: [reviewerReply('VERDICT: BLOCKED\nREASON: insecure')],
    });

    const outcome = await orchestrator.run();

    expect(outcome.status).toBe('blocked');
    expect(outcome.reason).toBe('insecure');
    expect(workflow.phase).toBe(PHASES.REVIEW);
    expect(git.pushes).toBe(0);
    expect(github.created).toHaveLength(0);
  });

  it('asks a human when the reviewer verdict cannot be read', async () => {
    const { orchestrator, workflow } = buildHarness({
      reviewerReplies: [reviewerReply('The diff looks reasonable to me overall.')],
    });

    const outcome = await orchestrator.run();

    expect(outcome.status).toBe('human-intervention');
    expect(outcome.reason).toContain('VERDICT');
    expect(workflow.phase).toBe(PHASES.REVIEW);
  });

  it('keeps the unreadable reviewer answer on the audit trail', async () => {
    const { orchestrator, audit } = buildHarness({
      reviewerReplies: [reviewerReply('The diff looks reasonable to me overall.')],
    });

    await orchestrator.run();

    const finished = audit.events().find((entry) => entry.event === 'review_finished');
    expect(finished?.result).toBe('failure');
    expect(finished?.excerpt).toContain('The diff looks reasonable to me overall.');
  });

  it('asks a human when the reviewer itself crashes', async () => {
    const { orchestrator, workflow } = buildHarness({
      reviewer: new ReviewerAgent({ runtime: CRASHING_REVIEWER_RUNTIME }),
    });

    const outcome = await orchestrator.run();

    expect(outcome.status).toBe('human-intervention');
    expect(outcome.reason).toContain('opencode run failed');
    expect(workflow.phase).toBe(PHASES.REVIEW);
  });

  it('re-implements after a verification failure', async () => {
    const { orchestrator, steps } = buildHarness({
      testScripts: [{ passed: true }, { passed: false }, { passed: true }],
    });

    const outcome = await orchestrator.run();

    expect(outcome.status).toBe('pr-created');
    expect(steps.state.implementations).toBe(2);
  });

  it('escalates immediately when the test suite cannot run at all', async () => {
    const { orchestrator, audit, steps } = buildHarness({
      testScripts: [{ passed: false, reason: 'no test script named "test"', retryable: false }],
    });

    const outcome = await orchestrator.run();

    expect(outcome.status).toBe('human-intervention');
    expect(outcome.reason).toContain('no test script');
    expect(steps.state.implementations).toBe(0);
    expect(audit.types()).not.toContain('pr_created');
  });

  it('records the test failure reason on the audit trail', async () => {
    const { orchestrator, audit } = buildHarness({
      testScripts: [
        { passed: true },
        { passed: false, reason: 'assertion failed: expected 2 to be 3' },
        { passed: true },
      ],
    });

    await orchestrator.run();

    expect(audit.events()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'test_finished',
          result: 'failure',
          reason: 'assertion failed: expected 2 to be 3',
        }),
      ]),
    );
  });

  it('delegates to a human when the plan loop budget is exhausted', async () => {
    const { orchestrator, audit } = buildHarness({
      planDecisions: [false, false, false, false, false, false],
    });

    const outcome = await orchestrator.run();

    expect(outcome.status).toBe('human-intervention');
    expect(outcome.finalPhase).toBe(PHASES.HUMAN_INTERVENTION_REQUIRED);
    expect(audit.types()).not.toContain('pr_created');
  });

  it('asks the human the open questions raised during discovery', async () => {
    const { orchestrator, keeper } = buildHarness({
      questions: ['which ui kit?'],
      keeperAnswers: ['mantine'],
    });

    const outcome = await orchestrator.run();

    expect(outcome.status).toBe('pr-created');
    expect(keeper.state.questionsAsked).toEqual(['which ui kit?']);
  });

  it('composes the pull request body from the run outcomes', async () => {
    const { orchestrator, github } = buildHarness();

    await orchestrator.run();

    const body = github.created[0]?.body ?? '';
    expect(body).toContain('#1 — Add reset password');
    expect(body).toContain('## Plan');
    expect(body).toContain('1. add endpoint');
    expect(body).toContain('## Tests');
    expect(body).toContain('## Review');
    expect(body).toContain('APPROVED: clear and tested');
  });

  it('records only known audit events across the run', async () => {
    const { orchestrator, audit } = buildHarness();

    await orchestrator.run();

    const types = audit.types();
    for (const type of types) {
      expect(EVENT_TYPES).toContain(type);
    }
    expect(types.filter((type) => type === 'human_approval')).toHaveLength(2);
    expect(types.filter((type) => type === 'test_finished')).toHaveLength(2);
    expect(types.filter((type) => type === 'file_changed')).toHaveLength(2);
    expect(types).toContain('git_commit');
    expect(types).toContain('git_push');
    expect(types).toContain('pr_created');
  });

  it('never pushes without an explicit PR_CREATED phase', async () => {
    const { orchestrator, git } = buildHarness({
      reviewerReplies: [reviewerReply('VERDICT: BLOCKED\nREASON: never')],
    });

    await orchestrator.run();

    expect(git.commits).toHaveLength(0);
  });
});
