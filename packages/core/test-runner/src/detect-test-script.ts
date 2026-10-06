import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type TestScriptPresence = 'declared' | 'missing' | 'no-manifest';

export function detectTestScript(cwd: string, name: string): TestScriptPresence {
  const manifest = readManifest(cwd);
  if (manifest === null) {
    return 'no-manifest';
  }
  return declaredScript(manifest, name) === null ? 'missing' : 'declared';
}

export function readTestScript(cwd: string, name: string): string | null {
  const manifest = readManifest(cwd);
  return manifest === null ? null : declaredScript(manifest, name);
}

function declaredScript(manifest: Record<string, unknown>, name: string): string | null {
  const scripts = manifest['scripts'];
  if (typeof scripts !== 'object' || scripts === null) {
    return null;
  }
  const declared = (scripts as Record<string, unknown>)[name];
  return typeof declared === 'string' ? declared : null;
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
