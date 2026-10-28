import type { Platform } from '@/domain/entities/Post';

export interface EnqueueArgs {
  postId: string;
  platform: Platform;
  runAt: Date;
}

/** Port — implemented with BullMQ/Redis (open source). */
export interface PublishQueue {
  enqueue(args: EnqueueArgs): Promise<void>;
}
