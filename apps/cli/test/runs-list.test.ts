import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RunSummary } from '../src/run/run-command';
import type { RunsSnapshot, RunsStore } from '../src/runs/runs-list';
import {
  createNodeRunsStore,
  formatRunsReport,
  listEntries,
  runListRuns,
} from '../src/runs/runs-list';

const DONE: RunSummary = {
  issueNumber: 12,
  status: 'pr-created',
  pullRequestUrl: 'https://hub.example/pr/42',
  startedAt: '2026-09-29T09:00:00.000Z',
  finishedAt: '2026-09-29T10:00:00.000Z',
};

const BLOCKED: RunSummary = {
  issueNumber: 11,
  status: 'blocked',
  reason: 'security risk',
  startedAt: '2026-09-29T08:00:00.000Z',
  finishedAt: '2026-09-29T08:30:00.000Z',
};

function storeOf(snapshot: RunsSnapshot): RunsStore {
  return { snapshot: () => snapshot };
}

describe('listEntries', () => {
  it('puts in-progress runs before finished ones', () => {
    const entries = listEntries({ summaries: [DONE, BLOCKED], inProgress: [13] });

    expect(entries.map((entry) => entry.issueNumber)).toEqual([13, 12, 11]);
  });

  it('sorts finished runs by finishedAt descending', () => {
    const entries = listEntries({ summaries: [DONE, BLOCKED], inProgress: [] });

    expect(entries.map((entry) => entry.issueNumber)).toEqual([12, 11]);
  });
});

describe('formatRunsReport', () => {
  it('formats finished and in-progress runs', () => {
    const lines = formatRunsReport(listEntries({ summaries: [DONE], inProgress: [13] }));

    expect(lines).toEqual([
      '#13  in progress',
      '#12  PR created  2026-09-29 10:00:00  https://hub.example/pr/42',
    ]);
  });

  it('falls back to the reason when no pull request url exists', () => {
    const lines = formatRunsReport([BLOCKED]);

    expect(lines).toEqual(['#11  blocked  2026-09-29 08:30:00  security risk']);
  });
});

describe('runListRuns', () => {
  it('prints the run report', async () => {
    const out: string[] = [];
    const code = await runListRuns({
      store: storeOf({ summaries: [DONE], inProgress: [13] }),
      json: false,
      out: (line) => out.push(line),
    });

    expect(code).toBe(0);
    expect(out).toEqual([
      '#13  in progress',
      '#12  PR created  2026-09-29 10:00:00  https://hub.example/pr/42',
    ]);
  });

  it('prints parseable JSON when asked', async () => {
    const out: string[] = [];
    const code = await runListRuns({
      store: storeOf({ summaries: [DONE], inProgress: [13] }),
      json: true,
      out: (line) => out.push(line),
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out.join('\n')) as readonly {
      readonly issueNumber: number;
      readonly status: string;
    }[];
    expect(parsed).toEqual([
      { issueNumber: 13, status: 'running' },
      {
        issueNumber: 12,
        status: 'pr-created',
        pullRequestUrl: 'https://hub.example/pr/42',
        finishedAt: '2026-09-29T10:00:00.000Z',
      },
    ]);
  });

  it('prints a hint when there are no runs', async () => {
    const out: string[] = [];
    const code = await runListRuns({
      store: storeOf({ summaries: [], inProgress: [] }),
      json: false,
      out: (line) => out.push(line),
    });

    expect(code).toBe(0);
    expect(out).toEqual(['No runs yet. Run `lou run <issue-number>` to start one.']);
  });
});

describe('createNodeRunsStore', () => {
  it('reads summaries and detects in-progress audit files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lou-runs-'));
    writeFileSync(join(dir, 'run-12.summary.json'), JSON.stringify(DONE));
    writeFileSync(join(dir, 'run-12.jsonl'), '');
    writeFileSync(join(dir, 'run-13.jsonl'), '');
    writeFileSync(join(dir, 'run-9.summary.json'), 'not json');

    const snapshot = createNodeRunsStore(dir).snapshot();

    expect(snapshot).toEqual({
      summaries: [DONE],
      inProgress: [13],
    });
    rmSync(dir, { recursive: true, force: true });
  });

  it('is empty when the directory does not exist', () => {
    const snapshot = createNodeRunsStore(join(tmpdir(), 'lou-runs-missing-xyz')).snapshot();

    expect(snapshot).toEqual({ summaries: [], inProgress: [] });
  });
});
