import { describe, expect, it } from 'vitest';
import type { AgentActivity } from '@lou/agent-runtime';
import { OpenCodeEventReader } from '../src/opencode-event-reader.ts';

function collect(chunks: readonly string[]): { events: AgentActivity[]; answer: string } {
  const events: AgentActivity[] = [];
  const reader = new OpenCodeEventReader((activity) => events.push(activity));
  for (const chunk of chunks) {
    reader.push(chunk);
  }
  reader.finish();
  return { events, answer: reader.answerText() };
}

const THINKING = '{"type":"reasoning","part":{"type":"reasoning","text":"pondering"}}';
const ANSWER = '{"type":"text","part":{"type":"text","text":"SUMMARY: all good"}}';

describe('OpenCodeEventReader', () => {
  it('emits activities for complete lines', () => {
    const { events } = collect([`${THINKING}\n${ANSWER}\n`]);

    expect(events).toEqual([
      { kind: 'thinking', text: 'pondering' },
      { kind: 'text', text: 'SUMMARY: all good' },
    ]);
  });

  it('reassembles an event split across chunks', () => {
    const { events } = collect([
      '{"type":"reasoning","part":{"type":"reasoning","text":"ponder',
      'ing"}}',
      '\n',
    ]);

    expect(events).toEqual([{ kind: 'thinking', text: 'pondering' }]);
  });

  it('waits for the newline before emitting', () => {
    const events: AgentActivity[] = [];
    const reader = new OpenCodeEventReader((activity) => events.push(activity));

    reader.push(ANSWER);

    expect(events).toEqual([]);
  });

  it('delivers a trailing line without newline on finish', () => {
    const { events } = collect([ANSWER]);

    expect(events).toEqual([{ kind: 'text', text: 'SUMMARY: all good' }]);
  });

  it('joins every text part as the answer', () => {
    const first = '{"type":"text","part":{"type":"text","text":"line one"}}';
    const second = '{"type":"text","part":{"type":"text","text":"QUESTIONS: none"}}';

    expect(collect([`${first}\n${second}\n`]).answer).toBe('line one\nQUESTIONS: none');
  });

  it('skips blank and unknown lines', () => {
    const { events, answer } = collect([`\n\n${ANSWER}\ngarbage\n`]);

    expect(events).toEqual([{ kind: 'text', text: 'SUMMARY: all good' }]);
    expect(answer).toBe('SUMMARY: all good');
  });
});
