import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cliPath = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

describe('cli entry point', () => {
  it('runs when invoked through a symlinked path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lou-cli-'));
    const link = join(dir, 'lou.ts');
    symlinkSync(cliPath, link);

    const stdout = execFileSync(
      process.execPath,
      ['--no-warnings', '--experimental-strip-types', link, '--version'],
      { encoding: 'utf8' },
    );

    expect(stdout.trim()).toMatch(/^lou \d+\.\d+\.\d+(?:\.\d+)?$/);
  });
});
