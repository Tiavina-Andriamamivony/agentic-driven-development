import { describe, expect, it } from 'vitest';
import { TRANSITION_RULES, findTransitionRule } from '../src/transitions.ts';
import { PHASES } from '../src/phases.ts';
import { COMMANDS } from '../src/commands.ts';

describe('transition table', () => {
  it('is deterministic for every declared transition', () => {
    for (const rule of TRANSITION_RULES) {
      const resolved = findTransitionRule(rule.from, rule.command);

      expect(resolved).toBeDefined();
      expect(resolved?.to).toBe(rule.to);
      expect(resolved?.consumesIteration).toBe(rule.consumesIteration);
    }
  });

  it('routes every outcome of the main flow without consuming iterations', () => {
    const forward = TRANSITION_RULES.filter((rule) => !rule.consumesIteration);

    expect(forward).toHaveLength(14);
    expect(forward.every((rule) => rule.loopRegion === null)).toBe(true);
  });

  it('declares bounded loops only where the flow can regress', () => {
    const loops = TRANSITION_RULES.filter((rule) => rule.consumesIteration);

    expect(loops).toHaveLength(4);
    for (const loop of loops) {
      expect(loop.loopRegion).not.toBeNull();
      expect(loop.loopRegion).toBe(loop.to);
    }
  });

  it('hands red tests to the developer without spending an iteration', () => {
    const rule = findTransitionRule(PHASES.TEST_VERIFICATION, COMMANDS.TESTS_FAIL);

    expect(rule?.to).toBe(PHASES.IMPLEMENTATION);
    expect(rule?.consumesIteration).toBe(false);
    expect(rule?.loopRegion).toBeNull();
  });

  it('never sends the test writer back to its own phase once tests exist', () => {
    const backToWriter = TRANSITION_RULES.filter(
      (rule) => rule.to === PHASES.TEST_IMPLEMENTATION && rule.from !== PHASES.TEST_DESIGN,
    );

    expect(backToWriter).toHaveLength(0);
  });

  it('never transitions out of an intervention phase', () => {
    const outgoing = TRANSITION_RULES.filter(
      (rule) => rule.from === PHASES.HUMAN_INTERVENTION_REQUIRED,
    );

    expect(outgoing).toHaveLength(0);
  });
});
