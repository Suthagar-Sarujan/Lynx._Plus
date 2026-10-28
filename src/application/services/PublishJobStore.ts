import type { Platform, PostStatus } from '@/domain/entities/Post';

export interface PublishJobRecord {
  postId: string;
  platform: Platform;
  status: PostStatus;
  attempts: number;
  platformPostId: string | null;
}

/**
 * Port — one record per post+platform. It is what makes publishing idempotent:
 * a job that already holds a `platformPostId` is never sent to Meta again, so a
 * retry after "Facebook worked, Instagram failed" cannot double-post.
 */
export interface PublishJobStore {
  /** Creates the job, or returns the existing one (a published job keeps its result). */
  ensure(postId: string, platform: Platform, runAt: Date): Promise<PublishJobRecord>;
  recordSuccess(postId: string, platform: Platform, platformPostId: string): Promise<void>;
  recordFailure(postId: string, platform: Platform, message: string): Promise<void>;
  listForPost(postId: string): Promise<PublishJobRecord[]>;
}
