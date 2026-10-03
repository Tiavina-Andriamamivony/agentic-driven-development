import type { AuditEventPayload } from '@lou/audit';
import { describe, expect, it, vi } from 'vitest';
import { createRunTrace } from '../src/run/run-trace.ts';
import type { RunTrace } from '../src/run/run-trace.ts';

const TICKET = { issueNumber: 12, title: 'Add reset password' };

function send(trace: RunTrace, payload: Omit<AuditEventPayload, 'runId'>): void {
  trace.event({ runId: 'RUN-TRACE', ...payload });
}

function harness(options: { readonly isTty?: boolean } = {}) {
  const lines: string[] = [];
  const frames: string[] = [];
  let clock = 0;
  const trace = createRunTrace({
    out: (line) => lines.push(line),
    write: (text) => frames.push(text),
    isTty: options.isTty ?? false,
    now: () => clock,
  });
  return {
    trace,
    lines,
    frames,
    advance: (ms: number) => {
      clock += ms;
    },
    set: (ms: number) => {
      clock = ms;
    },
  };
}

describe('run trace', () => {
  it('names the ticket it is working on before anything else', () => {
    const { trace, lines } = harness();

    trace.begin(TICKET);

    expect(lines).toEqual(['lou run · ticket #12 · Add reset password']);
  });

  it('reports how long each agent took', () => {
    const { trace, lines, set } = harness();
    trace.begin(TICKET);
    set(2_000);
    send(trace, { event: 'agent_started', agent: 'planner' });
    set(16_000);
    send(trace, { event: 'agent_finished', agent: 'planner', result: 'success' });

    expect(lines.slice(1)).toEqual(['· planner finished in 14s']);
  });

  it('marks an agent that failed as failed', () => {
    const { trace, lines } = harness();
    trace.begin(TICKET);

    send(trace, { event: 'agent_started', agent: 'developer' });
    send(trace, { event: 'agent_finished', agent: 'developer', result: 'failure' });

    expect(lines).toContain('✖ developer failed');
  });

  it('shows the reviewer verdict as soon as it lands', () => {
    const { trace, lines } = harness();
    trace.begin(TICKET);

    send(trace, { event: 'review_started' });
    send(trace, { event: 'review_finished', result: 'success' });

    expect(lines).toContain('✔ review approved');
  });

  it('shows a blocked review as a problem', () => {
    const { trace, lines } = harness();
    trace.begin(TICKET);

    send(trace, { event: 'review_started' });
    send(trace, { event: 'review_finished', result: 'failure' });

    expect(lines).toContain('✖ review requested changes');
  });

  it('reports the branch, the commit, the push and the pull request', () => {
    const { trace, lines } = harness();
    trace.begin(TICKET);

    send(trace, {
      event: 'tool_called',
      tool: 'git.createBranch',
      risk: 'low',
      target: 'feature/reset-password',
    });
    send(trace, { event: 'git_commit', target: 'feat(auth): add password reset' });
    send(trace, { event: 'git_push' });
    send(trace, { event: 'pr_created', target: '42' });

    expect(lines.slice(1)).toEqual([
      '· branch feature/reset-password',
      '· commit feat(auth): add password reset',
      '· pushed',
      '✔ pull request #42',
    ]);
  });

  it('says what the human decided', () => {
    const { trace, lines } = harness();
    trace.begin(TICKET);

    send(trace, { event: 'human_approval', agent: 'human', target: 'workflow' });
    send(trace, { event: 'human_rejection', agent: 'human', target: 'workflow' });

    expect(lines).toEqual([
      'lou run · ticket #12 · Add reset password',
      '✔ you approved',
      '✖ you rejected',
    ]);
  });

  it('counts changed files instead of listing them one by one', () => {
    const { trace, lines } = harness();
    trace.begin(TICKET);

    send(trace, { event: 'file_changed', target: 'src/a.ts' });
    send(trace, { event: 'file_changed', target: 'src/b.ts' });
    trace.close();

    expect(lines.slice(1)).toEqual(['· 2 files changed']);
  });

  it('reports a denied command loudly', () => {
    const { trace, lines } = harness();
    trace.begin(TICKET);

    send(trace, { event: 'tool_denied', tool: 'git.push', target: 'force' });

    expect(lines).toContain('✖ denied git.push — force');
  });

  it('runs the tests and says whether they passed', () => {
    const { trace, lines, set } = harness();
    trace.begin(TICKET);
    set(1_000);
    send(trace, { event: 'test_started', target: 'test-first' });
    set(9_000);
    send(trace, { event: 'test_finished', result: 'success', target: 'test-first' });

    expect(lines.slice(1)).toEqual(['✔ tests test-first in 8s']);
  });

  it('never goes silent while an agent is working', () => {
    vi.useFakeTimers();
    try {
      const { trace, frames, set } = harness({ isTty: true });
      trace.begin(TICKET);
      send(trace, { event: 'agent_started', agent: 'planner' });
      set(30_000);
      vi.advanceTimersByTime(120);

      expect(frames.filter((frame) => frame.includes('planner'))).not.toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a single rewriting line on a terminal instead of flooding it', () => {
    vi.useFakeTimers();
    try {
      const { trace, lines, frames, set } = harness({ isTty: true });
      trace.begin(TICKET);
      send(trace, { event: 'agent_started', agent: 'planner' });
      for (let tick = 1; tick <= 5; tick += 1) {
        set(tick * 1_000);
        vi.advanceTimersByTime(120);
      }

      expect(frames.length).toBeGreaterThan(2);
      expect(lines).toEqual(['lou run · ticket #12 · Add reset password']);
      expect(frames.every((frame) => frame.startsWith('\r'))).toBe(true);
      expect(frames.every((frame) => !frame.includes('\n'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('erases the spinner before committing the line that replaces it', () => {
    vi.useFakeTimers();
    try {
      const { trace, lines, frames, set } = harness({ isTty: true });
      trace.begin(TICKET);
      send(trace, { event: 'agent_started', agent: 'planner' });
      set(2_000);
      vi.advanceTimersByTime(120);
      send(trace, { event: 'agent_finished', agent: 'planner', result: 'success' });

      expect(lines).toEqual([
        'lou run · ticket #12 · Add reset password',
        '· planner finished in 2s',
      ]);
      expect(frames[frames.length - 1]).toBe('\r\x1b[2K');
    } finally {
      vi.useRealTimers();
    }
  });

  it('never lets a spinner frame reach the line channel', () => {
    vi.useFakeTimers();
    try {
      const { trace, lines, set } = harness({ isTty: true });
      trace.begin(TICKET);
      send(trace, { event: 'agent_started', agent: 'developer' });
      set(1_000);
      vi.advanceTimersByTime(600);
      send(trace, { event: 'agent_finished', agent: 'developer', result: 'success' });
      send(trace, { event: 'pr_created', target: '42' });

      expect(lines.every((line) => !line.includes('\r'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows work it is asked to do even when no audit trail feeds it', async () => {
    const { trace, lines, set } = harness();
    trace.begin(TICKET);
    set(1_000);

    await trace.work('planner', () => {
      set(6_000);
      return Promise.resolve('plan');
    });

    expect(lines.slice(1)).toEqual(['· planner finished in 5s']);
  });

  it('reports work that threw as a failure', async () => {
    const { trace, lines } = harness();
    trace.begin(TICKET);

    await expect(
      trace.work('planner', () => Promise.reject(new Error('no runtime'))),
    ).rejects.toThrow('no runtime');

    expect(lines).toContain('✖ planner failed');
  });

  it('stops moving once the run is over', () => {
    vi.useFakeTimers();
    try {
      const { trace, lines, set } = harness({ isTty: true });
      trace.begin(TICKET);
      send(trace, { event: 'agent_started', agent: 'planner' });
      trace.close();
      const before = lines.length;
      set(9_000);
      vi.advanceTimersByTime(5_000);

      expect(lines).toHaveLength(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
