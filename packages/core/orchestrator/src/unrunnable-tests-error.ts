export class UnrunnableTestsError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'UnrunnableTestsError';
  }
}
