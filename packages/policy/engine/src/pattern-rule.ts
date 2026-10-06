import type { Action } from './action.ts';
import type { Decision } from './decision.ts';
import type { PolicyRule } from './rule.ts';

export class PatternRule implements PolicyRule {
  readonly id: string;
  readonly reason: string;
  private readonly verdict: Decision;
  private readonly pattern: RegExp;

  constructor(id: string, verdict: Decision, reason: string, pattern: RegExp) {
    this.id = id;
    this.verdict = verdict;
    this.reason = reason;
    this.pattern = pattern;
  }

  evaluate(action: Action): Decision | null {
    return this.pattern.test(action.target) ? this.verdict : null;
  }
}
