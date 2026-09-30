import { NodeConstitutionStore, validateArticles } from '@lou/constitution';
import type { Article } from '@lou/constitution';

export function formatConstitution(articles: readonly Article[]): string {
  if (articles.length === 0) {
    return '';
  }
  return [
    'Project constitution:',
    ...articles.map((article) => `${article.ordinal}. ${article.statement}`),
  ].join('\n');
}

export async function loadConstitution(
  root: string,
  out: (line: string) => void,
): Promise<readonly Article[]> {
  const file = await new NodeConstitutionStore(root).load();
  const problems = validateArticles(file.articles);
  if (problems.length === 0) {
    return file.articles;
  }
  out(`Project constitution ignored: ${problems[0]}. Fix ${file.path} and run again.`);
  return [];
}

export function withConstitution(conventions: string, articles: readonly Article[]): string {
  const block = formatConstitution(articles);
  return block.length === 0 ? conventions : `${conventions}\n\n${block}`;
}
