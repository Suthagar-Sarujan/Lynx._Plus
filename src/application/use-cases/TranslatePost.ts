import type { PostRepository } from '@/domain/repositories/PostRepository';
import type { StoryRepository } from '@/domain/repositories/StoryRepository';
import type { TranslationService } from '@/application/services/TranslationService';
import { Post } from '@/domain/entities/Post';
import { randomId } from '@/application/util/randomId';

/**
 * Takes one source post and produces N new sibling posts (same Story, same
 * photo/date/category) in each target language — mirrors the "Generate
 * translations" action in the dashboard UI.
 */
export class TranslatePost {
  constructor(
    private readonly posts: PostRepository,
    private readonly stories: StoryRepository,
    private readonly translator: TranslationService
  ) {}

  async execute(sourcePostId: string, targetLanguages: string[]): Promise<Post[]> {
    const source = await this.posts.findById(sourcePostId);
    if (!source) throw new Error(`Post ${sourcePostId} not found`);

    const story = await this.stories.findById(source.storyId);
    if (!story) throw new Error(`Story ${source.storyId} not found`);

    const sourceProps = source.toProps();
    const results: Post[] = [];

    for (const lang of targetLanguages) {
      const translated = await this.translator.translate({
        targetLanguage: lang,
        bodyText: sourceProps.bodyText ?? '',
        caption: sourceProps.caption ?? '',
        hashtags: sourceProps.hashtags ?? ''
      });

      const now = new Date();
      const newPost = Post.create({
        ...sourceProps,
        id: randomId('post'),
        language: lang,
        status: 'DRAFT',
        bodyText: translated.bodyText,
        caption: translated.caption,
        hashtags: translated.hashtags,
        renderedImageUrl: null,
        scheduledAt: null,
        publishedAt: null,
        createdAt: now,
        updatedAt: now
      });

      results.push(await this.posts.save(newPost));
    }

    return results;
  }
}
