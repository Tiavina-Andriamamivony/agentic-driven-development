export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly interrupted: boolean;
}

export type OutputHandler = (chunk: string) => void;

export interface CommandRunOptions {
  readonly cwd: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly env?: Readonly<Record<string, string>>;
  readonly stdin?: string;
  readonly onStdout?: OutputHandler;
  readonly onStderr?: OutputHandler;
}

export interface CommandRunner {
  run(command: string, args: readonly string[], options: CommandRunOptions): Promise<CommandResult>;
}
