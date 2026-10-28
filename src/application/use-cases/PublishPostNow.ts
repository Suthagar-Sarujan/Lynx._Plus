import type { PostRepository } from '@/domain/repositories/PostRepository';
import type { SocialPublisher } from '@/application/services/SocialPublisher';
import type { PublishJobStore } from '@/application/services/PublishJobStore';
import type { Platform } from '@/domain/entities/Post';

/**
 * The actual publish step — called either immediately ("Publish now") or by
 * the BullMQ worker when a scheduled job comes due. Either path goes through
 * this one use case, so there's exactly one place that talks to Meta's API.
 *
 * Idempotent per post+platform: a platform that already published is skipped,
 * so BullMQ retrying a job (or a double click) can never post twice.
 */
export class PublishPostNow {
  constructor(
    private readonly posts: PostRepository,
    private readonly publisher: SocialPublisher,
    private readonly jobs: PublishJobStore
  ) {}

  async execute(postId: string, platform: Platform): Promise<void> {
    const post = await this.posts.findById(postId);
    if (!post) throw new Error(`Post ${postId} not found`);

    const job = await this.jobs.ensure(postId, platform, new Date());
    if (job.platformPostId) {
      await this.finalize(postId);
      return;
    }

    const imageUrl = post.renderedImageUrl ?? post.photoUrl;
    if (!imageUrl) {
      throw new Error('Post has no image to publish — render or upload one first.');
    }

    try {
      const { platformPostId } = await this.publisher.publish({ platform, imageUrl, text: post.composeSocialText() });
      await this.jobs.recordSuccess(postId, platform, platformPostId);
    } catch (err) {
      await this.jobs.recordFailure(postId, platform, err instanceof Error ? err.message : String(err));
      // Another platform may have succeeded meanwhile; don't overwrite that with FAILED.
      const latest = await this.posts.findById(postId);
      if (latest && latest.status !== 'PUBLISHED') {
        latest.markFailed();
        await this.posts.save(latest);
      }
      throw err;
    }

    await this.finalize(postId);
  }

  /** The post counts as PUBLISHED only once every platform it was queued for has gone out. */
  private async finalize(postId: string): Promise<void> {
    const jobs = await this.jobs.listForPost(postId);
    if (!jobs.every((j) => j.platformPostId)) return;
    const post = await this.posts.findById(postId);
    if (!post) return;
    post.markPublished();
    await this.posts.save(post);
  }
}
