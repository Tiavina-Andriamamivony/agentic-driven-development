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

async function collect(
  probes: DoctorProbes,
  cwd: string,
  runtime: AgentRuntimeName,
): Promise<readonly Subject[]> {
  const [gh, agent, git] = await Promise.all([
    probes.gitHubCli(),
    probes.agentRuntime(runtime),
    probes.gitRepository(),
  ]);
  return [
    { check: gh, remedy: GH_REMEDY },
    { check: agent, remedy: runtimeRemedy(runtime) },
    { check: git, remedy: GIT_REMEDY },
    { check: testScriptCheck(cwd), remedy: testScriptRemedy(cwd) },
  ];
}

export async function runPreflight(
  probes: DoctorProbes,
  cwd: string,
  runtime: AgentRuntimeName,
): Promise<PreflightOutcome> {
  const subjects = await collect(probes, cwd, runtime);
  const findings = subjects
    .filter((subject) => !subject.check.ok)
    .map((subject) => ({
      label: subject.check.label,
      detail: subject.check.detail,
      remedy: subject.remedy,
    }));
  return { ok: findings.length === 0, findings };
}
