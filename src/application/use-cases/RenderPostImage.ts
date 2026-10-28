import type { PostRepository } from '@/domain/repositories/PostRepository';
import type { TemplateRenderer } from '@/application/services/TemplateRenderer';
import type { Post } from '@/domain/entities/Post';

export class RenderPostImage {
  constructor(
    private readonly posts: PostRepository,
    private readonly renderer: TemplateRenderer
  ) {}

  async execute(postId: string): Promise<Post> {
    const post = await this.posts.findById(postId);
    if (!post) throw new Error(`Post ${postId} not found`);

    if (post.mode === 'DIRECT_IMAGE') {
      // Nothing to render — the uploaded photo IS the publishable image.
      return post;
    }

    const props = post.toProps();
    if (!props.photoUrl) {
      throw new Error('Cannot render the template: no photo uploaded yet.');
    }

    const { url } = await this.renderer.render({
      photoPath: props.photoUrl,
      dateLabel: props.dateLabel ?? '',
      yearLabel: props.yearLabel ?? '',
      bodyText: props.bodyText ?? '',
      language: post.language,
      showBreaking: props.showBreaking ?? false,
      showNews: props.showNews ?? true,
      bodyStyle: { font: props.bodyFont, size: props.bodyFontSize, align: props.bodyAlign, lineHeight: props.bodyLineHeight }
    });

    post.attachRenderedImage(url);
    return this.posts.save(post);
  }
}
