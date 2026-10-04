import { describe, expect, it } from 'vitest';

const ESC = String.fromCharCode(27);
import { createStyler } from '../src/ux/style.ts';
import {
  countLabel,
  detailLine,
  doneLine,
  hasActivity,
  headerLines,
  humanDuration,
  liveLine,
  noteLine,
  promptLine,
  sectionLine,
  statsLine,
  toolLine,
} from '../src/run/trace-render.ts';

const style = createStyler(false);
const plain = createStyler(true);
const WIDTH = 60;

function visible(text: string): string {
  return text.replace(new RegExp(`${ESC}\\[[0-9;]*m`, 'g'), '');
}

describe('humanDuration', () => {
  it('reports seconds under a minute', () => {
    expect(humanDuration(0)).toBe('0s');
    expect(humanDuration(4_900)).toBe('5s');
    expect(humanDuration(59_400)).toBe('59s');
  });

  it('reports minutes and padded seconds above a minute', () => {
    expect(humanDuration(60_000)).toBe('1m 00s');
    expect(humanDuration(125_000)).toBe('2m 05s');
  });
});

describe('headerLines', () => {
  it('shows the ticket number and title on the first line', () => {
    const [first] = headerLines({
      issueNumber: 42,
      title: 'Add password reset',
      workspace: '/work',
      style,
    });

    expect(first).toContain('#42 · Add password reset');
    expect(first).toContain('lou run');
  });

  it('shows the workspace on the second line', () => {
    const lines = headerLines({ issueNumber: 42, title: 'x', workspace: '/work', style });

    expect(lines[1]).toContain('workspace /work');
  });
});

describe('sectionLine', () => {
  it('uppercases the phase so the run reads as a ladder', () => {
    expect(sectionLine('plan', style)).toContain('PLAN');
  });
});

describe('liveLine', () => {
  const base = { frame: '⠹', label: 'developer', style, columns: WIDTH };

  it('pins the duration to the right edge of the terminal', () => {
    const line = liveLine({ ...base, activity: 'writing tests', duration: '1m 04s' });

    expect(line.length).toBe(WIDTH);
    expect(line.endsWith('1m 04s')).toBe(true);
  });

  it('keeps the same right edge whatever the activity length', () => {
    const short = liveLine({ ...base, activity: 'read', duration: '12s' });
    const long = liveLine({ ...base, activity: 'reading many files', duration: '12s' });

    expect(short.length).toBe(long.length);
    expect(short.endsWith('12s')).toBe(true);
    expect(long.endsWith('12s')).toBe(true);
  });

  it('truncates an activity that cannot fit beside the duration', () => {
    const line = liveLine({ ...base, activity: 'x'.repeat(300), duration: '12s' });

    expect(line.length).toBeLessThanOrEqual(WIDTH);
    expect(visible(line)).toContain('…');
  });

  it('keeps the spinner and the agent label visible', () => {
    const line = liveLine({ ...base, activity: '', duration: '' });

    expect(line).toContain('⠹ developer');
  });

  it('colours the agent label with its own colour', () => {
    const line = liveLine({ ...base, activity: '', duration: '', style: plain });

    expect(visible(line)).toContain('developer');
    expect(line).not.toBe(visible(line));
  });

  it('paints the spinner frame in the agent colour too', () => {
    const line = liveLine({ ...base, activity: '', duration: '', style: plain });

    expect(line).toContain(`${ESC}[38;5;84m⠹${ESC}[0m`);
    expect(line).toContain(`${ESC}[38;5;84mdeveloper${ESC}[0m`);
  });

  it('gives each agent a different colour', () => {
    const planner = liveLine({
      ...base,
      label: 'planner',
      activity: '',
      duration: '',
      style: plain,
    });
    const developer = liveLine({
      ...base,
      label: 'developer',
      activity: '',
      duration: '',
      style: plain,
    });

    expect(planner).not.toBe(developer);
  });
});

describe('doneLine', () => {
  it('marks a successful step with a check', () => {
    expect(doneLine({ ok: true, label: 'planner', detail: '8s', style })).toContain('✔ planner');
  });

  it('marks a failed step with a cross', () => {
    expect(doneLine({ ok: false, label: 'planner', detail: '', style })).toContain('✖ planner');
  });

  it('shows the detail next to the label', () => {
    expect(doneLine({ ok: true, label: 'tests', detail: '3 cases', style })).toContain('3 cases');
  });
});

describe('detailLine', () => {
  it('indents the agent summary under its step', () => {
    const line = detailLine({ text: 'added a reset flow', style });

    expect(visible(line)).toContain('⎿ added a reset flow');
    expect(line.startsWith(' ')).toBe(true);
  });
});

describe('countLabel', () => {
  it('uses the singular for exactly one', () => {
    expect(countLabel(1, 'file changed', 'files changed')).toBe('1 file changed');
  });

  it('uses the plural for anything else', () => {
    expect(countLabel(0, 'file changed', 'files changed')).toBe('0 files changed');
    expect(countLabel(3, 'file changed', 'files changed')).toBe('3 files changed');
  });
});

describe('noteLine and promptLine', () => {
  it('renders a quiet note with a middle dot', () => {
    expect(noteLine({ text: 'pushed', tone: 'info', style })).toContain('pushed');
  });

  it('renders a denied command loudly', () => {
    expect(noteLine({ text: 'denied git.push', tone: 'bad', style })).toContain('✖');
  });

  it('renders a success note with a check', () => {
    expect(noteLine({ text: 'pull request #42', tone: 'good', style })).toContain('✔');
  });

  it('renders a human question with a question mark', () => {
    expect(promptLine('Approve the plan?', style)).toContain('Approve the plan?');
  });
});

describe('toolLine', () => {
  it('renders a completed tool under the agent', () => {
    expect(toolLine({ label: 'read src/auth.ts', ok: true, style: style })).toBe(
      '      ⎿ read src/auth.ts',
    );
  });

  it('marks a failed tool', () => {
    expect(toolLine({ label: 'bash make', ok: false, style: style })).toBe('      ⎿ ✖ bash make');
  });
});

describe('statsLine', () => {
  it('counts thoughts, tools and tokens', () => {
    expect(statsLine({ thoughts: 4, tools: 9, tokens: 24_100, style: style })).toBe(
      '      ⎿ 4 thoughts · 9 tools · 24.1k tokens',
    );
  });

  it('uses singular labels for a single item', () => {
    expect(statsLine({ thoughts: 1, tools: 1, tokens: 12, style: style })).toBe(
      '      ⎿ 1 thought · 1 tool · 12 tokens',
    );
  });

  it('adds the cost only when the runtime reported one', () => {
    expect(statsLine({ thoughts: 0, tools: 1, tokens: 10, costUsd: 0.5, style: style })).toBe(
      '      ⎿ 0 thoughts · 1 tool · 10 tokens · $0.500',
    );
    expect(statsLine({ thoughts: 0, tools: 1, tokens: 10, costUsd: 0, style: style })).toBe(
      '      ⎿ 0 thoughts · 1 tool · 10 tokens',
    );
  });

  it('abbreviates millions of tokens', () => {
    expect(statsLine({ thoughts: 0, tools: 0, tokens: 1_250_000, style: style })).toBe(
      '      ⎿ 0 thoughts · 0 tools · 1.3M tokens',
    );
  });
});

describe('hasActivity', () => {
  it('is false for a runtime that reported nothing', () => {
    expect(hasActivity({ thoughts: 0, tools: 0, tokens: 0, style: style })).toBe(false);
  });

  it('is true as soon as one thought landed', () => {
    expect(hasActivity({ thoughts: 1, tools: 0, tokens: 0, style: style })).toBe(true);
  });
});
