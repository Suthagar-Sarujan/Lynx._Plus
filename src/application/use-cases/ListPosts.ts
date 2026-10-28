import type { PostRepository, PostFilter } from '@/domain/repositories/PostRepository';
import type { Post } from '@/domain/entities/Post';

export class ListPosts {
  constructor(private readonly posts: PostRepository) {}

  async execute(filter: PostFilter = {}): Promise<Post[]> {
    return this.posts.findMany(filter);
  }
}
