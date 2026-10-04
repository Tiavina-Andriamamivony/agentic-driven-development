const OUTPUT_LIMIT = 2_000;

export function excerptOf(output: string): { readonly excerpt: string } | Record<string, never> {
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    return {};
  }
  const clipped = trimmed.length > OUTPUT_LIMIT;
  const head = clipped ? trimmed.slice(0, OUTPUT_LIMIT) : trimmed;
  return { excerpt: clipped ? `${head}... [truncated]` : head };
}
