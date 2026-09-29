import { spawnSync } from 'node:child_process';

export const LOU_REPO = 'Tiavina-Andriamamivony/lou-agents-orchestrator';

export type LatestVersion = (repo: string) => Promise<string | undefined>;

export function createGhLatestFetcher(): LatestVersion {
  return (repo: string): Promise<string | undefined> => {
    const result = spawnSync('gh', ['api', `repos/${repo}/releases/latest`, '--jq', '.tag_name'], {
      encoding: 'utf8',
    });
    if (result.error !== undefined || result.status !== 0) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(result.stdout.trim().length === 0 ? undefined : result.stdout.trim());
  };
}
