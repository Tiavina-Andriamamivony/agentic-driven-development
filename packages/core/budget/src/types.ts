export interface BudgetLimits {
  readonly maxCostUsd?: number;
  readonly maxMinutes?: number;
  readonly maxRuns?: number;
}

export interface RunUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly costUsd?: number;
  readonly elapsedMs?: number;
}

export interface ExhaustedLimit {
  readonly name: 'cost' | 'minutes' | 'runs' | 'tokens';
  readonly details: string;
}
