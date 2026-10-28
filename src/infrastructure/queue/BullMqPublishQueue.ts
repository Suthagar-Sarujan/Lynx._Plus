import { Queue } from 'bullmq';
import type { PublishQueue, EnqueueArgs } from '@/application/services/PublishQueue';
import { createRedisConnection, PUBLISH_QUEUE_NAME } from './connection';

export class BullMqPublishQueue implements PublishQueue {
  private readonly queue: Queue;

  constructor() {
    this.queue = new Queue(PUBLISH_QUEUE_NAME, { connection: createRedisConnection() });
  }

  async enqueue(args: EnqueueArgs): Promise<void> {
    const delay = Math.max(0, args.runAt.getTime() - Date.now());
    // Without Redis the client retries forever; surface that instead of hanging the request.
    const unreachable = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Scheduling needs Redis, but it is not reachable. Start Redis (and `npm run worker`) and try again.')), 5_000).unref()
    );
    await Promise.race([this.add(args, delay), unreachable]);
  }

  /** Asks the worker to run an autopilot tick right now (the "Run now" button). */
  async triggerAutopilotTick(): Promise<void> {
    await this.queue.add('autopilot-tick', {}, { removeOnComplete: true, removeOnFail: 20 });
  }

  private async add(args: EnqueueArgs, delay: number): Promise<void> {
    await this.queue.add(
      'publish',
      { postId: args.postId, platform: args.platform },
      {
        jobId: `${args.postId}__${args.platform}__${args.runAt.getTime()}`, // same post+platform+time queues once
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: false
      }
    );
  }
}
