import type { PostRepository } from '@/domain/repositories/PostRepository';
import type { Category, Post } from '@/domain/entities/Post';
import type { AutomationSettings, AutomationSettingsStore } from '@/application/services/AutomationSettings';
import type { AutopilotCandidate, AutopilotStore } from '@/application/services/AutopilotStore';
import type { ImageInspector } from '@/application/services/ImageInspector';
import type { Notifier } from '@/application/services/Notifier';
import type { ImportFeedNews } from '@/application/use-cases/ImportFeedNews';
import type { TranslatePost } from '@/application/use-cases/TranslatePost';
import type { RenderPostImage } from '@/application/use-cases/RenderPostImage';
import type { UpdatePost } from '@/application/use-cases/UpdatePost';
import type { SchedulePost } from '@/application/use-cases/SchedulePost';
import { keywordTags } from '@/application/util/hashtags';
import { isDuplicateHeadline } from '@/application/util/headlines';
import { matchesAnyKeyword } from '@/application/util/keywords';

export interface AutopilotResult {
  imported: number;
  /** Headlines queued for publishing during this run. */
  queued: string[];
  /** Why nothing was queued (disabled, outside hours, cap reached...). */
  reason?: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** The first story goes out this long after the run, so Meta's fetch of the image never races the scheduler. */
const FIRST_POST_DELAY_MS = 20_000;
/** Stories are never scheduled further ahead than this; the rest wait for the next run while still fresh. */
const LOOKAHEAD_MS = 4 * HOUR_MS;
/** Safety net per run, whatever the settings say. */
const MAX_PER_RUN = 40;
/** A story already sent (or scheduled) within this window blocks any near-identical headline. */
const ALREADY_SENT_WINDOW_MS = 7 * DAY_MS;

const CATEGORY_TAGS: Record<Category, string[]> = {
  SRI_LANKA: ['#SriLanka', '#SriLankaNews'],
  INDIA: ['#India', '#IndiaNews'],
  FOREIGN: ['#WorldNews']
};

/** Keeps names (#RoshanRanasinghe) and acronyms (#UN); drops lone capitalised words (#Presidential) that only start a sentence. */
const NOT_NAMES = new Set('january february march april may june july august september october november december nov dec jan feb mar apr jun jul aug sep sept oct monday tuesday wednesday thursday friday saturday sunday'.split(' '));
const isSpecificTag = (tag: string): boolean => {
  const words = tag.slice(1).match(/\p{Lu}[\p{Ll}\p{N}]*|\p{Lu}+(?![\p{Ll}])/gu) ?? [];
  return words.length >= 2 || (words.length === 1 && /^\p{Lu}{2,6}$/u.test(words[0]!)) ? !words.some((w) => NOT_NAMES.has(w.toLowerCase())) : false;
};

/** Template photo box is 1500x1665; a photo is cover-cropped to it, so a wide photo loses width. */
const PHOTO_BOX_RATIO = 1500 / 1665;

/** Source pixels that actually span the visible photo area after the crop. */
export function effectivePhotoWidth(size: { width: number; height: number }): number {
  return Math.min(size.width, size.height * PHOTO_BOX_RATIO);
}

/** Hour of day (0-23) in an IANA timezone. */
function hourIn(timezone: string, at: Date): number {
  const h = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: timezone }).format(at);
  return Number(h) % 24;
}

export function isWithinActiveHours(s: Pick<AutomationSettings, 'activeFromHour' | 'activeToHour' | 'timezone'>, at: Date): boolean {
  const h = hourIn(s.timezone, at);
  const { activeFromHour: from, activeToHour: to } = s;
  if (from === to) return true;
  return from < to ? h >= from && h < to : h >= from || h < to;
}

/**
 * One autopilot run: fetch fresh news, then — if the kill switch is on — publish every fetched
 * draft that is allowed to go out (up to the daily limit), one after another, `minGapMinutes` apart,
 * on every enabled platform. A story is never sent twice: it is claimed atomically, must still be a
 * DRAFT, must not match anything already sent or scheduled recently, and each platform's publish is
 * itself idempotent. Stories it must not post (blocked/sensitive words, too-small photo) stay drafts.
 */
export class RunAutopilot {
  constructor(
    private readonly settings: AutomationSettingsStore,
    private readonly store: AutopilotStore,
    private readonly importFeedNews: ImportFeedNews,
    private readonly posts: PostRepository,
    private readonly translatePost: TranslatePost,
    private readonly renderPostImage: RenderPostImage,
    private readonly updatePost: UpdatePost,
    private readonly schedulePost: SchedulePost,
    private readonly notifier: Notifier,
    private readonly inspector: ImageInspector
  ) {}

  async execute(now = new Date()): Promise<AutopilotResult> {
    const imported = (await this.importFeedNews.execute()).imported;
    const settings = await this.settings.get();
    const skip = (reason: string): AutopilotResult => ({ imported, queued: [], reason });

    if (!settings.enabled) return skip('autopilot is off');
    if (!settings.platforms.length) return skip('no platforms enabled');
    if (!isWithinActiveHours(settings, now)) return skip('outside active hours');

    const sentToday = await this.store.countStoriesQueuedSince(new Date(now.getTime() - DAY_MS));
    const room = Math.min(settings.dailyCap - sentToday, MAX_PER_RUN);
    if (room <= 0) return skip('daily cap reached');

    const alreadySent = await this.store.recentSentHeadlines(new Date(now.getTime() - ALREADY_SENT_WINDOW_MS));
    const pool = await this.eligible(settings, now, alreadySent);
    if (!pool.length) return skip('no suitable story');

    const lastByCategory = await this.store.lastQueuedByCategory();
    const lastScheduled = await this.store.lastScheduledAt();
    const gapMs = settings.minGapMinutes * 60_000;
    let slot = new Date(Math.max(now.getTime() + FIRST_POST_DELAY_MS, lastScheduled ? lastScheduled.getTime() + gapMs : 0));

    const queued: string[] = [];
    while (queued.length < room && pool.length) {
      if (slot.getTime() > now.getTime() + LOOKAHEAD_MS || !isWithinActiveHours(settings, slot)) break;

      const pick = await this.next(pool, lastByCategory, queued, settings);
      if (!pick) break;
      if (!(await this.store.claimStory(pick.storyId))) continue; // another run got it first

      try {
        await this.queueStory(pick, settings, slot);
        queued.push(pick.headline);
        lastByCategory[pick.category] = slot;
        slot = new Date(slot.getTime() + gapMs);
      } catch (err) {
        // The story stays claimed (so we never loop on it) and remains a draft for manual handling.
        await this.notifier.notify('error', 'Autopilot could not queue a story', `${pick.headline}\n${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return queued.length ? { imported, queued } : skip('no story could be queued');
  }

  /** Fresh drafts the autopilot is allowed to publish. Everything else stays a draft for a person. */
  private async eligible(settings: AutomationSettings, now: Date, alreadySent: string[]): Promise<AutopilotCandidate[]> {
    const sensitive = [...settings.blockedKeywords, ...settings.reviewKeywords];
    const fresh = await this.store.findCandidates(new Date(now.getTime() - settings.maxAgeHours * HOUR_MS));
    return fresh.filter(
      (c) =>
        c.headline.trim().length >= 15 &&
        !matchesAnyKeyword(c.headline, sensitive) &&
        !isDuplicateHeadline(c.headline, alreadySent)
    );
  }

  /**
   * Takes the next story out of the pool: categories take turns (the one posted longest ago first),
   * newest story within a category. Skips near-duplicates of what this run already queued, and
   * photos below the quality gate (those stay drafts).
   */
  private async next(
    pool: AutopilotCandidate[],
    lastByCategory: Partial<Record<Category, Date>>,
    queued: string[],
    settings: AutomationSettings
  ): Promise<AutopilotCandidate | null> {
    const when = (c: Category) => lastByCategory[c]?.getTime() ?? 0;
    pool.sort((a, b) => when(a.category) - when(b.category) || b.createdAt.getTime() - a.createdAt.getTime());

    while (pool.length) {
      const c = pool.shift()!;
      if (isDuplicateHeadline(c.headline, queued)) continue;
      if (await this.photoIsSharpEnough(c, settings.minPhotoWidth)) return c;
    }
    return null;
  }

  private async photoIsSharpEnough(c: AutopilotCandidate, minWidth: number): Promise<boolean> {
    if (minWidth <= 0) return true;
    if (!c.photoUrl) return false;
    const size = await this.inspector.size(c.photoUrl);
    return !!size && effectivePhotoWidth(size) >= minWidth;
  }

  private async queueStory(pick: AutopilotCandidate, settings: AutomationSettings, at: Date): Promise<void> {
    const source = await this.posts.findById(pick.postId);
    if (!source) throw new Error(`Post ${pick.postId} disappeared`);
    // Last line of defence against publishing twice: only a plain draft may be queued.
    if (source.status !== 'DRAFT') throw new Error(`Post ${pick.postId} is already ${source.status}; not publishing it again.`);

    const tags = [...CATEGORY_TAGS[pick.category], ...keywordTags(source.bodyText.replace(/['’]s(?![\p{L}])/gu, ''), 8).filter(isSpecificTag).slice(0, 3)];
    const hashtags = [...new Map(tags.map((t) => [t.toLowerCase(), t])).values()].slice(0, 6).join(' ');
    await this.updatePost.execute(source.id, { hashtags });

    const targets: Post[] = [source];
    for (const lang of settings.languages.filter((l) => l !== source.language)) {
      try {
        const [translated] = await this.translatePost.execute(source.id, [lang]);
        if (!translated) continue;
        const rendered = await this.renderPostImage.execute(translated.id);
        if (rendered.renderedImageUrl) targets.push(rendered);
      } catch (err) {
        // A missing translation must not block the English post.
        await this.notifier.notify('warn', `Autopilot skipped the ${lang} version`, `${pick.headline}\n${err instanceof Error ? err.message : String(err)}`);
      }
    }

    for (const [i, post] of targets.entries()) {
      await this.schedulePost.execute(post.id, new Date(at.getTime() + i * settings.languageStaggerMinutes * 60_000), settings.platforms);
    }
  }
}
