import type { PostRepository } from '@/domain/repositories/PostRepository';
import type { Platform } from '@/domain/entities/Post';
import type { PublishQueue } from '@/application/services/PublishQueue';
import type { PublishJobStore } from '@/application/services/PublishJobStore';

export class SchedulePost {
  constructor(
    private readonly posts: PostRepository,
    private readonly queue: PublishQueue,
    private readonly jobs: PublishJobStore
  ) {}

  async execute(postId: string, at: Date, platforms: Platform[]): Promise<void> {
    const post = await this.posts.findById(postId);
    if (!post) throw new Error(`Post ${postId} not found`);

    post.schedule(at); // validates the transition and time (in memory only)

    // Queue first, so a queue outage can't leave the post marked SCHEDULED with nothing behind it.
    for (const platform of platforms) {
      await this.queue.enqueue({ postId, platform, runAt: at });
      await this.jobs.ensure(postId, platform, at);
    }
    await this.posts.save(post);
  }
}
