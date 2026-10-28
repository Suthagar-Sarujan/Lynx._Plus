import IORedis from 'ioredis';

export function createRedisConnection() {
  return new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null // required by BullMQ
  });
}

export const PUBLISH_QUEUE_NAME = 'post-publish';
