import { describe, expect, it } from 'vitest';
import { detectInstall } from '../src/upgrade/install-detection';
import type { FilesystemProbe } from '../src/upgrade/install-detection';
import { createGhLatestFetcher } from '../src/upgrade/latest-release';
import { LOU_REPO } from '../src/upgrade/latest-release';
import type { InstallerRunner, UpgradeContext } from '../src/upgrade/upgrade-command';
import {
  createShellInstallerRunner,
  normalizeVersion,
  parseUpgradeArguments,
  runUpgrade,
} from '../src/upgrade/upgrade-command';
import { maybeNotifyUpgrade } from '../src/upgrade/upgrade-notice';
import type { UpgradeNoticeOptions } from '../src/upgrade/upgrade-notice';
import { createStyler } from '../src/ux/style';

const MANAGED_PATH = '/home/u/.lou/current/apps/cli/src/cli.ts';

function fakeFs(links: readonly string[]): FilesystemProbe {
  return {
    isSymbolicLink: (path: string) => links.includes(path),
  };
}

function makeContext(overrides?: Partial<UpgradeContext>): UpgradeContext {
  return {
    scriptPath: MANAGED_PATH,
    currentVersion: '0.1.0',
    platform: 'linux',
    nodeBin: '/usr/bin/node',
    repo: LOU_REPO,
    latest: () => Promise.resolve('v0.2.0'),
    runner: () => Promise.resolve({ ok: true }),
    out: () => undefined,
    style: createStyler(false),
    detect: () => ({ managed: true, prefix: '/home/u/.lou' }),
    ...overrides,
  };
}

function makeNotice(overrides?: Partial<UpgradeNoticeOptions>): UpgradeNoticeOptions {
  return {
    currentVersion: '0.1.0',
    repo: LOU_REPO,
    scriptPath: MANAGED_PATH,
    interactive: true,
    json: false,
    isCi: false,
    now: 1_000_000,
    checkEveryMs: 86_400_000,
    detect: () => ({ managed: true, prefix: '/home/u/.lou' }),
    latest: () => Promise.resolve('v0.2.0'),
    readTimestamp: () => undefined,
    writeTimestamp: () => undefined,
    out: () => undefined,
    style: createStyler(false),
    ...overrides,
  };
}

describe('detectInstall', () => {
  it('detects an installer-managed install from the running script path', () => {
    expect(detectInstall(MANAGED_PATH, fakeFs(['/home/u/.lou/current']))).toEqual({
      managed: true,
      prefix: '/home/u/.lou',
    });
  });

  it('classifies a source checkout as unmanaged', () => {
    expect(detectInstall('/home/u/lou/apps/cli/src/cli.ts', fakeFs([]))).toEqual({
      managed: false,
    });
  });

  it('classifies as unmanaged when the current symlink is missing', () => {
    expect(detectInstall(MANAGED_PATH, fakeFs([]))).toEqual({ managed: false });
  });
});

describe('parseUpgradeArguments', () => {
  it('accepts no arguments', () => {
    expect(parseUpgradeArguments([])).toEqual({ help: false });
  });

  it('accepts an explicit target version', () => {
    expect(parseUpgradeArguments(['v0.2.0'])).toEqual({ help: false, version: 'v0.2.0' });
  });

  it('accepts --help', () => {
    expect(parseUpgradeArguments(['--help'])).toEqual({ help: true });
  });

  it('rejects extra arguments', () => {
    expect(parseUpgradeArguments(['a', 'b'])).toBeNull();
  });
});

describe('runUpgrade', () => {
  it('does nothing and prints already up to date when the target matches the current version', async () => {
    const out: string[] = [];
    const context = makeContext({
      out: (line: string) => out.push(line),
      latest: () => Promise.resolve('v0.1.0'),
    });
    const code = await runUpgrade(undefined, context);
    expect(code).toBe(0);
    expect(out.join(' ')).toContain('already up to date');
  });

  it('upgrades to an explicit target through the installer runner', async () => {
    const out: string[] = [];
    const calls: Array<{ prefix: string; version: string }> = [];
    const runner: InstallerRunner = (opts) => {
      calls.push({ prefix: opts.prefix, version: opts.version });
      return Promise.resolve({ ok: true });
    };
    const code = await runUpgrade(
      'v0.2.0',
      makeContext({ out: (line: string) => out.push(line), runner }),
    );
    expect(code).toBe(0);
    expect(calls).toEqual([{ prefix: '/home/u/.lou', version: 'v0.2.0' }]);
    expect(out.join('\n')).toContain('Upgrading Lou from 0.1.0 to 0.2.0');
    expect(out.join('\n')).toContain('Upgrade complete.');
  });

  it('resolves the latest version when no target is given', async () => {
    const out: string[] = [];
    const code = await runUpgrade(
      undefined,
      makeContext({ out: (line: string) => out.push(line) }),
    );
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('Upgrade complete.');
  });

  it('fails when the latest version cannot be resolved', async () => {
    const out: string[] = [];
    const code = await runUpgrade(
      undefined,
      makeContext({
        out: (line: string) => out.push(line),
        latest: () => Promise.resolve(undefined),
      }),
    );
    expect(code).toBe(1);
    expect(out.join('\n')).toContain('Could not determine the latest Lou version');
  });

  it('prints guidance in dev mode without running the installer', async () => {
    const out: string[] = [];
    const runner: InstallerRunner = () => Promise.reject(new Error('must not run'));
    const code = await runUpgrade(
      undefined,
      makeContext({
        detect: () => ({ managed: false }),
        out: (line: string) => out.push(line),
        runner,
      }),
    );
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('not managed');
  });

  it('prints a reinstall hint on Windows without running the installer', async () => {
    const out: string[] = [];
    const runner: InstallerRunner = () => Promise.reject(new Error('must not run'));
    const code = await runUpgrade(
      undefined,
      makeContext({ platform: 'win32', out: (line: string) => out.push(line), runner }),
    );
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('Windows');
  });

  it('reports a runner failure', async () => {
    const out: string[] = [];
    const runner: InstallerRunner = () => Promise.resolve({ ok: false });
    const code = await runUpgrade(
      undefined,
      makeContext({ out: (line: string) => out.push(line), runner }),
    );
    expect(code).toBe(1);
    expect(out.join('\n')).toContain('Upgrade failed');
  });
});

describe('createGhLatestFetcher', () => {
  it('exposes the fetcher factory and repo constant used across upgrade', () => {
    expect(typeof createGhLatestFetcher).toBe('function');
    expect(LOU_REPO).toBe('Tiavina-Andriamamivony/lou-agents-orchestrator');
  });
});

describe('createShellInstallerRunner', () => {
  it('exposes a runner factory and a version normalizer', () => {
    expect(typeof createShellInstallerRunner).toBe('function');
    expect(normalizeVersion('v0.2.0')).toBe('0.2.0');
    expect(normalizeVersion('0.2.0')).toBe('0.2.0');
  });
});

describe('maybeNotifyUpgrade', () => {
  it('skips JSON output', async () => {
    let called = false;
    const latest = () => {
      called = true;
      return Promise.resolve('v0.2.0');
    };
    await maybeNotifyUpgrade(makeNotice({ json: true, latest }));
    expect(called).toBe(false);
  });

  it('skips non-interactive sessions', async () => {
    let called = false;
    const latest = () => {
      called = true;
      return Promise.resolve('v0.2.0');
    };
    await maybeNotifyUpgrade(makeNotice({ interactive: false, latest }));
    expect(called).toBe(false);
  });

  it('skips CI runs', async () => {
    let called = false;
    const latest = () => {
      called = true;
      return Promise.resolve('v0.2.0');
    };
    await maybeNotifyUpgrade(makeNotice({ isCi: true, latest }));
    expect(called).toBe(false);
  });

  it('skips dev checkouts', async () => {
    let called = false;
    const latest = () => {
      called = true;
      return Promise.resolve('v0.2.0');
    };
    await maybeNotifyUpgrade(makeNotice({ detect: () => ({ managed: false }), latest }));
    expect(called).toBe(false);
  });

  it('skips when checked recently', async () => {
    let called = false;
    const out: string[] = [];
    const latest = () => {
      called = true;
      return Promise.resolve('v0.2.0');
    };
    await maybeNotifyUpgrade(
      makeNotice({
        now: 1_000_000,
        readTimestamp: () => 999_000,
        latest,
        out: (line: string) => out.push(line),
      }),
    );
    expect(called).toBe(false);
    expect(out).toEqual([]);
  });

  it('prints a notice for a stale check with a newer version and records the check time', async () => {
    const out: string[] = [];
    const stamps: Array<[string, number]> = [];
    await maybeNotifyUpgrade(
      makeNotice({
        readTimestamp: () => undefined,
        writeTimestamp: (prefix: string, ts: number) => stamps.push([prefix, ts]),
        out: (line: string) => out.push(line),
        now: 1_000_000,
      }),
    );
    expect(stamps).toEqual([['/home/u/.lou', 1_000_000]]);
    expect(out.join('\n')).toContain('A new version of Lou is available (0.2.0)');
    expect(out.join('\n')).toContain('lou upgrade');
  });

  it('stays silent when the latest version matches the current one', async () => {
    const out: string[] = [];
    await maybeNotifyUpgrade(
      makeNotice({
        latest: () => Promise.resolve('v0.1.0'),
        out: (line: string) => out.push(line),
      }),
    );
    expect(out).toEqual([]);
  });

  it('stays silent when the version lookup fails', async () => {
    const out: string[] = [];
    await maybeNotifyUpgrade(
      makeNotice({
        latest: () => Promise.resolve(undefined),
        out: (line: string) => out.push(line),
      }),
    );
    expect(out).toEqual([]);
  });
});
