import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultArticles } from '@lou/constitution';
import {
  createNodeConstitutionWriter,
  runConstitution,
} from '../src/constitution/constitution-command.ts';

let root: string;
let out: string[];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lou-constitution-cmd-'));
  out = [];
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const writer = (): ReturnType<typeof createNodeConstitutionWriter> =>
  createNodeConstitutionWriter(root);

const path = (): string => join(root, '.add', 'constitution.md');

describe('lou constitution', () => {
  it('reports an absent constitution without creating anything', async () => {
    const code = await runConstitution(writer(), { init: false, force: false, json: false }, (l) =>
      out.push(l),
    );

    expect(code).toBe(0);
    expect(existsSync(path())).toBe(false);
    expect(out.join('\n')).toMatch(/Not found/);
  });

  it('creates the default constitution on request', async () => {
    const code = await runConstitution(writer(), { init: true, force: false, json: false }, (l) =>
      out.push(l),
    );

    expect(code).toBe(0);
    expect(readFileSync(path(), 'utf8')).toContain('# Project Constitution');
    expect(out.join('\n')).toMatch(/Created/);
  });

  it('refuses to overwrite an existing constitution', async () => {
    await runConstitution(writer(), { init: true, force: false, json: false }, (l) => out.push(l));
    const before = readFileSync(path(), 'utf8');
    out = [];

    const code = await runConstitution(writer(), { init: true, force: false, json: false }, (l) =>
      out.push(l),
    );

    expect(code).toBe(1);
    expect(readFileSync(path(), 'utf8')).toBe(before);
    expect(out.join('\n')).toMatch(/--force/);
  });

  it('replaces it when forced', async () => {
    await runConstitution(writer(), { init: true, force: false, json: false }, (l) => out.push(l));
    out = [];

    const code = await runConstitution(writer(), { init: true, force: true, json: false }, (l) =>
      out.push(l),
    );

    expect(code).toBe(0);
    expect(out.join('\n')).toMatch(/Replaced/);
  });

  it('reports the articles it found', async () => {
    await runConstitution(writer(), { init: true, force: false, json: false }, (l) => out.push(l));
    out = [];

    await runConstitution(writer(), { init: false, force: false, json: false }, (l) => out.push(l));

    expect(out.join('\n')).toMatch(new RegExp(`Found: ${defaultArticles().length} articles`));
  });

  it('emits json for scripting', async () => {
    await runConstitution(writer(), { init: true, force: false, json: true }, (l) => out.push(l));

    const parsed = JSON.parse(out.join('\n')) as { action: string; articles: number };
    expect(parsed.action).toBe('created');
    expect(parsed.articles).toBe(defaultArticles().length);
  });

  it('exits non zero on json too when it refuses', async () => {
    await runConstitution(writer(), { init: true, force: false, json: true }, (l) => out.push(l));
    out = [];

    const code = await runConstitution(writer(), { init: true, force: false, json: true }, (l) =>
      out.push(l),
    );

    expect(code).toBe(1);
    expect((JSON.parse(out.join('\n')) as { action: string }).action).toBe('refused');
  });
});
