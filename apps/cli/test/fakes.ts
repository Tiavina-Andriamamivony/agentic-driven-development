import type { DoctorCheck, DoctorProbes } from '../src/doctor/doctor-command.ts';
import type { AuditLog, AuditEvent, AuditEventPayload } from '@lou/audit';
import type { GitAdapter } from '@lou/git';
import type { GitHubAdapter, GitHubIssue, PullRequest, PullRequestInput } from '@lou/github';
import type { AgentRunInput, AgentRunResult, AgentRuntime, AgentStatus } from '@lou/agent-runtime';
import type { TestResult, TestRunner, TestRunOptions } from '@lou/test-runner';

export function createFakeRuntime(
  replies: readonly AgentRunResult[],
): AgentRuntime & { readonly runs: readonly AgentRunInput[] } {
  const runs: AgentRunInput[] = [];
  let index = 0;
  return {
    runs,
    run(input: AgentRunInput): Promise<AgentRunResult> {
      runs.push(input);
      const reply = replies[Math.min(index, replies.length - 1)];
      index += 1;
      return Promise.resolve(reply ?? { ...DEFAULT_REPLY, runId: input.runId });
    },
    getStatus(runId: string): Promise<AgentStatus> {
      return Promise.resolve({ runId, running: true, finished: true });
    },
    interrupt(): Promise<void> {
      return Promise.resolve();
    },
  };
}

export function resultFor(stdout: string): AgentRunResult {
  return { runId: '', exitCode: 0, stdout, stderr: '', interrupted: false };
}

interface GitSpy {
  readonly git: GitAdapter;
  readonly branches: readonly string[];
  readonly commits: readonly string[];
  readonly pushes: number;
}

export function createGitSpy(): GitSpy {
  const branches: string[] = [];
  const staged: string[] = [];
  const commits: string[] = [];
  const pushes = { count: 0 };
  const git: GitAdapter = {
    createBranch(name: string): Promise<void> {
      branches.push(name);
      return Promise.resolve();
    },
    stage(paths: readonly string[]): Promise<void> {
      staged.push(...paths);
      return Promise.resolve();
    },
    commit(message: string): Promise<void> {
      commits.push(message);
      return Promise.resolve();
    },
    push(): Promise<void> {
      pushes.count += 1;
      return Promise.resolve();
    },
    getCurrentBranch(): Promise<string> {
      return Promise.resolve('main');
    },
    isClean(): Promise<boolean> {
      return Promise.resolve(true);
    },
  };
  return {
    git,
    branches,
    commits,
    get pushes(): number {
      return pushes.count;
    },
  };
}

export function createGitHubSpy(issue: GitHubIssue): {
  readonly github: GitHubAdapter;
  readonly created: readonly PullRequestInput[];
} {
  const created: PullRequestInput[] = [];
  const github: GitHubAdapter = {
    getIssue(): Promise<GitHubIssue> {
      return Promise.resolve(issue);
    },
    createPullRequest(input: PullRequestInput): Promise<PullRequest> {
      created.push(input);
      return Promise.resolve({ number: 42, url: 'https://hub.example/pr/42', title: input.title });
    },
  };
  return { github, created };
}

interface AuditSpy {
  readonly log: AuditLog;
  events(): readonly AuditEvent[];
}

export function createAuditSpy(): AuditSpy {
  const events: AuditEvent[] = [];
  const log: AuditLog = {
    record(payload: AuditEventPayload): Promise<void> {
      events.push({ timestamp: '2026-09-24T00:00:00.000Z', ...payload });
      return Promise.resolve();
    },
    history(): Promise<readonly AuditEvent[]> {
      return Promise.resolve(events.slice());
    },
  };
  return { log, events: () => events.slice() };
}

export function createTestRunner(passed: boolean): {
  readonly runs: readonly TestRunOptions[];
  readonly runner: TestRunner;
} {
  const runs: TestRunOptions[] = [];
  const tester: TestRunner = {
    run(options: TestRunOptions): Promise<TestResult> {
      runs.push(options);
      return Promise.resolve({
        passed,
        exitCode: passed ? 0 : 1,
        stdout: passed ? 'ok' : 'boom',
        stderr: '',
        interrupted: false,
        command: 'pnpm test',
      });
    },
  };
  return { runs, runner: tester };
}

export function provingVerifier(): {
  run(o: { cwd: string }): Promise<{ passed: boolean; reason?: string }>;
} {
  return { run: () => Promise.resolve({ passed: true }) };
}

export function readyDoctorProbes(): DoctorProbes {
  const pass: DoctorCheck = { label: 'ok', ok: true, detail: 'fine' };
  return {
    node: () => Promise.resolve(pass),
    pnpm: () => Promise.resolve(pass),
    gitHubCli: () => Promise.resolve(pass),
    agentRuntime: () => Promise.resolve(pass),
    gitRepository: () => Promise.resolve(pass),
  };
}

const DEFAULT_REPLY: AgentRunResult = {
  runId: 'run',
  exitCode: 1,
  stdout: '',
  stderr: 'no reply configured',
  interrupted: false,
};
