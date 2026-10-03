import type { GitHubIssue } from '@lou/github';
import { ReviewerAgent } from '@lou/reviewer';
import { Workflow } from '@lou/state-machine';
import { describe, expect, it } from 'vitest';
import { Orchestrator } from '../src/orchestrator.ts';
import type { OrchestratorSteps, PlanDraft } from '../src/types.ts';
import { createAuditSpy } from './fake-audit.ts';
import { createGitHubSpy } from './fake-github.ts';
import { createGitSpy } from './fake-git.ts';
import { createKeeper } from './fake-keeper.ts';
import { createSteps } from './fake-steps.ts';
import { createTestRunner } from './fake-test-runner.ts';
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

const APPROVED: readonly RuntimeReply[] = [
  { exitCode: 0, stdout: 'VERDICT: APPROVED\nREASON: clear', stderr: '', interrupted: false },
];

function build(options: { readonly steps?: OrchestratorSteps } = {}) {
  const workflow = new Workflow();
  const git = createGitSpy();
  const github = createGitHubSpy(ISSUE);
  const audit = createAuditSpy();
  const runner = createTestRunner([{ passed: true }, { passed: true }]);
  const keeper = createKeeper({ plan: [], review: [], answers: [] });
  const base = createSteps(PLAN);
  const orchestrator = new Orchestrator({
    runId: 'RUN-TRACE',
    issue: ISSUE,
    workspace: '/work',
    workflow,
    steps: options.steps ?? base.steps,
    keeper: keeper.keeper,
    reviewer: new ReviewerAgent({ runtime: new RuntimeRecorder(APPROVED) }),
    tests: runner.runner,
    git: git.git,
    github: github.github,
    audit: audit.log,
  });
  return { orchestrator, audit };
}

function agentEvents(
  audit: ReturnType<typeof createAuditSpy>,
): readonly { readonly event: string; readonly agent: string | undefined }[] {
  return audit
    .events()
    .filter((entry) => entry.event === 'agent_started' || entry.event === 'agent_finished')
    .map((entry) => ({ event: entry.event, agent: entry.agent }));
}

describe('agent audit trail', () => {
  it('brackets every workflow agent between a start and a finish', async () => {
    const { orchestrator, audit } = build();

    await orchestrator.run();

    expect(agentEvents(audit)).toEqual([
      { event: 'agent_started', agent: 'planner' },
      { event: 'agent_finished', agent: 'planner' },
      { event: 'agent_started', agent: 'test-designer' },
      { event: 'agent_finished', agent: 'test-designer' },
      { event: 'agent_started', agent: 'test-writer' },
      { event: 'agent_finished', agent: 'test-writer' },
      { event: 'agent_started', agent: 'developer' },
      { event: 'agent_finished', agent: 'developer' },
    ]);
  });

  it('marks a finished agent as successful', async () => {
    const { orchestrator, audit } = build();

    await orchestrator.run();

    const finished = audit.events().filter((entry) => entry.event === 'agent_finished');
    expect(finished).toHaveLength(4);
    expect(finished.every((entry) => entry.result === 'success')).toBe(true);
  });

  it('records the failure when an agent throws', async () => {
    const base = createSteps(PLAN);
    const failing: OrchestratorSteps = {
      ...base.steps,
      implement(): Promise<never> {
        return Promise.reject(new Error('developer unavailable'));
      },
    };
    const { orchestrator, audit } = build({ steps: failing });

    const outcome = await orchestrator.run();

    expect(outcome.status).toBe('failed');
    const developer = audit.events().filter((entry) => entry.agent === 'developer');
    expect(developer.map((entry) => [entry.event, entry.result])).toEqual([
      ['agent_started', undefined],
      ['agent_finished', 'failure'],
    ]);
  });

  it('never claims an agent finished when it never started', async () => {
    const base = createSteps(PLAN);
    const failing: OrchestratorSteps = {
      ...base.steps,
      designTests(): Promise<never> {
        return Promise.reject(new Error('designer unavailable'));
      },
    };
    const { orchestrator, audit } = build({ steps: failing });

    await orchestrator.run();

    const finishes = agentEvents(audit).filter((entry) => entry.event === 'agent_finished');
    expect(finishes.map((entry) => entry.agent)).toEqual(['planner', 'test-designer']);
    const designer = audit
      .events()
      .find((entry) => entry.event === 'agent_finished' && entry.agent === 'test-designer');
    expect(designer?.result).toBe('failure');
  });
});
