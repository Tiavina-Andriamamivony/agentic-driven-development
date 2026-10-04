import { describe, expect, it } from 'vitest';
import { EMPTY_STREAM, feedActivity, feedStream, stripAnsi } from '../src/run/agent-stream.ts';

describe('stripAnsi', () => {
  it('removes colour sequences', () => {
    expect(stripAnsi('\x1b[32mgreen\x1b[0m')).toBe('green');
  });

  it('removes cursor and erase sequences', () => {
    expect(stripAnsi('\x1b[2K\x1b[1Aclean')).toBe('clean');
  });

  it('removes operating system command sequences', () => {
    expect(stripAnsi('\x1b]0;title\x07body')).toBe('body');
  });

  it('leaves plain text untouched', () => {
    expect(stripAnsi('plain text')).toBe('plain text');
  });
});

describe('feedStream', () => {
  it('exposes the latest line as the current activity', () => {
    const view = feedStream(EMPTY_STREAM, 'reading files\n');

    expect(view.activity).toBe('reading files');
  });

  it('replaces the activity when a new line arrives', () => {
    const first = feedStream(EMPTY_STREAM, 'reading files\n');
    const second = feedStream(first, 'writing tests\n');

    expect(second.activity).toBe('writing tests');
  });

  it('shows a partial line immediately so the output feels live', () => {
    const view = feedStream(EMPTY_STREAM, 'half a sen');

    expect(view.activity).toBe('half a sen');
  });

  it('ignores blank lines and keeps the previous activity', () => {
    const first = feedStream(EMPTY_STREAM, 'reading files\n');
    const second = feedStream(first, '\n   \n');

    expect(second.activity).toBe('reading files');
  });

  it('ignores carriage return progress redraws', () => {
    const view = feedStream(EMPTY_STREAM, '10%\r50%\r100% done');

    expect(view.activity).toBe('100% done');
  });

  it('strips ansi codes before exposing the activity', () => {
    const view = feedStream(EMPTY_STREAM, '\x1b[36mtool: read\x1b[0m\n');

    expect(view.activity).toBe('tool: read');
  });

  it('captures the summary line the agents are asked to emit', () => {
    const view = feedStream(EMPTY_STREAM, 'done\nSUMMARY: added password reset\n');

    expect(view.summary).toBe('added password reset');
  });

  it('keeps the first summary and ignores later noise', () => {
    const first = feedStream(EMPTY_STREAM, 'SUMMARY: first result\n');
    const second = feedStream(first, 'more output\n');

    expect(second.summary).toBe('first result');
  });

  it('keeps the protocol answer out of the live preview', () => {
    const view = feedStream(EMPTY_STREAM, 'SUMMARY: added a reset flow\n');

    expect(view.activity).toBe('');
    expect(view.summary).toBe('added a reset flow');
  });

  it('falls back to the previous activity when only protocol lands', () => {
    const first = feedStream(EMPTY_STREAM, 'writing files\n');
    const second = feedStream(first, 'CHANGED: src/a.ts\n');

    expect(second.activity).toBe('writing files');
  });

  it('ignores every structured answer line in the preview', () => {
    const view = feedStream(
      EMPTY_STREAM,
      'PLAN_TITLE: feat: reset\nTEST_PLAN: one case\nAPPROVED: ok\n',
    );

    expect(view.activity).toBe('');
  });

  it('truncates a very long activity line', () => {
    const view = feedStream(EMPTY_STREAM, `${'x'.repeat(400)}\n`);

    expect(view.activity.length).toBeLessThanOrEqual(160);
    expect(view.activity.startsWith('…')).toBe(true);
  });

  it('starts from an empty view', () => {
    expect(EMPTY_STREAM.activity).toBe('');
    expect(EMPTY_STREAM.summary).toBe('');
  });
});

describe('feedActivity', () => {
  it('exposes a thought as the live activity and counts it', () => {
    const view = feedActivity(EMPTY_STREAM, {
      kind: 'thinking',
      text: 'I should read the auth module',
    });

    expect(view.activity).toBe('I should read the auth module');
    expect(view.thoughts).toBe(1);
  });

  it('exposes a tool as the live activity and counts it', () => {
    const view = feedActivity(EMPTY_STREAM, {
      kind: 'tool',
      tool: 'read',
      detail: 'src/auth.ts',
      ok: true,
    });

    expect(view.activity).toBe('read src/auth.ts');
    expect(view.tools).toBe(1);
  });

  it('falls back to the tool name when there is no detail', () => {
    const view = feedActivity(EMPTY_STREAM, { kind: 'tool', tool: 'bash', detail: '', ok: true });

    expect(view.activity).toBe('bash');
  });

  it('keeps the latest tokens and cost reported by the runtime', () => {
    const first = feedActivity(EMPTY_STREAM, {
      kind: 'usage',
      inputTokens: 100,
      outputTokens: 10,
      reasoningTokens: 5,
      cachedTokens: 0,
      costUsd: 0.5,
    });
    const second = feedActivity(first, {
      kind: 'usage',
      inputTokens: 200,
      outputTokens: 20,
      reasoningTokens: 5,
      cachedTokens: 0,
      costUsd: 0.9,
    });

    expect(second.tokens).toBe(220);
    expect(second.costUsd).toBe(0.9);
  });

  it('captures the summary carried by a text activity', () => {
    const view = feedActivity(EMPTY_STREAM, { kind: 'text', text: 'SUMMARY: added watchlist' });

    expect(view.summary).toBe('added watchlist');
    expect(view.activity).toBe('');
  });

  it('keeps only the current line of a multiline thought', () => {
    const view = feedActivity(EMPTY_STREAM, { kind: 'thinking', text: 'first line\nsecond line' });

    expect(view.activity).toBe('second line');
  });
});
