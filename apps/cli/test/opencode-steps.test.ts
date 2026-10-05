import type { PlanDraft, UnderstandInput } from '@lou/orchestrator';
import { describe, expect, it } from 'vitest';
import { createOpenCodeSteps } from '../src/run/opencode-steps';
import { createFakeRuntime, resultFor } from './fakes';

const ISSUE = {
  number: 1,
  title: 'Add reset password',
  body: 'User can reset the password.',
  state: 'OPEN',
} as const;

const PLAN: PlanDraft = {
  title: 'feat: reset password',
  branchName: 'feature/reset-password',
  commitMessage: 'feat(auth): add password reset',
  steps: ['add the reset endpoint'],
};

const UNDERSTAND_STDOUT = [
  'SUMMARY: implement the reset password flow',
  'QUESTION: which auth provider is used?',
  'QUESTION: should the link expire?',
  'PLAN_TITLE: feat: reset password',
  'PLAN_BRANCH: feature/reset-password',
  'PLAN_COMMIT: feat(auth): add password reset',
  'PLAN_STEP: add the reset endpoint',
  'PLAN_STEP: add the reset ui',
].join('\n');

function understandInput(): UnderstandInput {
  return { runId: 'run-1', issue: ISSUE, workspace: '/work', feedback: ['make it secure'] };
}

describe('createOpenCodeSteps', () => {
  it('parses the planner output into an understanding', async () => {
    const runtime = createFakeRuntime([resultFor(UNDERSTAND_STDOUT)]);
    const steps = createOpenCodeSteps({ runtime, workspace: '/work' });

    const understanding = await steps.understand(understandInput());

    expect(understanding.summary).toBe('implement the reset password flow');
    expect(understanding.questions).toEqual([
      'which auth provider is used?',
      'should the link expire?',
    ]);
    expect(understanding.plan).toEqual({
      title: 'feat: reset password',
      branchName: 'feature/reset-password',
      commitMessage: 'feat(auth): add password reset',
      steps: ['add the reset endpoint', 'add the reset ui'],
    });
  });

  it('sends the planner prompt with the ticket and the human feedback', async () => {
    const runtime = createFakeRuntime([resultFor(UNDERSTAND_STDOUT)]);
    const steps = createOpenCodeSteps({ runtime, workspace: '/work' });

    await steps.understand(understandInput());

    const input = runtime.runs[0];
    expect(input?.agent).toBe('planner');
    expect(input?.workspace).toBe('/work');
    expect(input?.instructions).toContain('PLAN_TITLE: <conventional commits title>');
    expect(input?.instructions).toContain('make it secure');
  });

  it('rejects a plan that lacks the required fields', async () => {
    const runtime = createFakeRuntime([resultFor('SUMMARY: incomplete')]);
    const steps = createOpenCodeSteps({ runtime, workspace: '/work' });

    await expect(steps.understand(understandInput())).rejects.toThrow('PLAN_TITLE');
  });

  it('parses the designed test plan', async () => {
    const runtime = createFakeRuntime([
      resultFor('TEST_PLAN: valid token\nTEST_PLAN: invalid token'),
    ]);
    const steps = createOpenCodeSteps({ runtime, workspace: '/work' });

    const design = await steps.designTests(PLAN);

    expect(design.testPlan).toBe('valid token\ninvalid token');
    expect(runtime.runs[0]?.agent).toBe('test-designer');
  });

  it('parses the written tests change note', async () => {
    const runtime = createFakeRuntime([
      resultFor('CHANGED: test/reset.spec.ts\nSUMMARY: tests written'),
    ]);
    const steps = createOpenCodeSteps({ runtime, workspace: '/work' });

    const note = await steps.writeTests(PLAN, 'the reset endpoint clears the session');

    expect(note.changedFiles).toEqual(['test/reset.spec.ts']);
    expect(note.summary).toBe('tests written');
    expect(runtime.runs[0]?.agent).toBe('test-writer');
  });

  it('gives the test writer the acceptance tests designed for it', async () => {
    const runtime = createFakeRuntime([resultFor('CHANGED: test/reset.spec.ts\nSUMMARY: ok')]);
    const steps = createOpenCodeSteps({ runtime, workspace: '/work' });

    await steps.writeTests(PLAN, 'the reset endpoint clears the session');

    expect(runtime.runs[0]?.instructions).toContain('the reset endpoint clears the session');
  });

  it('authorises the test writer to build a missing harness', async () => {
    const runtime = createFakeRuntime([resultFor('CHANGED: vitest.config.ts\nSUMMARY: ok')]);
    const steps = createOpenCodeSteps({ runtime, workspace: '/work' });

    await steps.writeTests(PLAN, '');

    expect(runtime.runs[0]?.instructions).toContain('add a "test" script');
  });

  it('drops a CHANGED line that is a placeholder rather than a path', async () => {
    const runtime = createFakeRuntime([resultFor('CHANGED: none\nSUMMARY: nothing to do')]);
    const steps = createOpenCodeSteps({ runtime, workspace: '/work' });

    const note = await steps.writeTests(PLAN, '');

    expect(note.changedFiles).toEqual([]);
  });

  it('keeps the real paths next to a placeholder', async () => {
    const runtime = createFakeRuntime([resultFor('CHANGED: none\nCHANGED: math.ts\nSUMMARY: ok')]);
    const steps = createOpenCodeSteps({ runtime, workspace: '/work' });

    const note = await steps.writeTests(PLAN, '');

    expect(note.changedFiles).toEqual(['math.ts']);
  });

  it('drops a CHANGED line that opens with a placeholder and continues in prose', async () => {
    const runtime = createFakeRuntime([
      resultFor(
        'CHANGED: none — commit #1 (72933b0) already implemented the pnpm foundation; verified green, no edits required\nSUMMARY: nothing to do',
      ),
    ]);
    const steps = createOpenCodeSteps({ runtime, workspace: '/work' });

    const note = await steps.writeTests(PLAN, '');

    expect(note.changedFiles).toEqual([]);
  });

  it('drops a parenthesised placeholder that trails off into a sentence', async () => {
    const runtime = createFakeRuntime([
      resultFor('CHANGED: (none — verified existing commit 72933b0)\nSUMMARY: done'),
    ]);
    const steps = createOpenCodeSteps({ runtime, workspace: '/work' });

    const note = await steps.writeTests(PLAN, '');

    expect(note.changedFiles).toEqual([]);
  });

  it('splits a CHANGED line that lists several paths at once', async () => {
    const runtime = createFakeRuntime([
      resultFor('CHANGED: package.json, pnpm-lock.yaml, README.md\nSUMMARY: ok'),
    ]);
    const steps = createOpenCodeSteps({ runtime, workspace: '/work' });

    const note = await steps.writeTests(PLAN, '');

    expect(note.changedFiles).toEqual(['package.json', 'pnpm-lock.yaml', 'README.md']);
  });

  it('strips the state annotation an agent appends to a path', async () => {
    const runtime = createFakeRuntime([
      resultFor('CHANGED: package.json (modified), package-lock.json (deleted)\nSUMMARY: ok'),
    ]);
    const steps = createOpenCodeSteps({ runtime, workspace: '/work' });

    const note = await steps.writeTests(PLAN, '');

    expect(note.changedFiles).toEqual(['package.json', 'package-lock.json']);
  });

  it('keeps the real paths of a sentence that also announces no change', async () => {
    const runtime = createFakeRuntime([
      resultFor('CHANGED: none — except src/math.ts which I added\nSUMMARY: ok'),
    ]);
    const steps = createOpenCodeSteps({ runtime, workspace: '/work' });

    const note = await steps.writeTests(PLAN, '');

    expect(note.changedFiles).toEqual([]);
  });

  it('keeps a path that contains a dot and a dash', async () => {
    const runtime = createFakeRuntime([resultFor('CHANGED: src/my-module.v2.ts\nSUMMARY: ok')]);
    const steps = createOpenCodeSteps({ runtime, workspace: '/work' });

    const note = await steps.writeTests(PLAN, '');

    expect(note.changedFiles).toEqual(['src/my-module.v2.ts']);
  });

  it('parses the implemented change note', async () => {
    const runtime = createFakeRuntime([
      resultFor('CHANGED: src/reset.ts\nCHANGED: src/reset.spec.ts\nSUMMARY: implemented'),
    ]);
    const steps = createOpenCodeSteps({ runtime, workspace: '/work' });

    const note = await steps.implement(PLAN);

    expect(note.changedFiles).toEqual(['src/reset.ts', 'src/reset.spec.ts']);
    expect(note.summary).toBe('implemented');
    expect(runtime.runs[0]?.agent).toBe('developer');
  });

  it('defaults the summary and the test plan when absent', async () => {
    const runtime = createFakeRuntime([resultFor('')]);
    const steps = createOpenCodeSteps({ runtime, workspace: '/work' });

    const design = await steps.designTests(PLAN);
    const note = await steps.implement(PLAN);

    expect(design.testPlan).toBe('(no test plan)');
    expect(note.summary).toBe('(no summary)');
    expect(note.changedFiles).toEqual([]);
  });
});
