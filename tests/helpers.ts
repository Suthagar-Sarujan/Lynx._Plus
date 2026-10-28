import { Post, type PostProps } from '@/domain/entities/Post';
import type { AutomationSettings } from '@/application/services/AutomationSettings';

export const SETTINGS: AutomationSettings = {
  enabled: true,
  platforms: ['FACEBOOK', 'INSTAGRAM'],
  languages: ['en'],
  dailyCap: 5,
  minGapMinutes: 30,
  languageStaggerMinutes: 15,
  activeFromHour: 0,
  activeToHour: 0,
  timezone: 'Asia/Colombo',
  maxAgeHours: 12,
  minPhotoWidth: 0,
  blockedKeywords: ['suicide'],
  reviewKeywords: ['election', 'court']
};

export function makePost(over: Partial<PostProps> = {}): Post {
  const now = new Date();
  return Post.create({
    id: 'post_1',
    storyId: 'story_1',
    category: 'SRI_LANKA',
    language: 'en',
    mode: 'TEMPLATE',
    status: 'DRAFT',
    bodyText: 'Colombo Port Authority and Roshan Ranasinghe announce new terminal.',
    caption: 'Colombo port opens new terminal',
    renderedImageUrl: 'http://x/generated/post-1.png',
    photoUrl: 'http://x/uploads/p.jpg',
    createdAt: now,
    updatedAt: now,
    ...over
  });
}

/** In-memory PostRepository holding Post entities by id. */
export function memoryPosts(initial: Post[] = []) {
  const map = new Map(initial.map((p) => [p.id, p]));
  return {
    map,
    async findById(id: string) {
      return map.get(id) ?? null;
    },
    async save(p: Post) {
      map.set(p.id, p);
      return p;
    }
  } as any;
}
