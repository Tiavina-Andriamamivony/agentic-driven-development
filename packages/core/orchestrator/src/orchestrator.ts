import type { AuditLog, AuditEventPayload, AuditEventType } from '@lou/audit';
import { BudgetExceededError } from '@lou/budget';
import type { GitAdapter } from '@lou/git';
import type { GitHubAdapter, GitHubIssue } from '@lou/github';
import type { ReviewDecision, ReviewRequest, ReviewerAgent } from '@lou/reviewer';
import type { Command, Phase } from '@lou/state-machine';
import { COMMANDS, PHASES, Workflow } from '@lou/state-machine';
import type { TestResult, TestRunner } from '@lou/test-runner';
import { InterventionBudgetError } from './intervention-budget-error.ts';
import { UnrunnableTestsError } from './unrunnable-tests-error.ts';
import { buildPullRequestBody } from './pr-body.ts';
import { reviewOutcome } from './review-outcome.ts';
import { testOutcome } from './test-outcome.ts';
import type {
  ApprovalDecision,
  ApprovalKind,
  ChangeNote,
  HumanKeeper,
  OrchestratorOutcome,
  OrchestratorSteps,
  PlanDraft,
  ReviewNote,
  UnderstandInput,
  Understanding,
} from './types.ts';

const STEP_BUDGET = 256;
const NO_COMMENT = '(no comment)';
const FALLBACK_PLAN: PlanDraft = {
  title: 'work in progress',
  branchName: 'feature/work',
  commitMessage: 'chore: work in progress',
  steps: [],
};

export interface OrchestratorOptions {
  readonly runId: string;
  readonly issue: GitHubIssue;
  readonly workspace: string;
  readonly workflow: Workflow;
  readonly steps: OrchestratorSteps;
  readonly keeper: HumanKeeper;
  readonly reviewer: ReviewerAgent;
  readonly tests: TestRunner;
  readonly git: GitAdapter;
  readonly github: GitHubAdapter;
  readonly audit: AuditLog;
  readonly conventions?: string;
}

export class Orchestrator {
  private readonly runId: string;
  private readonly issue: GitHubIssue;
  private readonly workspace: string;
  private readonly workflow: Workflow;
  private readonly steps: OrchestratorSteps;
  private readonly keeper: HumanKeeper;
  private readonly reviewer: ReviewerAgent;
  private readonly tests: TestRunner;
  private readonly git: GitAdapter;
  private readonly github: GitHubAdapter;
  private readonly audit: AuditLog;
  private readonly conventions: string;
  private feedback: readonly string[] = [];
  private lastPlannedFeedback: readonly string[] = [];
  private understanding: Understanding | null = null;
  private implementation: ChangeNote = { changedFiles: [], summary: '(no implementation)' };
  private changedFiles: string[] = [];
  private testReport = '(no tests run)';
  private reviewNote: ReviewNote | null = null;

  private readonly handlers: Readonly<
    Partial<Record<Phase, () => Promise<OrchestratorOutcome | null>>>
  > = {
    [PHASES.TICKET_RECEIVED]: () => this.intake(),
    [PHASES.DISCOVERY]: () => this.discover(),
    [PHASES.QUESTIONS]: () => this.clarify(),
    [PHASES.PLAN]: () => this.proposePlan(),
    [PHASES.PLAN_APPROVAL]: () => this.approvePlanGate(),
    [PHASES.TEST_DESIGN]: () => this.designTests(),
    [PHASES.TEST_IMPLEMENTATION]: () => this.writeTests(),
    [PHASES.TEST_VERIFICATION]: () => this.verifyTests(),
    [PHASES.IMPLEMENTATION]: () => this.implement(),
    [PHASES.VERIFICATION]: () => this.verifyImplementation(),
    [PHASES.REVIEW]: () => this.review(),
    [PHASES.REVIEW_APPROVAL]: () => this.approveReviewGate(),
    [PHASES.PR_CREATED]: () => this.publish(),
  };

  constructor(options: OrchestratorOptions) {
    this.runId = options.runId;
    this.issue = options.issue;
    this.workspace = options.workspace;
    this.workflow = options.workflow;
    this.steps = options.steps;
    this.keeper = options.keeper;
    this.reviewer = options.reviewer;
    this.tests = options.tests;
    this.git = options.git;
    this.github = options.github;
    this.audit = options.audit;
    this.conventions = options.conventions ?? '(none)';
  }

  async run(): Promise<OrchestratorOutcome> {
    let hops = 0;
    try {
      while (!this.workflow.isTerminal) {
        hops += 1;
        if (hops > STEP_BUDGET) {
          return this.intervention('step budget exceeded');
        }
        const settled = await this.step();
        if (settled !== null) {
          return settled;
        }
      }
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        return this.intervention(error.limit.details);
      }
      if (error instanceof InterventionBudgetError) {
        return this.intervention(error.message);
      }
      if (error instanceof UnrunnableTestsError) {
        return this.intervention(error.message);
      }
      return this.failure(errorMessage(error));
    }
    return this.intervention(`unexpected terminal phase ${this.workflow.phase}`);
  }

  private async step(): Promise<OrchestratorOutcome | null> {
    const handler = this.handlers[this.workflow.phase];
    if (handler === undefined) {
      return this.failure(`orchestrator does not handle phase ${this.workflow.phase}`);
    }
    return handler();
  }

  private intake(): Promise<OrchestratorOutcome | null> {
    this.apply(COMMANDS.START_DISCOVERY);
    return Promise.resolve(null);
  }

  private async discover(): Promise<OrchestratorOutcome | null> {
    this.understanding = await this.runAgent('planner', () =>
      this.steps.understand(this.understandInput()),
    );
    await this.audit.record(this.event('command_executed', { tool: 'planner.understand' }));
    this.apply(COMMANDS.FINISH_DISCOVERY);
    return null;
  }

  private async clarify(): Promise<OrchestratorOutcome | null> {
    await this.audit.record(this.event('permission_requested', { target: 'clarifications' }));
    const questions = this.understanding?.questions ?? [];
    if (questions.length > 0) {
      const answers = await this.keeper.askClarifications(questions);
      this.feedback = [...this.feedback, ...answers];
    }
    this.apply(COMMANDS.FINISH_QUESTIONS);
    return null;
  }

  private async proposePlan(): Promise<OrchestratorOutcome | null> {
    if (!sameFeedback(this.lastPlannedFeedback, this.feedback)) {
      this.understanding = await this.runAgent('planner', () =>
        this.steps.understand(this.understandInput()),
      );
    }
    this.lastPlannedFeedback = this.feedback;
    await this.audit.record(this.event('command_executed', { tool: 'planner.propose' }));
    this.apply(COMMANDS.PLAN_PROPOSED);
    return null;
  }

  private async approvePlanGate(): Promise<OrchestratorOutcome | null> {
    const decision = await this.askHuman('plan', this.planDescription());
    await this.recordHumanDecision(decision.approved);
    if (decision.approved) {
      this.apply(COMMANDS.APPROVE_PLAN);
      return null;
    }
    this.feedback = [...this.feedback, decision.comment ?? NO_COMMENT];
    this.apply(COMMANDS.REJECT_PLAN);
    return null;
  }

  private async designTests(): Promise<OrchestratorOutcome | null> {
    await this.git.createBranch(this.plan.branchName);
    await this.audit.record(
      this.event('tool_called', {
        tool: 'git.createBranch',
        risk: 'low',
        target: this.plan.branchName,
      }),
    );
    const design = await this.runAgent('test-designer', () => this.steps.designTests(this.plan));
    this.testReport = `designed tests: ${design.testPlan}`;
    this.apply(COMMANDS.TESTS_DESIGNED);
    return null;
  }

  private async writeTests(): Promise<OrchestratorOutcome | null> {
    const note = await this.runAgent('test-writer', () => this.steps.writeTests(this.plan));
    await this.recordChanges(note);
    this.apply(COMMANDS.TESTS_COMPLETE);
    return null;
  }

  private async verifyTests(): Promise<OrchestratorOutcome | null> {
    const passed = await this.runTests('test-first');
    this.apply(passed ? COMMANDS.TESTS_PASS : COMMANDS.TESTS_FAIL);
    return null;
  }

  private async implement(): Promise<OrchestratorOutcome | null> {
    const note = await this.runAgent('developer', () => this.steps.implement(this.plan));
    this.implementation = note;
    await this.recordChanges(note);
    this.apply(COMMANDS.IMPLEMENTATION_COMPLETE);
    return null;
  }

  private async verifyImplementation(): Promise<OrchestratorOutcome | null> {
    const passed = await this.runTests('verification');
    this.apply(passed ? COMMANDS.VERIFICATION_PASS : COMMANDS.VERIFICATION_FAIL);
    return null;
  }

  private async review(): Promise<OrchestratorOutcome | null> {
    await this.audit.record(this.event('review_started', {}));
    const decision = await this.askReviewer();
    this.reviewNote = { verdict: decision.verdict, reason: decision.reason };
    await this.audit.record(this.event('review_finished', reviewOutcome(decision)));
    return this.applyVerdict(decision);
  }

  private async askReviewer(): Promise<ReviewDecision> {
    try {
      return await this.runAgent('reviewer', () => this.reviewer.review(this.reviewRequest()));
    } catch (error) {
      return { verdict: 'UNREADABLE', reason: errorMessage(error), command: null, rawOutput: '' };
    }
  }

  private reviewRequest(): ReviewRequest {
    return {
      runId: this.runId,
      title: this.plan.title,
      description: this.issue.body,
      diff: this.implementation.summary,
      testReport: this.testReport,
      conventions: this.conventions,
      workspace: this.workspace,
    };
  }

  private applyVerdict(decision: ReviewDecision): OrchestratorOutcome | null {
    if (decision.verdict === 'UNREADABLE') {
      return this.intervention(decision.reason);
    }
    if (decision.verdict === 'BLOCKED') {
      return { status: 'blocked', finalPhase: this.workflow.phase, reason: decision.reason };
    }
    const command =
      decision.verdict === 'APPROVED' ? COMMANDS.REVIEW_APPROVED : COMMANDS.CHANGES_REQUESTED;
    this.apply(command);
    return null;
  }

  private async approveReviewGate(): Promise<OrchestratorOutcome | null> {
    const decision = await this.askHuman('review', this.reviewSummary());
    await this.recordHumanDecision(decision.approved);
    if (decision.approved) {
      this.apply(COMMANDS.APPROVE_REVIEW);
      return null;
    }
    this.feedback = [...this.feedback, decision.comment ?? NO_COMMENT];
    this.apply(COMMANDS.REJECT_REVIEW);
    return null;
  }

  private async publish(): Promise<OrchestratorOutcome | null> {
    if (this.changedFiles.length === 0) {
      return this.failure('the agents reported no file change');
    }
    await this.git.stage(this.changedFiles);
    await this.audit.record(
      this.event('tool_called', {
        tool: 'git.stage',
        risk: 'low',
        target: `${this.changedFiles.length}`,
      }),
    );
    await this.git.commit(this.plan.commitMessage);
    await this.audit.record(this.event('git_commit', { target: this.plan.commitMessage }));
    await this.git.push();
    await this.audit.record(this.event('git_push', {}));
    const body = buildPullRequestBody({
      issue: this.issue,
      plan: this.plan,
      implementationSummary: this.implementation.summary,
      testReport: this.testReport,
      review: this.reviewNote,
    });
    const pullRequest = await this.github.createPullRequest({ title: this.plan.title, body });
    await this.audit.record(this.event('pr_created', { target: String(pullRequest.number) }));
    return { status: 'pr-created', finalPhase: this.workflow.phase, pullRequest };
  }

  private async runAgent<T>(agent: string, work: () => Promise<T>): Promise<T> {
    await this.audit.record(this.event('agent_started', { agent }));
    try {
      const value = await work();
      await this.audit.record(this.event('agent_finished', { agent, result: 'success' }));
      return value;
    } catch (error) {
      await this.audit.record(this.event('agent_finished', { agent, result: 'failure' }));
      throw error;
    }
  }

  private async runTests(kind: string): Promise<boolean> {
    await this.audit.record(this.event('test_started', { target: kind }));
    const result = await this.tests.run({ cwd: this.workspace });
    this.testReport = `exit ${result.exitCode}: ${result.stdout || result.stderr || '(no output)'}`;
    await this.audit.record(this.event('test_finished', testOutcome(kind, result)));
    this.refuseUnrunnableTests(result);
    return result.passed;
  }

  private refuseUnrunnableTests(result: TestResult): void {
    if (result.passed || result.retryable !== false) {
      return;
    }
    throw new UnrunnableTestsError(result.reason ?? 'tests cannot run in this workspace');
  }

  private async recordChanges(note: ChangeNote): Promise<void> {
    for (const file of note.changedFiles) {
      this.changedFiles.push(file);
      await this.audit.record(this.event('file_changed', { target: file }));
    }
  }

  private async recordHumanDecision(approved: boolean): Promise<void> {
    const type = approved ? 'human_approval' : 'human_rejection';
    await this.audit.record(this.event(type, { agent: 'human', target: 'workflow' }));
  }

  private async askHuman(kind: ApprovalKind, details: string): Promise<ApprovalDecision> {
    return this.keeper.decide({ runId: this.runId, kind, subject: this.plan.title, details });
  }

  private apply(command: Command): void {
    const result = this.workflow.apply(command);
    if (result.status === 'intervention-required') {
      throw new InterventionBudgetError(result.reason ?? 'iteration budget exhausted');
    }
    if (result.status !== 'accepted') {
      throw new Error(result.reason ?? `unexpected transition on ${command}`);
    }
  }

  private event(type: AuditEventType, extra: Partial<AuditEventPayload> = {}): AuditEventPayload {
    return { runId: this.runId, event: type, ...extra };
  }

  private understandInput(): UnderstandInput {
    return {
      runId: this.runId,
      issue: this.issue,
      workspace: this.workspace,
      feedback: this.feedback,
    };
  }

  private get plan(): PlanDraft {
    return this.understanding?.plan ?? FALLBACK_PLAN;
  }

  private planDescription(): string {
    const steps = this.plan.steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
    return `Approach:\n${steps.length > 0 ? steps : '(no steps)'}`;
  }

  private reviewSummary(): string {
    const note = this.reviewNote;
    return note === null ? '(no review yet)' : `${note.verdict}: ${note.reason}`;
  }

  private failure(reason: string): OrchestratorOutcome {
    return { status: 'failed', finalPhase: this.workflow.phase, reason };
  }

  private intervention(reason: string): OrchestratorOutcome {
    return { status: 'human-intervention', finalPhase: this.workflow.phase, reason };
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'unknown orchestrator failure';
}

function sameFeedback(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((entry, index) => entry === right[index]);
}
