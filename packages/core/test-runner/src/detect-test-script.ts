import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type TestScriptPresence = 'declared' | 'missing' | 'no-manifest';

export function detectTestScript(cwd: string, name: string): TestScriptPresence {
  const manifest = readManifest(cwd);
  if (manifest === null) {
    return 'no-manifest';
  }
  const scripts = manifest['scripts'];
  if (typeof scripts !== 'object' || scripts === null) {
    return 'missing';
  }
  const declared = (scripts as Record<string, unknown>)[name];
  return typeof declared === 'string' ? 'declared' : 'missing';
}

function readManifest(cwd: string): Record<string, unknown> | null {
  try {
    const raw = readFileSync(join(cwd, 'package.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
