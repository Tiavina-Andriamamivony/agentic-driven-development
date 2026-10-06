import type { Action } from './action.ts';
import type { PolicyDecision } from './decision.ts';
import type { PolicyEngine } from './policy-engine.ts';
import type { PolicyRule } from './rule.ts';

const FAIL_CLOSED_RULE = 'default-fail-closed';
const FAIL_CLOSED_REASON = 'no rule matched; failing closed';

export class DefaultPolicyEngine implements PolicyEngine {
  private readonly rules: readonly PolicyRule[];

  constructor(rules: readonly PolicyRule[]) {
    this.rules = rules;
  }

  evaluate(action: Action): Promise<PolicyDecision> {
    return new Promise<PolicyDecision>((resolve) => {
      const invalid = invalidReason(action);
      if (invalid !== null) {
        throw new Error(invalid);
      }
      for (const rule of this.rules) {
        const decision = rule.evaluate(action);
        if (decision !== null) {
          resolve({ decision, ruleId: rule.id, reason: rule.reason });
          return;
        }
      }
      resolve({ decision: 'DENY', ruleId: FAIL_CLOSED_RULE, reason: FAIL_CLOSED_REASON });
    });
  }
}

function invalidReason(action: Action): string | null {
  if (action.role.length === 0) {
    return 'role must not be empty';
  }
  if (action.target.length === 0) {
    return 'target must not be empty';
  }
  return null;
}
