import { defaultArticles, NodeConstitutionStore, validateArticles } from '@lou/constitution';
import type { Article } from '@lou/constitution';

export interface ConstitutionWriter {
  load(): Promise<{
    readonly exists: boolean;
    readonly articles: readonly Article[];
    readonly path: string;
  }>;
  save(articles: readonly Article[]): Promise<string>;
}

export function createNodeConstitutionWriter(root: string): ConstitutionWriter {
  return new NodeConstitutionStore(root);
}

export interface ConstitutionOptions {
  readonly init: boolean;
  readonly force: boolean;
  readonly json: boolean;
}

interface ConstitutionReport {
  readonly action: 'showed' | 'created' | 'refused' | 'replaced';
  readonly path: string;
  readonly exists: boolean;
  readonly articles: number;
  readonly problems: readonly string[];
}

export async function runConstitution(
  writer: ConstitutionWriter,
  options: ConstitutionOptions,
  out: (line: string) => void,
): Promise<number> {
  const report = options.init ? await write(writer, options.force) : await show(writer);
  if (options.json) {
    out(JSON.stringify(report));
    return report.action === 'refused' ? 1 : 0;
  }
  for (const line of describe(report)) {
    out(line);
  }
  return report.action === 'refused' ? 1 : 0;
}

async function show(writer: ConstitutionWriter): Promise<ConstitutionReport> {
  const file = await writer.load();
  return {
    action: 'showed',
    path: file.path,
    exists: file.exists,
    articles: file.articles.length,
    problems: validateArticles(file.articles),
  };
}

async function write(writer: ConstitutionWriter, force: boolean): Promise<ConstitutionReport> {
  const current = await writer.load();
  if (current.exists && !force) {
    return {
      action: 'refused',
      path: current.path,
      exists: true,
      articles: current.articles.length,
      problems: [],
    };
  }
  const path = await writer.save(defaultArticles());
  return {
    action: current.exists ? 'replaced' : 'created',
    path,
    exists: true,
    articles: defaultArticles().length,
    problems: [],
  };
}

function describe(report: ConstitutionReport): readonly string[] {
  const lines = [`Constitution: ${report.path}`];
  if (report.action === 'refused') {
    return [...lines, 'Already present. Re-run with --force to replace it.'];
  }
  if (report.action === 'created' || report.action === 'replaced') {
    return [
      ...lines,
      `${report.action === 'created' ? 'Created' : 'Replaced'} with the ${report.articles} default articles.`,
    ];
  }
  if (!report.exists) {
    return [...lines, 'Not found. Create it with: lou constitution --init'];
  }
  const problems = report.problems.length > 0 ? ` (${report.problems[0]})` : '';
  return [...lines, `Found: ${report.articles} articles${problems}`];
}
