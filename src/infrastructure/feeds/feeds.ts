import type { FeedSource } from '@/application/services/FeedReader';

// Edit this list to add/remove sources. Each feed's entries land in `category`.
export const FEED_SOURCES: FeedSource[] = [
  { name: 'Ada Derana', url: 'http://www.adaderana.lk/rss.php', category: 'SRI_LANKA' },
  { name: 'EconomyNext', url: 'https://economynext.com/feed/', category: 'SRI_LANKA' },
  { name: 'NDTV', url: 'https://feeds.feedburner.com/ndtvnews-latest', category: 'INDIA' },
  { name: 'Times of India', url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms', category: 'INDIA' },
  { name: 'The Hindu', url: 'https://www.thehindu.com/news/national/feeder/default.rss', category: 'INDIA' },
  { name: 'BBC World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml', category: 'FOREIGN' }
];
