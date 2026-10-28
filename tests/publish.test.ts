import test from 'node:test';
import assert from 'node:assert/strict';
import { PublishPostNow } from '@/application/use-cases/PublishPostNow';
import type { PublishJobRecord, PublishJobStore } from '@/application/services/PublishJobStore';
import { makePost, memoryPosts } from './helpers';

type Row = PublishJobRecord & { lastError?: string };

function memoryJobs() {
  const rows = new Map<string, Row>();
  const key = (p: string, pl: string) => `${p}:${pl}`;
  const store: PublishJobStore & { rows: Map<string, Row> } = {
    rows,
    async ensure(postId, platform) {
      if (!rows.has(key(postId, platform))) rows.set(key(postId, platform), { postId, platform, status: 'SCHEDULED', attempts: 0, platformPostId: null });
      return rows.get(key(postId, platform))!;
    },
    async recordSuccess(postId, platform, id) {
      const r = rows.get(key(postId, platform))!;
      Object.assign(r, { status: 'PUBLISHED', platformPostId: id, attempts: r.attempts + 1 });
    },
    async recordFailure(postId, platform, msg) {
      const r = rows.get(key(postId, platform))!;
      Object.assign(r, { status: 'FAILED', lastError: msg, attempts: r.attempts + 1 });
    },
    async listForPost(postId) {
      return [...rows.values()].filter((r) => r.postId === postId);
    }
  };
  return store;
}

test('a retry after a partial failure never posts to the finished platform again', async () => {
  const posts = memoryPosts([makePost({ status: 'SCHEDULED' })]);
  const jobs = memoryJobs();
  const calls: string[] = [];
  let instagramDown = true;
  const publisher: any = {
    async publish({ platform }: { platform: string }) {
      calls.push(platform);
      if (platform === 'INSTAGRAM' && instagramDown) throw new Error('Instagram unavailable');
      return { platformPostId: `${platform}-id` };
    }
  };
  const uc = new PublishPostNow(posts, publisher, jobs);
  // The scheduler queued both platforms up front, as SchedulePost does.
  await jobs.ensure('post_1', 'FACEBOOK', new Date());
  await jobs.ensure('post_1', 'INSTAGRAM', new Date());

  await uc.execute('post_1', 'FACEBOOK');
  await assert.rejects(uc.execute('post_1', 'INSTAGRAM'), /Instagram unavailable/);
  assert.equal((await posts.findById('post_1')).status, 'FAILED');

  instagramDown = false;
  await uc.execute('post_1', 'INSTAGRAM'); // BullMQ retry
  await uc.execute('post_1', 'FACEBOOK'); // a duplicate/replayed Facebook job

  assert.deepEqual(calls, ['FACEBOOK', 'INSTAGRAM', 'INSTAGRAM'], 'Facebook must be sent exactly once');
  assert.equal((await posts.findById('post_1')).status, 'PUBLISHED');
  assert.equal(jobs.rows.get('post_1:FACEBOOK')!.platformPostId, 'FACEBOOK-id');
});

test('the post stays unpublished until every queued platform is done', async () => {
  const posts = memoryPosts([makePost({ status: 'SCHEDULED' })]);
  const jobs = memoryJobs();
  const uc = new PublishPostNow(posts, { async publish() { return { platformPostId: 'x' }; } } as any, jobs);
  await jobs.ensure('post_1', 'FACEBOOK', new Date());
  await jobs.ensure('post_1', 'INSTAGRAM', new Date());
  await uc.execute('post_1', 'FACEBOOK');
  assert.equal((await posts.findById('post_1')).status, 'SCHEDULED');
  await uc.execute('post_1', 'INSTAGRAM');
  assert.equal((await posts.findById('post_1')).status, 'PUBLISHED');
});

test('a post without an image is rejected', async () => {
  const posts = memoryPosts([makePost({ renderedImageUrl: null, photoUrl: null })]);
  const uc = new PublishPostNow(posts, { async publish() { return { platformPostId: 'x' }; } } as any, memoryJobs());
  await assert.rejects(uc.execute('post_1', 'FACEBOOK'), /no image/);
});
