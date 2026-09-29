import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface OpenCodeInstaller {
  detect(): Promise<boolean>;
  install(): Promise<boolean>;
}

const INSTALL_COMMAND = 'curl -fsSL https://opencode.ai/install | bash';
const DEFAULT_BIN = join(homedir(), '.opencode', 'bin', 'opencode');

export function createLocalOpenCodeInstaller(): OpenCodeInstaller {
  return {
    detect(): Promise<boolean> {
      return Promise.resolve(isOnPath() || existsSync(DEFAULT_BIN));
    },
    install(): Promise<boolean> {
      const outcome = runShell(INSTALL_COMMAND);
      return Promise.resolve(outcome && (isOnPath() || existsSync(DEFAULT_BIN)));
    },
  };
}

export function openCodeInstallCommand(): string {
  return INSTALL_COMMAND;
}

function isOnPath(): boolean {
  return runShell('opencode --version');
}

function runShell(command: string): boolean {
  try {
    const result = spawnSync(command, {
      shell: true,
      stdio: 'inherit',
    });
    return result.error === undefined && result.status === 0;
  } catch {
    return false;
  }
}
