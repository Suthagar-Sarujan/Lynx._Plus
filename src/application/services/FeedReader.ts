import type { Category } from '@/domain/entities/Post';

export interface FeedSource {
  name: string;
  url: string;
  category: Category;
}

export interface FeedEntry {
  title: string;
  summary: string;
  link: string;
  publishedAt: Date | null;
  /** Image declared inside the feed itself (media:content, enclosure, <img>...). */
  imageUrl: string | null;
}

/** Port: fetches and parses RSS/Atom feeds. Implemented in infrastructure/feeds. */
export interface FeedReader {
  read(source: FeedSource): Promise<FeedEntry[]>;
  /** Fallback for entries whose feed has no image: looks at the article page itself (og:image). */
  resolveImage(entry: FeedEntry): Promise<string | null>;
}
