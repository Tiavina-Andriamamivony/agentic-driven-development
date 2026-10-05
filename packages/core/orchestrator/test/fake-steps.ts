import type {
  ChangeNote,
  OrchestratorSteps,
  PlanDraft,
  UnderstandInput,
  Understanding,
} from '../src/types.ts';

interface StepsOptions {
  readonly summary?: string;
  readonly tests?: readonly string[];
  readonly implementation?: readonly string[];
  readonly implementations?: readonly ChangeNote[];
}

interface StepsState {
  readonly understandCalls: readonly UnderstandInput[];
  readonly implementations: number;
  readonly testWrites: number;
  readonly testDesigns: number;
}

interface StepsSpy {
  readonly steps: OrchestratorSteps;
  readonly state: StepsState;
}

export function createSteps(
  plan: PlanDraft,
  questions: readonly string[] = [],
  options: StepsOptions = {},
): StepsSpy {
  const understandCalls: UnderstandInput[] = [];
  const testFiles = options.tests ?? ['test/feature.spec.ts'];
  const implementationFiles = options.implementation ?? ['src/index.ts'];
  const summary = options.summary ?? 'implemented';
  const queue = [...(options.implementations ?? [])];
  let implementations = 0;
  let testWrites = 0;
  let testDesigns = 0;
  const steps: OrchestratorSteps = {
    understand(input: UnderstandInput): Promise<Understanding> {
      understandCalls.push(input);
      return Promise.resolve({ summary: 'summary', questions, plan });
    },
    designTests(): Promise<{ readonly testPlan: string }> {
      testDesigns += 1;
      return Promise.resolve({ testPlan: 'tc-01 valid token\ntc-02 invalid token' });
    },
    writeTests(): Promise<ChangeNote> {
      testWrites += 1;
      return Promise.resolve({ changedFiles: testFiles, summary: 'tests written' });
    },
    implement(): Promise<ChangeNote> {
      implementations += 1;
      return Promise.resolve(queue.shift() ?? { changedFiles: implementationFiles, summary });
    },
  };
  return {
    steps,
    state: {
      understandCalls,
      get implementations(): number {
        return implementations;
      },
      get testWrites(): number {
        return testWrites;
      },
      get testDesigns(): number {
        return testDesigns;
      },
    },
  };
}
