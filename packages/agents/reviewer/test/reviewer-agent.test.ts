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

  it('throws when the output carries no verdict line', async () => {
    const runtime = new RecordingRuntime('Unclear.');
    const reviewer = new ReviewerAgent({ runtime });

    await expect(reviewer.review(request)).rejects.toThrow('VERDICT');
  });

  it('throws on an unknown verdict value', async () => {
    const runtime = new RecordingRuntime('VERDICT: MAYBE\nREASON: shrug');
    const reviewer = new ReviewerAgent({ runtime });

    await expect(reviewer.review(request)).rejects.toThrow('verdict');
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
