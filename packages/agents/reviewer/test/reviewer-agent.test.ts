import type { AgentRunInput, AgentRunResult, AgentRuntime, AgentStatus } from '@lou/agent-runtime';
import { describe, expect, it } from 'vitest';
import { ReviewerAgent } from '../src/reviewer-agent.ts';

class RecordingRuntime implements AgentRuntime {
  readonly calls: AgentRunInput[] = [];

  constructor(private readonly stdout: string) {}

  run(input: AgentRunInput): Promise<AgentRunResult> {
    this.calls.push(input);
    return Promise.resolve({
      runId: input.runId,
      exitCode: 0,
      stdout: this.stdout,
      stderr: '',
      interrupted: false,
    });
  }

  getStatus(): Promise<AgentStatus> {
    return Promise.resolve({ runId: '', running: false, finished: true });
  }

  interrupt(): Promise<void> {
    return Promise.resolve();
  }
}

const request = {
  runId: 'RUN-42',
  title: 'Add login',
  description: 'Users can authenticate.',
  diff: '+export async function login() {}',
  testReport: '2 passed',
  conventions: 'TypeScript strict',
  workspace: '/repo',
};

describe('ReviewerAgent', () => {
  it('returns an approved verdict and maps it to the review-approved command', async () => {
    const runtime = new RecordingRuntime('VERDICT: APPROVED\nREASON: Looks good.');
    const reviewer = new ReviewerAgent({ runtime });

    const decision = await reviewer.review(request);

    expect(decision.verdict).toBe('APPROVED');
    expect(decision.reason).toBe('Looks good.');
    expect(decision.command).toBe('REVIEW_APPROVED');
  });

  it('returns changes-requested and maps it to the changes-requested command', async () => {
    const runtime = new RecordingRuntime('VERDICT: CHANGES_REQUESTED\nREASON: Add tests.');
    const reviewer = new ReviewerAgent({ runtime });

    const decision = await reviewer.review(request);

    expect(decision.verdict).toBe('CHANGES_REQUESTED');
    expect(decision.command).toBe('CHANGES_REQUESTED');
  });

  it('returns blocked without a state transition command', async () => {
    const runtime = new RecordingRuntime('VERDICT: BLOCKED\nREASON: Secrets in diff.');
    const reviewer = new ReviewerAgent({ runtime });

    const decision = await reviewer.review(request);

    expect(decision.verdict).toBe('BLOCKED');
    expect(decision.command).toBeNull();
  });

  it('parses the verdict case-insensitively', async () => {
    const runtime = new RecordingRuntime('verdict: approved\nreason: ok');
    const reviewer = new ReviewerAgent({ runtime });

    const decision = await reviewer.review(request);

    expect(decision.verdict).toBe('APPROVED');
  });

  it('reports an unreadable review instead of throwing when no verdict line exists', async () => {
    const runtime = new RecordingRuntime('Unclear.');
    const reviewer = new ReviewerAgent({ runtime });

    const decision = await reviewer.review(request);

    expect(decision.verdict).toBe('UNREADABLE');
    expect(decision.command).toBeNull();
    expect(decision.reason).toContain('VERDICT');
    expect(decision.rawOutput).toBe('Unclear.');
  });

  it('reports an unreadable review on an unknown verdict value', async () => {
    const runtime = new RecordingRuntime('VERDICT: MAYBE\nREASON: shrug');
    const reviewer = new ReviewerAgent({ runtime });

    const decision = await reviewer.review(request);

    expect(decision.verdict).toBe('UNREADABLE');
    expect(decision.command).toBeNull();
    expect(decision.rawOutput).toContain('MAYBE');
  });

  it('accepts a bolded verdict line', async () => {
    const runtime = new RecordingRuntime('**VERDICT:** APPROVED\n**REASON:** ship it');
    const reviewer = new ReviewerAgent({ runtime });

    const decision = await reviewer.review(request);

    expect(decision.verdict).toBe('APPROVED');
    expect(decision.reason).toBe('ship it');
  });

  it('accepts a verdict followed by prose on the same line', async () => {
    const runtime = new RecordingRuntime('VERDICT: CHANGES_REQUESTED — the tests are missing');
    const reviewer = new ReviewerAgent({ runtime });

    const decision = await reviewer.review(request);

    expect(decision.verdict).toBe('CHANGES_REQUESTED');
    expect(decision.command).toBe('CHANGES_REQUESTED');
  });

  it('accepts a verdict heading with the token on the next line', async () => {
    const runtime = new RecordingRuntime('## Verdict\n\nBLOCKED\n\nsecrets in the diff');
    const reviewer = new ReviewerAgent({ runtime });

    const decision = await reviewer.review(request);

    expect(decision.verdict).toBe('BLOCKED');
  });

  it('accepts a bare verdict line with no verdict label', async () => {
    const runtime = new RecordingRuntime('The change is fine.\n\nAPPROVED');
    const reviewer = new ReviewerAgent({ runtime });

    const decision = await reviewer.review(request);

    expect(decision.verdict).toBe('APPROVED');
  });

  it('does not read a verdict out of prose that never labels one', async () => {
    const runtime = new RecordingRuntime('This is not approved yet, I need another look.');
    const reviewer = new ReviewerAgent({ runtime });

    const decision = await reviewer.review(request);

    expect(decision.verdict).toBe('UNREADABLE');
  });

  it('falls back to the first prose line when no reason line exists', async () => {
    const runtime = new RecordingRuntime('VERDICT: BLOCKED\nsecrets in the diff');
    const reviewer = new ReviewerAgent({ runtime });

    const decision = await reviewer.review(request);

    expect(decision.reason).toBe('secrets in the diff');
  });

  it('forwards the output sink so the reviewer answer can be persisted', async () => {
    const runtime = new RecordingRuntime('VERDICT: APPROVED\nREASON: ok');
    const chunks: string[] = [];
    const reviewer = new ReviewerAgent({ runtime, onOutput: (chunk) => chunks.push(chunk) });

    await reviewer.review(request);

    const sink = runtime.calls[0]?.onOutput;
    expect(sink).toBeDefined();
    sink?.('evidence');
    expect(chunks).toEqual(['evidence']);
  });

  it('forwards the activity sink so the reviewer is not a silent phase', async () => {
    const runtime = new RecordingRuntime('VERDICT: APPROVED\nREASON: ok');
    const seen: string[] = [];
    const reviewer = new ReviewerAgent({
      runtime,
      onActivity: (activity) => seen.push(activity.kind),
    });

    await reviewer.review(request);

    runtime.calls[0]?.onActivity?.({ kind: 'text', text: 'reading the diff' });
    expect(seen).toEqual(['text']);
  });

  it('asks the runtime for the review run', async () => {
    const runtime = new RecordingRuntime('VERDICT: APPROVED\nREASON: ok');
    const reviewer = new ReviewerAgent({ runtime });

    await reviewer.review(request);

    expect(runtime.calls).toHaveLength(1);
    expect(runtime.calls[0]?.runId).toBe('RUN-42');
    expect(runtime.calls[0]?.agent).toBe('reviewer');
    expect(runtime.calls[0]?.workspace).toBe('/repo');
  });

  it('embeds the change context in the instructions', async () => {
    const runtime = new RecordingRuntime('VERDICT: APPROVED\nREASON: ok');
    const reviewer = new ReviewerAgent({ runtime });

    await reviewer.review(request);

    const instructions = runtime.calls[0]?.instructions ?? '';
    expect(instructions).toContain('Add login');
    expect(instructions).toContain('+export async function login()');
    expect(instructions).toContain('2 passed');
    expect(instructions).toContain('TypeScript strict');
    expect(instructions).toContain('CHANGES_REQUESTED');
  });
});
