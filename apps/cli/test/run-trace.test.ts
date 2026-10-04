import type { AuditEventPayload } from '@lou/audit';
import { describe, expect, it, vi } from 'vitest';
import { createRunTrace } from '../src/run/run-trace.ts';
import type { RunTrace } from '../src/run/run-trace.ts';
import { createStyler } from '../src/ux/style.ts';

const TICKET = { issueNumber: 12, title: 'Add reset password', workspace: '/work/lou' };
const HEADER = ['', '  ▍ lou run #12 · Add reset password', '  ⎿ workspace /work/lou', ''];
const SPIN_MS = 120;

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
    columns: () => 80,
    style: createStyler(false),
  });
  return {
    trace,
    lines,
    frames,
    body: () => lines.slice(HEADER.length),
    advance: (ms: number) => {
      clock += ms;
    },
    set: (ms: number) => {
      clock = ms;
    },
  };
}

describe('run trace header', () => {
  it('announces the ticket and the workspace before any work', () => {
    const { trace, lines } = harness();

    trace.begin(TICKET);

    expect(lines).toEqual(HEADER);
  });
});

describe('run trace sections', () => {
  it('opens a section for each phase of the pipeline', () => {
    const { trace, body } = harness();
    trace.begin(TICKET);

    send(trace, { event: 'agent_started', agent: 'planner' });
    send(trace, { event: 'agent_finished', agent: 'planner', result: 'success' });
    send(trace, { event: 'agent_started', agent: 'test-designer' });

    expect(body()).toContain('  ▸ PLAN');
    expect(body()).toContain('  ▸ TESTS');
  });

  it('does not repeat the section while the same phase runs', () => {
    const { trace, body } = harness();
    trace.begin(TICKET);

    send(trace, { event: 'agent_started', agent: 'test-designer' });
    send(trace, { event: 'agent_finished', agent: 'test-designer', result: 'success' });
    send(trace, { event: 'agent_started', agent: 'test-writer' });

    expect(body().filter((line) => line === '  ▸ TESTS')).toHaveLength(1);
  });

  it('moves the section on when the phase changes', () => {
    const { trace, body } = harness();
    trace.begin(TICKET);

    send(trace, { event: 'agent_started', agent: 'planner' });
    send(trace, { event: 'agent_finished', agent: 'planner', result: 'success' });
    send(trace, { event: 'agent_started', agent: 'developer' });

    expect(body()).toContain('  ▸ CODE');
  });
});

describe('run trace steps', () => {
  it('reports how long each agent took', () => {
    const { trace, body, set } = harness();
    trace.begin(TICKET);
    set(2_000);
    send(trace, { event: 'agent_started', agent: 'planner' });
    set(16_000);
    send(trace, { event: 'agent_finished', agent: 'planner', result: 'success' });

    expect(body()).toContain('    ✔ planner · 14s');
  });

  it('marks an agent that failed as failed', () => {
    const { trace, body } = harness();
    trace.begin(TICKET);

    send(trace, { event: 'agent_started', agent: 'developer' });
    send(trace, { event: 'agent_finished', agent: 'developer', result: 'failure' });

    expect(body()).toEqual(['  ▸ CODE', '    ✖ developer · 0s']);
  });

  it('shows the reviewer verdict as soon as it lands', () => {
    const { trace, body } = harness();
    trace.begin(TICKET);

    send(trace, { event: 'review_started' });
    send(trace, { event: 'review_finished', result: 'success' });

    expect(body()).toContain('    ✔ review · approved');
  });

  it('shows a blocked review as a problem', () => {
    const { trace, body } = harness();
    trace.begin(TICKET);

    send(trace, { event: 'review_started' });
    send(trace, { event: 'review_finished', result: 'failure' });

    expect(body()).toContain('    ✖ review · changes requested');
  });

  it('reports the branch, the commit, the push and the pull request', () => {
    const { trace, body } = harness();
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

    expect(body()).toEqual([
      '  ▸ BRANCH',
      '    · branch feature/reset-password',
      '  ▸ PUSH',
      '    · commit feat(auth): add password reset',
      '    · pushed',
      '  ▸ PULL REQUEST',
      '    ✔ pull request #42',
    ]);
  });

  it('says what the human decided', () => {
    const { trace, body } = harness();
    trace.begin(TICKET);

    send(trace, { event: 'human_approval', agent: 'human', target: 'workflow' });
    send(trace, { event: 'human_rejection', agent: 'human', target: 'workflow' });

    expect(body()).toEqual(['  ▸ APPROVAL', '    ✔ you approved', '    ✖ you rejected']);
  });

  it('counts changed files instead of listing them one by one', () => {
    const { trace, body } = harness();
    trace.begin(TICKET);

    send(trace, { event: 'file_changed', target: 'src/a.ts' });
    send(trace, { event: 'file_changed', target: 'src/b.ts' });
    trace.close();

    expect(body()).toEqual(['    · 2 files changed']);
  });

  it('says one file changed in the singular', () => {
    const { trace, body } = harness();
    trace.begin(TICKET);

    send(trace, { event: 'file_changed', target: 'src/a.ts' });
    trace.close();

    expect(body()).toEqual(['    · 1 file changed']);
  });

  it('reports a denied command loudly', () => {
    const { trace, body } = harness();
    trace.begin(TICKET);

    send(trace, { event: 'tool_denied', tool: 'git.push', target: 'force' });

    expect(body()).toContain('    ✖ denied git.push force');
  });

  it('runs the tests and says whether they passed', () => {
    const { trace, body, set } = harness();
    trace.begin(TICKET);
    set(1_000);
    send(trace, { event: 'test_started', target: 'test-first' });
    set(9_000);
    send(trace, { event: 'test_finished', result: 'success', target: 'test-first' });

    expect(body()).toContain('    ✔ tests · test-first passed 8s');
  });
});

describe('run trace live agent activity', () => {
  it('shows what the agent is doing while it thinks', () => {
    const { trace, frames } = harness({ isTty: true });
    trace.begin(TICKET);
    send(trace, { event: 'agent_started', agent: 'developer' });

    trace.activity({ kind: 'text', text: 'reading run-trace.ts' });

    expect(frames.join('')).toContain('reading run-trace.ts');
  });

  it('replaces the preview as the agent moves on', () => {
    const { trace, frames } = harness({ isTty: true });
    trace.begin(TICKET);
    send(trace, { event: 'agent_started', agent: 'developer' });

    trace.activity({ kind: 'text', text: 'reading files' });
    trace.activity({ kind: 'text', text: 'writing tests' });

    expect(frames.join('')).toContain('writing tests');
  });

  it('heartbeats instead of going quiet when the agent stops reporting', () => {
    vi.useFakeTimers();
    try {
      const { trace, frames, advance } = harness({ isTty: true });
      trace.begin(TICKET);
      send(trace, { event: 'agent_started', agent: 'developer' });
      advance(20_000);
      vi.advanceTimersByTime(SPIN_MS);

      expect(frames.at(-1)).toContain('no events for 20s');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops claiming silence once the agent reports again', () => {
    vi.useFakeTimers();
    try {
      const { trace, frames, advance } = harness({ isTty: true });
      trace.begin(TICKET);
      send(trace, { event: 'agent_started', agent: 'developer' });
      advance(20_000);
      vi.advanceTimersByTime(SPIN_MS);
      trace.activity({ kind: 'text', text: 'still going' });
      advance(1_000);
      vi.advanceTimersByTime(SPIN_MS);

      expect(frames.at(-1)).not.toContain('no events for');
      expect(frames.at(-1)).toContain('still going');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores output that arrives with no agent running', () => {
    const { trace, frames } = harness({ isTty: true });
    trace.begin(TICKET);

    trace.activity({ kind: 'text', text: 'stray output' });

    expect(frames).toHaveLength(0);
  });

  it('prints the agent summary under its step when it finishes', () => {
    const { trace, body } = harness();
    trace.begin(TICKET);
    send(trace, { event: 'agent_started', agent: 'developer' });

    trace.activity({ kind: 'text', text: 'SUMMARY: added a reset flow' });
    send(trace, { event: 'agent_finished', agent: 'developer', result: 'success' });

    expect(body()).toContain('      ⎿ added a reset flow');
  });

  it('leaves the transient preview off the permanent line', () => {
    vi.useFakeTimers();
    try {
      const { trace, frames, body } = harness({ isTty: true });
      trace.begin(TICKET);
      send(trace, { event: 'agent_started', agent: 'developer' });

      trace.activity({ kind: 'text', text: 'reading files' });
      send(trace, { event: 'agent_finished', agent: 'developer', result: 'success' });

      expect(frames.join('')).toContain('reading files');
      expect(body().join('\n')).not.toContain('reading files');
    } finally {
      vi.useRealTimers();
    }
  });

  it('strips terminal colours from the preview', () => {
    const { trace, frames } = harness({ isTty: true });
    trace.begin(TICKET);
    send(trace, { event: 'agent_started', agent: 'developer' });

    trace.activity({ kind: 'text', text: '\x1b[36mtool: read\x1b[0m' });

    expect(frames.join('')).toContain('tool: read');
  });
});

describe('run trace spinner', () => {
  it('never goes silent while an agent is working', () => {
    vi.useFakeTimers();
    try {
      const { trace, frames, set } = harness({ isTty: true });
      trace.begin(TICKET);
      send(trace, { event: 'agent_started', agent: 'planner' });
      set(30_000);
      vi.advanceTimersByTime(120);

      expect(frames.filter((frame) => frame.includes('planner')).length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides the timer for the first seconds so it does not flash', () => {
    vi.useFakeTimers();
    try {
      const { trace, frames, set } = harness({ isTty: true });
      trace.begin(TICKET);
      send(trace, { event: 'agent_started', agent: 'planner' });
      set(2_000);
      vi.advanceTimersByTime(120);

      expect(frames.join('')).not.toContain('2s');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reveals the timer once the step is long enough to matter', () => {
    vi.useFakeTimers();
    try {
      const { trace, frames, set } = harness({ isTty: true });
      trace.begin(TICKET);
      send(trace, { event: 'agent_started', agent: 'planner' });
      set(20_000);
      vi.advanceTimersByTime(120);

      expect(frames.join('')).toContain('20s');
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
      expect(lines).toEqual([...HEADER, '  ▸ PLAN']);
      expect(frames.every((frame) => frame.startsWith('\r'))).toBe(true);
      expect(frames.every((frame) => !frame.includes('\n'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('erases the spinner before committing the line that replaces it', () => {
    vi.useFakeTimers();
    try {
      const { trace, body, frames, set } = harness({ isTty: true });
      trace.begin(TICKET);
      send(trace, { event: 'agent_started', agent: 'planner' });
      set(2_000);
      vi.advanceTimersByTime(120);
      send(trace, { event: 'agent_finished', agent: 'planner', result: 'success' });

      expect(body()).toEqual(['  ▸ PLAN', '    ✔ planner · 2s']);
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

describe('run trace work helper', () => {
  it('shows work it is asked to do even when no audit trail feeds it', async () => {
    const { trace, body, set } = harness();
    trace.begin(TICKET);
    set(1_000);

    await trace.work('planner', () => {
      set(6_000);
      return Promise.resolve('plan');
    });

    expect(body()).toEqual(['    ✔ planner · 5s']);
  });

  it('reports work that threw as a failure', async () => {
    const { trace, body } = harness();
    trace.begin(TICKET);

    await expect(
      trace.work('planner', () => Promise.reject(new Error('no runtime'))),
    ).rejects.toThrow('no runtime');

    expect(body()).toEqual(['    ✖ planner · 0s']);
  });
});

describe('run trace agent activity', () => {
  it('shows the current thought on the live line', () => {
    const { trace, body } = harness();
    trace.begin(TICKET);
    send(trace, { event: 'agent_started', agent: 'planner' });

    trace.activity({ kind: 'thinking', text: 'the auth module matters here' });

    expect(body().join('\n')).toContain('the auth module matters here');
    expect(body()).toContain('  ▸ PLAN');
  });

  it('keeps one durable line per tool so the work is auditable', () => {
    const { trace, body } = harness();
    trace.begin(TICKET);
    send(trace, { event: 'agent_started', agent: 'developer' });

    trace.activity({ kind: 'tool', tool: 'read', detail: 'src/auth.ts', ok: true });
    trace.activity({ kind: 'tool', tool: 'bash', detail: 'pnpm test', ok: false });

    expect(body()).toContain('      ⎿ read src/auth.ts');
    expect(body()).toContain('      ⎿ ✖ bash pnpm test');
  });

  it('reports thoughts, tools and tokens once the agent settles', () => {
    const { trace, body } = harness();
    trace.begin(TICKET);
    send(trace, { event: 'agent_started', agent: 'developer' });

    trace.activity({ kind: 'thinking', text: 'one' });
    trace.activity({ kind: 'thinking', text: 'two' });
    trace.activity({ kind: 'tool', tool: 'read', detail: 'a.ts', ok: true });
    trace.activity({
      kind: 'usage',
      inputTokens: 20_000,
      outputTokens: 1_100,
      reasoningTokens: 400,
      cachedTokens: 0,
      costUsd: 0,
    });
    send(trace, { event: 'agent_finished', agent: 'developer', result: 'success' });

    expect(body()).toContain('      ⎿ 2 thoughts · 1 tool · 21.1k tokens');
  });

  it('omits the stats line for a runtime that reports no activity', () => {
    const { trace, body } = harness();
    trace.begin(TICKET);
    send(trace, { event: 'agent_started', agent: 'developer' });
    send(trace, { event: 'agent_finished', agent: 'developer', result: 'success' });

    expect(body().join('\n')).not.toContain('tokens');
  });

  it('ignores activity that arrives outside a running agent', () => {
    const { trace, body } = harness();
    trace.begin(TICKET);

    trace.activity({ kind: 'tool', tool: 'read', detail: 'ghost.ts', ok: true });

    expect(body().join('\n')).not.toContain('ghost.ts');
  });
});
