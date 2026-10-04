import type { DoctorCheck, DoctorProbes } from '../src/doctor/doctor-command.ts';
import { runPreflight, PREFLIGHT_TIMEOUT_MS } from '../src/run/run-preflight.ts';
import type { VerificationRunner } from '../src/run/run-preflight.ts';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PASS: DoctorCheck = { label: 'ok', ok: true, detail: 'fine' };

function failing(label: string, detail: string): () => Promise<DoctorCheck> {
  return () => Promise.resolve({ label, ok: false, detail });
}

function verifier(result: { passed: boolean; reason?: string }): VerificationRunner {
  return { run: () => Promise.resolve(result) };
}

const PROVING = verifier({ passed: true });

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

function blocking(outcome: { readonly findings: readonly { severity: string }[] }): readonly {
  readonly severity: string;
}[] {
  return outcome.findings.filter((finding) => finding.severity === 'blocking');
}

describe('runPreflight', () => {
  it('passes when every prerequisite is ready', async () => {
    const outcome = await runPreflight(probes(), '/proj', 'opencode', PROVING);

    expect(outcome.ok).toBe(true);
    expect(blocking(outcome)).toHaveLength(0);
  });

  it('fails with a remedy when gh is not authenticated', async () => {
    const outcome = await runPreflight(
      probes({ gitHubCli: failing('GitHub CLI', 'gh not authenticated') }),
      '/proj',
      'opencode',
      PROVING,
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.findings[0]?.remedy).toContain('gh auth login');
  });

  it('fails when the runtime is missing', async () => {
    const outcome = await runPreflight(
      probes({ agentRuntime: failing('opencode', 'opencode not found on PATH') }),
      '/proj',
      'opencode',
      PROVING,
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.findings[0]?.remedy).toContain('--runtime');
  });

  it('fails when the folder is not a git work tree', async () => {
    const outcome = await runPreflight(
      probes({ gitRepository: failing('Git repository', 'not inside a git work tree') }),
      '/proj',
      'opencode',
      PROVING,
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.findings[0]?.remedy).toContain('git init');
  });

  it('fails when the test script proves nothing', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'lou-preflight-'));
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'true' } }));

    const outcome = await runPreflight(
      probes(),
      cwd,
      'opencode',
      verifier({ passed: false, reason: 'the test command ran no test (vitest)' }),
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.findings.map((f) => f.label)).toContain('Test verification');
  });

  it('lets a project without a test harness start, flagging it as advisory', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'lou-preflight-'));
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { build: 'tsc' } }));

    const outcome = await runPreflight(probes(), cwd, 'opencode', PROVING);

    expect(outcome.ok).toBe(true);
    expect(outcome.findings).toHaveLength(1);
    expect(outcome.findings[0]?.severity).toBe('advisory');
    expect(outcome.findings[0]?.label).toBe('Test harness');
  });

  it('tells the human the test agent owns the missing harness', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'lou-preflight-'));
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { build: 'tsc' } }));

    const outcome = await runPreflight(probes(), cwd, 'opencode', PROVING);

    expect(outcome.findings[0]?.remedy).toContain('test agent');
  });

  it('lets a project with no manifest at all start', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'lou-preflight-'));

    const outcome = await runPreflight(probes(), cwd, 'opencode', PROVING);

    expect(outcome.ok).toBe(true);
    expect(outcome.findings[0]?.severity).toBe('advisory');
  });

  it('never spends a test run when there is no harness to verify', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'lou-preflight-'));
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { build: 'tsc' } }));
    let invocations = 0;

    await runPreflight(probes(), cwd, 'opencode', {
      run: () => {
        invocations += 1;
        return Promise.resolve({ passed: true });
      },
    });

    expect(invocations).toBe(0);
  });

  it('keeps a declared but failing harness blocking', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'lou-preflight-'));
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }));

    const outcome = await runPreflight(
      probes(),
      cwd,
      'opencode',
      verifier({ passed: false, reason: 'the test command exited 1' }),
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.findings[0]?.severity).toBe('blocking');
    expect(outcome.findings[0]?.label).toBe('Test verification');
  });

  it('passes when the project declares a test script', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'lou-preflight-'));
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }));

    const outcome = await runPreflight(probes(), cwd, 'opencode', PROVING);

    expect(outcome.ok).toBe(true);
  });

  it('bounds the verification so a hanging test command cannot stall the run', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'lou-preflight-'));
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }));
    let seen: number | undefined;

    const outcome = await runPreflight(probes(), cwd, 'opencode', {
      run: (options) => {
        seen = options.timeoutMs;
        return Promise.resolve({ passed: true });
      },
    });

    expect(seen).toBe(PREFLIGHT_TIMEOUT_MS);
    expect(outcome.ok).toBe(true);
  });

  it('fails when the test command cannot finish inside the bound', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'lou-preflight-'));
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }));

    const outcome = await runPreflight(probes(), cwd, 'opencode', {
      run: () => Promise.reject(new Error('the test run was interrupted')),
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.findings[0]?.detail).toContain('interrupted');
  });
});
