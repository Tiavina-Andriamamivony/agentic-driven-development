import type { CommandRunOptions, CommandRunner } from '@lou/command-runner';
import { NodeCommandRunner } from '@lou/command-runner';
import type { AgentRuntime } from '@lou/agent-runtime';
import type { AgentRunInput, AgentRunResult, AgentStatus } from '@lou/agent-runtime';
import { OpenCodeEventReader } from './opencode-event-reader.ts';

const DEFAULT_TIMEOUT_MS = 1_800_000;
const MCP_CONFIG_ENV = 'OPENCODE_CONFIG_CONTENT';

export interface OpenCodeRuntimeOptions {
  readonly binary?: string;
  readonly runner?: CommandRunner;
  readonly timeoutMs?: number;
}

export class OpenCodeRuntime implements AgentRuntime {
  private readonly binary: string;
  private readonly runner: CommandRunner;
  private readonly timeoutMs: number;
  private readonly controllers = new Map<string, AbortController>();
  private readonly statuses = new Map<string, AgentStatus>();

  constructor(options?: OpenCodeRuntimeOptions) {
    this.binary = options?.binary ?? 'opencode';
    this.runner = options?.runner ?? new NodeCommandRunner();
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    this.validate(input);
    const controller = new AbortController();
    const reader = this.reader(input);
    this.controllers.set(input.runId, controller);
    this.statuses.set(input.runId, { runId: input.runId, running: true, finished: false });
    try {
      const result = await this.runner.run(this.binary, this.buildArgs(input), {
        cwd: input.workspace,
        signal: controller.signal,
        timeoutMs: this.timeoutMs,
        ...(input.mcp !== undefined ? { env: this.mcpEnv(input.mcp) } : {}),
        ...this.stream(input, reader),
      });
      reader.finish();
      this.statuses.set(
        input.runId,
        this.toFinished(input.runId, result.exitCode, result.interrupted),
      );
      return { runId: input.runId, ...result, stdout: reader.answerText() };
    } catch (error) {
      this.statuses.set(input.runId, { runId: input.runId, running: false, finished: false });
      throw error;
    } finally {
      this.controllers.delete(input.runId);
    }
  }

  getStatus(runId: string): Promise<AgentStatus> {
    return Promise.resolve(this.statuses.get(runId) ?? { runId, running: false, finished: false });
  }

  interrupt(runId: string): Promise<void> {
    this.controllers.get(runId)?.abort();
    return Promise.resolve();
  }

  private buildArgs(input: AgentRunInput): string[] {
    const args = ['run', '--format', 'json', '--thinking', '--dir', input.workspace];
    if (input.agent !== undefined) {
      args.push('--agent', input.agent);
    }
    if (input.model !== undefined) {
      args.push('--model', input.model);
    }
    args.push('--print-logs', input.instructions);
    return args;
  }

  private reader(input: AgentRunInput): OpenCodeEventReader {
    return new OpenCodeEventReader((activity) => input.onActivity?.(activity));
  }

  private stream(input: AgentRunInput, reader: OpenCodeEventReader): Partial<CommandRunOptions> {
    const onStdout = (chunk: string): void => {
      input.onOutput?.(chunk);
      reader.push(chunk);
    };
    return input.onOutput === undefined ? { onStdout } : { onStdout, onStderr: input.onOutput };
  }

  private mcpEnv(servers: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
    const mcp: Record<string, { type: string; command: readonly string[]; enabled: boolean }> = {};
    for (const [name, command] of Object.entries(servers)) {
      mcp[name] = { type: 'local', command: [command], enabled: true };
    }
    return { [MCP_CONFIG_ENV]: JSON.stringify({ mcp }) };
  }

  private validate(input: AgentRunInput): void {
    if (input.runId.length === 0) {
      throw new Error('runId must not be empty');
    }
    if (input.instructions.length === 0) {
      throw new Error('instructions must not be empty');
    }
    if (input.workspace.length === 0) {
      throw new Error('workspace must not be empty');
    }
  }

  private toFinished(runId: string, exitCode: number, interrupted: boolean): AgentStatus {
    return {
      runId,
      running: false,
      finished: true,
      ...(interrupted ? { interrupted } : {}),
      exitCode,
    };
  }
}
