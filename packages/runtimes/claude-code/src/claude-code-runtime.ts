import { NodeCommandRunner } from '@lou/command-runner';
import type { CommandRunner } from '@lou/command-runner';
import { AgentRunFailedError } from '@lou/agent-runtime';
import type { AgentRuntime } from '@lou/agent-runtime';
import type { AgentRunInput, AgentRunResult, AgentStatus, TokenUsage } from '@lou/agent-runtime';

const DEFAULT_TIMEOUT_MS = 300_000;
const PERMISSION_MODE = 'acceptEdits';

export interface ClaudeCodeRuntimeOptions {
  readonly binary?: string;
  readonly runner?: CommandRunner;
  readonly timeoutMs?: number;
}

interface ClaudeCodeUsage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
}

interface ClaudeCodeResult {
  readonly is_error?: boolean;
  readonly subtype?: string;
  readonly errors?: readonly string[];
  readonly total_cost_usd?: number;
  readonly usage?: ClaudeCodeUsage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function failureReason(payload: Record<string, unknown>): string {
  const errors = payload['errors'];
  if (Array.isArray(errors)) {
    const reported = errors.filter(
      (line): line is string => typeof line === 'string' && line !== '',
    );
    if (reported.length > 0) {
      return reported.join('; ');
    }
  }
  const subtype = payload['subtype'];
  return typeof subtype === 'string' ? subtype : 'the agent reported a failed run';
}

export class ClaudeCodeRuntime implements AgentRuntime {
  private readonly binary: string;
  private readonly runner: CommandRunner;
  private readonly timeoutMs: number;
  private readonly controllers = new Map<string, AbortController>();
  private readonly statuses = new Map<string, AgentStatus>();

  constructor(options?: ClaudeCodeRuntimeOptions) {
    this.binary = options?.binary ?? 'claude';
    this.runner = options?.runner ?? new NodeCommandRunner();
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    this.validate(input);
    const controller = new AbortController();
    this.controllers.set(input.runId, controller);
    this.statuses.set(input.runId, { runId: input.runId, running: true, finished: false });
    try {
      const result = await this.runner.run(this.binary, this.buildArgs(input), {
        cwd: input.workspace,
        signal: controller.signal,
        timeoutMs: this.timeoutMs,
        stdin: input.instructions,
      });
      this.statuses.set(
        input.runId,
        this.toFinished(input.runId, result.exitCode, result.interrupted),
      );
      this.assertSucceeded(input.runId, result.stdout);
      return { runId: input.runId, ...result, ...this.usage(result.stdout) };
    } catch (error) {
      if (!(error instanceof AgentRunFailedError)) {
        this.statuses.set(input.runId, { runId: input.runId, running: false, finished: false });
      }
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
    const args = ['-p', '--output-format', 'json', '--permission-mode', PERMISSION_MODE];
    if (input.model !== undefined) {
      args.push('--model', input.model);
    }
    if (input.mcp !== undefined) {
      args.push('--mcp-config', this.mcpConfig(input.mcp), '--strict-mcp-config');
    }
    return args;
  }

  private mcpConfig(servers: Readonly<Record<string, string>>): string {
    const mcpServers: Record<string, { command: string }> = {};
    for (const [name, command] of Object.entries(servers)) {
      mcpServers[name] = { command };
    }
    return JSON.stringify({ mcpServers });
  }

  private usage(stdout: string): { usage?: TokenUsage } {
    const payload = this.parsePayload(stdout);
    if (payload === null) {
      return {};
    }
    const parsed = this.toResult(payload);
    return parsed === null ? {} : { usage: this.toTokenUsage(parsed) };
  }

  private parsePayload(stdout: string): Record<string, unknown> | null {
    const value: unknown = this.tryParse(stdout);
    return isRecord(value) ? value : null;
  }

  private tryParse(stdout: string): unknown {
    try {
      return JSON.parse(stdout) as unknown;
    } catch {
      return null;
    }
  }

  private toResult(value: Record<string, unknown>): ClaudeCodeResult | null {
    const usage = this.toUsage(value['usage']);
    const costUsd = readNumber(value['total_cost_usd']);
    if (usage === null && costUsd === null) {
      return null;
    }
    return {
      ...(usage === null ? {} : { usage }),
      ...(costUsd === null ? {} : { total_cost_usd: costUsd }),
    };
  }

  private toUsage(value: unknown): ClaudeCodeUsage | null {
    if (!isRecord(value)) {
      return null;
    }
    const input = readNumber(value['input_tokens']);
    const output = readNumber(value['output_tokens']);
    if (input === null && output === null) {
      return null;
    }
    return {
      ...(input === null ? {} : { input_tokens: input }),
      ...(output === null ? {} : { output_tokens: output }),
    };
  }

  private assertSucceeded(runId: string, stdout: string): void {
    const payload = this.parsePayload(stdout);
    if (payload === null || payload['is_error'] !== true) {
      return;
    }
    const result = this.toResult(payload);
    throw new AgentRunFailedError(
      runId,
      failureReason(payload),
      result === null ? undefined : this.toTokenUsage(result),
    );
  }

  private toTokenUsage(parsed: ClaudeCodeResult): TokenUsage {
    return {
      promptTokens: parsed.usage?.input_tokens ?? 0,
      completionTokens: parsed.usage?.output_tokens ?? 0,
      ...(parsed.total_cost_usd !== undefined ? { costUsd: parsed.total_cost_usd } : {}),
    };
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
