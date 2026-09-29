import type { OpenCodeInstaller } from './opencode-installer.ts';
import { openCodeInstallCommand } from './opencode-installer.ts';
import type { Styler } from './style.ts';

type OpenCodeStatus = 'present' | 'installed' | 'declined' | 'failed';

export interface EnsureOpenCodeOptions {
  readonly installer: OpenCodeInstaller;
  readonly ask: (question: string) => Promise<string>;
  readonly interactive: boolean;
  readonly out: (line: string) => void;
  readonly style: Styler;
  readonly platform: string;
}

export async function ensureOpenCode(options: EnsureOpenCodeOptions): Promise<OpenCodeStatus> {
  if (await options.installer.detect()) {
    return 'present';
  }
  options.out(options.style.yellow('opencode is required but was not found on your PATH.'));
  if (!options.interactive) {
    options.out('Install it manually (https://opencode.ai/docs) or run `lou doctor`.');
    return 'declined';
  }
  const answer = await options.ask('Install the official opencode binary now? [y/N] ');
  if (!isYes(answer)) {
    options.out('Skipping install. You can run `lou doctor` or `lou init` later to retry.');
    return 'declined';
  }
  if (options.platform === 'win32') {
    options.out(
      'Automatic install is not supported on Windows yet — install manually (https://opencode.ai/docs).',
    );
    return 'declined';
  }
  options.out(`Running: ${options.style.cyan(openCodeInstallCommand())}`);
  if (!(await options.installer.install())) {
    options.out(
      options.style.red('Installation failed. Check your network and retry with `lou init`.'),
    );
    return 'failed';
  }
  options.out(options.style.green('opencode installed and verified.'));
  return 'installed';
}

function isYes(answer: string): boolean {
  return /^y(?:es)?$/i.test(answer.trim());
}
