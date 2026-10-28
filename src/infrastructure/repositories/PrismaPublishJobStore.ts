import type { PrismaClient, PublishJob } from '@prisma/client';
import type { Platform } from '@/domain/entities/Post';
import type { PublishJobRecord, PublishJobStore } from '@/application/services/PublishJobStore';

const toRecord = (row: PublishJob): PublishJobRecord => ({
  postId: row.postId,
  platform: row.platform,
  status: row.status,
  attempts: row.attempts,
  platformPostId: row.platformPostId
});

export class PrismaPublishJobStore implements PublishJobStore {
  constructor(private readonly prisma: PrismaClient) {}

  async ensure(postId: string, platform: Platform, runAt: Date): Promise<PublishJobRecord> {
    const where = { postId_platform: { postId, platform } };
    const existing = await this.prisma.publishJob.findUnique({ where });
    if (existing?.platformPostId) return toRecord(existing); // already published: keep the result
    const row = await this.prisma.publishJob.upsert({
      where,
      create: { postId, platform, runAt },
      update: { runAt, status: 'SCHEDULED' }
    });
    return toRecord(row);
  }

  async recordSuccess(postId: string, platform: Platform, platformPostId: string): Promise<void> {
    await this.prisma.publishJob.update({
      where: { postId_platform: { postId, platform } },
      data: { status: 'PUBLISHED', platformPostId, lastError: null, attempts: { increment: 1 } }
    });
  }

  async recordFailure(postId: string, platform: Platform, message: string): Promise<void> {
    await this.prisma.publishJob.update({
      where: { postId_platform: { postId, platform } },
      data: { status: 'FAILED', lastError: message.slice(0, 2000), attempts: { increment: 1 } }
    });
  }

  async listForPost(postId: string): Promise<PublishJobRecord[]> {
    return (await this.prisma.publishJob.findMany({ where: { postId } })).map(toRecord);
  }
}
