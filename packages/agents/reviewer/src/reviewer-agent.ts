import type { AgentRuntime } from '@lou/agent-runtime';
import type { Command } from '@lou/state-machine';
import { COMMANDS } from '@lou/state-machine';

export type ReviewVerdict = 'APPROVED' | 'CHANGES_REQUESTED' | 'BLOCKED';

export interface ReviewRequest {
  readonly runId: string;
  readonly title: string;
  readonly description: string;
  readonly diff: string;
  readonly testReport: string;
  readonly conventions?: string;
  readonly workspace: string;
}

export interface ReviewDecision {
  readonly verdict: ReviewVerdict;
  readonly reason: string;
  readonly command: Command | null;
}

export interface ReviewerAgentOptions {
  readonly runtime: AgentRuntime;
  readonly model?: string;
  readonly modelsByAgent?: Readonly<Record<string, string>>;
  readonly mcp?: Readonly<Record<string, string>>;
}

const VERDICT_PATTERN = /^VERDICT\s*:\s*(APPROVED|CHANGES_REQUESTED|BLOCKED)\s*$/im;
const REASON_PATTERN = /^REASON\s*:\s*(.+)$/im;

const VERDICT_TO_COMMAND: Readonly<Partial<Record<ReviewVerdict, Command>>> = {
  APPROVED: COMMANDS.REVIEW_APPROVED,
  CHANGES_REQUESTED: COMMANDS.CHANGES_REQUESTED,
};

export class ReviewerAgent {
  private readonly options: ReviewerAgentOptions;

  constructor(options: ReviewerAgentOptions) {
    this.options = options;
  }

  async review(request: ReviewRequest): Promise<ReviewDecision> {
    const result = await this.options.runtime.run({
      runId: request.runId,
      agent: 'reviewer',
      instructions: buildReviewInstructions(request),
      workspace: request.workspace,
      ...withModel(this.options.modelsByAgent?.['reviewer'] ?? this.options.model),
      ...(this.options.mcp !== undefined ? { mcp: this.options.mcp } : {}),
    });
    return parseReview(result.stdout);
  }
}

function withModel(model: string | undefined): { readonly model?: string } {
  return model === undefined ? {} : { model };
}

function buildReviewInstructions(request: ReviewRequest): string {
  const conventions = request.conventions ?? '(none)';
  const description = request.description.length > 0 ? request.description : '(no description)';
  const diff = request.diff.length > 0 ? request.diff : '(no diff)';
  const testReport = request.testReport.length > 0 ? request.testReport : '(no test report)';
  return [
    'You are the Lou review agent. Review the change against the request and the project',
    'conventions.',
    '',
    `Request: ${request.title}`,
    description,
    '',
    'Implementation diff:',
    diff,
    '',
    'Test report:',
    testReport,
    '',
    'Project conventions:',
    conventions,
    '',
    'Check correctness, architecture, tests, security, complexity, regressions and policy.',
    'Return BLOCKED when the change is insecure or violates the request.',
    'Return APPROVED when the change is acceptable.',
    'Return CHANGES_REQUESTED otherwise.',
    '',
    'Reply exactly with:',
    'VERDICT: <APPROVED|CHANGES_REQUESTED|BLOCKED>',
    'REASON: <one line>',
  ].join('\n');
}

function parseReview(stdout: string): ReviewDecision {
  const verdictMatch = VERDICT_PATTERN.exec(stdout);
  const verdict = toVerdict(verdictMatch?.[1]);
  if (verdict === undefined) {
    throw new Error('reviewer output must contain a VERDICT line with a known verdict');
  }
  const reason = REASON_PATTERN.exec(stdout)?.[1]?.trim() ?? '(no reason provided)';
  return {
    verdict,
    reason,
    command: VERDICT_TO_COMMAND[verdict] ?? null,
  };
}

function toVerdict(value: string | undefined): ReviewVerdict | undefined {
  const normalized = value?.toUpperCase();
  if (normalized === 'APPROVED' || normalized === 'CHANGES_REQUESTED' || normalized === 'BLOCKED') {
    return normalized;
  }
  return undefined;
}
