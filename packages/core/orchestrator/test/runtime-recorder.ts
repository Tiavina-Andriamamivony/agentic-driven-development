import type { AgentRunInput, AgentRunResult, AgentStatus, AgentRuntime } from '@lou/agent-runtime';

export interface RuntimeReply {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly interrupted: boolean;
}

export class RuntimeRecorder implements AgentRuntime {
  readonly runs: AgentRunInput[] = [];
  private readonly defaultReply: RuntimeReply = {
    exitCode: 1,
    stdout: '',
    stderr: 'no reply configured',
    interrupted: false,
  };
  private index = 0;
  private readonly replies: readonly RuntimeReply[];

  constructor(replies: readonly RuntimeReply[]) {
    this.replies = replies;
  }

  run(input: AgentRunInput): Promise<AgentRunResult> {
    this.runs.push(input);
    const result: AgentRunResult = { ...this.nextReply(), runId: input.runId };
    return Promise.resolve(result);
  }

  getStatus(runId: string): Promise<AgentStatus> {
    return Promise.resolve({ runId, running: true, finished: true });
  }

  interrupt(): Promise<void> {
    return Promise.resolve();
  }

  private nextReply(): RuntimeReply {
    const reply = this.replies[Math.min(this.index, this.replies.length - 1)];
    this.index += 1;
    return reply ?? this.defaultReply;
  }
}
