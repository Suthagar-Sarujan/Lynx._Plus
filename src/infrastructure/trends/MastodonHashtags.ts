import type { HashtagDirectory, TagUsage } from '@/application/services/HashtagDirectory';

interface MastodonTag {
  name: string;
  history?: { uses: string; accounts: string }[];
}

const LOOKUP_TTL_MS = 60 * 60_000;
const SEARCH_TTL_MS = 10 * 60_000;

/**
 * Real hashtag usage from Mastodon's public API (no account or key needed).
 * `history` holds one entry per day for the last week, so summing it gives
 * "posts this week". Results are cached so typing doesn't hammer the server.
 */
export class MastodonHashtags implements HashtagDirectory {
  private readonly base = (process.env.MASTODON_URL ?? 'https://mastodon.social').replace(/\/$/, '');
  private readonly lookups = new Map<string, { at: number; usage: TagUsage }>();
  private readonly searches = new Map<string, { at: number; usage: TagUsage[] }>();

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'LYNX-Plus hashtag suggestions' },
      signal: AbortSignal.timeout(6_000),
      cache: 'no-store'
    });
    if (!res.ok) throw new Error(`Hashtag source returned HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  private toUsage(t: MastodonTag): TagUsage {
    const history = t.history ?? [];
    return {
      tag: `#${t.name}`,
      uses: history.reduce((sum, h) => sum + Number(h.uses), 0),
      accounts: history.reduce((sum, h) => sum + Number(h.accounts), 0)
    };
  }

  async lookup(name: string): Promise<TagUsage> {
    const key = name.toLowerCase();
    const hit = this.lookups.get(key);
    if (hit && Date.now() - hit.at < LOOKUP_TTL_MS) return hit.usage;

    const usage = this.toUsage(await this.get<MastodonTag>(`/api/v1/tags/${encodeURIComponent(name)}`));
    this.lookups.set(key, { at: Date.now(), usage });
    return usage;
  }

  async search(query: string, limit: number): Promise<TagUsage[]> {
    const key = `${query.toLowerCase()}|${limit}`;
    const hit = this.searches.get(key);
    if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return hit.usage;

    const res = await this.get<{ hashtags?: MastodonTag[] }>(
      `/api/v2/search?type=hashtags&limit=${limit}&q=${encodeURIComponent(query)}`
    );
    const usage = (res.hashtags ?? []).map((t) => this.toUsage(t)).sort((a, b) => b.uses - a.uses);
    this.searches.set(key, { at: Date.now(), usage });
    for (const u of usage) this.lookups.set(u.tag.slice(1).toLowerCase(), { at: Date.now(), usage: u });
    return usage;
  }
}
