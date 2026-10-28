import type { PostRepository } from '@/domain/repositories/PostRepository';
import type { Post, PostEdit } from '@/domain/entities/Post';
import type { RenderPostImage } from '@/application/use-cases/RenderPostImage';

/** Saves edits to a post, then re-renders its template image if the content changed. */
export class UpdatePost {
  constructor(
    private readonly posts: PostRepository,
    private readonly renderPostImage: RenderPostImage
  ) {}

  async execute(postId: string, changes: PostEdit): Promise<Post> {
    const post = await this.posts.findById(postId);
    if (!post) throw new Error(`Post ${postId} not found`);

    post.edit(changes);
    const saved = await this.posts.save(post);

    if (saved.mode === 'TEMPLATE' && saved.photoUrl && !saved.renderedImageUrl) {
      return this.renderPostImage.execute(postId);
    }
    return saved;
  }
}
