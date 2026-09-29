export interface Styler {
  readonly bold: (text: string) => string;
  readonly dim: (text: string) => string;
  readonly cyan: (text: string) => string;
  readonly green: (text: string) => string;
  readonly yellow: (text: string) => string;
  readonly red: (text: string) => string;
  readonly check: (ok: boolean) => string;
  readonly banner: (text: string) => string;
}

const GREEN = 32;
const RED = 31;
const YELLOW = 33;
const CYAN = 36;

export function createStyler(enabled: boolean): Styler {
  const paint = enabled
    ? (code: number, text: string): string => `\x1b[${code}m${text}\x1b[0m`
    : (_code: number, text: string): string => text;
  return {
    bold: (text) => paint(1, text),
    dim: (text) => paint(2, text),
    cyan: (text) => paint(CYAN, text),
    green: (text) => paint(GREEN, text),
    yellow: (text) => paint(YELLOW, text),
    red: (text) => paint(RED, text),
    check: (ok) => (ok ? paint(GREEN, '✔') : paint(RED, '✖')),
    banner: (text) => paint(1, paint(CYAN, text)),
  };
}
