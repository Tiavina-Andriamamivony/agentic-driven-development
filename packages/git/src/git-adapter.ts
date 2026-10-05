export interface GitAdapter {
  createBranch(name: string): Promise<void>;
  stage(paths: readonly string[]): Promise<void>;
  commit(message: string): Promise<void>;
  push(): Promise<void>;
  getCurrentBranch(): Promise<string>;
  isClean(): Promise<boolean>;
  changedPaths(): Promise<readonly string[]>;
}
