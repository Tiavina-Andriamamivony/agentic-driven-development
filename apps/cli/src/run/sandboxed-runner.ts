import { DefaultPolicyEngine, louRunRules } from '@lou/policy-engine';
import { SandboxedCommandRunner } from '@lou/sandbox';
import type { CommandRunner } from '@lou/command-runner';

export function createSandboxedRunner(
  workspace: string,
  role: string,
  inner?: CommandRunner,
): CommandRunner {
  return new SandboxedCommandRunner({
    root: workspace,
    role,
    policyEngine: new DefaultPolicyEngine(louRunRules()),
    ...(inner !== undefined ? { runner: inner } : {}),
  });
}
