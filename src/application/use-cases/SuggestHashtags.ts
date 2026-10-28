import type { PostRepository } from '@/domain/repositories/PostRepository';
import type { Category } from '@/domain/entities/Post';
import type { HashtagDirectory, TagUsage } from '@/application/services/HashtagDirectory';
import { extractTags, keywordTags } from '@/application/util/hashtags';

export type SuggestionSource = 'story' | 'related' | 'used' | 'popular';

export interface HashtagSuggestion {
  tag: string;
  source: SuggestionSource;
  note?: string;
  /** Posts using it in the last 7 days; undefined if usage couldn't be checked. */
  uses?: number;
}

export interface SuggestInput {
  q: string; // what the user has typed so far (may start with #)
  text: string; // the story's news text + caption, to pull names from
  category: Category;
  language: string;
}

const POPULAR: Record<Category, string[]> = {
  SRI_LANKA: ['#SriLanka', '#SriLankaNews', '#Colombo', '#LKA', '#LankaNews'],
  INDIA: ['#India', '#IndiaNews', '#IndianNews', '#NewDelhi'],
  FOREIGN: ['#WorldNews', '#InternationalNews', '#Global']
};
const GENERAL = ['#BreakingNews', '#LatestNews', '#News'];

/** A tag must have this many posts in the last 7 days to count as "really used" (local topics are small). */
const MIN_USES = 3;
const MIN_USES_WHEN_TYPING = 2;
const RELATED_KEYWORDS = 3;
const RELATED_PER_KEYWORD = 2;
const LIMIT = 14;

const PER_SOURCE_WHEN_EMPTY: Record<SuggestionSource, number> = { story: 5, related: 4, used: 3, popular: 5 };

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n));
const usageNote = (uses: number) => `${compact(uses)} posts this week`;

/**
 * Suggests hashtags that really exist: every tag is checked against live usage on a
 * public social network (see HashtagDirectory), and made-up tags nobody uses are dropped.
 */
export class SuggestHashtags {
  constructor(
    private readonly posts: PostRepository,
    private readonly directory: HashtagDirectory
  ) {}

  async execute(input: SuggestInput): Promise<HashtagSuggestion[]> {
    const needle = input.q.replace(/^#/, '').trim().toLowerCase();
    const stored = await this.posts.recentHashtags(300);

    // Candidates, in priority order. Each is checked against real usage below.
    const story = keywordTags(input.text);
    const candidates: { tag: string; source: SuggestionSource }[] = [
      ...story.map((tag) => ({ tag, source: 'story' as const })),
      ...[...POPULAR[input.category], ...GENERAL].map((tag) => ({ tag, source: 'popular' as const })),
      ...this.mostUsed(stored).map((tag) => ({ tag, source: 'used' as const }))
    ];

    const results: HashtagSuggestion[] = [];
    const seen = new Set<string>();
    const push = (s: HashtagSuggestion) => {
      const key = s.tag.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      results.push(s);
    };

    // 1. Verify each candidate against real usage. If the source is unreachable we fall back to unverified tags.
    const checks = await Promise.all(
      candidates.map(async (c) => {
        try {
          return { ...c, usage: (await this.directory.lookup(c.tag.slice(1))) as TagUsage | null };
        } catch {
          return { ...c, usage: null };
        }
      })
    );
    const sourceReachable = checks.some((c) => c.usage !== null);

    for (const c of checks) {
      if (c.usage) {
        // Your own earlier tags stay even if quiet; everything else must be really in use.
        if (c.usage.uses < MIN_USES && c.source !== 'used') continue;
        push({ tag: c.tag, source: c.source, uses: c.usage.uses, note: usageNote(c.usage.uses) });
      } else if (!sourceReachable) {
        push({ tag: c.tag, source: c.source, note: 'unverified' });
      }
    }

    // 2. Real tags related to the story's names (e.g. "Colombo" -> #colombo, #colombotraffic).
    if (sourceReachable) {
      const keywords = story.slice(0, RELATED_KEYWORDS).map((t) => t.slice(1));
      const related = await Promise.all(keywords.map((k) => this.directory.search(k, 6).catch(() => [] as TagUsage[])));
      for (const found of related) {
        found
          .filter((u) => u.uses >= MIN_USES)
          .slice(0, RELATED_PER_KEYWORD)
          .forEach((u) => push({ tag: u.tag, source: 'related', uses: u.uses, note: usageNote(u.uses) }));
      }
    }

    // 3. Typing: bring in real tags starting with what was typed.
    if (needle) {
      const found = await this.directory.search(needle, 10).catch(() => [] as TagUsage[]);
      for (const u of found.filter((x) => x.uses >= MIN_USES_WHEN_TYPING)) {
        push({ tag: u.tag, source: 'related', uses: u.uses, note: usageNote(u.uses) });
      }

      const body = (s: HashtagSuggestion) => s.tag.slice(1).toLowerCase();
      const byUse = (a: HashtagSuggestion, b: HashtagSuggestion) => (b.uses ?? 0) - (a.uses ?? 0);
      const matches = results.filter((s) => body(s).includes(needle));
      const starts = matches.filter((s) => body(s).startsWith(needle)).sort(byUse);
      const contains = matches.filter((s) => !body(s).startsWith(needle)).sort(byUse);
      return [...starts, ...contains].slice(0, LIMIT);
    }

    const taken: Record<SuggestionSource, number> = { story: 0, related: 0, used: 0, popular: 0 };
    return results.filter((s) => taken[s.source]++ < PER_SOURCE_WHEN_EMPTY[s.source]).slice(0, LIMIT);
  }

  /** The tags used most often on earlier posts. */
  private mostUsed(stored: string[]): string[] {
    const counts = new Map<string, { tag: string; n: number }>();
    for (const tag of stored.flatMap(extractTags)) {
      const key = tag.toLowerCase();
      counts.set(key, { tag, n: (counts.get(key)?.n ?? 0) + 1 });
    }
    return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 5).map((c) => c.tag);
  }
}
