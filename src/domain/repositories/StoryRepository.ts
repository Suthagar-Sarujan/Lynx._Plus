import type { Story } from '@/domain/entities/Story';
import type { Category } from '@/domain/entities/Post';

export interface StoryRepository {
  create(category: Category, sourceUrl?: string, sourceName?: string): Promise<Story>;
  findById(id: string): Promise<Story | null>;
  existsBySourceUrl(sourceUrl: string): Promise<boolean>;
}
