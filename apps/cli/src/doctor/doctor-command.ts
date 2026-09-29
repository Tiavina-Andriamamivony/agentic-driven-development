import type { Styler } from '../ux/style.ts';
import { createStyler } from '../ux/style.ts';

export interface DoctorCheck {
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface DoctorProbes {
  node(): Promise<DoctorCheck>;
  pnpm(): Promise<DoctorCheck>;
  gitHubCli(): Promise<DoctorCheck>;
  opencode(): Promise<DoctorCheck>;
  gitRepository(): Promise<DoctorCheck>;
}

interface DoctorReport {
  readonly checks: readonly DoctorCheck[];
  readonly code: number;
}

export async function runDoctor(probes: DoctorProbes): Promise<DoctorReport> {
  const checks = await Promise.all([
    probes.node(),
    probes.pnpm(),
    probes.gitHubCli(),
    probes.opencode(),
    probes.gitRepository(),
  ]);
  return { checks, code: checks.every((check) => check.ok) ? 0 : 1 };
}

export function formatDoctorReport(
  report: DoctorReport,
  style: Styler = createStyler(false),
): string {
  const lines = report.checks.map((check) => formatCheck(check, style));
  if (report.checks.some((check) => check.label === 'opencode' && !check.ok)) {
    lines.push(style.dim('Run `lou init` in a terminal to install it.'));
  }
  const passed = report.checks.filter((check) => check.ok).length;
  const summary =
    passed === report.checks.length
      ? style.green(`${passed}/${report.checks.length} checks passed.`)
      : style.yellow(`${passed}/${report.checks.length} checks passed.`);
  lines.push('', summary);
  return `${lines.join('\n')}\n`;
}

function formatCheck(check: DoctorCheck, style: Styler): string {
  const detail = check.detail.length > 0 ? ` — ${check.detail}` : '';
  return `${style.check(check.ok)}  ${check.label}${detail}`;
}
