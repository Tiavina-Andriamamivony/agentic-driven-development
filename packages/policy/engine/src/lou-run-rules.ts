import type { RoleCapability } from './capability-rule.ts';
import { capabilityRule } from './capability-rule.ts';
import { destructiveRules } from './destructive-rules.ts';
import { configRule, productionRule, riskRules, secretRule } from './human-rules.ts';
import type { PolicyRule } from './rule.ts';

export const GIT_ROLE = 'git';
export const TESTS_ROLE = 'tests';
export const GITHUB_ROLE = 'github';
export const AGENT_ROLE = 'agent';

const LOU_CAPABILITIES: readonly RoleCapability[] = [
  { role: GIT_ROLE, kind: 'shell', operations: ['git '] },
  { role: TESTS_ROLE, kind: 'shell', operations: ['pnpm test', 'npm test', 'yarn test'] },
  { role: GITHUB_ROLE, kind: 'shell', operations: ['gh '] },
  { role: AGENT_ROLE, kind: 'shell', operations: ['opencode ', 'claude '] },
];

/**
 * Destructive rules must precede the allow lists, or a role permitted to `git push` would
 * also be permitted to `--force`. The allow lists precede the risk rules because pushing and
 * opening pull requests are steps the orchestrator already gates on two human approvals.
 */
export function louRunRules(): readonly PolicyRule[] {
  return [
    ...destructiveRules(),
    productionRule(),
    secretRule(),
    configRule(),
    capabilityRule(LOU_CAPABILITIES),
    ...riskRules(),
  ];
}
