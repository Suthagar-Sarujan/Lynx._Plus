import type { PrismaClient } from '@prisma/client';
import type { Category } from '@/domain/entities/Post';
import type { AutopilotCandidate, AutopilotStore, FailedJob } from '@/application/services/AutopilotStore';

const CATEGORIES: Category[] = ['SRI_LANKA', 'INDIA', 'FOREIGN'];

export class PrismaAutopilotStore implements AutopilotStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findCandidates(createdAfter: Date): Promise<AutopilotCandidate[]> {
    const rows = await this.prisma.post.findMany({
      where: {
        language: 'en',
        status: 'DRAFT',
        renderedImageUrl: { not: null },
        createdAt: { gte: createdAfter },
        story: { sourceUrl: { not: null }, autoQueuedAt: null }
      },
      include: { story: true },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    return rows.map((r) => ({
      postId: r.id,
      storyId: r.storyId,
      category: r.story.category,
      headline: r.caption ?? '',
      photoUrl: r.photoUrl,
      sourceName: r.story.sourceName,
      sourceUrl: r.story.sourceUrl,
      createdAt: r.createdAt
    }));
  }

  async claimStory(storyId: string): Promise<boolean> {
    const { count } = await this.prisma.story.updateMany({ where: { id: storyId, autoQueuedAt: null }, data: { autoQueuedAt: new Date() } });
    return count === 1;
  }

  countStoriesQueuedSince(since: Date): Promise<number> {
    return this.prisma.story.count({ where: { autoQueuedAt: { gte: since } } });
  }

  async lastQueuedByCategory(): Promise<Partial<Record<Category, Date>>> {
    const out: Partial<Record<Category, Date>> = {};
    await Promise.all(
      CATEGORIES.map(async (category) => {
        const row = await this.prisma.story.findFirst({ where: { category, autoQueuedAt: { not: null } }, orderBy: { autoQueuedAt: 'desc' }, select: { autoQueuedAt: true } });
        if (row?.autoQueuedAt) out[category] = row.autoQueuedAt;
      })
    );
    return out;
  }

  async isQueuedByAutopilot(postId: string): Promise<boolean> {
    return (await this.prisma.post.count({ where: { id: postId, story: { autoQueuedAt: { not: null } } } })) > 0;
  }

  async releaseQueued(postId: string): Promise<void> {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { storyId: true, status: true } });
    if (!post || post.status === 'PUBLISHED') return; // never touch something already sent
    await this.prisma.$transaction([
      this.prisma.publishJob.deleteMany({ where: { postId, platformPostId: null } }),
      this.prisma.post.update({ where: { id: postId }, data: { status: 'DRAFT', scheduledAt: null } }),
      this.prisma.story.update({ where: { id: post.storyId }, data: { autoQueuedAt: null } })
    ]);
  }

  async lastScheduledAt(): Promise<Date | null> {
    const r = await this.prisma.post.aggregate({
      _max: { scheduledAt: true },
      where: { status: { in: ['SCHEDULED', 'PUBLISHED'] }, story: { autoQueuedAt: { not: null } } }
    });
    return r._max.scheduledAt ?? null;
  }

  async recentSentHeadlines(since: Date): Promise<string[]> {
    const rows = await this.prisma.post.findMany({
      where: { language: 'en', status: { in: ['SCHEDULED', 'PUBLISHED'] }, updatedAt: { gte: since }, caption: { not: null } },
      select: { caption: true },
      take: 3000
    });
    return rows.map((r) => r.caption ?? '').filter(Boolean);
  }

  async listFailedJobs(limit: number): Promise<FailedJob[]> {
    const rows = await this.prisma.publishJob.findMany({
      where: { status: 'FAILED' },
      include: { post: { select: { caption: true, bodyText: true } } },
      orderBy: { updatedAt: 'desc' },
      take: limit
    });
    return rows.map((r) => ({
      postId: r.postId,
      platform: r.platform,
      headline: r.post.caption ?? r.post.bodyText ?? '',
      error: r.lastError ?? 'Unknown error',
      attempts: r.attempts,
      at: r.updatedAt
    }));
  }

  async lastQueuedAt(): Promise<Date | null> {
    const row = await this.prisma.story.findFirst({ where: { autoQueuedAt: { not: null } }, orderBy: { autoQueuedAt: 'desc' }, select: { autoQueuedAt: true } });
    return row?.autoQueuedAt ?? null;
  }
}
