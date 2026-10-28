import type { PrismaClient } from '@prisma/client';
import type { AuditEntry, AuditLog, AuditRecord } from '@/application/services/AuditLog';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export class PrismaAuditLog implements AuditLog {
  constructor(private readonly prisma: PrismaClient) {}

  async record(e: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actor: clip(e.actor, 100),
          action: e.action,
          entityType: e.entityType ?? null,
          entityId: e.entityId ?? null,
          summary: clip(e.summary, 300),
          detail: e.detail === undefined ? null : JSON.stringify(e.detail),
          ip: e.ip ? clip(e.ip, 64) : null
        }
      });
    } catch (err) {
      // The trail is best-effort: a logging failure must not fail the user's action.
      console.error('[audit] could not record entry', e.action, err);
    }
  }

  async list({ limit, entityId }: { limit: number; entityId?: string }): Promise<AuditRecord[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: entityId ? { entityId } : undefined,
      orderBy: { at: 'desc' },
      take: limit
    });
    return rows.map((r) => ({ ...r, at: r.at.toISOString() }));
  }
}
