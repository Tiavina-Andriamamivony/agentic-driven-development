import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Article } from './article.ts';
import { parseConstitution } from './parse.ts';
import { serializeConstitution } from './serialize.ts';

export interface ConstitutionFile {
  readonly exists: boolean;
  readonly articles: readonly Article[];
  readonly path: string;
}

export class NodeConstitutionStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  async load(): Promise<ConstitutionFile> {
    const path = this.path;
    try {
      const content = await readFile(path, 'utf8');
      return { exists: true, articles: parseConstitution(content), path };
    } catch (error) {
      if (isMissingFile(error)) {
        return { exists: false, articles: [], path };
      }
      throw error;
    }
  }

  async save(articles: readonly Article[]): Promise<string> {
    await mkdir(this.dotAddPath, { recursive: true });
    await writeFile(this.path, serializeConstitution(articles), 'utf8');
    return this.path;
  }

  private get dotAddPath(): string {
    return join(this.root, '.add');
  }

  private get path(): string {
    return join(this.dotAddPath, 'constitution.md');
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
