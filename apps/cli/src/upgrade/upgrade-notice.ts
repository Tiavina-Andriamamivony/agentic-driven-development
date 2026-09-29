import type { InstallInfo } from './install-detection.ts';
import type { LatestVersion } from './latest-release.ts';
import { normalizeVersion } from './upgrade-command.ts';
import type { Styler } from '../ux/style.ts';

export interface UpgradeNoticeOptions {
  readonly currentVersion: string;
  readonly repo: string;
  readonly scriptPath: string;
  readonly interactive: boolean;
  readonly json: boolean;
  readonly isCi: boolean;
  readonly now: number;
  readonly checkEveryMs: number;
  readonly detect: (scriptPath: string) => InstallInfo;
  readonly latest: LatestVersion;
  readonly readTimestamp: (prefix: string) => number | undefined;
  readonly writeTimestamp: (prefix: string, timestamp: number) => void;
  readonly out: (line: string) => void;
  readonly style: Styler;
}

export const DEFAULT_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function maybeNotifyUpgrade(options: UpgradeNoticeOptions): Promise<void> {
  if (options.json || !options.interactive || options.isCi) {
    return;
  }
  const info = options.detect(options.scriptPath);
  if (!info.managed) {
    return;
  }
  const last = options.readTimestamp(info.prefix);
  if (checkedRecently(last, options.now, options.checkEveryMs)) {
    return;
  }
  options.writeTimestamp(info.prefix, options.now);
  const latest = await options.latest(options.repo);
  if (latest === undefined) {
    return;
  }
  if (normalizeVersion(latest) === normalizeVersion(options.currentVersion)) {
    return;
  }
  options.out(
    `${options.style.yellow('A new version of Lou is available')} (${normalizeVersion(latest)}). Run ${options.style.cyan('lou upgrade')} to update.`,
  );
}

function checkedRecently(last: number | undefined, now: number, every: number): boolean {
  return last !== undefined && now - last < every;
}
