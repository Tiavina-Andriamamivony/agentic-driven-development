import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { OrchestratorStatus } from '@lou/orchestrator';
import type { RunSummary } from '../run/run-command.ts';

interface RunEntry {
  readonly issueNumber: number;
  readonly status: OrchestratorStatus | 'running';
  readonly reason?: string;
  readonly pullRequestUrl?: string;
  readonly finishedAt?: string;
}

export interface RunsSnapshot {
  readonly summaries: readonly RunSummary[];
  readonly inProgress: readonly number[];
}

export interface RunsStore {
  readonly snapshot: () => RunsSnapshot;
}

interface RunsListOptions {
  readonly store: RunsStore;
  readonly json: boolean;
  readonly out: (line: string) => void;
}

const STATUS_LABELS: Readonly<Record<RunEntry['status'], string>> = {
  'pr-created': 'PR created',
  blocked: 'blocked',
  'human-intervention': 'needs human',
  failed: 'failed',
  running: 'in progress',
};

export function listEntries(snapshot: RunsSnapshot): readonly RunEntry[] {
  const entries: RunEntry[] = snapshot.summaries.map((summary) => ({
    issueNumber: summary.issueNumber,
    status: summary.status,
    ...(summary.reason !== undefined ? { reason: summary.reason } : {}),
    ...(summary.pullRequestUrl !== undefined ? { pullRequestUrl: summary.pullRequestUrl } : {}),
    finishedAt: summary.finishedAt,
  }));
  for (const issueNumber of snapshot.inProgress) {
    entries.push({ issueNumber, status: 'running' });
  }
  entries.sort(runOrder);
  return entries;
}

function runOrder(a: RunEntry, b: RunEntry): number {
  if (a.finishedAt === undefined) {
    return b.finishedAt === undefined ? 0 : -1;
  }
  if (b.finishedAt === undefined) {
    return 1;
  }
  if (a.finishedAt < b.finishedAt) {
    return 1;
  }
  return a.finishedAt > b.finishedAt ? -1 : 0;
}

export function formatRunsReport(entries: readonly RunEntry[]): readonly string[] {
  return entries.map(formatEntry);
}

function formatEntry(entry: RunEntry): string {
  const time = entry.finishedAt === undefined ? '' : `  ${formatTime(entry.finishedAt)}`;
  const detail = entry.pullRequestUrl ?? entry.reason ?? '';
  return `#${entry.issueNumber}  ${STATUS_LABELS[entry.status]}${time}${
    detail === '' ? '' : `  ${detail}`
  }`;
}

function formatTime(iso: string): string {
  return iso.replace('T', ' ').slice(0, 19);
}

export function runListRuns(options: RunsListOptions): Promise<number> {
  const entries = listEntries(options.store.snapshot());
  if (options.json) {
    options.out(JSON.stringify(entries, null, 2));
    return Promise.resolve(0);
  }
  if (entries.length === 0) {
    options.out('No runs yet. Run `lou run <issue-number>` to start one.');
    return Promise.resolve(0);
  }
  formatRunsReport(entries).forEach((line) => {
    options.out(line);
  });
  return Promise.resolve(0);
}

export function createNodeRunsStore(directory: string): RunsStore {
  return {
    snapshot: () => readSnapshot(directory),
  };
}

const SUMMARY_FILE = /^run-(\d+)\.summary\.json$/;
const AUDIT_FILE = /^run-(\d+)\.jsonl$/;

function readSnapshot(directory: string): RunsSnapshot {
  const names = listNames(directory);
  const summaries = summariesFrom(directory, names);
  const covered = new Set(summaries.map((summary) => summary.issueNumber));
  const inProgress = inProgressFrom(names, covered);
  return { summaries, inProgress };
}

function listNames(directory: string): readonly string[] {
  try {
    return readdirSync(directory);
  } catch {
    return [];
  }
}

function summariesFrom(directory: string, names: readonly string[]): RunSummary[] {
  const summaries: RunSummary[] = [];
  for (const name of names) {
    const issueNumber = issueNumberOf(SUMMARY_FILE.exec(name));
    if (issueNumber === null) {
      continue;
    }
    const parsed = parseSummaryFile(readFileSync(join(directory, name), 'utf8'));
    if (parsed === null) {
      continue;
    }
    summaries.push({ issueNumber, ...parsed });
  }
  return summaries;
}

function inProgressFrom(names: readonly string[], covered: ReadonlySet<number>): number[] {
  const inProgress: number[] = [];
  for (const name of names) {
    const issueNumber = issueNumberOf(AUDIT_FILE.exec(name));
    if (issueNumber === null) {
      continue;
    }
    if (!covered.has(issueNumber)) {
      inProgress.push(issueNumber);
    }
  }
  return inProgress;
}

function issueNumberOf(match: RegExpExecArray | null): number | null {
  const value = match?.[1];
  if (value === undefined) {
    return null;
  }
  return Number(value);
}

interface ParsedSummaryBody {
  readonly status: OrchestratorStatus;
  reason?: string;
  pullRequestUrl?: string;
  readonly startedAt: string;
  readonly finishedAt: string;
}

function parseSummaryFile(content: string): ParsedSummaryBody | null {
  const value = parseJson(content);
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  return bodyFromRecord(value as Record<string, unknown>);
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function bodyFromRecord(record: Record<string, unknown>): ParsedSummaryBody | null {
  const status = record.status;
  const startedAt = record.startedAt;
  const finishedAt = record.finishedAt;
  if (typeof status !== 'string' || !isStatus(status)) {
    return null;
  }
  if (typeof startedAt !== 'string' || typeof finishedAt !== 'string') {
    return null;
  }
  const body: ParsedSummaryBody = { status, startedAt, finishedAt };
  const reason = record.reason;
  if (typeof reason === 'string') {
    body.reason = reason;
  }
  const pullRequestUrl = record.pullRequestUrl;
  if (typeof pullRequestUrl === 'string') {
    body.pullRequestUrl = pullRequestUrl;
  }
  return body;
}

function isStatus(value: string): value is OrchestratorStatus {
  return (
    value === 'pr-created' ||
    value === 'blocked' ||
    value === 'human-intervention' ||
    value === 'failed'
  );
}
