import { describe, expect, it } from 'vitest';
import { formatDoctorReport, runDoctor } from '../src/doctor/doctor-command';
import type { DoctorProbes } from '../src/doctor/doctor-command';
import { createStyler } from '../src/ux/style';

function okProbes(): DoctorProbes {
  return {
    node: () => Promise.resolve({ label: 'Node runtime', ok: true, detail: 'v24.18.0' }),
    pnpm: () => Promise.resolve({ label: 'pnpm', ok: true, detail: '10.9.0' }),
    gitHubCli: () => Promise.resolve({ label: 'GitHub CLI', ok: true, detail: 'authenticated' }),
    agentRuntime: (name) => Promise.resolve({ label: name, ok: true, detail: `${name} v1.0.0` }),
    gitRepository: () =>
      Promise.resolve({ label: 'Git repository', ok: true, detail: 'inside a git work tree' }),
  };
}

describe('runDoctor', () => {
  it('exits 0 when every check passes', async () => {
    const report = await runDoctor(okProbes());

    expect(report.code).toBe(0);
    expect(report.checks.every((check) => check.ok)).toBe(true);
  });

  it('exits 1 when any check fails', async () => {
    const probes = okProbes();
    probes.gitHubCli = () =>
      Promise.resolve({ label: 'GitHub CLI', ok: false, detail: 'not authenticated' });

    const report = await runDoctor(probes);

    expect(report.code).toBe(1);
    expect(report.checks.filter((check) => check.ok)).toHaveLength(4);
  });
});

describe('formatDoctorReport', () => {
  it('renders one line per check plus the summary', async () => {
    const report = await runDoctor(okProbes());
    const text = formatDoctorReport(report);

    expect(text).toContain('✔  Node runtime — v24.18.0');
    expect(text).toContain('✔  pnpm — 10.9.0');
    expect(text).toContain('✔  GitHub CLI — authenticated');
    expect(text).toContain('✔  opencode — opencode v1.0.0');
    expect(text).toContain('✔  Git repository — inside a git work tree');
    expect(text).toContain('5/5 checks passed.');
  });

  it('renders KO with the reason', async () => {
    const probes = okProbes();
    probes.agentRuntime = (name) =>
      Promise.resolve({ label: name, ok: false, detail: 'not found on PATH' });

    const text = formatDoctorReport(await runDoctor(probes));

    expect(text).toContain('✖  opencode — not found on PATH');
    expect(text).toContain('4/5 checks passed.');
  });

  it('colors the checks when a styler is enabled', async () => {
    const report = await runDoctor(okProbes());

    const text = formatDoctorReport(report, createStyler(true));

    expect(text).toContain('\x1b[32m✔\x1b[0m  Node runtime — v24.18.0');
  });

  it('suggests an install when opencode is missing', async () => {
    const probes = okProbes();
    probes.agentRuntime = (name) =>
      Promise.resolve({ label: name, ok: false, detail: 'not found on PATH' });

    const text = formatDoctorReport(await runDoctor(probes));

    expect(text).toContain('Run `lou init` in a terminal to install it.');
  });

  it('points at the claude install when the claude runtime is missing', async () => {
    const probes = okProbes();
    probes.agentRuntime = (name) =>
      Promise.resolve({ label: name, ok: false, detail: 'not found on PATH' });

    const text = formatDoctorReport(await runDoctor(probes, 'claude'));

    expect(text).toContain('✖  claude — not found on PATH');
    expect(text).toContain('Claude Code');
    expect(text).not.toContain('Run `lou init` in a terminal to install it.');
  });
});

describe('runDoctor with a selected runtime', () => {
  it('probes the runtime the run will use', async () => {
    const seen: string[] = [];
    const probes = okProbes();
    probes.agentRuntime = (name) => {
      seen.push(name);
      return Promise.resolve({ label: name, ok: true, detail: 'ready' });
    };

    await runDoctor(probes, 'claude');

    expect(seen).toEqual(['claude']);
  });

  it('defaults to opencode', async () => {
    const seen: string[] = [];
    const probes = okProbes();
    probes.agentRuntime = (name) => {
      seen.push(name);
      return Promise.resolve({ label: name, ok: true, detail: 'ready' });
    };

    await runDoctor(probes);

    expect(seen).toEqual(['opencode']);
  });
});
