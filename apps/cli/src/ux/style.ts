export interface Styler {
  readonly bold: (text: string) => string;
  readonly dim: (text: string) => string;
  readonly cyan: (text: string) => string;
  readonly green: (text: string) => string;
  readonly yellow: (text: string) => string;
  readonly red: (text: string) => string;
  readonly purple: (text: string) => string;
  readonly blue: (text: string) => string;
  readonly orange: (text: string) => string;
  readonly gray: (text: string) => string;
  readonly accent: (text: string) => string;
  readonly check: (ok: boolean) => string;
  readonly banner: (text: string) => string;
  readonly agent: (name: string) => string;
  readonly tone: (agent: string, text: string) => string;
}

const BOLD = '1';
const DIM = '2';
const RED = '31';
const GREEN = '32';
const YELLOW = '33';
const CYAN = '36';
const PURPLE = '38;5;141';
const BLUE = '38;5;75';
const ORANGE = '38;5;215';
const GRAY = '38;5;245';
const ACCENT = '38;5;84';
const CHECK = '✔';
const CROSS = '✖';

const AGENT_TONES: Readonly<Record<string, string>> = {
  planner: PURPLE,
  'test-designer': CYAN,
  'test-writer': BLUE,
  developer: ACCENT,
  reviewer: ORANGE,
};

export function resolveColorEnabled(
  isTty: boolean,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const forced = env['FORCE_COLOR'];
  if (forced !== undefined && forced !== '0' && forced !== 'false') {
    return true;
  }
  if (env['NO_COLOR'] !== undefined) {
    return false;
  }
  if (env['TERM'] === 'dumb') {
    return false;
  }
  return isTty;
}

export function createStyler(enabled: boolean): Styler {
  const paint = enabled
    ? (params: string, text: string): string => `\x1b[${params}m${text}\x1b[0m`
    : (_params: string, text: string): string => text;
  const toneOf = (agent: string): string => AGENT_TONES[agent] ?? GRAY;
  return {
    bold: (text) => paint(BOLD, text),
    dim: (text) => paint(DIM, text),
    cyan: (text) => paint(CYAN, text),
    green: (text) => paint(GREEN, text),
    yellow: (text) => paint(YELLOW, text),
    red: (text) => paint(RED, text),
    purple: (text) => paint(PURPLE, text),
    blue: (text) => paint(BLUE, text),
    orange: (text) => paint(ORANGE, text),
    gray: (text) => paint(GRAY, text),
    accent: (text) => paint(ACCENT, text),
    check: (ok) => paint(ok ? GREEN : RED, ok ? CHECK : CROSS),
    banner: (text) => paint(BOLD, paint(CYAN, text)),
    agent: (name) => paint(toneOf(name), name),
    tone: (agent, text) => paint(toneOf(agent), text),
  };
}
