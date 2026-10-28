import type { PrismaClient, Post as PrismaPost } from '@prisma/client';
import { Post } from '@/domain/entities/Post';
import type { Category, PostStatus } from '@/domain/entities/Post';
import type { BodyAlign, BodyFontKey } from '@/domain/entities/BodyStyle';
import type { PostRepository, PostFilter } from '@/domain/repositories/PostRepository';

const CATEGORIES: Category[] = ['SRI_LANKA', 'INDIA', 'FOREIGN'];
const STATUSES: PostStatus[] = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED'];

type PostRowWithCategory = PrismaPost & { category: Category };

function toDomain(row: PostRowWithCategory): Post {
  return Post.create({
    id: row.id,
    storyId: row.storyId,
    // `category` lives on the related Story row; callers below always pass
    // a row joined with `story` and spread `category: row.story.category`
    // onto it before calling this function.
    category: row.category,
    language: row.language,
    mode: row.mode as Post['mode'],
    status: row.status as Post['status'],
    dateLabel: row.dateLabel,
    yearLabel: row.yearLabel,
    badgeWord: row.badgeWord,
    showBreaking: row.showBreaking,
    showNews: row.showNews,
    bodyText: row.bodyText,
    creditTag: row.creditTag,
    bodyFont: row.bodyFont as BodyFontKey | null,
    bodyFontSize: row.bodyFontSize,
    bodyAlign: row.bodyAlign as BodyAlign | null,
    bodyLineHeight: row.bodyLineHeight,
    directTitle: row.directTitle,
    photoUrl: row.photoUrl,
    renderedImageUrl: row.renderedImageUrl,
    caption: row.caption,
    hashtags: row.hashtags,
    scheduledAt: row.scheduledAt,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });
}

export class PrismaPostRepository implements PostRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get includeStory() {
    return { story: true } as const;
  }

  async findById(id: string): Promise<Post | null> {
    const row = await this.prisma.post.findUnique({ where: { id }, include: this.includeStory });
    if (!row) return null;
    return toDomain({ ...row, category: row.story.category } as never);
  }

  async findMany(filter: PostFilter): Promise<Post[]> {
    const rows = await this.prisma.post.findMany({
      where: {
        storyId: filter.storyId,
        status: filter.status,
        ...(filter.category ? { story: { category: filter.category } } : {})
      },
      include: this.includeStory,
      orderBy: { updatedAt: 'desc' }
    });
    return rows.map((row) => toDomain({ ...row, category: row.story.category } as never));
  }

  async findRecent(limit: number): Promise<Post[]> {
    const rows = await this.prisma.post.findMany({
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: this.includeStory
    });
    return rows.map((row) => toDomain({ ...row, category: row.story.category } as never));
  }

  async countByCategory(): Promise<Record<Category, number>> {
    const counts = await Promise.all(
      CATEGORIES.map((category) =>
        this.prisma.post.count({ where: { story: { category } } })
      )
    );
    return Object.fromEntries(CATEGORIES.map((c, i) => [c, counts[i]])) as Record<Category, number>;
  }

  async countByStatus(): Promise<Record<PostStatus, number>> {
    const counts = await Promise.all(
      STATUSES.map((status) => this.prisma.post.count({ where: { status } }))
    );
    return Object.fromEntries(STATUSES.map((s, i) => [s, counts[i]])) as Record<PostStatus, number>;
  }

  async recentHashtags(limit: number): Promise<string[]> {
    const rows = await this.prisma.post.findMany({
      where: { hashtags: { not: null } },
      select: { hashtags: true },
      orderBy: { updatedAt: 'desc' },
      take: limit
    });
    return rows.map((r) => r.hashtags ?? '').filter(Boolean);
  }

  async recentHeadlines(since: Date): Promise<string[]> {
    const rows = await this.prisma.post.findMany({
      where: { language: 'en', createdAt: { gte: since }, caption: { not: null } },
      select: { caption: true }
    });
    return rows.map((r) => r.caption ?? '').filter(Boolean);
  }

  async save(post: Post): Promise<Post> {
    const p = post.toProps();
    const row = await this.prisma.post.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        storyId: p.storyId,
        language: p.language,
        mode: p.mode,
        status: p.status,
        dateLabel: p.dateLabel,
        yearLabel: p.yearLabel,
        badgeWord: p.badgeWord,
        showBreaking: p.showBreaking,
        showNews: p.showNews,
        bodyText: p.bodyText,
        creditTag: p.creditTag,
        bodyFont: p.bodyFont,
        bodyFontSize: p.bodyFontSize,
        bodyAlign: p.bodyAlign,
        bodyLineHeight: p.bodyLineHeight,
        directTitle: p.directTitle,
        photoUrl: p.photoUrl,
        renderedImageUrl: p.renderedImageUrl,
        caption: p.caption,
        hashtags: p.hashtags,
        scheduledAt: p.scheduledAt,
        publishedAt: p.publishedAt
      },
      update: {
        language: p.language,
        mode: p.mode,
        status: p.status,
        dateLabel: p.dateLabel,
        yearLabel: p.yearLabel,
        badgeWord: p.badgeWord,
        showBreaking: p.showBreaking,
        showNews: p.showNews,
        bodyText: p.bodyText,
        creditTag: p.creditTag,
        bodyFont: p.bodyFont,
        bodyFontSize: p.bodyFontSize,
        bodyAlign: p.bodyAlign,
        bodyLineHeight: p.bodyLineHeight,
        directTitle: p.directTitle,
        photoUrl: p.photoUrl,
        renderedImageUrl: p.renderedImageUrl,
        caption: p.caption,
        hashtags: p.hashtags,
        scheduledAt: p.scheduledAt,
        publishedAt: p.publishedAt
      },
      include: this.includeStory
    });
    return toDomain({ ...row, category: row.story.category } as never);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.post.delete({ where: { id } });
  }
}
