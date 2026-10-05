import type { Styler } from '../ux/style.ts';

const INDENT = '  ';
const ITEM = '    ';
const DETAIL = '      ';
const DOT = '·';
const TAIL = '…';
const MIN_ACTIVITY = 12;

export type TraceTone = 'info' | 'good' | 'bad';

interface HeaderInput {
  readonly issueNumber: number;
  readonly title: string;
  readonly workspace: string;
  readonly style: Styler;
}

interface LiveInput {
  readonly frame: string;
  readonly label: string;
  readonly activity: string;
  readonly duration: string;
  readonly silentFor?: string;
  readonly columns: number;
  readonly style: Styler;
}

interface DoneInput {
  readonly ok: boolean;
  readonly label: string;
  readonly detail: string;
  readonly style: Styler;
}

interface DetailInput {
  readonly text: string;
  readonly style: Styler;
}

interface ToolLineInput {
  readonly label: string;
  readonly ok: boolean;
  readonly style: Styler;
}

interface StatsInput {
  readonly thoughts: number;
  readonly tools: number;
  readonly tokens: number;
  readonly costUsd?: number;
  readonly style: Styler;
}

interface GateInput {
  readonly kind: string;
  readonly subject: string;
  readonly details: string;
  readonly style: Styler;
}

interface NoteInput {
  readonly text: string;
  readonly tone: TraceTone;
  readonly style: Styler;
}

export function humanDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
}

export function headerLines(input: HeaderInput): readonly string[] {
  const bar = input.style.purple('▍');
  const name = input.style.bold('lou run');
  const ticket = input.style.gray(`#${input.issueNumber} ${DOT} ${input.title}`);
  const workspace = input.style.gray(`⎿ workspace ${input.workspace}`);
  return [`${INDENT}${bar} ${name} ${ticket}`, `${INDENT}${workspace}`];
}

export function sectionLine(phase: string, style: Styler): string {
  return `${INDENT}${style.purple('▸')} ${style.bold(phase.toUpperCase())}`;
}

export function liveLine(input: LiveInput): string {
  const head = `${input.frame} ${input.label}`;
  const quietFor = input.silentFor ?? '';
  const room =
    input.columns -
    ITEM.length -
    visibleLength(head) -
    visibleLength(input.duration) -
    visibleLength(quietFor) -
    4;
  const activity = withSilence(input.activity, quietFor, Math.max(MIN_ACTIVITY, room));
  const plain = activity === '' ? head : `${head} ${DOT} ${activity}`;
  const lead = `${input.style.tone(input.label, input.frame)} ${input.style.agent(input.label)}`;
  if (input.duration === '') {
    return `${ITEM}${lead}${body(input, activity)}`;
  }
  const gap = Math.max(
    1,
    input.columns - ITEM.length - visibleLength(plain) - visibleLength(input.duration),
  );
  return `${ITEM}${lead}${body(input, activity)}${' '.repeat(gap)}${input.style.dim(input.duration)}`;
}

function withSilence(activity: string, quietFor: string, room: number): string {
  if (quietFor === '') {
    return truncate(activity, room);
  }
  const heartbeat = `no events for ${quietFor}`;
  const combined = activity === '' ? heartbeat : `${activity} ${DOT} ${heartbeat}`;
  return truncate(combined, room);
}

function body(input: LiveInput, activity: string): string {
  return activity === '' ? '' : ` ${DOT} ${input.style.gray(activity)}`;
}

export function doneLine(input: DoneInput): string {
  const icon = input.style.check(input.ok);
  const detail = input.detail === '' ? '' : ` ${DOT} ${input.style.gray(input.detail)}`;
  return `${ITEM}${icon} ${input.style.agent(input.label)}${detail}`;
}

export function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function detailLine(input: DetailInput): string {
  return `${DETAIL}${input.style.gray(`⎿ ${input.text}`)}`;
}

export function toolLine(input: ToolLineInput): string {
  const label = input.style.gray(input.label);
  const mark = input.ok ? '' : ` ${input.style.check(false)}`;
  return `${DETAIL}⎿${mark} ${label}`;
}

export function statsLine(input: StatsInput): string {
  return detailLine({ text: statsParts(input).join(` ${DOT} `), style: input.style });
}

function statsParts(input: StatsInput): readonly string[] {
  const parts: string[] = [];
  if (input.thoughts > 0) {
    parts.push(countLabel(input.thoughts, 'thought', 'thoughts'));
  }
  if (input.tools > 0) {
    parts.push(countLabel(input.tools, 'tool', 'tools'));
  }
  if (input.thoughts === 0 && input.tools === 0) {
    parts.push('no activity reported');
  }
  parts.push(`${formatTokens(input.tokens)} tokens`);
  if (input.costUsd !== undefined && input.costUsd > 0) {
    parts.push(formatCost(input.costUsd));
  }
  return parts;
}

export function hasActivity(stats: StatsInput): boolean {
  return stats.thoughts > 0 || stats.tools > 0 || stats.tokens > 0;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}k`;
  }
  return String(tokens);
}

function formatCost(costUsd: number): string {
  return `$${costUsd.toFixed(3)}`;
}

export function noteLine(input: NoteInput): string {
  const text = input.style.gray(input.text);
  if (input.tone === 'info') {
    return `${ITEM}${input.style.gray(DOT)} ${text}`;
  }
  return `${ITEM}${input.style.check(input.tone === 'good')} ${text}`;
}

export function promptLine(text: string, style: Styler): string {
  return `${ITEM}${style.yellow('?')} ${style.bold(text)}`;
}

export function gateLines(input: GateInput): readonly string[] {
  const heading = `${INDENT}${input.style.purple('▸')} ${input.style.bold(
    `${input.kind.toUpperCase()} GATE`,
  )}`;
  const subject = `${ITEM}${input.style.bold(input.subject)}`;
  const details = input.details.split('\n').map((line) => `${DETAIL}${input.style.gray(line)}`);
  return ['', heading, subject, ...details, ''];
}

function visibleLength(text: string): number {
  return Array.from(text).length;
}

function truncate(text: string, max: number): string {
  const characters = Array.from(text);
  if (characters.length <= max) {
    return text;
  }
  return `${TAIL}${characters.slice(characters.length - max + 1).join('')}`;
}
