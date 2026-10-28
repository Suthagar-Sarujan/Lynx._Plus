import type { PrismaClient } from '@prisma/client';
import { Story } from '@/domain/entities/Story';
import type { Category } from '@/domain/entities/Post';
import type { StoryRepository } from '@/domain/repositories/StoryRepository';

export class PrismaStoryRepository implements StoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(category: Category, sourceUrl?: string, sourceName?: string): Promise<Story> {
    const row = await this.prisma.story.create({ data: { category, sourceUrl, sourceName } });
    return Story.create(row);
  }

  async findById(id: string): Promise<Story | null> {
    const row = await this.prisma.story.findUnique({ where: { id } });
    return row ? Story.create(row) : null;
  }

  async existsBySourceUrl(sourceUrl: string): Promise<boolean> {
    return (await this.prisma.story.count({ where: { sourceUrl } })) > 0;
  }
}
