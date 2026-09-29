import { describe, expect, it } from 'vitest';
import { SandboxedCommandRunner } from '@lou/sandbox';
import { buildRunEnvironment } from '../src/run/run-command.ts';

const WORKSPACE = '/tmp/lou-sandbox-wiring';

function composedAdapters(): ReturnType<typeof buildRunEnvironment> {
  return buildRunEnvironment({
    options: {
      issueNumbers: [1],
      cwd: WORKSPACE,
      out: () => {},
      runtime: 'opencode',
      dryRun: true,
    },
    issueNumber: 1,
    workspace: WORKSPACE,
    many: false,
  });
}

function sandboxedRunnerOf(adapter: object): unknown {
  return Object.values(adapter).find((value) => value instanceof SandboxedCommandRunner) ?? null;
}

describe('run composition', () => {
  it('puts a sandboxed runner behind git, github and tests', () => {
    const env = composedAdapters();

    expect(sandboxedRunnerOf(env.git as object)).toBeInstanceOf(SandboxedCommandRunner);
    expect(sandboxedRunnerOf(env.github as object)).toBeInstanceOf(SandboxedCommandRunner);
    expect(sandboxedRunnerOf(env.tests as object)).toBeInstanceOf(SandboxedCommandRunner);
  });

  it('puts a sandboxed runner behind the agent runtime', () => {
    const env = composedAdapters();

    expect(sandboxedRunnerOf(env.runtime as object)).toBeInstanceOf(SandboxedCommandRunner);
  });

  it('lets an injected adapter replace the composed one', () => {
    const fake = { stage: () => Promise.resolve(), commit: () => Promise.resolve('sha') };
    const env = buildRunEnvironment({
      options: {
        issueNumbers: [1],
        cwd: WORKSPACE,
        out: () => {},
        runtime: 'opencode',
        dryRun: true,
      },
      issueNumber: 1,
      workspace: WORKSPACE,
      many: false,
      wiring: { git: fake as never },
    });

    expect(sandboxedRunnerOf(env.git as object)).toBeNull();
  });
});
