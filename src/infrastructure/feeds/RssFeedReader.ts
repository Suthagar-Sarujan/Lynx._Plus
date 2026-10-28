import { XMLParser } from 'fast-xml-parser';
import { decodeEntities } from './htmlEntities';
import type { FeedReader, FeedSource, FeedEntry } from '@/application/services/FeedReader';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' });
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (LYNX-Plus feed reader)' };

type Node = Record<string, unknown>;

function asArray<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

/** Collapses fast-xml-parser nodes (string, or object with #text) to plain text. */
function text(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'object') return text((node as Node)['#text']);
  return String(node);
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function atomLink(link: unknown): string {
  const links = asArray(link as Node | Node[]);
  const alt = links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? links[0];
  return String(alt?.['@_href'] ?? '');
}

function isHttp(url: string | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

/** Image declared by the feed item: media:content / media:thumbnail / enclosure, else the first <img> in its HTML. */
function feedImage(item: Node): string | null {
  const media = [...asArray(item['media:content'] as Node | Node[]), ...asArray(item['media:thumbnail'] as Node | Node[])];
  const fromMedia = media.find((m) => {
    const type = String(m['@_type'] ?? '');
    const medium = String(m['@_medium'] ?? '');
    return isHttp(m['@_url'] as string) && (!type || type.startsWith('image/')) && (!medium || medium === 'image');
  });
  if (fromMedia) return upsize(String(fromMedia['@_url']));

  const enclosure = asArray(item.enclosure as Node | Node[]).find(
    (e) => String(e['@_type'] ?? '').startsWith('image/') && isHttp(e['@_url'] as string)
  );
  if (enclosure) return String(enclosure['@_url']);

  const html = text(item['content:encoded']) + text(item.description);
  const img = /<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1];
  return isHttp(img) ? img : null;
}

/** BBC's feed only carries 240px thumbnails; the same CDN serves bigger sizes. */
function upsize(url: string): string {
  return url.replace('/ace/standard/240/', '/ace/standard/1024/');
}

function metaContent(html: string, property: string): string | undefined {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (new RegExp(`(?:property|name)=["']${property}["']`, 'i').test(tag)) {
      return /content=["']([^"']+)["']/i.exec(tag)?.[1]?.replace(/&amp;/g, '&');
    }
  }
  return undefined;
}

export class RssFeedReader implements FeedReader {
  async read(source: FeedSource): Promise<FeedEntry[]> {
    const res = await fetch(source.url, {
      headers: { ...HEADERS, Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const doc = parser.parse(await res.text());
    const items: Node[] = doc.rss ? asArray(doc.rss.channel?.item) : asArray(doc.feed?.entry);

    return items
      .map((item): FeedEntry => {
        const link = (item.link && typeof item.link === 'object' && !('#text' in item.link)
          ? atomLink(item.link)
          : text(item.link)
        ).trim();
        const date = new Date(text(item.pubDate ?? item.published ?? item.updated));
        return {
          title: stripHtml(text(item.title)),
          summary: stripHtml(text(item.description ?? item.summary)),
          link: link.slice(0, 500),
          publishedAt: Number.isNaN(date.getTime()) ? null : date,
          imageUrl: feedImage(item)
        };
      })
      .filter((e) => e.title && e.link);
  }

  async resolveImage(entry: FeedEntry): Promise<string | null> {
    try {
      const res = await fetch(entry.link, { headers: HEADERS, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
      if (!res.ok) return null;
      // og:image lives in <head>; no need to scan a whole article.
      const html = (await res.text()).slice(0, 200_000);
      const raw = metaContent(html, 'og:image') ?? metaContent(html, 'twitter:image');
      if (!raw) return null;
      const abs = new URL(raw, entry.link).toString();
      return isHttp(abs) ? abs : null;
    } catch {
      return null;
    }
  }
}
