import { describe, expect, it } from 'vitest';
import { Workflow } from '../src/workflow.ts';
import { PHASES } from '../src/phases.ts';
import { COMMANDS } from '../src/commands.ts';
import {
  HAPPY_PATH_COMMANDS,
  UP_TO_REVIEW_COMMANDS,
  UP_TO_TEST_VERIFICATION_COMMANDS,
} from './fixtures.ts';

function redTestsHandover(): Workflow {
  const workflow = new Workflow();
  for (const command of UP_TO_TEST_VERIFICATION_COMMANDS) {
    workflow.apply(command);
  }
  workflow.apply(COMMANDS.TESTS_FAIL);
  return workflow;
}

describe('Workflow', () => {
  it('starts at TICKET_RECEIVED', () => {
    const workflow = new Workflow();

    expect(workflow.phase).toBe(PHASES.TICKET_RECEIVED);
    expect(workflow.isTerminal).toBe(false);
    expect(workflow.transitionHistory).toEqual([PHASES.TICKET_RECEIVED]);
  });

  it('walks the happy path from ticket to preprod', () => {
    const workflow = new Workflow();

    for (const command of HAPPY_PATH_COMMANDS) {
      expect(workflow.apply(command).status).toBe('accepted');
    }

    expect(workflow.phase).toBe(PHASES.PREPROD);
    expect(workflow.isTerminal).toBe(true);
  });

  it('rejects an unknown command without moving', () => {
    const workflow = new Workflow();

    const result = workflow.apply(COMMANDS.PR_MERGED);

    expect(result.status).toBe('rejected');
    expect(result.phase).toBe(PHASES.TICKET_RECEIVED);
    expect(result.reason).toContain('no transition');
  });

  it('accepts plan only after questions are finished', () => {
    const workflow = new Workflow();

    workflow.apply(COMMANDS.START_DISCOVERY);
    workflow.apply(COMMANDS.FINISH_DISCOVERY);

    const result = workflow.apply(COMMANDS.APPROVE_PLAN);

    expect(result.status).toBe('rejected');
    expect(workflow.phase).toBe(PHASES.QUESTIONS);
  });

  it('requires a proposed plan before it can be approved', () => {
    const workflow = new Workflow();
    workflow.apply(COMMANDS.START_DISCOVERY);
    workflow.apply(COMMANDS.FINISH_DISCOVERY);
    workflow.apply(COMMANDS.FINISH_QUESTIONS);

    const early = workflow.apply(COMMANDS.APPROVE_PLAN);

    expect(early.status).toBe('rejected');
    expect(workflow.phase).toBe(PHASES.PLAN);

    workflow.apply(COMMANDS.PLAN_PROPOSED);
    expect(workflow.phase).toBe(PHASES.PLAN_APPROVAL);

    const approved = workflow.apply(COMMANDS.APPROVE_PLAN);

    expect(approved.status).toBe('accepted');
    expect(workflow.phase).toBe(PHASES.TEST_DESIGN);
  });

  it('sends a rejected plan back to planning and bounds the loop', () => {
    const workflow = new Workflow();
    workflow.apply(COMMANDS.START_DISCOVERY);
    workflow.apply(COMMANDS.FINISH_DISCOVERY);
    workflow.apply(COMMANDS.FINISH_QUESTIONS);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      workflow.apply(COMMANDS.PLAN_PROPOSED);
      workflow.apply(COMMANDS.REJECT_PLAN);
      expect(workflow.phase).toBe(PHASES.PLAN);
    }
    workflow.apply(COMMANDS.PLAN_PROPOSED);

    const result = workflow.apply(COMMANDS.REJECT_PLAN);

    expect(result.status).toBe('intervention-required');
    expect(workflow.phase).toBe(PHASES.HUMAN_INTERVENTION_REQUIRED);
    expect(workflow.isTerminal).toBe(true);
  });

  it('requires human approval after review before the PR', () => {
    const workflow = new Workflow();
    for (const command of UP_TO_REVIEW_COMMANDS) {
      workflow.apply(command);
    }
    workflow.apply(COMMANDS.REVIEW_APPROVED);
    expect(workflow.phase).toBe(PHASES.REVIEW_APPROVAL);

    const early = workflow.apply(COMMANDS.PR_MERGED);

    expect(early.status).toBe('rejected');

    workflow.apply(COMMANDS.APPROVE_REVIEW);
    expect(workflow.phase).toBe(PHASES.PR_CREATED);
  });

  it('sends a rejected review back to implementation', () => {
    const workflow = new Workflow();
    for (const command of UP_TO_REVIEW_COMMANDS) {
      workflow.apply(command);
    }
    workflow.apply(COMMANDS.REVIEW_APPROVED);
    expect(workflow.phase).toBe(PHASES.REVIEW_APPROVAL);

    const result = workflow.apply(COMMANDS.REJECT_REVIEW);

    expect(result.status).toBe('accepted');
    expect(workflow.phase).toBe(PHASES.IMPLEMENTATION);
  });

  it('rejects commands once the workflow is terminal', () => {
    const workflow = new Workflow();

    for (const command of HAPPY_PATH_COMMANDS) {
      workflow.apply(command);
    }

    const result = workflow.apply(COMMANDS.START_DISCOVERY);

    expect(result.status).toBe('rejected');
    expect(result.reason).toContain('terminal');
  });

  it('hands red tests to the developer instead of rewriting them', () => {
    const workflow = new Workflow();
    for (const command of UP_TO_TEST_VERIFICATION_COMMANDS) {
      workflow.apply(command);
    }

    const result = workflow.apply(COMMANDS.TESTS_FAIL);

    expect(result.status).toBe('accepted');
    expect(workflow.phase).toBe(PHASES.IMPLEMENTATION);
  });

  it('gives the developer the whole budget after red tests hand over', () => {
    const workflow = redTestsHandover();
    const attempts: string[] = [];

    for (let attempt = 0; attempt < 6; attempt += 1) {
      workflow.apply(COMMANDS.IMPLEMENTATION_COMPLETE);
      attempts.push(workflow.apply(COMMANDS.VERIFICATION_FAIL).status);
    }

    expect(attempts.filter((status) => status === 'accepted')).toHaveLength(5);
    expect(attempts.at(-1)).toBe('intervention-required');
  });

  it('escapes the implementation loop after the iteration budget is exhausted', () => {
    const workflow = redTestsHandover();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      workflow.apply(COMMANDS.IMPLEMENTATION_COMPLETE);
      expect(workflow.apply(COMMANDS.VERIFICATION_FAIL).status).toBe('accepted');
    }
    workflow.apply(COMMANDS.IMPLEMENTATION_COMPLETE);

    const result = workflow.apply(COMMANDS.VERIFICATION_FAIL);

    expect(result.status).toBe('intervention-required');
    expect(workflow.phase).toBe(PHASES.HUMAN_INTERVENTION_REQUIRED);
    expect(workflow.isTerminal).toBe(true);
  });

  it('escapes the review loop after the iteration budget is exhausted', () => {
    const workflow = new Workflow();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      for (const command of UP_TO_REVIEW_COMMANDS) {
        workflow.apply(command);
      }
      expect(workflow.apply(COMMANDS.CHANGES_REQUESTED).status).toBe('accepted');
    }
    for (const command of UP_TO_REVIEW_COMMANDS) {
      workflow.apply(command);
    }

    const result = workflow.apply(COMMANDS.CHANGES_REQUESTED);

    expect(result.status).toBe('intervention-required');
    expect(workflow.phase).toBe(PHASES.HUMAN_INTERVENTION_REQUIRED);
  });

  it('records the full transition history', () => {
    const workflow = new Workflow();
    workflow.apply(COMMANDS.START_DISCOVERY);
    workflow.apply(COMMANDS.FINISH_DISCOVERY);
    workflow.apply(COMMANDS.FINISH_QUESTIONS);

    expect(workflow.transitionHistory).toEqual([
      PHASES.TICKET_RECEIVED,
      PHASES.DISCOVERY,
      PHASES.QUESTIONS,
      PHASES.PLAN,
    ]);
  });
});
