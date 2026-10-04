export type AuditResult = 'success' | 'failure' | 'denied';

export type AuditRisk = 'low' | 'medium' | 'high' | 'critical';

export type AuditEventType =
  | 'agent_started'
  | 'agent_finished'
  | 'tool_called'
  | 'tool_denied'
  | 'permission_requested'
  | 'human_approval'
  | 'human_rejection'
  | 'file_changed'
  | 'command_executed'
  | 'test_started'
  | 'test_finished'
  | 'review_started'
  | 'review_finished'
  | 'git_commit'
  | 'git_push'
  | 'pr_created';

export interface AuditEvent {
  readonly timestamp: string;
  readonly runId: string;
  readonly event: AuditEventType;
  readonly agent?: string;
  readonly result?: AuditResult;
  readonly risk?: AuditRisk;
  readonly tool?: string;
  readonly target?: string;
  readonly reason?: string;
  readonly command?: string;
  readonly excerpt?: string;
  readonly exitCode?: number;
}

export type AuditEventPayload = Omit<AuditEvent, 'timestamp'>;
