import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const installerPath = fileURLToPath(new URL('../src/ux/opencode-installer.ts', import.meta.url));

function fakeOpenCode(version: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'lou-opencode-'));
  const bin = join(dir, 'opencode');
  writeFileSync(bin, `#!/bin/sh\necho "${version}"\n`);
  chmodSync(bin, 0o755);
  return dir;
}

function detectStdout(binDir: string, home = process.env['HOME']): string {
  const script = `
import { createLocalOpenCodeInstaller } from '${installerPath}';
const found = await createLocalOpenCodeInstaller().detect();
process.stdout.write('DETECTED=' + found);
`;
  return execFileSync(
    process.execPath,
    ['--no-warnings', '--experimental-transform-types', '--input-type=module', '--eval', script],
    { encoding: 'utf8', env: { ...process.env, PATH: binDir, HOME: home } },
  );
}

describe('opencode detection', () => {
  it('never prints the probed version into the caller output', () => {
    const stdout = detectStdout(fakeOpenCode('1.18.34'));

    expect(stdout.trim()).toBe('DETECTED=true');
  });

  it('still detects the binary it cannot print', () => {
    const stdout = detectStdout(fakeOpenCode('9.9.9'));

    expect(stdout.trim()).toBe('DETECTED=true');
  });

  it('finds the binary in the default install location when PATH has none', () => {
    const home = mkdtempSync(join(tmpdir(), 'lou-home-'));
    mkdirSync(join(home, '.opencode', 'bin'), { recursive: true });
    writeFileSync(join(home, '.opencode', 'bin', 'opencode'), '#!/bin/sh\necho 1.18.34\n');
    const emptyPath = mkdtempSync(join(tmpdir(), 'lou-empty-'));

    const stdout = detectStdout(emptyPath, home);

    expect(stdout.trim()).toBe('DETECTED=true');
  });

  it('reports a missing binary without leaking a shell error', () => {
    const home = mkdtempSync(join(tmpdir(), 'lou-home-'));

    const stdout = detectStdout(mkdtempSync(join(tmpdir(), 'lou-empty-')), home);

    expect(stdout.trim()).toBe('DETECTED=false');
  });
});
