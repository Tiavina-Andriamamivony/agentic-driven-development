import { describe, expect, it } from 'vitest';
import type { OpenCodeInstaller } from '../src/ux/opencode-installer';
import { ensureOpenCode } from '../src/ux/preflight';
import { createStyler } from '../src/ux/style';

function openCodeStub(options: {
  readonly detects: readonly boolean[];
  readonly installsOk?: boolean;
}): OpenCodeInstaller & { readonly installCalls: () => number } {
  let detectIndex = 0;
  let installCount = 0;
  return {
    detect(): Promise<boolean> {
      const value = options.detects[detectIndex] ?? false;
      detectIndex += 1;
      return Promise.resolve(value);
    },
    install(): Promise<boolean> {
      installCount += 1;
      return Promise.resolve(options.installsOk ?? true);
    },
    installCalls: () => installCount,
  };
}

async function runPreflight(options: {
  readonly installer: OpenCodeInstaller;
  readonly interactive?: boolean;
  readonly platform?: string;
  readonly answer?: string;
}): Promise<{
  readonly status: string;
  readonly out: readonly string[];
  readonly asked: readonly string[];
}> {
  const out: string[] = [];
  const asked: string[] = [];
  const status = await ensureOpenCode({
    installer: options.installer,
    interactive: options.interactive ?? true,
    platform: options.platform ?? 'linux',
    ask: (question: string) => {
      asked.push(question);
      return Promise.resolve(options.answer ?? 'y');
    },
    out: (line: string) => out.push(line),
    style: createStyler(false),
  });
  return { status, out, asked };
}

describe('ensureOpenCode', () => {
  it('returns present without asking when opencode is installed', async () => {
    const installer = openCodeStub({ detects: [true] });

    const result = await runPreflight({ installer });

    expect(result.status).toBe('present');
    expect(result.asked).toEqual([]);
    expect(result.out).toEqual([]);
  });

  it('declines without asking when the session is not interactive', async () => {
    const installer = openCodeStub({ detects: [false] });

    const result = await runPreflight({ installer, interactive: false });

    expect(result.status).toBe('declined');
    expect(result.asked).toEqual([]);
    expect(result.out.join('\n')).toContain('opencode is required');
  });

  it('declines when the user refuses the install', async () => {
    const installer = openCodeStub({ detects: [false] });

    const result = await runPreflight({ installer, answer: 'n' });

    expect(result.status).toBe('declined');
    expect(result.asked).toHaveLength(1);
    expect(result.out.join('\n')).toContain('Skipping install');
  });

  it('installs opencode when the user agrees and re-detects it', async () => {
    const installer = openCodeStub({ detects: [false, true] });

    const result = await runPreflight({ installer, answer: 'y' });

    expect(result.status).toBe('installed');
    expect(installer.installCalls()).toBe(1);
    expect(result.out.join('\n')).toContain('curl -fsSL https://opencode.ai/install | bash');
    expect(result.out.join('\n')).toContain('opencode installed');
  });

  it('reports a failed install', async () => {
    const installer = openCodeStub({ detects: [false, false], installsOk: false });

    const result = await runPreflight({ installer });

    expect(result.status).toBe('failed');
    expect(result.out.join('\n')).toContain('Installation failed');
  });

  it('declines with guidance on Windows without installing', async () => {
    const installer = openCodeStub({ detects: [false, true] });

    const result = await runPreflight({ installer, platform: 'win32' });

    expect(result.status).toBe('declined');
    expect(installer.installCalls()).toBe(0);
    expect(result.out.join('\n')).toContain('install manually');
  });
});
