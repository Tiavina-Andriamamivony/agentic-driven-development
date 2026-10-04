import type { TransitionRule } from './transition-type.ts';
import type { Phase, Command } from './types.ts';
import { PHASES } from './phases.ts';
import { COMMANDS } from './commands.ts';

export const TRANSITION_RULES: readonly TransitionRule[] = [
  {
    from: PHASES.TICKET_RECEIVED,
    command: COMMANDS.START_DISCOVERY,
    to: PHASES.DISCOVERY,
    consumesIteration: false,
    loopRegion: null,
  },
  {
    from: PHASES.DISCOVERY,
    command: COMMANDS.FINISH_DISCOVERY,
    to: PHASES.QUESTIONS,
    consumesIteration: false,
    loopRegion: null,
  },
  {
    from: PHASES.QUESTIONS,
    command: COMMANDS.FINISH_QUESTIONS,
    to: PHASES.PLAN,
    consumesIteration: false,
    loopRegion: null,
  },
  {
    from: PHASES.PLAN,
    command: COMMANDS.PLAN_PROPOSED,
    to: PHASES.PLAN_APPROVAL,
    consumesIteration: false,
    loopRegion: null,
  },
  {
    from: PHASES.PLAN_APPROVAL,
    command: COMMANDS.APPROVE_PLAN,
    to: PHASES.TEST_DESIGN,
    consumesIteration: false,
    loopRegion: null,
  },
  {
    from: PHASES.PLAN_APPROVAL,
    command: COMMANDS.REJECT_PLAN,
    to: PHASES.PLAN,
    consumesIteration: true,
    loopRegion: PHASES.PLAN,
  },
  {
    from: PHASES.TEST_DESIGN,
    command: COMMANDS.TESTS_DESIGNED,
    to: PHASES.TEST_IMPLEMENTATION,
    consumesIteration: false,
    loopRegion: null,
  },
  {
    from: PHASES.TEST_IMPLEMENTATION,
    command: COMMANDS.TESTS_COMPLETE,
    to: PHASES.TEST_VERIFICATION,
    consumesIteration: false,
    loopRegion: null,
  },
  {
    from: PHASES.TEST_VERIFICATION,
    command: COMMANDS.TESTS_PASS,
    to: PHASES.IMPLEMENTATION,
    consumesIteration: false,
    loopRegion: null,
  },
  {
    from: PHASES.TEST_VERIFICATION,
    command: COMMANDS.TESTS_FAIL,
    to: PHASES.IMPLEMENTATION,
    consumesIteration: false,
    loopRegion: null,
  },
  {
    from: PHASES.IMPLEMENTATION,
    command: COMMANDS.IMPLEMENTATION_COMPLETE,
    to: PHASES.VERIFICATION,
    consumesIteration: false,
    loopRegion: null,
  },
  {
    from: PHASES.VERIFICATION,
    command: COMMANDS.VERIFICATION_PASS,
    to: PHASES.REVIEW,
    consumesIteration: false,
    loopRegion: null,
  },
  {
    from: PHASES.VERIFICATION,
    command: COMMANDS.VERIFICATION_FAIL,
    to: PHASES.IMPLEMENTATION,
    consumesIteration: true,
    loopRegion: PHASES.IMPLEMENTATION,
  },
  {
    from: PHASES.REVIEW,
    command: COMMANDS.REVIEW_APPROVED,
    to: PHASES.REVIEW_APPROVAL,
    consumesIteration: false,
    loopRegion: null,
  },
  {
    from: PHASES.REVIEW,
    command: COMMANDS.CHANGES_REQUESTED,
    to: PHASES.IMPLEMENTATION,
    consumesIteration: true,
    loopRegion: PHASES.IMPLEMENTATION,
  },
  {
    from: PHASES.REVIEW_APPROVAL,
    command: COMMANDS.APPROVE_REVIEW,
    to: PHASES.PR_CREATED,
    consumesIteration: false,
    loopRegion: null,
  },
  {
    from: PHASES.REVIEW_APPROVAL,
    command: COMMANDS.REJECT_REVIEW,
    to: PHASES.IMPLEMENTATION,
    consumesIteration: true,
    loopRegion: PHASES.IMPLEMENTATION,
  },
  {
    from: PHASES.PR_CREATED,
    command: COMMANDS.PR_MERGED,
    to: PHASES.PREPROD,
    consumesIteration: false,
    loopRegion: null,
  },
];

const TRANSITION_INDEX = buildTransitionIndex(TRANSITION_RULES);

export function findTransitionRule(from: Phase, command: Command): TransitionRule | undefined {
  return TRANSITION_INDEX.get(from)?.get(command);
}

function buildTransitionIndex(
  rules: readonly TransitionRule[],
): ReadonlyMap<Phase, ReadonlyMap<Command, TransitionRule>> {
  const index = new Map<Phase, Map<Command, TransitionRule>>();
  for (const rule of rules) {
    const byCommand = index.get(rule.from) ?? new Map<Command, TransitionRule>();
    byCommand.set(rule.command, rule);
    index.set(rule.from, byCommand);
  }
  return index;
}
