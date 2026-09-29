import { describe, expect, it } from 'vitest';
import { createStyler } from '../src/ux/style';

describe('createStyler', () => {
  it('wraps selected text in ANSI codes when enabled', () => {
    const style = createStyler(true);

    expect(style.green('ok')).toBe('\x1b[32mok\x1b[0m');
    expect(style.red('ko')).toBe('\x1b[31mko\x1b[0m');
    expect(style.yellow('caution')).toBe('\x1b[33mcaution\x1b[0m');
    expect(style.cyan('hint')).toBe('\x1b[36mhint\x1b[0m');
    expect(style.bold('x')).toBe('\x1b[1mx\x1b[0m');
    expect(style.dim('tail')).toBe('\x1b[2mtail\x1b[0m');
    expect(style.check(true)).toBe('\x1b[32m✔\x1b[0m');
    expect(style.check(false)).toBe('\x1b[31m✖\x1b[0m');
    expect(style.banner('Lou')).toBe('\x1b[1m\x1b[36mLou\x1b[0m\x1b[0m');
  });

  it('is a no-op when disabled', () => {
    const style = createStyler(false);

    expect(style.green('ok')).toBe('ok');
    expect(style.yellow('caution')).toBe('caution');
    expect(style.bold('x')).toBe('x');
    expect(style.check(true)).toBe('✔');
    expect(style.check(false)).toBe('✖');
    expect(style.banner('Lou')).toBe('Lou');
  });
});
