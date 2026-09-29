import { spawnSync } from 'node:child_process';
import type { InstallInfo } from './install-detection.ts';
import type { LatestVersion } from './latest-release.ts';
import type { Styler } from '../ux/style.ts';

export function normalizeVersion(tag: string): string {
  return tag.replace(/^v/, '');
}

export interface InstallerRunOptions {
  readonly prefix: string;
  readonly version: string;
  readonly nodeBin: string;
  readonly repo: string;
}

export interface InstallerRun {
  readonly ok: boolean;
}

export type InstallerRunner = (options: InstallerRunOptions) => Promise<InstallerRun>;

export interface UpgradeContext {
  readonly scriptPath: string;
  readonly currentVersion: string;
  readonly platform: string;
  readonly nodeBin: string;
  readonly repo: string;
  readonly latest: LatestVersion;
  readonly runner: InstallerRunner;
  readonly detect: (scriptPath: string) => InstallInfo;
  readonly out: (line: string) => void;
  readonly style: Styler;
}

export type UpgradeDependencies = Omit<UpgradeContext, 'out' | 'style'>;

interface ParsedUpgrade {
  readonly help: boolean;
  readonly version?: string;
}

export function parseUpgradeArguments(argv: readonly string[]): ParsedUpgrade | null {
  if (argv.length === 0) {
    return { help: false };
  }
  if (argv.length > 1) {
    return null;
  }
  const arg = argv[0];
  if (arg === undefined) {
    return null;
  }
  if (arg === '--help' || arg === '-h' || arg === 'help') {
    return { help: true };
  }
  if (arg.startsWith('-')) {
    return null;
  }
  return { help: false, version: arg };
}

export function createShellInstallerRunner(): InstallerRunner {
  return (options: InstallerRunOptions): Promise<InstallerRun> => {
    const url = `https://raw.githubusercontent.com/${options.repo}/main/apps/cli/install/install.sh`;
    const result = spawnSync(`curl -fsSL "${url}" | bash`, {
      shell: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        LOU_PREFIX: options.prefix,
        LOU_VERSION: options.version,
        NODE_BIN: options.nodeBin,
        LOU_REPO: options.repo,
      },
    });
    return Promise.resolve({ ok: result.error === undefined && result.status === 0 });
  };
}

const devModeMessage =
  'This Lou install is not managed by the one-line installer. Update it from your checkout (git pull) or re-run the installer.';
const latestUnknownMessage =
  'Could not determine the latest Lou version. Check your network or pass a version explicitly.';
const windowsMessage =
  'Automatic upgrades are not supported on Windows yet. Re-run the PowerShell installer from https://opencode.ai/docs.';

export async function runUpgrade(target: string | undefined, env: UpgradeContext): Promise<number> {
  const info = env.detect(env.scriptPath);
  if (!info.managed) {
    env.out(env.style.yellow(devModeMessage));
    return 0;
  }
  const requested = target !== undefined ? target : await env.latest(env.repo);
  if (requested === undefined) {
    env.out(env.style.red(latestUnknownMessage));
    return 1;
  }
  if (normalizeVersion(requested) === normalizeVersion(env.currentVersion)) {
    env.out(`Lou ${normalizeVersion(env.currentVersion)} is already up to date.`);
    return 0;
  }
  if (env.platform === 'win32') {
    env.out(env.style.yellow(windowsMessage));
    return 0;
  }
  return applyUpgrade(requested, info.prefix, env);
}

async function applyUpgrade(
  requested: string,
  prefix: string,
  env: UpgradeContext,
): Promise<number> {
  env.out(
    `Upgrading Lou from ${normalizeVersion(env.currentVersion)} to ${normalizeVersion(requested)} ...`,
  );
  const result = await env.runner({
    prefix,
    version: requested,
    nodeBin: env.nodeBin,
    repo: env.repo,
  });
  if (!result.ok) {
    env.out(env.style.red('Upgrade failed. Re-run `lou upgrade` after fixing the reported step.'));
    return 1;
  }
  env.out(env.style.green('Upgrade complete.'));
  return 0;
}
