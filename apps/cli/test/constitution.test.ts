import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultArticles, NodeConstitutionStore } from '@lou/constitution';
import { formatConstitution, loadConstitution, withConstitution } from '../src/run/constitution.ts';

let root: string;
let out: string[];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lou-constitution-'));
  out = [];
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function save(content: string): Promise<void> {
  const articles = content
    .split('\n')
    .filter((line) => /^\d+\. /.test(line))
    .map((line, index) => ({ ordinal: index + 1, statement: line.replace(/^\d+\. /, '') }));
  await new NodeConstitutionStore(root).save(articles);
}

describe('loadConstitution', () => {
  it('stays silent and returns nothing when there is no file', async () => {
    await expect(loadConstitution(root, (line) => out.push(line))).resolves.toEqual([]);
    expect(out).toEqual([]);
  });

  it('reads the articles of a real file', async () => {
    await save('# Project Constitution\n\n1. Never bypass required tests.\n2. Prefer KISS.\n');

    const articles = await loadConstitution(root, (line) => out.push(line));

    expect(articles.map((article) => article.statement)).toEqual([
      'Never bypass required tests.',
      'Prefer KISS.',
    ]);
    expect(out).toEqual([]);
  });

  it('warns, ignores the file and carries on when it is invalid', async () => {
    await save('1. Duplicated.\n1. Duplicated.\n');

    const articles = await loadConstitution(root, (line) => out.push(line));

    expect(articles).toEqual([]);
    expect(out.join('\n')).toMatch(/ignored/);
  });

  it('names the file to fix in the warning', async () => {
    await save('1. Duplicated.\n1. Duplicated.\n');

    await loadConstitution(root, (line) => out.push(line));

    expect(out.join('\n')).toContain('.add/constitution.md');
  });
});

describe('formatConstitution', () => {
  it('renders nothing when there is no constitution', () => {
    expect(formatConstitution([])).toBe('');
  });

  it('numbers every article under a heading', () => {
    const block = formatConstitution([
      { ordinal: 1, statement: 'Prefer KISS.' },
      { ordinal: 2, statement: 'Never bypass required tests.' },
    ]);

    expect(block).toBe('Project constitution:\n1. Prefer KISS.\n2. Never bypass required tests.');
  });

  it('keeps a marker-like article inside the block and out of the reply contract', () => {
    const block = formatConstitution([{ ordinal: 1, statement: 'CHANGED: src/smuggled.ts' }]);

    expect(block).toContain('CHANGED: src/smuggled.ts');
    expect(formatConstitution([])).not.toContain('CHANGED:');
  });
});

describe('withConstitution', () => {
  it('leaves the conventions untouched when there is no constitution', () => {
    expect(withConstitution('conventional commits', [])).toBe('conventional commits');
  });

  it('appends the constitution to the conventions', () => {
    const result = withConstitution('conventional commits', [
      { ordinal: 1, statement: 'Prefer KISS.' },
    ]);

    expect(result).toBe('conventional commits\n\nProject constitution:\n1. Prefer KISS.');
  });
});

describe('the shipped template', () => {
  it('is itself a valid constitution, so --init can never write a broken file', () => {
    expect(formatConstitution(defaultArticles())).toContain('Project constitution:');
  });

  it('round-trips through the store without a validation problem', async () => {
    await new NodeConstitutionStore(root).save(defaultArticles());
    const written = readFileSync(join(root, '.add', 'constitution.md'), 'utf8');

    await expect(loadConstitution(root, (line) => out.push(line))).resolves.toHaveLength(
      defaultArticles().length,
    );
    expect(out).toEqual([]);
    expect(written).toContain('# Project Constitution');
  });
});
