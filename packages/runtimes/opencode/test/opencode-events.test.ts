import { describe, expect, it } from 'vitest';
import { parseOpenCodeEvent } from '../src/opencode-events.ts';

const TOOL_USE_LINE =
  '{"type":"tool_use","timestamp":1791063473408,"sessionID":"ses_ef","part":{"type":"tool","tool":"read","callID":"call_01","state":{"status":"completed","input":{"filePath":"/tmp/opencode/oc-probe/err.log"},"output":"<content>\\n1: x\\n</content>","metadata":{"preview":"x","truncated":false},"title":"tmp/opencode/oc-probe/err.log","time":{"start":1,"end":2}}}}';

const STEP_FINISH_LINE =
  '{"type":"step_finish","timestamp":1791063473408,"sessionID":"ses_ef","part":{"id":"prt_1","reason":"tool-calls","messageID":"msg_1","sessionID":"ses_ef","type":"step-finish","tokens":{"total":21629,"input":19650,"output":38,"reasoning":12,"cache":{"write":0,"read":1941}},"cost":0.0123}}';

const TEXT_LINE =
  '{"type":"text","timestamp":1791063477210,"sessionID":"ses_ef","part":{"id":"prt_2","type":"text","sessionID":"ses_ef","messageID":"msg_1","text":"err.log contains just \\"x\\".","time":{"start":1791063477173,"end":1791063477201}}}';

const REASONING_LINE =
  '{"type":"reasoning","timestamp":1791063477100,"sessionID":"ses_ef","part":{"id":"prt_3","type":"reasoning","sessionID":"ses_ef","messageID":"msg_1","text":"The user wants me to inspect err.log.","time":{"start":1,"end":2}}}';

describe('parseOpenCodeEvent', () => {
  it('maps a reasoning part to a thinking activity', () => {
    expect(parseOpenCodeEvent(REASONING_LINE)).toEqual({
      kind: 'thinking',
      text: 'The user wants me to inspect err.log.',
    });
  });

  it('maps a text part to a text activity', () => {
    expect(parseOpenCodeEvent(TEXT_LINE)).toEqual({
      kind: 'text',
      text: 'err.log contains just "x".',
    });
  });

  it('maps a tool part to a tool activity using the human title', () => {
    expect(parseOpenCodeEvent(TOOL_USE_LINE)).toEqual({
      kind: 'tool',
      tool: 'read',
      detail: 'tmp/opencode/oc-probe/err.log',
      ok: true,
    });
  });

  it('maps a step finish to a usage activity', () => {
    expect(parseOpenCodeEvent(STEP_FINISH_LINE)).toEqual({
      kind: 'usage',
      inputTokens: 19650,
      outputTokens: 38,
      reasoningTokens: 12,
      cachedTokens: 1941,
      costUsd: 0.0123,
    });
  });

  it('falls back to the metadata preview when a tool has no title', () => {
    const line = TOOL_USE_LINE.replace('"title":"tmp/opencode/oc-probe/err.log",', '');

    expect(parseOpenCodeEvent(line)).toEqual({
      kind: 'tool',
      tool: 'read',
      detail: 'x',
      ok: true,
    });
  });

  it('marks a failed tool state', () => {
    const line = TOOL_USE_LINE.replace('"status":"completed"', '"status":"error"');

    expect(parseOpenCodeEvent(line)).toMatchObject({ kind: 'tool', ok: false });
  });

  it('defaults missing token counters to zero', () => {
    const line = '{"type":"step_finish","part":{"type":"step-finish","tokens":{"total":5}}}';

    expect(parseOpenCodeEvent(line)).toEqual({
      kind: 'usage',
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cachedTokens: 0,
      costUsd: 0,
    });
  });

  it('ignores a step finish without tokens', () => {
    const line = '{"type":"step_finish","part":{"type":"step-finish"}}';

    expect(parseOpenCodeEvent(line)).toBeUndefined();
  });

  it('ignores step start events', () => {
    const line =
      '{"type":"step_start","part":{"id":"prt_0","type":"step-start","messageID":"msg_1"}}';

    expect(parseOpenCodeEvent(line)).toBeUndefined();
  });

  it('ignores blank and malformed lines', () => {
    expect(parseOpenCodeEvent('')).toBeUndefined();
    expect(parseOpenCodeEvent('   ')).toBeUndefined();
    expect(parseOpenCodeEvent('not json')).toBeUndefined();
    expect(parseOpenCodeEvent('{"type":"text"}')).toBeUndefined();
    expect(parseOpenCodeEvent('[1,2,3]')).toBeUndefined();
    expect(parseOpenCodeEvent('null')).toBeUndefined();
  });

  it('ignores parts whose text is only whitespace', () => {
    const line = '{"type":"text","part":{"type":"text","text":"  \\n "}}';

    expect(parseOpenCodeEvent(line)).toBeUndefined();
  });

  it('ignores a tool part without state', () => {
    const line = '{"type":"tool_use","part":{"type":"tool","tool":"read"}}';

    expect(parseOpenCodeEvent(line)).toBeUndefined();
  });
});
