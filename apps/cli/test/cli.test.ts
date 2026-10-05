import { describe, expect, it } from 'vitest';
import { runCli } from '../src/cli';
import type { DoctorProbes } from '../src/doctor/doctor-command';
import { parseInitJsonFlag } from '../src/init/run-init';
import type { RunsSnapshot, RunsStore } from '../src/runs/runs-list';
import type { ConstitutionWriter } from '../src/constitution/constitution-command';
import type { OpenCodeInstaller } from '../src/ux/opencode-installer';
import { createMemoryReader } from './memory-reader';

interface Collector {
  readonly out: string[];
  readonly err: string[];
}

function createCollector(): Collector {
  return { out: [], err: [] };
}

function fakeWriter(exists: boolean): ConstitutionWriter {
  return {
    load: () => Promise.resolve({ exists, articles: [], path: '/proj/.add/constitution.md' }),
    save: (articles) => Promise.resolve(`/proj/.add/constitution.md (${articles.length})`),
  };
}

function storeOf(snapshot: RunsSnapshot): RunsStore {
  return { snapshot: () => snapshot };
}

function missingOpenCode(): OpenCodeInstaller {
  return {
    detect(): Promise<boolean> {
      return Promise.resolve(false);
    },
    install(): Promise<boolean> {
      return Promise.resolve(true);
    },
  };
}

describe('runCli', () => {
  it('runs init and prints the onboarding report', async () => {
    const collector = createCollector();
    const code = await runCli(['init'], {
      reader: createMemoryReader({ 'package.json': '{}' }),
      cwd: '',
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(0);
    expect(collector.err).toEqual([]);
    expect(collector.out.join('\n')).toContain('Project successfully onboarded.');
  });

  it('runs init --json and prints parseable, stable JSON', async () => {
    const collector = createCollector();
    const code = await runCli(['init', '--json'], {
      reader: createMemoryReader({ 'package.json': '{}' }),
      cwd: '',
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(0);
    expect(collector.err).toEqual([]);
    const parsed = JSON.parse(collector.out.join('\n')) as {
      readonly packageManager: string | null;
      readonly gitRepository: boolean;
      readonly commitConventions: readonly string[];
      readonly docs: readonly string[];
      readonly ci: boolean;
      readonly constitution: boolean;
    };
    expect(parsed).toEqual({
      packageManager: null,
      gitRepository: false,
      commitConventions: [],
      docs: [],
      ci: false,
      constitution: false,
    });
  });

  it('rejects unknown init flags and stray arguments', async () => {
    const collector = createCollector();
    const code = await runCli(['init', '--json', 'extra'], {
      reader: createMemoryReader({}),
      cwd: '',
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(1);
    expect(collector.out).toEqual([]);
    expect(collector.err.join('\n')).toContain('Usage: lou init');
  });

  it('runs doctor and prints the checks', async () => {
    const collector = createCollector();
    const doctorProbes: DoctorProbes = {
      node: () => Promise.resolve({ label: 'Node runtime', ok: true, detail: 'v24.18.0' }),
      pnpm: () => Promise.resolve({ label: 'pnpm', ok: true, detail: '10.9.0' }),
      gitHubCli: () => Promise.resolve({ label: 'GitHub CLI', ok: true, detail: 'authenticated' }),
      agentRuntime: (name) => Promise.resolve({ label: name, ok: true, detail: '' }),
      gitRepository: () => Promise.resolve({ label: 'Git repository', ok: true, detail: '' }),
    };
    const code = await runCli(['doctor'], {
      reader: createMemoryReader({}),
      cwd: '/work',
      doctorProbes,
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(0);
    expect(collector.err).toEqual([]);
    expect(collector.out.join('\n')).toContain('5/5 checks passed.');
  });

  it('exits 1 from doctor when a prerequisite is missing', async () => {
    const collector = createCollector();
    const doctorProbes: DoctorProbes = {
      node: () => Promise.resolve({ label: 'Node runtime', ok: true, detail: 'v24.18.0' }),
      pnpm: () => Promise.resolve({ label: 'pnpm', ok: true, detail: '10.9.0' }),
      gitHubCli: () =>
        Promise.resolve({ label: 'GitHub CLI', ok: false, detail: 'not authenticated' }),
      agentRuntime: (name) => Promise.resolve({ label: name, ok: true, detail: '' }),
      gitRepository: () => Promise.resolve({ label: 'Git repository', ok: true, detail: '' }),
    };
    const code = await runCli(['doctor', 'extra'], {
      reader: createMemoryReader({}),
      cwd: '/work',
      doctorProbes,
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(1);
    expect(collector.err.join('\n')).toContain('Usage: lou doctor');
  });

  it('probes the runtime named by --runtime', async () => {
    const collector = createCollector();
    const seen: string[] = [];
    const doctorProbes: DoctorProbes = {
      node: () => Promise.resolve({ label: 'Node runtime', ok: true, detail: 'v24.18.0' }),
      pnpm: () => Promise.resolve({ label: 'pnpm', ok: true, detail: '10.9.0' }),
      gitHubCli: () => Promise.resolve({ label: 'GitHub CLI', ok: true, detail: 'ok' }),
      agentRuntime: (name) => {
        seen.push(name);
        return Promise.resolve({ label: name, ok: true, detail: '' });
      },
      gitRepository: () => Promise.resolve({ label: 'Git repository', ok: true, detail: '' }),
    };
    const code = await runCli(['doctor', '--runtime', 'claude'], {
      reader: createMemoryReader({}),
      cwd: '/work',
      doctorProbes,
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(0);
    expect(seen).toEqual(['claude']);
  });

  it('rejects an unknown --runtime in doctor', async () => {
    const collector = createCollector();
    const code = await runCli(['doctor', '--runtime', 'codex'], {
      reader: createMemoryReader({}),
      cwd: '/work',
      doctorProbes: {
        node: () => Promise.resolve({ label: 'Node runtime', ok: true, detail: '' }),
        pnpm: () => Promise.resolve({ label: 'pnpm', ok: true, detail: '' }),
        gitHubCli: () => Promise.resolve({ label: 'GitHub CLI', ok: true, detail: '' }),
        agentRuntime: (name) => Promise.resolve({ label: name, ok: true, detail: '' }),
        gitRepository: () => Promise.resolve({ label: 'Git repository', ok: true, detail: '' }),
      },
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(1);
    expect(collector.err.join('\n')).toContain('--runtime opencode|claude');
  });

  it('bails out of run when opencode is missing and the session is not interactive', async () => {
    const collector = createCollector();
    const code = await runCli(['run', '7'], {
      reader: createMemoryReader({}),
      cwd: '/work',
      openCodeInstaller: missingOpenCode(),
      interactive: false,
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(1);
    expect(collector.out.join('\n')).toContain('opencode is required');
    expect(collector.out.join('\n')).not.toContain('Cannot fetch issue');
  });

  it('does not send a claude run through the opencode gate', async () => {
    const collector = createCollector();
    const code = await runCli(['run', '7', '--runtime', 'claude'], {
      reader: createMemoryReader({}),
      cwd: '/work',
      openCodeInstaller: missingOpenCode(),
      interactive: false,
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(collector.out.join('\n')).not.toContain('opencode is required');
    expect(code).toBe(1);
  });

  it('bails out of run when the user declines the opencode install', async () => {
    const collector = createCollector();
    const code = await runCli(['run', '7'], {
      reader: createMemoryReader({}),
      cwd: '/work',
      openCodeInstaller: missingOpenCode(),
      interactive: true,
      ask: () => Promise.resolve('n'),
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(1);
    expect(collector.out.join('\n')).toContain('Skipping install');
    expect(collector.out.join('\n')).not.toContain('Cannot fetch issue');
  });

  it('installs opencode during init when the user agrees', async () => {
    const collector = createCollector();
    const code = await runCli(['init'], {
      reader: createMemoryReader({ 'package.json': '{}' }),
      cwd: '',
      openCodeInstaller: missingOpenCode(),
      interactive: true,
      ask: () => Promise.resolve('y'),
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(0);
    expect(collector.out.join('\n')).toContain('Project successfully onboarded.');
    expect(collector.out.join('\n')).toContain('opencode installed');
  });

  it('keeps init --json machine-readable when opencode is missing', async () => {
    const collector = createCollector();
    const code = await runCli(['init', '--json'], {
      reader: createMemoryReader({ 'package.json': '{}' }),
      cwd: '',
      openCodeInstaller: missingOpenCode(),
      interactive: true,
      ask: () => Promise.resolve('y'),
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(0);
    const text = collector.out.join('\n');
    expect(text).not.toContain('opencode');
    expect(JSON.parse(text)).toEqual({
      packageManager: null,
      gitRepository: false,
      commitConventions: [],
      docs: [],
      ci: false,
      constitution: false,
    });
  });

  it('rejects an unknown command', async () => {
    const collector = createCollector();
    const code = await runCli(['nope'], {
      reader: createMemoryReader({}),
      cwd: '',
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(1);
    expect(collector.out).toEqual([]);
    expect(collector.err.join('\n')).toContain('Unknown command: nope');
  });

  it('lists the runs from the runs store', async () => {
    const collector = createCollector();
    const code = await runCli(['runs'], {
      reader: createMemoryReader({}),
      runsStore: storeOf({ summaries: [], inProgress: [7] }),
      cwd: '',
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(0);
    expect(collector.out).toEqual(['#7  in progress']);
    expect(collector.err).toEqual([]);
  });

  it('creates the constitution through the cli', async () => {
    const collector = createCollector();
    const code = await runCli(['constitution', '--init'], {
      reader: createMemoryReader({}),
      constitutionWriter: fakeWriter(false),
      cwd: '',
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(0);
    expect(collector.out.join('\n')).toMatch(/Created/);
  });

  it('refuses --force without --init', async () => {
    const collector = createCollector();
    const code = await runCli(['constitution', '--force'], {
      reader: createMemoryReader({}),
      constitutionWriter: fakeWriter(false),
      cwd: '',
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(1);
    expect(collector.err.join('\n')).toMatch(/Usage: lou constitution/);
  });

  it('rejects an unknown constitution flag', async () => {
    const collector = createCollector();
    const code = await runCli(['constitution', '--wat'], {
      reader: createMemoryReader({}),
      constitutionWriter: fakeWriter(false),
      cwd: '',
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(1);
  });

  it('lists runs as JSON with --json', async () => {
    const collector = createCollector();
    const code = await runCli(['runs', '--json'], {
      reader: createMemoryReader({}),
      runsStore: storeOf({ summaries: [], inProgress: [7] }),
      cwd: '',
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(collector.out.join('\n')) as readonly { issueNumber: number }[];
    expect(parsed).toEqual([{ issueNumber: 7, status: 'running' }]);
  });

  it('rejects unknown runs arguments', async () => {
    const collector = createCollector();
    const code = await runCli(['runs', 'bogus'], {
      reader: createMemoryReader({}),
      runsStore: storeOf({ summaries: [], inProgress: [] }),
      cwd: '',
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(1);
    expect(collector.err.join('\n')).toContain('Usage: lou runs [--json]');
  });

  it('prints usage when no command is given', async () => {
    const collector = createCollector();
    const code = await runCli([], {
      reader: createMemoryReader({}),
      cwd: '',
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(1);
    expect(collector.err.join('\n')).toContain('Usage: lou <command>');
  });

  it('prints the lou version', async () => {
    const collector = createCollector();
    const code = await runCli(['--version'], {
      reader: createMemoryReader({}),
      cwd: '',
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(0);
    expect(collector.out.join('\n')).toMatch(/^lou \d+\.\d+\.\d+(?:\.\d+)?$/);
  });

  it('supports the -v version alias', async () => {
    const collector = createCollector();
    const code = await runCli(['-v'], {
      reader: createMemoryReader({}),
      cwd: '',
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(0);
    expect(collector.out.join('\n')).toMatch(/^lou \d+\.\d+\.\d+(?:\.\d+)?$/);
  });

  it.each(['--help', '-h', 'help'])('prints the usage on %s', async (flag) => {
    const collector = createCollector();
    const code = await runCli([flag], {
      reader: createMemoryReader({}),
      cwd: '',
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
    });

    expect(code).toBe(0);
    expect(collector.out.join('\n')).toContain('Usage: lou <command>');
    expect(collector.err).toEqual([]);
  });

  it('upgrades a managed install through the injected runner', async () => {
    const collector = createCollector();
    let ran = false;
    const code = await runCli(['upgrade', 'v0.2.0'], {
      reader: createMemoryReader({}),
      cwd: '',
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
      upgrade: {
        scriptPath: '/home/u/.lou/current/apps/cli/src/cli.ts',
        currentVersion: '0.1.0',
        platform: 'linux',
        nodeBin: '/usr/bin/node',
        repo: 'Tiavina-Andriamamivony/lou-agents-orchestrator',
        latest: () => Promise.resolve('v0.2.0'),
        runner: () => {
          ran = true;
          return Promise.resolve({ ok: true });
        },
        detect: () => ({ managed: true, prefix: '/home/u/.lou' }),
      },
    });

    expect(code).toBe(0);
    expect(ran).toBe(true);
    expect(collector.out.join('\n')).toContain('Upgrade complete.');
  });

  it('reports a dev checkout without running anything', async () => {
    const collector = createCollector();
    let ran = false;
    const code = await runCli(['upgrade'], {
      reader: createMemoryReader({}),
      cwd: '',
      out: (line: string) => collector.out.push(line),
      err: (line: string) => collector.err.push(line),
      upgrade: {
        scriptPath: '/home/u/lou/apps/cli/src/cli.ts',
        currentVersion: '0.1.0',
        platform: 'linux',
        nodeBin: '/usr/bin/node',
        repo: 'Tiavina-Andriamamivony/lou-agents-orchestrator',
        latest: () => Promise.resolve('v0.2.0'),
        runner: () => {
          ran = true;
          return Promise.resolve({ ok: true });
        },
        detect: () => ({ managed: false }),
      },
    });

    expect(code).toBe(0);
    expect(ran).toBe(false);
    expect(collector.out.join('\n')).toContain('not managed');
  });
});

describe('parseInitJsonFlag', () => {
  it('is false with no flag', () => {
    expect(parseInitJsonFlag(['init'])).toBe(false);
  });

  it('is true with --json', () => {
    expect(parseInitJsonFlag(['init', '--json'])).toBe(true);
  });

  it('rejects unknown or extra arguments', () => {
    expect(parseInitJsonFlag(['init', '--json', 'extra'])).toBeNull();
    expect(parseInitJsonFlag(['init', '--plain'])).toBeNull();
  });
});
