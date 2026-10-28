import type { PostRepository } from '@/domain/repositories/PostRepository';
import type { StoryRepository } from '@/domain/repositories/StoryRepository';
import type { FeedReader, FeedSource } from '@/application/services/FeedReader';
import type { ImageStore } from '@/application/services/ImageStore';
import type { CreatePost } from '@/application/use-cases/CreatePost';
import type { RenderPostImage } from '@/application/use-cases/RenderPostImage';
import { isDuplicateHeadline } from '@/application/util/headlines';

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: { source: string; message: string }[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const BODY_MAX = 320;
/** Headlines newer than this are compared against, so the same event from two outlets is imported once. */
const DEDUPE_WINDOW_MS = 48 * 60 * 60 * 1000;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Pulls the newest entries from each feed and saves unseen ones as DRAFT posts, with their article photo and rendered image. */
export class ImportFeedNews {
  constructor(
    private readonly reader: FeedReader,
    private readonly stories: StoryRepository,
    private readonly createPost: CreatePost,
    private readonly images: ImageStore,
    private readonly renderPostImage: RenderPostImage,
    private readonly posts: PostRepository,
    private readonly sources: FeedSource[],
    private readonly perFeedLimit = 5
  ) {}

  async execute(): Promise<ImportResult> {
    const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
    const knownHeadlines = await this.posts.recentHeadlines(new Date(Date.now() - DEDUPE_WINDOW_MS));

    await Promise.all(
      this.sources.map(async (source) => {
        try {
          const entries = (await this.reader.read(source)).slice(0, this.perFeedLimit);
          // Sequential within a feed so one source can't flood the DB at once.
          for (const entry of entries) {
            if (await this.stories.existsBySourceUrl(entry.link)) {
              result.skipped++;
              continue;
            }
            if (isDuplicateHeadline(entry.title, knownHeadlines)) {
              result.skipped++;
              continue;
            }
            knownHeadlines.push(entry.title);
            const when = entry.publishedAt ?? new Date();
            // Some feeds repeat the headline as the summary; don't say it twice.
            const repeatsTitle = entry.summary.toLowerCase().startsWith(entry.title.toLowerCase().replace(/[.…]+$/, ''));
            const body = entry.summary && !repeatsTitle ? `${entry.title}. ${entry.summary}` : entry.title;
            // Only look for an image once we know the entry is new (saves a page fetch per cycle).
            // The feed's own image first; if it's missing or can't be downloaded, try the article's og:image.
            let photoUrl = entry.imageUrl ? await this.images.saveFromUrl(entry.imageUrl) : null;
            if (!photoUrl) {
              const fallback = await this.reader.resolveImage(entry);
              if (fallback && fallback !== entry.imageUrl) photoUrl = await this.images.saveFromUrl(fallback);
            }
            try {
              const post = await this.createPost.execute({
                category: source.category,
                language: 'en',
                mode: 'TEMPLATE',
                sourceUrl: entry.link,
                sourceName: source.name,
                dateLabel: `${MONTHS[when.getMonth()]} ${when.getDate()}`,
                yearLabel: String(when.getFullYear()),
                bodyText: clip(body, BODY_MAX),
                photoUrl: photoUrl ?? undefined,
                caption: entry.title
              });
              result.imported++;
              if (photoUrl) {
                // Best effort: a render failure just leaves the draft without a thumbnail.
                await this.renderPostImage.execute(post.id).catch(() => undefined);
              }
            } catch {
              // Lost a race on the unique sourceUrl (or a bad entry): treat as already imported.
              result.skipped++;
            }
          }
        } catch (err) {
          result.errors.push({ source: source.name, message: err instanceof Error ? err.message : String(err) });
        }
      })
    );

    return result;
  }
}
