import { describe, expect, it } from 'vitest';
import { ClaudeStreamReader, activityFor, finalResult } from '../src/claude-stream.ts';

const HOOK_RESPONSE =
  '{"type":"system","subtype":"hook_response","hook_name":"SessionStart:startup","output":"PONYTAIL MODE ACTIVE\\n\\n' +
  'a'.repeat(4000) +
  '","stdout":"noise","exit_code":0}';

function parse(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  return value as Record<string, unknown>;
}

const RESULT =
  '{"type":"result","is_error":false,"total_cost_usd":0.02,' +
  '"usage":{"input_tokens":10,"output_tokens":4}}';

describe('activityFor', () => {
  it('reads the Claude status verbatim', () => {
    const record = parse('{"type":"system","subtype":"status","status":"requesting"}');

    expect(activityFor(record)).toBe('requesting');
  });

  it('summarises a retry with its attempt and cause', () => {
    const record = parse(
      '{"type":"system","subtype":"api_retry","attempt":2,"max_retries":10,"error":"authentication_failed"}',
    );

    expect(activityFor(record)).toBe('retrying 2/10 · authentication_failed');
  });

  it('names the model the session started on', () => {
    const record = parse('{"type":"system","subtype":"init","model":"claude-sonnet-5"}');

    expect(activityFor(record)).toBe('model claude-sonnet-5');
  });

  it('never leaks a hook payload, however large', () => {
    expect(activityFor(parse(HOOK_RESPONSE))).toBeNull();
  });

  it('ignores every event type it does not know', () => {
    expect(activityFor(parse('{"type":"assistant","message":{"content":[]}}'))).toBeNull();
    expect(activityFor(parse('{"type":"stream_event","event":{"type":"x"}}'))).toBeNull();
    expect(activityFor(parse('{"type":"user"}'))).toBeNull();
  });

  it('truncates an absurd status so the spinner stays one line', () => {
    const record = parse(
      JSON.stringify({ type: 'system', subtype: 'status', status: 'x'.repeat(300) }),
    );

    expect(activityFor(record)).toHaveLength(60);
  });
});

describe('finalResult', () => {
  it('finds the result envelope at the end of the stream', () => {
    const stdout = [HOOK_RESPONSE, RESULT].join('\n');

    expect(finalResult(stdout)).toEqual(parse(RESULT));
  });

  it('returns null when the stream carries no result', () => {
    expect(finalResult(HOOK_RESPONSE)).toBeNull();
  });
});

describe('ClaudeStreamReader', () => {
  it('reports nothing for a stream made only of hook noise', () => {
    const reader = new ClaudeStreamReader();

    expect(reader.push(`${HOOK_RESPONSE}\n`)).toEqual([]);
    expect(reader.result()).toBeNull();
  });

  it('reassembles a line split across two chunks', () => {
    const reader = new ClaudeStreamReader();
    const line = '{"type":"system","subtype":"status","status":"thinking"}';

    expect(reader.push(line.slice(0, 20))).toEqual([]);
    expect(reader.push(`${line.slice(20)}\n`)).toEqual(['thinking']);
  });

  it('keeps the trailing partial line until it completes', () => {
    const reader = new ClaudeStreamReader();

    reader.push('{"type":"system","subtype":"status","status":"th');

    expect(reader.push('inking"}\n')).toEqual(['thinking']);
  });

  it('collects several activities from one chunk and holds the result', () => {
    const reader = new ClaudeStreamReader();
    const status = '{"type":"system","subtype":"status","status":"requesting"}';

    reader.push(`${status}\n${RESULT}\n`);

    expect(reader.result()).toEqual(parse(RESULT));
  });

  it('survives a line that is not JSON at all', () => {
    const reader = new ClaudeStreamReader();

    expect(reader.push('not json\n{"type":"system","subtype":"status","status":"ok"}\n')).toEqual([
      'ok',
    ]);
  });
});
