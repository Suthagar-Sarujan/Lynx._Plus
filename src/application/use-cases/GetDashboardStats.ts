import type { PostRepository } from '@/domain/repositories/PostRepository';
import type { Category, PostStatus, Post } from '@/domain/entities/Post';

export interface DashboardStats {
  byCategory: Record<Category, number>;
  byStatus: Record<PostStatus, number>;
  recent: Post[];
}

export class GetDashboardStats {
  constructor(private readonly posts: PostRepository) {}

  async execute(): Promise<DashboardStats> {
    const [byCategory, byStatus, recent] = await Promise.all([
      this.posts.countByCategory(),
      this.posts.countByStatus(),
      this.posts.findRecent(20)
    ]);
    return { byCategory, byStatus, recent };
  }
}
