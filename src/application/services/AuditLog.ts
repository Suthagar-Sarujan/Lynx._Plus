export interface AuditEntry {
  actor: string;
  action: string; // e.g. "post.update", "auth.login"
  entityType?: 'post' | 'feed';
  entityId?: string;
  summary: string;
  detail?: unknown; // serialised to JSON
  ip?: string;
}

export interface AuditRecord {
  id: string;
  at: string;
  actor: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  detail: string | null;
  ip: string | null;
}

/** Port — append-only trail of who did what. Recording must never break the action it describes. */
export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
  list(opts: { limit: number; entityId?: string }): Promise<AuditRecord[]>;
}
