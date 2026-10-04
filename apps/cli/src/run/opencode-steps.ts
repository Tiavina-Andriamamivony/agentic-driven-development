import type { ActivityHandler, AgentRuntime } from '@lou/agent-runtime';
import type { OutputHandler } from '@lou/command-runner';
import type {
  ChangeNote,
  OrchestratorSteps,
  PlanDraft,
  UnderstandInput,
  Understanding,
} from '@lou/orchestrator';

interface OpenCodeStepsOptions {
  readonly runtime: AgentRuntime;
  readonly workspace: string;
  readonly model?: string;
  readonly modelsByAgent?: Readonly<Record<string, string>>;
  readonly mcp?: Readonly<Record<string, string>>;
  readonly constitution?: string;
  readonly onOutput?: OutputHandler;
  readonly onActivity?: ActivityHandler;
}

interface RunSettings {
  readonly model?: string;
  readonly mcp?: Readonly<Record<string, string>>;
  readonly onOutput?: OutputHandler;
  readonly onActivity?: ActivityHandler;
}

const SUMMARY_PATTERN = /^SUMMARY\s*:\s*(.+)$/im;
const QUESTION_PATTERN = /^QUESTION\s*:\s*(.+)$/im;
const TITLE_PATTERN = /^PLAN_TITLE\s*:\s*(.+)$/im;
const BRANCH_PATTERN = /^PLAN_BRANCH\s*:\s*(.+)$/im;
const COMMIT_PATTERN = /^PLAN_COMMIT\s*:\s*(.+)$/im;
const STEP_PATTERN = /^PLAN_STEP\s*:\s*(.+)$/im;
const TEST_PLAN_PATTERN = /^TEST_PLAN\s*:\s*(.+)$/im;
const CHANGED_PATTERN = /^CHANGED\s*:\s*(.+)$/im;
export function createOpenCodeSteps(options: OpenCodeStepsOptions): OrchestratorSteps {
  const { runtime, workspace, model, modelsByAgent, mcp, onOutput, onActivity } = options;
  const constitution = options.constitution ?? '';
  const modelFor = (agent: string): string | undefined => modelsByAgent?.[agent] ?? model;
  return {
    understand: (input) =>
      understand(
        runtime,
        input,
        constitution,
        settingsFor(modelFor('planner'), mcp, onOutput, onActivity),
      ),
    designTests: (plan) =>
      designTests({
        runtime,
        workspace,
        plan,
        constitution,
        settings: settingsFor(modelFor('test-designer'), mcp, onOutput, onActivity),
      }),
    writeTests: (plan, testPlan) =>
      changeNote({
        runtime,
        workspace,
        plan,
        agent: 'test-writer',
        prompt: buildWriteTestsPrompt,
        constitution,
        ...(testPlan === '' ? {} : { testPlan }),
        settings: settingsFor(modelFor('test-writer'), mcp, onOutput, onActivity),
      }),
    implement: (plan) =>
      changeNote({
        runtime,
        workspace,
        plan,
        agent: 'developer',
        prompt: buildImplementPrompt,
        constitution,
        settings: settingsFor(modelFor('developer'), mcp, onOutput, onActivity),
      }),
  };
}

function settingsFor(
  model: string | undefined,
  mcp: RunSettings['mcp'],
  onOutput: RunSettings['onOutput'],
  onActivity: RunSettings['onActivity'],
): RunSettings {
  return {
    ...(model !== undefined ? { model } : {}),
    ...(mcp !== undefined ? { mcp } : {}),
    ...(onOutput !== undefined ? { onOutput } : {}),
    ...(onActivity !== undefined ? { onActivity } : {}),
  };
}

async function understand(
  runtime: AgentRuntime,
  input: UnderstandInput,
  constitution: string,
  settings: RunSettings,
): Promise<Understanding> {
  const result = await runtime.run({
    runId: input.runId,
    agent: 'planner',
    instructions: buildUnderstandPrompt(input, constitution),
    workspace: input.workspace,
    ...withSettings(settings),
  });
  return parseUnderstanding(result.stdout);
}

async function changeNote(options: {
  readonly runtime: AgentRuntime;
  readonly workspace: string;
  readonly plan: PlanDraft;
  readonly agent: string;
  readonly prompt: PromptBuilder;
  readonly testPlan?: string;
  readonly constitution: string;
  readonly settings: RunSettings;
}): Promise<ChangeNote> {
  const { runtime, workspace, plan, agent, prompt, constitution, settings } = options;
  const result = await runtime.run({
    runId: runIdFor(agent, plan),
    agent,
    instructions: prompt(plan, constitution, options.testPlan),
    workspace,
    ...withSettings(settings),
  });
  return {
    changedFiles: matchAll(result.stdout, CHANGED_PATTERN),
    summary: matchValue(result.stdout, SUMMARY_PATTERN) ?? '(no summary)',
  };
}

async function designTests(options: {
  readonly runtime: AgentRuntime;
  readonly workspace: string;
  readonly plan: PlanDraft;
  readonly constitution: string;
  readonly settings: RunSettings;
}): Promise<{ readonly testPlan: string }> {
  const result = await options.runtime.run({
    runId: runIdFor('test-designer', options.plan),
    agent: 'test-designer',
    instructions: buildDesignTestsPrompt(options.plan, options.constitution),
    workspace: options.workspace,
    ...withSettings(options.settings),
  });
  return {
    testPlan: matchAll(result.stdout, TEST_PLAN_PATTERN).join('\n') || '(no test plan)',
  };
}

function withSettings(settings: RunSettings): RunSettings {
  return {
    ...(settings.model !== undefined ? { model: settings.model } : {}),
    ...(settings.mcp !== undefined ? { mcp: settings.mcp } : {}),
    ...(settings.onOutput !== undefined ? { onOutput: settings.onOutput } : {}),
    ...(settings.onActivity !== undefined ? { onActivity: settings.onActivity } : {}),
  };
}

function constitutionSection(constitution: string): readonly string[] {
  return constitution.length === 0 ? [] : ['', constitution];
}

function buildUnderstandPrompt(input: UnderstandInput, constitution: string): string {
  const description = input.issue.body.length > 0 ? input.issue.body : '(no description)';
  const feedback =
    input.feedback.length > 0 ? input.feedback.map((entry) => `- ${entry}`).join('\n') : '(none)';
  return [
    'You are the Lou planner. Understand the ticket below and turn it into a plan.',
    '',
    `Ticket: #${input.issue.number} — ${input.issue.title}`,
    description,
    '',
    'Feedback from the human:',
    feedback,
    '',
    ...constitutionSection(constitution),
    'Reply exactly with:',
    'SUMMARY: <one line>',
    'QUESTION: <one ambiguity>',
    'PLAN_TITLE: <conventional commits title>',
    'PLAN_BRANCH: <feature/...>',
    'PLAN_COMMIT: <conventional commit message>',
    'PLAN_STEP: <concrete implementation step>',
  ].join('\n');
}

function buildDesignTestsPrompt(plan: PlanDraft, constitution: string): string {
  return [
    'You are the Lou test designer. Design the acceptance tests for this plan.',
    '',
    `Plan title: ${plan.title}`,
    plan.steps.length > 0 ? plan.steps.map((step) => `- ${step}`).join('\n') : '(no steps)',
    '',
    ...constitutionSection(constitution),
    'Reply exactly with:',
    'TEST_PLAN: <one test case>',
  ].join('\n');
}

function buildWriteTestsPrompt(plan: PlanDraft, constitution: string, testPlan?: string): string {
  return [
    'You are the Lou test writer. Write the tests described by the test plan.',
    '',
    `Plan title: ${plan.title}`,
    plan.steps.length > 0 ? plan.steps.map((step) => `- ${step}`).join('\n') : '(no steps)',
    '',
    ...testPlanSection(testPlan),
    ...constitutionSection(constitution),
    ...harnessSection(),
    'Reply exactly with:',
    'CHANGED: <changed file path>',
    'SUMMARY: <one line>',
  ].join('\n');
}

function testPlanSection(testPlan: string | undefined): readonly string[] {
  if (testPlan === undefined || testPlan.trim() === '') {
    return [];
  }
  return ['Acceptance tests to cover:', testPlan, ''];
}

type PromptBuilder = (plan: PlanDraft, constitution: string, testPlan?: string) => string;

function harnessSection(): readonly string[] {
  return [
    'If the project has no test harness yet, set one up before writing tests:',
    '- pick the runner that matches the stack in package.json',
    '- add it as a dev dependency',
    '- add a "test" script that runs it once and exits non-zero on failure',
    '- add the config file if the runner needs one',
    'Report every harness file you create under CHANGED.',
    '',
  ];
}

function buildImplementPrompt(plan: PlanDraft, constitution: string): string {
  return [
    'You are the Lou developer. Implement each planned step, respecting the plan.',
    '',
    `Plan title: ${plan.title}`,
    plan.steps.length > 0 ? plan.steps.map((step) => `- ${step}`).join('\n') : '(no steps)',
    '',
    ...constitutionSection(constitution),
    'Reply exactly with:',
    'CHANGED: <changed file path>',
    'SUMMARY: <one line>',
  ].join('\n');
}

function parseUnderstanding(stdout: string): Understanding {
  return {
    summary: matchValue(stdout, SUMMARY_PATTERN) ?? '(no summary)',
    questions: matchAll(stdout, QUESTION_PATTERN),
    plan: {
      title: requiredValue(stdout, TITLE_PATTERN, 'PLAN_TITLE'),
      branchName: requiredValue(stdout, BRANCH_PATTERN, 'PLAN_BRANCH'),
      commitMessage: requiredValue(stdout, COMMIT_PATTERN, 'PLAN_COMMIT'),
      steps: matchAll(stdout, STEP_PATTERN),
    },
  };
}

function requiredValue(stdout: string, pattern: RegExp, label: string): string {
  const value = matchValue(stdout, pattern);
  if (value === null) {
    throw new Error(`planner output must contain ${label}: <value>`);
  }
  return value;
}

function matchValue(stdout: string, pattern: RegExp): string | null {
  return pattern.exec(stdout)?.[1]?.trim() ?? null;
}

function matchAll(stdout: string, pattern: RegExp): readonly string[] {
  const regex = new RegExp(pattern.source, 'gim');
  const values: string[] = [];
  for (const match of stdout.matchAll(regex)) {
    const value = match[1];
    if (value !== undefined) {
      values.push(value.trim());
    }
  }
  return values;
}

function runIdFor(agent: string, plan: PlanDraft): string {
  return `run-${agent}-${plan.title}`;
}
