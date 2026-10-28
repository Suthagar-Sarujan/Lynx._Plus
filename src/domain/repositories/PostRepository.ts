import type { Post, Category, PostStatus } from '@/domain/entities/Post';

export interface PostFilter {
  category?: Category;
  status?: PostStatus;
  storyId?: string;
}

/**
 * Port: the application layer talks only to this interface. The concrete
 * Prisma/MySQL implementation lives in src/infrastructure/repositories and is
 * injected at the edges (API routes, worker) — nothing in domain/application
 * imports Prisma directly, which is the whole point of clean architecture:
 * you could swap MySQL for Postgres or SQLite by writing one new adapter.
 */
export interface PostRepository {
  findById(id: string): Promise<Post | null>;
  findMany(filter: PostFilter): Promise<Post[]>;
  findRecent(limit: number): Promise<Post[]>;
  countByCategory(): Promise<Record<Category, number>>;
  countByStatus(): Promise<Record<PostStatus, number>>;
  /** The hashtags strings of the most recently updated posts (for "used before" suggestions). */
  recentHashtags(limit: number): Promise<string[]>;
  /** Captions (= headlines, for feed imports) of English posts created since `since`; used to spot duplicate stories. */
  recentHeadlines(since: Date): Promise<string[]>;
  save(post: Post): Promise<Post>;
  delete(id: string): Promise<void>;
}
