import { detectTestScript } from '@lou/test-runner';
import type { TestScriptPresence } from '@lou/test-runner';
import type { DoctorCheck, DoctorProbes } from '../doctor/doctor-command.ts';
import type { AgentRuntimeName } from './agent-runtime-factory.ts';

const PREFLIGHT_SCRIPT = 'test';

export type PreflightSeverity = 'blocking' | 'advisory';

export interface PreflightFinding {
  readonly label: string;
  readonly detail: string;
  readonly remedy: string;
  readonly severity: PreflightSeverity;
}

interface PreflightOutcome {
  readonly ok: boolean;
  readonly findings: readonly PreflightFinding[];
}

interface Subject {
  readonly check: DoctorCheck;
  readonly remedy: string;
  readonly severity: PreflightSeverity;
}

const GH_REMEDY = 'Run `gh auth login`, then retry.';
const GIT_REMEDY = 'Run `git init` in this folder, or cd into an existing repository.';
const HARNESS_REMEDY =
  'Nothing to fix by hand: the Lou test agent picks the runner, adds the script and the config, then writes the first tests.';
const VERIFY_REMEDY = 'Fix the test script so it actually runs and proves the build.';

function testScriptCheck(presence: TestScriptPresence): DoctorCheck {
  return {
    label: 'Test script',
    ok: presence === 'declared',
    detail:
      presence === 'declared'
        ? `"${PREFLIGHT_SCRIPT}" is declared`
        : `no "${PREFLIGHT_SCRIPT}" script in package.json`,
  };
}

function harnessSubject(presence: TestScriptPresence): Subject | null {
  if (presence === 'declared') {
    return null;
  }
  return {
    check: {
      label: 'Test harness',
      ok: false,
      detail: `${testScriptCheck(presence).detail} — there is no harness yet`,
    },
    remedy: HARNESS_REMEDY,
    severity: 'advisory',
  };
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
): Promise<Subject> {
  try {
    const result = await verifier.run({ cwd, timeoutMs: PREFLIGHT_TIMEOUT_MS });
    return {
      check: {
        label: 'Test verification',
        ok: result.passed,
        detail: result.passed ? 'the test script proves something' : (result.reason ?? 'no proof'),
      },
      remedy: VERIFY_REMEDY,
      severity: 'blocking',
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'the test command failed';
    return {
      check: { label: 'Test verification', ok: false, detail },
      remedy: VERIFY_REMEDY,
      severity: 'blocking',
    };
  }
}

async function collect(
  probes: DoctorProbes,
  cwd: string,
  runtime: AgentRuntimeName,
  verifier: VerificationRunner,
): Promise<readonly Subject[]> {
  const presence = detectTestScript(cwd, PREFLIGHT_SCRIPT);
  const [gh, agent, git] = await Promise.all([
    probes.gitHubCli(),
    probes.agentRuntime(runtime),
    probes.gitRepository(),
  ]);
  const harness = harnessSubject(presence);
  const verification =
    presence === 'declared' ? await verifyTestsProveSomething(cwd, verifier) : null;
  const subjects: Subject[] = [
    { check: gh, remedy: GH_REMEDY, severity: 'blocking' },
    { check: agent, remedy: runtimeRemedy(runtime), severity: 'blocking' },
    { check: git, remedy: GIT_REMEDY, severity: 'blocking' },
  ];
  if (harness !== null) {
    subjects.push(harness);
  }
  if (verification !== null) {
    subjects.push(verification);
  }
  return subjects;
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
      severity: subject.severity,
    }));
  return { ok: !findings.some((finding) => finding.severity === 'blocking'), findings };
}
