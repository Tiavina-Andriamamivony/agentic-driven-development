import type { GitHubIssue } from '@lou/github';
import type { PullRequest } from '@lou/github';
import type { Phase } from '@lou/state-machine';

export interface PlanDraft {
  readonly title: string;
  readonly branchName: string;
  readonly commitMessage: string;
  readonly steps: readonly string[];
}

export interface UnderstandInput {
  readonly runId: string;
  readonly issue: GitHubIssue;
  readonly workspace: string;
  readonly feedback: readonly string[];
}

export interface Understanding {
  readonly summary: string;
  readonly questions: readonly string[];
  readonly plan: PlanDraft;
}

export interface ChangeNote {
  readonly changedFiles: readonly string[];
  readonly summary: string;
}

export interface ImplementInput {
  readonly plan: PlanDraft;
  readonly issue: GitHubIssue;
  readonly review: ReviewNote | null;
  readonly attempt: number;
  readonly alreadyDelivered: readonly string[];
}

export interface OrchestratorSteps {
  understand(input: UnderstandInput): Promise<Understanding>;
  designTests(plan: PlanDraft): Promise<{ readonly testPlan: string }>;
  writeTests(plan: PlanDraft, testPlan: string): Promise<ChangeNote>;
  implement(input: ImplementInput): Promise<ChangeNote>;
}

export type ApprovalKind = 'plan' | 'review';

export interface ApprovalRequest {
  readonly runId: string;
  readonly kind: ApprovalKind;
  readonly subject: string;
  readonly details: string;
}

export interface ApprovalDecision {
  readonly approved: boolean;
  readonly comment?: string;
}

export interface HumanKeeper {
  askClarifications(questions: readonly string[]): Promise<readonly string[]>;
  decide(request: ApprovalRequest): Promise<ApprovalDecision>;
}

export interface ReviewNote {
  readonly verdict: string;
  readonly reason: string;
}

export type OrchestratorStatus = 'pr-created' | 'blocked' | 'human-intervention' | 'failed';

export interface OrchestratorOutcome {
  readonly status: OrchestratorStatus;
  readonly finalPhase: Phase;
  readonly pullRequest?: PullRequest;
  readonly reason?: string;
}
