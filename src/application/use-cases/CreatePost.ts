import type { PostRepository } from '@/domain/repositories/PostRepository';
import type { StoryRepository } from '@/domain/repositories/StoryRepository';
import { Post } from '@/domain/entities/Post';
import type { CreatePostInput } from '@/application/dto/CreatePostDto';
import { randomId } from '@/application/util/randomId';

export class CreatePost {
  constructor(
    private readonly posts: PostRepository,
    private readonly stories: StoryRepository
  ) {}

  async execute(input: CreatePostInput): Promise<Post> {
    const story = input.storyId
      ? await this.stories.findById(input.storyId)
      : await this.stories.create(input.category, input.sourceUrl, input.sourceName);

    if (!story) {
      throw new Error(`Story ${input.storyId} not found`);
    }

    const now = new Date();
    const post = Post.create({
      id: randomId('post'),
      storyId: story.id,
      category: input.category,
      language: input.language,
      mode: input.mode,
      status: 'DRAFT',
      dateLabel: input.dateLabel ?? null,
      yearLabel: input.yearLabel ?? null,
      badgeWord: input.badgeWord ?? 'NEWS',
      showBreaking: input.showBreaking ?? false,
      showNews: input.showNews ?? true,
      bodyText: input.bodyText ?? null,
      creditTag: input.creditTag ?? ': LYNX._CINE',
      bodyFont: input.bodyFont ?? null,
      bodyFontSize: input.bodyFontSize ?? null,
      bodyAlign: input.bodyAlign ?? null,
      bodyLineHeight: input.bodyLineHeight ?? null,
      directTitle: input.directTitle ?? null,
      photoUrl: input.photoUrl ?? null,
      renderedImageUrl: null,
      caption: input.caption ?? null,
      hashtags: input.hashtags ?? null,
      scheduledAt: null,
      publishedAt: null,
      createdAt: now,
      updatedAt: now
    });

    return this.posts.save(post);
  }
}
