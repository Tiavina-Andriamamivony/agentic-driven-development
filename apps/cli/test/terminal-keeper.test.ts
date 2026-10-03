import { describe, expect, it } from 'vitest';
import { createTerminalKeeper } from '../src/run/terminal-keeper';

function collector(): { readonly out: string[] } {
  return { out: [] };
}

describe('createTerminalKeeper', () => {
  it('approves a plan gate when the human answers yes', async () => {
    const { out } = collector();
    const keeper = createTerminalKeeper({
      ask: () => Promise.resolve('y'),
      out: (line) => out.push(line),
    });

    const decision = await keeper.decide({
      runId: 'run-1',
      kind: 'plan',
      subject: 'feat: reset password',
      details: 'plan details',
    });

    expect(decision).toEqual({ approved: true });
    expect(out.join('\n')).toContain('▸ PLAN GATE');
    expect(out.join('\n')).toContain('plan details');
  });

  it('rejects a review gate when the human answers no', async () => {
    const { out } = collector();
    const keeper = createTerminalKeeper({
      ask: () => Promise.resolve('n'),
      out: (line) => out.push(line),
    });

    const decision = await keeper.decide({
      runId: 'run-1',
      kind: 'review',
      subject: 'feat: reset password',
      details: 'review details',
    });

    expect(decision).toEqual({ approved: false });
    expect(out.join('\n')).toContain('▸ REVIEW GATE');
    expect(out.join('\n')).toContain('review details');
  });

  it('collects one answer per clarification question', async () => {
    const answers = ['oauth', '1h'];
    let asked = 0;
    const keeper = createTerminalKeeper({
      ask: (question) => {
        expect(question.endsWith(' ')).toBe(true);
        asked += 1;
        return Promise.resolve(answers.shift() ?? '');
      },
      out: () => {},
    });

    const got = await keeper.askClarifications(['which auth provider?', 'expiry?']);

    expect(got).toEqual(['oauth', '1h']);
    expect(asked).toBe(2);
  });
});
