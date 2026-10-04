import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface OpenCodeInstaller {
  detect(): Promise<boolean>;
  install(): Promise<boolean>;
}

const INSTALL_COMMAND = 'curl -fsSL https://opencode.ai/install | bash';
const VERSION_COMMAND = 'opencode --version';
const DEFAULT_BIN = join(homedir(), '.opencode', 'bin', 'opencode');

export function createLocalOpenCodeInstaller(): OpenCodeInstaller {
  return {
    detect(): Promise<boolean> {
      return Promise.resolve(isOnPath() || existsSync(DEFAULT_BIN));
    },
    install(): Promise<boolean> {
      const outcome = runShell(INSTALL_COMMAND, 'inherit');
      return Promise.resolve(outcome && (isOnPath() || existsSync(DEFAULT_BIN)));
    },
  };
}

export function openCodeInstallCommand(): string {
  return INSTALL_COMMAND;
}

function isOnPath(): boolean {
  return runShell(VERSION_COMMAND, 'ignore');
}

function runShell(command: string, stdio: 'ignore' | 'inherit'): boolean {
  try {
    const result = spawnSync(command, {
      shell: true,
      stdio: stdio === 'inherit' ? 'inherit' : ['ignore', 'ignore', 'ignore'],
    });
    return result.error === undefined && result.status === 0;
  } catch {
    return false;
  }
}
