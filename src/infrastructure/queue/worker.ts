// Run with: npm run worker
// This is a separate long-running process from the Next.js server. It owns all
// background work, so it keeps running while nobody has the dashboard open:
//   - "publish"        fires one scheduled Facebook/Instagram post
//   - "autopilot-tick" imports fresh news and queues the best story (every AUTOPILOT_TICK_MINUTES)
//   - "health-check"   verifies the Meta token still works (every 6 hours)
//   - "cleanup"        deletes old temporary Facebook/Instagram export images (daily)
// Deploy it as its own Docker service (see docker-compose.yml) alongside the web app.

import { Queue, Worker, type Job } from 'bullmq';
import { createRedisConnection, PUBLISH_QUEUE_NAME } from './connection';
import { container } from '@/infrastructure/container';
import type { Platform } from '@/domain/entities/Post';
import { cleanupExports } from '@/infrastructure/social/cleanupExports';

interface PublishJobData {
  postId: string;
  platform: Platform;
}

// News is fetched, and every eligible draft published, once per run: every 30 minutes by default.
const TICK_MINUTES = Math.max(1, Number(process.env.AUTOPILOT_TICK_MINUTES ?? 30));
const HEALTH_EVERY_MS = 6 * 60 * 60 * 1000;

async function publish(job: Job<PublishJobData>) {
  // A job for a post that is back to DRAFT (never scheduled / unscheduled) must not publish.
  // PUBLISHED is fine: the post's other platform may have gone out first.
  const post = await container.postRepository.findById(job.data.postId);
  if (post?.status === 'DRAFT') {
    console.log(`[worker] skipping post ${job.data.postId}: it is a draft, not scheduled`);
    return;
  }
  // The kill switch also stops stories the autopilot has already queued: they go back to plain drafts.
  if (!(await container.automationSettings.get()).enabled && (await container.autopilotStore.isQueuedByAutopilot(job.data.postId))) {
    await container.autopilotStore.releaseQueued(job.data.postId);
    console.log(`[worker] autopilot is off: released queued post ${job.data.postId} back to draft`);
    return;
  }
  console.log(`[worker] publishing post ${job.data.postId} to ${job.data.platform}`);
  await container.publishPostNow.execute(job.data.postId, job.data.platform);
}

async function autopilotTick() {
  const r = await container.runAutopilot.execute();
  console.log(`[autopilot] imported ${r.imported}; ${r.queued.length ? `queued ${r.queued.length}: ${r.queued.map((h) => `"${h.slice(0, 50)}"`).join(', ')}` : `nothing queued (${r.reason})`}`);
}

async function cleanup() {
  const removed = await cleanupExports();
  console.log(`[cleanup] removed ${removed} old export image(s)`);
}

async function healthCheck() {
  const problem = await container.socialHealth();
  if (problem) await container.notifier.notify('error', 'Facebook/Instagram credentials are not working', problem);
  else console.log('[health] Meta credentials OK');
}

const worker = new Worker<PublishJobData>(
  PUBLISH_QUEUE_NAME,
  async (job: Job<PublishJobData>) => {
    switch (job.name) {
      case 'autopilot-tick': return autopilotTick();
      case 'health-check': return healthCheck();
      case 'cleanup': return cleanup();
      default: return publish(job);
    }
  },
  { connection: createRedisConnection(), concurrency: 2 }
);

worker.on('completed', (job) => {
  if (job.name === 'publish') console.log(`[worker] done: ${job.id} (post ${job.data.postId} -> ${job.data.platform})`);
});

worker.on('failed', (job, err) => {
  if (job?.name !== 'publish') {
    console.error(`[worker] ${job?.name ?? 'job'} failed:`, err.message);
    return;
  }
  const final = job.attemptsMade >= (job.opts.attempts ?? 1);
  console.error(`[worker] FAILED${final ? ' (giving up)' : ' (will retry)'}: ${job.id} (post ${job.data.postId} -> ${job.data.platform}):`, err.message);
  // Only page a human once retries are exhausted.
  if (final) {
    void container.notifier.notify('error', `Could not publish to ${job.data.platform}`, `Post ${job.data.postId}\n${err.message}`);
  }
});

// Repeatable jobs are keyed by scheduler id, so restarting the worker never duplicates them.
const scheduler = new Queue(PUBLISH_QUEUE_NAME, { connection: createRedisConnection() });
void Promise.all([
  scheduler.upsertJobScheduler('autopilot-tick', { every: TICK_MINUTES * 60_000 }, { name: 'autopilot-tick', opts: { removeOnComplete: true, removeOnFail: 20 } }),
  scheduler.upsertJobScheduler('cleanup', { every: 24 * 60 * 60 * 1000 }, { name: 'cleanup', opts: { removeOnComplete: true, removeOnFail: 20 } }),
  scheduler.upsertJobScheduler('health-check', { every: HEALTH_EVERY_MS }, { name: 'health-check', opts: { removeOnComplete: true, removeOnFail: 20 } })
]).then(() => console.log(`[worker] listening: publish jobs, autopilot every ${TICK_MINUTES} min, health check every 6 h`));
