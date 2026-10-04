import type { AgentRunInput, AgentRuntime } from '@lou/agent-runtime';
import type { Command } from '@lou/state-machine';
import { COMMANDS } from '@lou/state-machine';

export type ReviewVerdict = 'APPROVED' | 'CHANGES_REQUESTED' | 'BLOCKED' | 'UNREADABLE';

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
  readonly rawOutput: string;
}

export interface ReviewerAgentOptions {
  readonly runtime: AgentRuntime;
  readonly model?: string;
  readonly modelsByAgent?: Readonly<Record<string, string>>;
  readonly mcp?: Readonly<Record<string, string>>;
  readonly onOutput?: AgentRunInput['onOutput'];
  readonly onActivity?: AgentRunInput['onActivity'];
}

const READABLE_VERDICTS: readonly ReviewVerdict[] = ['APPROVED', 'CHANGES_REQUESTED', 'BLOCKED'];
const VERDICT_LABEL = /verdict/i;
const REASON_LINE = /^reason\s*:\s*(.+)$/i;
const MARKDOWN_NOISE = /[*#>`]/g;
const DECORATION = /[*_#>`\s]/g;
const UNREADABLE_REASON = 'reviewer output did not contain a readable VERDICT line';
const NO_REASON = '(no reason provided)';

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
      ...withSinks(this.options),
    });
    return parseReview(result.stdout);
  }
}

function withModel(model: string | undefined): { readonly model?: string } {
  return model === undefined ? {} : { model };
}

function withSinks(options: ReviewerAgentOptions): Pick<AgentRunInput, 'onOutput' | 'onActivity'> {
  return {
    ...(options.onOutput !== undefined ? { onOutput: options.onOutput } : {}),
    ...(options.onActivity !== undefined ? { onActivity: options.onActivity } : {}),
  };
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
    'Reply with two plain-text lines, no markdown, no commentary:',
    'VERDICT: <APPROVED|CHANGES_REQUESTED|BLOCKED>',
    'REASON: <one line>',
  ].join('\n');
}

function parseReview(stdout: string): ReviewDecision {
  const verdict = readVerdict(stdout);
  if (verdict === undefined) {
    return { verdict: 'UNREADABLE', reason: UNREADABLE_REASON, command: null, rawOutput: stdout };
  }
  return {
    verdict,
    reason: readReason(stdout),
    command: VERDICT_TO_COMMAND[verdict] ?? null,
    rawOutput: stdout,
  };
}

function readVerdict(stdout: string): ReviewVerdict | undefined {
  const lines = stdout.split('\n');
  return labelledVerdict(lines) ?? bareVerdict(lines);
}

function labelledVerdict(lines: readonly string[]): ReviewVerdict | undefined {
  return verdictIn(lines.filter((line) => VERDICT_LABEL.test(line)));
}

function bareVerdict(lines: readonly string[]): ReviewVerdict | undefined {
  const decorated = lines.map((line) => line.replace(DECORATION, ''));
  return READABLE_VERDICTS.find((verdict) => decorated.includes(verdict));
}

function verdictIn(lines: readonly string[]): ReviewVerdict | undefined {
  const shouted = lines.map((line) => line.toUpperCase());
  return READABLE_VERDICTS.find((verdict) => shouted.some((line) => line.includes(verdict)));
}

function readReason(stdout: string): string {
  const labelled = stdout
    .split('\n')
    .map((line) => line.replace(MARKDOWN_NOISE, '').trim())
    .map((line) => REASON_LINE.exec(line)?.[1]?.trim())
    .find((value) => value !== undefined && value.length > 0);
  return labelled ?? proseLine(stdout);
}

function proseLine(stdout: string): string {
  const prose = stdout
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !mentionsVerdict(line));
  return prose ?? NO_REASON;
}

function mentionsVerdict(line: string): boolean {
  return VERDICT_LABEL.test(line) || verdictIn([line]) !== undefined;
}
