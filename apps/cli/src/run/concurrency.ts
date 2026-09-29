export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<readonly R[]> {
  const results: R[] = new Array<R>(items.length);
  let cursor = 0;
  const entries = items.map((item, index) => ({ item, index }));
  const active = Math.min(limit, entries.length);
  const pump = async (): Promise<void> => {
    while (cursor < entries.length) {
      const entry = entries[cursor];
      cursor += 1;
      if (entry === undefined) {
        continue;
      }
      results[entry.index] = await worker(entry.item, entry.index);
    }
  };
  await Promise.all(Array.from({ length: active }, pump));
  return results;
}
