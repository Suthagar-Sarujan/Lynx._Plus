// Composition root: the ONLY file that wires concrete infrastructure classes
// into the application use cases. API routes and the worker import from
// here, never from `infrastructure/*` directly — keeps the dependency
// direction clean (inward: infra -> application -> domain).

import { prisma } from '@/infrastructure/db/prisma';
import { PrismaPostRepository } from '@/infrastructure/repositories/PrismaPostRepository';
import { PrismaStoryRepository } from '@/infrastructure/repositories/PrismaStoryRepository';
import { MetaGraphClient } from '@/infrastructure/social/MetaGraphClient';
import { MetaTokenStore } from '@/infrastructure/social/MetaTokenStore';
import { MetaTokenService } from '@/infrastructure/social/MetaTokenService';
import { LibreTranslateService } from '@/infrastructure/translation/LibreTranslateService';
import { CanvasTemplateRenderer } from '@/infrastructure/image/CanvasTemplateRenderer';
import { RssFeedReader } from '@/infrastructure/feeds/RssFeedReader';
import { FEED_SOURCES } from '@/infrastructure/feeds/feeds';
import { LocalImageStore } from '@/infrastructure/storage/LocalImageStore';
import { BullMqPublishQueue } from '@/infrastructure/queue/BullMqPublishQueue';

import { CreatePost } from '@/application/use-cases/CreatePost';
import { ListPosts } from '@/application/use-cases/ListPosts';
import { GetDashboardStats } from '@/application/use-cases/GetDashboardStats';
import { RenderPostImage } from '@/application/use-cases/RenderPostImage';
import { TranslatePost } from '@/application/use-cases/TranslatePost';
import { SchedulePost } from '@/application/use-cases/SchedulePost';
import { PublishPostNow } from '@/application/use-cases/PublishPostNow';
import { UpdatePost } from '@/application/use-cases/UpdatePost';
import { PreviewTemplate } from '@/application/use-cases/PreviewTemplate';
import { SuggestHashtags } from '@/application/use-cases/SuggestHashtags';
import { MastodonHashtags } from '@/infrastructure/trends/MastodonHashtags';
import { PrismaAuditLog } from '@/infrastructure/audit/PrismaAuditLog';
import { ImportFeedNews } from '@/application/use-cases/ImportFeedNews';
import { GetAutopilotStatus } from '@/application/use-cases/GetAutopilotStatus';
import { RunAutopilot } from '@/application/use-cases/RunAutopilot';
import { PrismaPublishJobStore } from '@/infrastructure/repositories/PrismaPublishJobStore';
import { PrismaAutomationSettingsStore } from '@/infrastructure/automation/PrismaAutomationSettingsStore';
import { PrismaAutopilotStore } from '@/infrastructure/automation/PrismaAutopilotStore';
import { SharpImageInspector } from '@/infrastructure/image/SharpImageInspector';
import { WebhookNotifier } from '@/infrastructure/notify/WebhookNotifier';

const postRepository = new PrismaPostRepository(prisma);
const storyRepository = new PrismaStoryRepository(prisma);

// Lazily constructed — these touch env vars / network, so only build them
// when actually used (keeps `next build` and non-publishing routes working
// even before Meta/LibreTranslate credentials are configured).
const metaTokenStore = new MetaTokenStore(prisma);
let _publisher: MetaGraphClient | null = null;
function getPublisher() {
  return (_publisher ??= new MetaGraphClient(metaTokenStore));
}

const translator = new LibreTranslateService();
const renderer = new CanvasTemplateRenderer();
const publishQueue = new BullMqPublishQueue();
const publishJobs = new PrismaPublishJobStore(prisma);
const automationSettings = new PrismaAutomationSettingsStore(prisma);
const notifier = new WebhookNotifier();
const createPost = new CreatePost(postRepository, storyRepository);
const renderPostImage = new RenderPostImage(postRepository, renderer);
const updatePost = new UpdatePost(postRepository, renderPostImage);
const translatePost = new TranslatePost(postRepository, storyRepository, translator);
const schedulePost = new SchedulePost(postRepository, publishQueue, publishJobs);
const importFeedNews = new ImportFeedNews(
  new RssFeedReader(), storyRepository, createPost, new LocalImageStore(), renderPostImage, postRepository, FEED_SOURCES
);

export const container = {
  audit: new PrismaAuditLog(prisma),
  notifier,
  metaTokens: new MetaTokenService(metaTokenStore),
  automationSettings,
  autopilotStore: new PrismaAutopilotStore(prisma),
  postRepository,
  storyRepository,

  createPost,
  importFeedNews,
  listPosts: new ListPosts(postRepository),
  getDashboardStats: new GetDashboardStats(postRepository),
  renderPostImage,
  updatePost,
  previewTemplate: new PreviewTemplate(renderer),
  suggestHashtags: new SuggestHashtags(postRepository, new MastodonHashtags()),
  translatePost,
  schedulePost,
  get publishPostNow() {
    return new PublishPostNow(postRepository, getPublisher(), publishJobs);
  },
  get autopilotStatus() {
    return new GetAutopilotStatus(automationSettings, new PrismaAutopilotStore(prisma), container.socialHealth);
  },
  triggerAutopilotTick: () => publishQueue.triggerAutopilotTick(),
  get runAutopilot() {
    return new RunAutopilot(
      automationSettings, new PrismaAutopilotStore(prisma), importFeedNews, postRepository,
      translatePost, renderPostImage, updatePost, schedulePost, notifier, new SharpImageInspector()
    );
  },
  /** Null when Meta credentials work, otherwise a description of the problem. */
  socialHealth: async (): Promise<string | null> => {
    try {
      return await getPublisher().checkHealth();
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }
};
