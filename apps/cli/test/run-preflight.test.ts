import type { DoctorCheck, DoctorProbes } from '../src/doctor/doctor-command.ts';
import { runPreflight } from '../src/run/run-preflight.ts';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PASS: DoctorCheck = { label: 'ok', ok: true, detail: 'fine' };

function failing(label: string, detail: string): () => Promise<DoctorCheck> {
  return () => Promise.resolve({ label, ok: false, detail });
}

function probes(overrides: Partial<DoctorProbes> = {}): DoctorProbes {
  return {
    node: () => Promise.resolve(PASS),
    pnpm: () => Promise.resolve(PASS),
    gitHubCli: () => Promise.resolve(PASS),
    agentRuntime: () => Promise.resolve(PASS),
    gitRepository: () => Promise.resolve(PASS),
    ...overrides,
  };
}

describe('runPreflight', () => {
  it('passes when every prerequisite is ready', async () => {
    const outcome = await runPreflight(probes(), '/proj', 'opencode');

    expect(outcome.ok).toBe(true);
    expect(outcome.findings).toHaveLength(0);
  });

  it('fails with a remedy when gh is not authenticated', async () => {
    const outcome = await runPreflight(
      probes({ gitHubCli: failing('GitHub CLI', 'gh not authenticated') }),
      '/proj',
      'opencode',
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.findings[0]?.remedy).toContain('gh auth login');
  });

  it('fails when the runtime is missing', async () => {
    const outcome = await runPreflight(
      probes({ agentRuntime: failing('opencode', 'opencode not found on PATH') }),
      '/proj',
      'opencode',
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.findings[0]?.remedy).toContain('--runtime');
  });

  it('fails when the folder is not a git work tree', async () => {
    const outcome = await runPreflight(
      probes({ gitRepository: failing('Git repository', 'not inside a git work tree') }),
      '/proj',
      'opencode',
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.findings[0]?.remedy).toContain('git init');
  });

  it('fails when the project has no test script', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'lou-preflight-'));
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { build: 'tsc' } }));

    const outcome = await runPreflight(probes(), cwd, 'opencode');

    expect(outcome.ok).toBe(false);
    expect(outcome.findings[0]?.label).toBe('Test script');
    expect(outcome.findings[0]?.remedy).toContain('"test"');
  });

  it('passes when the project declares a test script', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'lou-preflight-'));
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }));

    const outcome = await runPreflight(probes(), cwd, 'opencode');

    expect(outcome.ok).toBe(true);
  });
});
