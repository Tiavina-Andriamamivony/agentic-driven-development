import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_KEEP_CYCLES = 10;

const RUN_ARTIFACT = /^run-(\d+)(?:\.jsonl|\.summary\.json)?$/;

interface RetentionReport {
  readonly removed: readonly number[];
  readonly failed: readonly number[];
}

export function cycleOf(entryName: string): number | null {
  const matched = RUN_ARTIFACT.exec(entryName);
  const raw = matched?.[1];
  if (raw === undefined) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : null;
}

export function planRetention(
  entries: readonly string[],
  keep: number,
  current: number | null = null,
): readonly number[] {
  const cycles = [...new Set(entries.map(cycleOf).filter(isNumber))].sort((a, b) => a - b);
  const protectedCycles = cycles.slice(-Math.max(keep, 0));
  return cycles.filter((cycle) => !protectedCycles.includes(cycle) && cycle !== current);
}

function isNumber(value: number | null): value is number {
  return value !== null;
}

function artifactNames(cycle: number): readonly string[] {
  return [`run-${cycle}`, `run-${cycle}.jsonl`, `run-${cycle}.summary.json`];
}

function removeArtifacts(directory: string, cycle: number, failed: number[]): void {
  for (const name of artifactNames(cycle)) {
    try {
      rmSync(join(directory, name), { recursive: true, force: true });
    } catch {
      failed.push(cycle);
    }
  }
}

export function pruneRunCycles(
  directory: string,
  current: number,
  keep: number = DEFAULT_KEEP_CYCLES,
): RetentionReport {
  const removed: number[] = [];
  const failed: number[] = [];
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return { removed, failed };
  }
  for (const cycle of planRetention(entries, keep, current)) {
    removeArtifacts(directory, cycle, failed);
    removed.push(cycle);
  }
  return { removed, failed };
}
