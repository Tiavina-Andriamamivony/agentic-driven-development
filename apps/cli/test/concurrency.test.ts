import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../src/run/concurrency';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('mapWithConcurrency', () => {
  it('returns the results aligned with the input order', async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, (item) => Promise.resolve(item * 2));

    expect(results).toEqual([2, 4, 6]);
  });

  it('runs at most the requested number of workers at once', async () => {
    let active = 0;
    let peak = 0;
    const seen: number[] = [];
    const worker = async (item: number): Promise<number> => {
      active += 1;
      peak = Math.max(peak, active);
      await delay(10);
      seen.push(item);
      active -= 1;
      return item;
    };

    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, worker);

    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
    expect(peak).toBeLessThanOrEqual(2);
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('processes items sequentially when the limit is 1', async () => {
    const order: number[] = [];
    await mapWithConcurrency([3, 1, 2], 1, (item) => {
      order.push(item);
      return Promise.resolve(item);
    });

    expect(order).toEqual([3, 1, 2]);
  });

  it('provides the worker with its index', async () => {
    const results = await mapWithConcurrency(['a', 'b'], 3, (item, index) =>
      Promise.resolve(`${item}:${index}`),
    );

    expect(results).toEqual(['a:0', 'b:1']);
  });

  it('resolves to an empty array for no items', async () => {
    await expect(mapWithConcurrency([], 2, (item) => Promise.resolve(item))).resolves.toEqual([]);
  });
});
