import { lstatSync } from 'node:fs';
import { join } from 'node:path';

export interface FilesystemProbe {
  isSymbolicLink(path: string): boolean;
}

export type InstallInfo =
  { readonly managed: true; readonly prefix: string } | { readonly managed: false };

const nodeFilesystemProbe: FilesystemProbe = {
  isSymbolicLink(path: string): boolean {
    try {
      return lstatSync(path).isSymbolicLink();
    } catch {
      return false;
    }
  },
};

export function detectInstall(
  scriptPath: string,
  fsx: FilesystemProbe = nodeFilesystemProbe,
): InstallInfo {
  const match = scriptPath.match(/^(.*)\/current\/apps\/cli\/src\/cli\.ts$/);
  if (match === null) {
    return { managed: false };
  }
  const prefix = match[1];
  if (prefix === undefined || prefix.length === 0) {
    return { managed: false };
  }
  if (!fsx.isSymbolicLink(join(prefix, 'current'))) {
    return { managed: false };
  }
  return { managed: true, prefix };
}
