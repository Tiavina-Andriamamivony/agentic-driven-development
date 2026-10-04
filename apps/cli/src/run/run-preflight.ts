import { detectTestScript } from '@lou/test-runner';
import type { DoctorCheck, DoctorProbes } from '../doctor/doctor-command.ts';
import type { AgentRuntimeName } from './agent-runtime-factory.ts';

const PREFLIGHT_SCRIPT = 'test';

interface PreflightFinding {
  readonly label: string;
  readonly detail: string;
  readonly remedy: string;
}

interface PreflightOutcome {
  readonly ok: boolean;
  readonly findings: readonly PreflightFinding[];
}

interface Subject {
  readonly check: DoctorCheck;
  readonly remedy: string;
}

const GH_REMEDY = 'Run `gh auth login`, then retry.';
const GIT_REMEDY = 'Run `git init` in this folder, or cd into an existing repository.';

function testScriptCheck(cwd: string): DoctorCheck {
  const presence = detectTestScript(cwd, PREFLIGHT_SCRIPT);
  return {
    label: 'Test script',
    ok: presence !== 'missing',
    detail:
      presence === 'missing'
        ? `no "${PREFLIGHT_SCRIPT}" script in package.json`
        : `"${PREFLIGHT_SCRIPT}" is declared`,
  };
}

function testScriptRemedy(cwd: string): string {
  return `Add a "${PREFLIGHT_SCRIPT}" script to package.json in ${cwd} — Lou verifies by running it.`;
}

function runtimeRemedy(runtime: AgentRuntimeName): string {
  return `Install \`${runtime}\` (see https://opencode.ai/docs) or pick another runtime with --runtime.`;
}

export const PREFLIGHT_TIMEOUT_MS = 10 * 60 * 1000;

export interface VerificationRunner {
  run(options: { cwd: string; timeoutMs?: number }): Promise<{ passed: boolean; reason?: string }>;
}

async function verifyTestsProveSomething(
  cwd: string,
  verifier: VerificationRunner,
): Promise<DoctorCheck> {
  try {
    const result = await verifier.run({ cwd, timeoutMs: PREFLIGHT_TIMEOUT_MS });
    if (result.passed) {
      return {
        label: 'Test verification',
        ok: true,
        detail: 'the test script proves something',
      };
    }
    return {
      label: 'Test verification',
      ok: false,
      detail: result.reason ?? 'the test script did not prove anything',
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'the test command failed';
    return { label: 'Test verification', ok: false, detail };
  }
}

async function collect(
  probes: DoctorProbes,
  cwd: string,
  runtime: AgentRuntimeName,
  verifier: VerificationRunner,
): Promise<readonly Subject[]> {
  const [gh, agent, git] = await Promise.all([
    probes.gitHubCli(),
    probes.agentRuntime(runtime),
    probes.gitRepository(),
  ]);
  const verification = await verifyTestsProveSomething(cwd, verifier);
  return [
    { check: gh, remedy: GH_REMEDY },
    { check: agent, remedy: runtimeRemedy(runtime) },
    { check: git, remedy: GIT_REMEDY },
    { check: testScriptCheck(cwd), remedy: testScriptRemedy(cwd) },
    {
      check: verification,
      remedy: `Fix the test script in ${cwd} so it actually runs and proves the build.`,
    },
  ];
}

export async function runPreflight(
  probes: DoctorProbes,
  cwd: string,
  runtime: AgentRuntimeName,
  verifier: VerificationRunner,
): Promise<PreflightOutcome> {
  const subjects = await collect(probes, cwd, runtime, verifier);
  const findings = subjects
    .filter((subject) => !subject.check.ok)
    .map((subject) => ({
      label: subject.check.label,
      detail: subject.check.detail,
      remedy: subject.remedy,
    }));
  return { ok: findings.length === 0, findings };
}
