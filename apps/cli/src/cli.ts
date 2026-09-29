import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { createNodeProjectReader } from './init/project-reader.ts';
import type { ProjectReader } from './init/project-reader.ts';
import { parseRunArguments, runProduction } from './run/run-command.ts';
import type { RunArguments } from './run/run-command.ts';
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
import { createGhLatestFetcher } from './upgrade/latest-release.ts';
import { LOU_REPO } from './upgrade/latest-release.ts';
import { detectInstall } from './upgrade/install-detection.ts';
import type { UpgradeDependencies } from './upgrade/upgrade-command.ts';
import {
  createShellInstallerRunner,
  parseUpgradeArguments,
  runUpgrade,
} from './upgrade/upgrade-command.ts';
import { DEFAULT_UPDATE_CHECK_INTERVAL_MS, maybeNotifyUpgrade } from './upgrade/upgrade-notice.ts';
import { createNodeRunsStore, runListRuns } from './runs/runs-list.ts';
import type { RunsStore } from './runs/runs-list.ts';

const USAGE = `Usage: lou <command> [args]

Commands:
  doctor  Check the runtime prerequisites: lou doctor.
  init    Read-only project onboarding report: lou init [--json].
  run     Drive one or more GitHub issues to a pull request: lou run <issue-number> [<issue-number> ...] [--dry-run] [--model <name>] [--model-by-agent planner=...,developer=...] [--mcp name=command] [--max-cost-usd <usd>] [--max-time-min <minutes>] [--max-concurrency <n>].
  runs    List finished and in-flight runs: lou runs [--json].
  upgrade Self-update to the latest Lou version: lou upgrade [<version>].`;

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
  readonly upgrade?: UpgradeDependencies;
  readonly upgradeNotice?: () => Promise<void>;
  readonly runsStore?: RunsStore;
}

type CommandHandler = (argv: readonly string[], env: CliEnv) => Promise<number>;

const COMMANDS: Record<string, CommandHandler> = {
  init: handleInit,
  run: handleRun,
  doctor: handleDoctor,
  upgrade: handleUpgrade,
  runs: handleRuns,
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

function handleRuns(argv: readonly string[], env: CliEnv): Promise<number> {
  const json = argv[1] === '--json';
  if (argv.length > 1 && !json) {
    env.err('Usage: lou runs [--json]');
    return Promise.resolve(1);
  }
  const directory = join(env.cwd, '.lou', 'runs');
  return runListRuns({
    store: env.runsStore ?? createNodeRunsStore(directory),
    json,
    out: env.out,
  });
}

async function handleInit(argv: readonly string[], env: CliEnv): Promise<number> {
  const json = parseInitJsonFlag(argv);
  if (json === null) {
    env.err('Usage: lou init [--json]');
    return 1;
  }
  if (env.upgradeNotice !== undefined) {
    await env.upgradeNotice();
  }
  const style = resolveStyler(env);
  const report = await runInit({ reader: env.reader, root: env.cwd, json });
  if (!json) {
    env.out(style.bold('◆ Lou · agent-driven development'));
    env.out('');
  }
  env.out(report);
  if (json) {
    return 0;
  }
  await offerOpenCodeInstall(env);
  return 0;
}

function handleUpgrade(argv: readonly string[], env: CliEnv): Promise<number> {
  const parsed = parseUpgradeArguments(argv.slice(1));
  if (parsed === null) {
    env.err('Usage: lou upgrade [<version>]');
    return Promise.resolve(1);
  }
  if (parsed.help) {
    env.out(
      'Usage: lou upgrade [<version>]\n\nUpgrade Lou to the latest version (or a specific one, e.g. lou upgrade v0.2.0).',
    );
    return Promise.resolve(0);
  }
  return runUpgrade(parsed.version, {
    ...(env.upgrade ?? defaultUpgradeDependencies()),
    out: env.out,
    style: resolveStyler(env),
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
      'Usage: lou run <issue-number> [<issue-number> ...] [--dry-run] [--model <name>] [--model-by-agent planner=...] [--mcp name=command] [--max-cost-usd <usd>] [--max-time-min <minutes>] [--max-concurrency <n>]',
    );
    return 1;
  }
  if (env.upgradeNotice !== undefined) {
    await env.upgradeNotice();
  }
  if (!(await requireOpenCode(env))) {
    return 1;
  }
  return executeRun(parsed, env);
}

function executeRun(parsed: RunArguments, env: CliEnv): Promise<number> {
  return runProduction({
    issueNumbers: parsed.issueNumbers,
    dryRun: parsed.dryRun,
    cwd: env.cwd,
    out: env.out,
    ...(parsed.model !== undefined ? { model: parsed.model } : {}),
    ...(parsed.modelsByAgent !== undefined ? { modelsByAgent: parsed.modelsByAgent } : {}),
    ...(parsed.mcp !== undefined ? { mcp: parsed.mcp } : {}),
    ...(parsed.maxCostUsd !== undefined ? { maxCostUsd: parsed.maxCostUsd } : {}),
    ...(parsed.maxMinutes !== undefined ? { maxMinutes: parsed.maxMinutes } : {}),
    ...(parsed.maxConcurrency !== undefined ? { maxConcurrency: parsed.maxConcurrency } : {}),
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
    upgrade: defaultUpgradeDependencies(),
    upgradeNotice: createUpgradeNotice(),
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

function defaultUpgradeDependencies(): UpgradeDependencies {
  return {
    scriptPath: process.argv[1] ?? '',
    currentVersion: readVersion(),
    platform: process.platform,
    nodeBin: process.execPath,
    repo: LOU_REPO,
    latest: createGhLatestFetcher(),
    runner: createShellInstallerRunner(),
    detect: detectInstall,
  };
}

function createUpgradeNotice(): () => Promise<void> {
  const interactive = process.stdin.isTTY;
  const out = (line: string) => process.stdout.write(`${line}\n`);
  const style = createStyler(process.stdout.isTTY);
  return () =>
    maybeNotifyUpgrade({
      currentVersion: readVersion(),
      repo: LOU_REPO,
      scriptPath: process.argv[1] ?? '',
      interactive,
      json: false,
      isCi: process.env.CI !== undefined,
      now: Date.now(),
      checkEveryMs: DEFAULT_UPDATE_CHECK_INTERVAL_MS,
      detect: detectInstall,
      latest: createGhLatestFetcher(),
      readTimestamp: readUpdateCheck,
      writeTimestamp: writeUpdateCheck,
      out,
      style,
    });
}

function readUpdateCheck(prefix: string): number | undefined {
  try {
    const raw = readFileSync(join(prefix, '.last-update-check'), 'utf8').trim();
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function writeUpdateCheck(prefix: string, timestamp: number): void {
  mkdirSync(prefix, { recursive: true });
  writeFileSync(join(prefix, '.last-update-check'), String(timestamp));
}

function readVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { readonly version?: string };
  return packageJson.version ?? '0.0.0';
}
