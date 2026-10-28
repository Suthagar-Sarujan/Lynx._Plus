import test from 'node:test';
import assert from 'node:assert/strict';
import { RunAutopilot } from '@/application/use-cases/RunAutopilot';
import type { AutopilotCandidate } from '@/application/services/AutopilotStore';
import type { AutomationSettings } from '@/application/services/AutomationSettings';
import { SETTINGS, makePost, memoryPosts } from './helpers';

const NOW = new Date('2026-10-27T06:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const minutesAfter = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

function cand(id: string, headline: string, over: Partial<AutopilotCandidate> = {}): AutopilotCandidate {
  return { postId: id, storyId: `story_${id}`, category: 'SRI_LANKA', headline, photoUrl: `http://x/${id}.jpg`, sourceName: 'Ada Derana', sourceUrl: `http://src/${id}`, createdAt: hoursAgo(1), ...over };
}

interface Options {
  settings?: Partial<AutomationSettings>;
  candidates?: AutopilotCandidate[];
  queuedToday?: number;
  lastScheduled?: Date | null;
  lastByCategory?: any;
  photoWidth?: number;
  sentHeadlines?: string[];
  postStatus?: 'DRAFT' | 'PUBLISHED';
}

function setup(opts: Options = {}) {
  const settings = { ...SETTINGS, minGapMinutes: 5, dailyCap: 20, ...opts.settings };
  const claimed: string[] = [];
  const scheduled: { postId: string; at: Date; platforms: string[] }[] = [];
  const updates: { id: string; changes: any }[] = [];
  const alerts: string[] = [];
  const candidates = opts.candidates ?? [];
  const posts = memoryPosts(candidates.map((c) => makePost({ id: c.postId, storyId: c.storyId, category: c.category, status: opts.postStatus ?? 'DRAFT' })));

  const uc = new RunAutopilot(
    { async get() { return settings; }, async update() { return settings; } } as any,
    {
      async findCandidates() { return candidates; },
      async claimStory(id: string) { if (claimed.includes(id)) return false; claimed.push(id); return true; },
      async countStoriesQueuedSince() { return opts.queuedToday ?? 0; },
      async lastQueuedByCategory() { return { ...(opts.lastByCategory ?? {}) }; },
      async lastQueuedAt() { return null; },
      async lastScheduledAt() { return opts.lastScheduled ?? null; },
      async recentSentHeadlines() { return opts.sentHeadlines ?? []; },
      async listFailedJobs() { return []; }
    } as any,
    { async execute() { return { imported: 3, skipped: 0, errors: [] }; } } as any,
    posts,
    { async execute() { throw new Error('translation service down'); } } as any,
    { async execute() { throw new Error('should not render'); } } as any,
    { async execute(id: string, changes: any) { updates.push({ id, changes }); } } as any,
    { async execute(postId: string, at: Date, platforms: string[]) { scheduled.push({ postId, at, platforms }); } } as any,
    { async notify(_l: string, title: string) { alerts.push(title); } },
    { async size() { return { width: opts.photoWidth ?? 1200, height: 800 }; } }
  );
  return { uc, claimed, scheduled, updates, alerts };
}

const HEADLINES = [
  'Colombo port opens new terminal today',
  'Central Bank holds policy rate steady',
  'Heavy rain expected across Western province',
  'Cricket team announces squad for tour'
];

test('does nothing but import while the kill switch is off', async () => {
  const t = setup({ settings: { enabled: false }, candidates: [cand('a', HEADLINES[0]!)] });
  const r = await t.uc.execute(NOW);
  assert.equal(r.imported, 3);
  assert.deepEqual(r.queued, []);
  assert.equal(t.scheduled.length, 0);
  assert.equal(t.claimed.length, 0);
});

test('publishes every eligible fetched draft in one run, spaced apart', async () => {
  const t = setup({ candidates: HEADLINES.map((h, i) => cand(`s${i}`, h)) });
  const r = await t.uc.execute(NOW);
  assert.equal(r.queued.length, 4, 'all four drafts are queued, not just one');
  assert.equal(t.scheduled.length, 4);
  const times = t.scheduled.map((s) => s.at.getTime()).sort((a, b) => a - b);
  assert.equal(times[0], NOW.getTime() + 20_000, 'first goes out ~20s after the run');
  for (let i = 1; i < times.length; i++) assert.equal(times[i]! - times[i - 1]!, 5 * 60_000, 'consecutive stories are 5 minutes apart');
  for (const s of t.scheduled) assert.deepEqual(s.platforms, ['FACEBOOK', 'INSTAGRAM']);
});

test('new stories are spaced after ones already scheduled', async () => {
  const last = minutesAfter(NOW, 30);
  const t = setup({ lastScheduled: last, candidates: [cand('a', HEADLINES[0]!)] });
  await t.uc.execute(NOW);
  assert.equal(t.scheduled[0]!.at.getTime(), minutesAfter(last, 5).getTime());
});

test('stops at the daily cap and leaves the rest as drafts', async () => {
  const t = setup({ settings: { dailyCap: 3 }, queuedToday: 1, candidates: HEADLINES.map((h, i) => cand(`s${i}`, h)) });
  const r = await t.uc.execute(NOW);
  assert.equal(r.queued.length, 2);
  assert.match((await setup({ settings: { dailyCap: 2 }, queuedToday: 2, candidates: [cand('a', HEADLINES[0]!)] }).uc.execute(NOW)).reason!, /daily cap/);
});

test('respects active hours', async () => {
  const r = await setup({ settings: { activeFromHour: 20, activeToHour: 22 }, candidates: [cand('a', HEADLINES[0]!)] }).uc.execute(NOW);
  assert.match(r.reason!, /active hours/);
});

test('never publishes something already sent or scheduled, even from another outlet', async () => {
  const t = setup({
    sentHeadlines: ['Colombo port opens a new terminal today'],
    candidates: [cand('dup', 'Colombo port opens new terminal today', { sourceUrl: 'http://other-outlet/1' }), cand('fresh', HEADLINES[1]!)]
  });
  const r = await t.uc.execute(NOW);
  assert.deepEqual(r.queued, [HEADLINES[1]]);
  assert.deepEqual(t.scheduled.map((s) => s.postId), ['fresh']);
});

test('two near-identical stories fetched together are published once', async () => {
  const t = setup({ candidates: [cand('a', 'Colombo port opens new terminal today'), cand('b', 'New terminal opens at the Colombo port today')] });
  const r = await t.uc.execute(NOW);
  assert.equal(r.queued.length, 1);
});

test('a post that is no longer a draft is refused, not published again', async () => {
  const t = setup({ postStatus: 'PUBLISHED', candidates: [cand('a', HEADLINES[0]!)] });
  const r = await t.uc.execute(NOW);
  assert.deepEqual(r.queued, []);
  assert.equal(t.scheduled.length, 0);
  assert.ok(t.alerts.some((a) => /could not queue/i.test(a)));
});

test('a story is claimed once: a second run cannot pick it again', async () => {
  const t = setup({ candidates: [cand('a', HEADLINES[0]!)] });
  await t.uc.execute(NOW);
  const second = await t.uc.execute(NOW);
  assert.deepEqual(second.queued, []);
  assert.equal(t.scheduled.length, 1);
});

test('queues with hashtags and no source line', async () => {
  const t = setup({ candidates: [cand('a', HEADLINES[0]!)] });
  await t.uc.execute(NOW);
  const tags: string = t.updates.find((u) => u.changes.hashtags)!.changes.hashtags;
  assert.match(tags, /#SriLanka/);
  assert.ok(tags.split(' ').length <= 6);
  assert.equal(t.updates.some((u) => 'caption' in u.changes), false);
});

test('leaves sensitive and blocked stories for a person', async () => {
  const t = setup({ candidates: [cand('a', 'Court hears plea against election results'), cand('b', 'Writer found after suicide attempt reported'), cand('ok', HEADLINES[2]!)] });
  const r = await t.uc.execute(NOW);
  assert.deepEqual(r.queued, [HEADLINES[2]]);
});

test('categories take turns: the one posted longest ago goes first', async () => {
  const t = setup({
    candidates: [cand('sl', 'Sri Lanka headline number one here', { category: 'SRI_LANKA' }), cand('in', 'India headline number one here', { category: 'INDIA' })],
    lastByCategory: { SRI_LANKA: hoursAgo(1), INDIA: hoursAgo(5) }
  });
  await t.uc.execute(NOW);
  assert.equal(t.scheduled.sort((a, b) => a.at.getTime() - b.at.getTime())[0]!.postId, 'in');
});

test('the photo quality gate skips small photos when switched on', async () => {
  const c = [cand('a', HEADLINES[0]!)];
  assert.deepEqual((await setup({ candidates: c, settings: { minPhotoWidth: 1000 }, photoWidth: 1200 }).uc.execute(NOW)).queued, []); // 800px tall -> 675 effective
  assert.equal((await setup({ candidates: c, settings: { minPhotoWidth: 600 }, photoWidth: 1200 }).uc.execute(NOW)).queued.length, 1);
  assert.equal((await setup({ candidates: c, settings: { minPhotoWidth: 0 }, photoWidth: 100 }).uc.execute(NOW)).queued.length, 1);
});

test('a failed translation warns but never blocks the English post', async () => {
  const t = setup({ settings: { languages: ['en', 'si'] }, candidates: [cand('a', HEADLINES[0]!)] });
  const r = await t.uc.execute(NOW);
  assert.equal(r.queued.length, 1);
  assert.equal(t.scheduled.length, 1);
  assert.ok(t.alerts.some((a) => /si version/.test(a)));
});
