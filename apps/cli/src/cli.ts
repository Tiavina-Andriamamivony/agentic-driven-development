import { readFileSync, realpathSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { createNodeProjectReader } from './init/project-reader.ts';
import type { ProjectReader } from './init/project-reader.ts';
import { parseRunArguments, runProduction } from './run/run-command.ts';
import { parseInitJsonFlag, runInit } from './init/run-init.ts';
import { createRealDoctorProbes } from './doctor/real-probes.ts';
import { formatDoctorReport, runDoctor } from './doctor/doctor-command.ts';
import type { DoctorProbes } from './doctor/doctor-command.ts';
import { createLocalOpenCodeInstaller } from './ux/opencode-installer.ts';
import type { OpenCodeInstaller } from './ux/opencode-installer.ts';
import { ensureOpenCode } from './ux/preflight.ts';
import type { EnsureOpenCodeOptions } from './ux/preflight.ts';
import { createStyler } from './ux/style.ts';
import type { Styler } from './ux/style.ts';

const USAGE = `Usage: lou <command> [args]

Commands:
  doctor Check the runtime prerequisites: lou doctor.
  init   Read-only project onboarding report: lou init [--json].
  run    Drive a GitHub issue to a pull request: lou run <issue-number> [--dry-run] [--model <name>] [--model-by-agent planner=...,developer=...] [--mcp name=command] [--max-cost-usd <usd>] [--max-time-min <minutes>].`;

const HELP_COMMANDS = new Set(['--help', '-h', 'help']);
const VERSION_COMMANDS = new Set(['--version', '-v']);

export interface CliEnv {
  readonly reader: ProjectReader;
  readonly cwd: string;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
  readonly doctorProbes?: DoctorProbes;
  readonly interactive?: boolean;
  readonly style?: Styler;
  readonly ask?: (question: string) => Promise<string>;
  readonly openCodeInstaller?: OpenCodeInstaller;
}

type CommandHandler = (argv: readonly string[], env: CliEnv) => Promise<number>;

const COMMANDS: Record<string, CommandHandler> = {
  init: handleInit,
  run: handleRun,
  doctor: handleDoctor,
};

function handleDoctor(argv: readonly string[], env: CliEnv): Promise<number> {
  if (argv.length > 1) {
    env.err('Usage: lou doctor');
    return Promise.resolve(1);
  }
  return runDoctor(env.doctorProbes ?? createRealDoctorProbes(env.cwd)).then((report) => {
    env.out(formatDoctorReport(report, resolveStyler(env)));
    return report.code;
  });
}

function handleInit(argv: readonly string[], env: CliEnv): Promise<number> {
  const json = parseInitJsonFlag(argv);
  if (json === null) {
    env.err('Usage: lou init [--json]');
    return Promise.resolve(1);
  }
  const style = resolveStyler(env);
  return Promise.resolve()
    .then(() => runInit({ reader: env.reader, root: env.cwd, json }))
    .then((report) => {
      if (!json) {
        env.out(style.bold('◆ Lou · agent-driven development'));
        env.out('');
      }
      env.out(report);
      if (json) {
        return 0;
      }
      return offerOpenCodeInstall(env).then(() => 0);
    });
}

async function offerOpenCodeInstall(env: CliEnv): Promise<void> {
  const style = resolveStyler(env);
  const status = await ensureOpenCode(preflightOptions(env));
  if (status === 'present') {
    env.out(`${style.dim('opencode')} ${style.check(true)}`);
  }
}

async function requireOpenCode(env: CliEnv): Promise<boolean> {
  const status = await ensureOpenCode(preflightOptions(env));
  return status === 'present' || status === 'installed';
}

function preflightOptions(env: CliEnv): EnsureOpenCodeOptions {
  return {
    installer: env.openCodeInstaller ?? createLocalOpenCodeInstaller(),
    ask: env.ask ?? terminalQuestion,
    interactive: resolveInteractive(env),
    out: env.out,
    style: resolveStyler(env),
    platform: process.platform,
  };
}

async function handleRun(argv: readonly string[], env: CliEnv): Promise<number> {
  const parsed = parseRunArguments(argv);
  if (parsed === null) {
    env.err(
      'Usage: lou run <issue-number> [--dry-run] [--model <name>] [--model-by-agent planner=...] [--mcp name=command] [--max-cost-usd <usd>] [--max-time-min <minutes>]',
    );
    return 1;
  }
  if (!(await requireOpenCode(env))) {
    return 1;
  }
  return runProduction({
    issueNumber: parsed.issueNumber,
    dryRun: parsed.dryRun,
    cwd: env.cwd,
    out: env.out,
    ...(parsed.model !== undefined ? { model: parsed.model } : {}),
    ...(parsed.modelsByAgent !== undefined ? { modelsByAgent: parsed.modelsByAgent } : {}),
    ...(parsed.mcp !== undefined ? { mcp: parsed.mcp } : {}),
    ...(parsed.maxCostUsd !== undefined ? { maxCostUsd: parsed.maxCostUsd } : {}),
    ...(parsed.maxMinutes !== undefined ? { maxMinutes: parsed.maxMinutes } : {}),
  }).catch((error: unknown) => {
    env.err(`lou run failed: ${errorMessage(error)}`);
    return 1;
  });
}

export function runCli(argv: readonly string[], env: CliEnv): Promise<number> {
  const command = argv[0] ?? '';
  if (HELP_COMMANDS.has(command)) {
    env.out(USAGE);
    return Promise.resolve(0);
  }
  if (VERSION_COMMANDS.has(command)) {
    env.out(`lou ${readVersion()}`);
    return Promise.resolve(0);
  }
  const handler = COMMANDS[command];
  if (handler !== undefined) {
    return handler(argv, env);
  }
  env.err(command === '' ? USAGE : `Unknown command: ${command}\n\n${USAGE}`);
  return Promise.resolve(1);
}

export function main(argv?: readonly string[]): Promise<number> {
  return runCli(argv ?? process.argv.slice(2), {
    reader: createNodeProjectReader(),
    cwd: process.cwd(),
    interactive: process.stdin.isTTY,
    style: createStyler(process.stdout.isTTY),
    out: (line: string) => process.stdout.write(`${line}\n`),
    err: (line: string) => process.stderr.write(`${line}\n`),
  });
}

const entryPath = process.argv[1];
const isDirectRun =
  entryPath !== undefined && pathToFileURL(realpathSync(entryPath)).href === import.meta.url;
if (isDirectRun) {
  main().then(
    (code) => process.exit(code),
    () => process.exit(1),
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'unknown error';
}

function terminalQuestion(question: string): Promise<string> {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    readline.question(question, (answer) => {
      readline.close();
      resolve(answer);
    });
  });
}

function resolveStyler(env: CliEnv): Styler {
  return env.style ?? createStyler(false);
}

function resolveInteractive(env: CliEnv): boolean {
  return env.interactive ?? false;
}

function readVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { readonly version?: string };
  return packageJson.version ?? '0.0.0';
}
