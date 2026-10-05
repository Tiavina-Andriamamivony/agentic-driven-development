import { spawnSync } from 'node:child_process';
import type { SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import type { AgentRuntimeName } from '../run/agent-runtime-factory.ts';
import type { DoctorCheck, DoctorProbes } from './doctor-command.ts';

interface CommandOutcome {
  readonly ok: boolean;
  readonly stdout: string;
}

const BASE_OPTIONS: SpawnSyncOptionsWithStringEncoding = {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
};

export function createRealDoctorProbes(cwd: string): DoctorProbes {
  return {
    node: () => Promise.resolve(nodeProbe()),
    pnpm: () =>
      Promise.resolve(commandCheck('pnpm', ['--version'], 'pnpm', 'pnpm not found on PATH')),
    gitHubCli: () =>
      Promise.resolve(
        commandCheck('gh', ['auth', 'status'], 'GitHub CLI', 'gh not found or not authenticated'),
      ),
    agentRuntime: (name) => Promise.resolve(runtimeProbe(name)),
    gitRepository: () => Promise.resolve(gitRepositoryProbe(cwd)),
  };
}

function runtimeProbe(name: AgentRuntimeName): DoctorCheck {
  return commandCheck(name, ['--version'], name, `${name} not found on PATH`);
}

function nodeProbe(): DoctorCheck {
  const version = runCommand(process.execPath, ['--version']);
  if (!version.ok) {
    return { label: 'Node runtime', ok: false, detail: 'node not found on PATH' };
  }
  const parsed = parseNodeVersion(version.stdout);
  if (!parsed.ok) {
    return {
      label: 'Node runtime',
      ok: false,
      detail: `v${parsed.value} is below the required 22.7`,
    };
  }
  const probe = runCommand(process.execPath, [
    '--experimental-strip-types',
    '-e',
    'console.log("ok")',
  ]);
  if (!probe.ok) {
    return {
      label: 'Node runtime',
      ok: false,
      detail: '--experimental-strip-types probe failed',
    };
  }
  return { label: 'Node runtime', ok: true, detail: `v${parsed.value}` };
}

function commandCheck(
  command: string,
  args: readonly string[],
  label: string,
  failDetail: string,
): DoctorCheck {
  const outcome = runCommand(command, args);
  return {
    label,
    ok: outcome.ok,
    detail: outcome.ok ? firstLine(outcome.stdout) : failDetail,
  };
}

function gitRepositoryProbe(cwd: string): DoctorCheck {
  const outcome = runCommand('git', ['rev-parse', '--is-inside-work-tree'], cwd);
  const ok = outcome.ok && outcome.stdout.trim() === 'true';
  return {
    label: 'Git repository',
    ok,
    detail: ok ? 'inside a git work tree' : 'not inside a git work tree',
  };
}

function runCommand(command: string, args: readonly string[], cwd?: string): CommandOutcome {
  try {
    const options = cwd === undefined ? BASE_OPTIONS : { ...BASE_OPTIONS, cwd };
    const result = spawnSync(command, [...args], options);
    if (result.error !== undefined) {
      return { ok: false, stdout: '' };
    }
    return { ok: result.status === 0, stdout: result.stdout };
  } catch {
    return { ok: false, stdout: '' };
  }
}

function firstLine(stdout: string): string {
  return stdout.trim().split('\n')[0] ?? '';
}

function parseNodeVersion(stdout: string): { readonly ok: boolean; readonly value: string } {
  const value = stdout.trim().replace(/^v/, '');
  const [major, minor] = value.split('.').map(Number);
  const ok = (major ?? 0) > 22 || ((major ?? 0) === 22 && (minor ?? 0) >= 7);
  return { ok, value };
}
