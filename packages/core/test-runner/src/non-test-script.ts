const NON_TEST_EXECUTABLES = new Set([
  'tsc',
  'eslint',
  'biome',
  'prettier',
  'stylelint',
  'oxlint',
  'swc',
  'next',
  'vite',
]);

const WRAPPERS = new Set(['npx', 'pnpm', 'npm', 'yarn', 'bun', 'exec', 'run', 'dlx']);

const SEPARATORS = /\s*(?:&&|\|\||;)\s*/;

export function nonTestScriptTool(script: string): string | null {
  const segments = script.split(SEPARATORS).filter((segment) => segment.trim() !== '');
  if (segments.length === 0) {
    return null;
  }
  const tools: string[] = [];
  for (const segment of segments) {
    const tool = firstExecutable(segment);
    if (tool === null || !NON_TEST_EXECUTABLES.has(tool)) {
      return null;
    }
    tools.push(tool);
  }
  return tools[0] ?? null;
}

function firstExecutable(segment: string): string | null {
  for (const token of segment.trim().split(/\s+/)) {
    if (!WRAPPERS.has(token)) {
      return token;
    }
  }
  return null;
}
