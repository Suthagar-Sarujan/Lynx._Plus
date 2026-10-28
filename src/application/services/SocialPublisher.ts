import type { Platform } from '@/domain/entities/Post';

export interface PublishResult {
  platformPostId: string;
}

/**
 * Port for whatever publishes a finished post to a social platform.
 * The only implementation today is the Meta Graph API (Facebook + Instagram),
 * because that's the one closed, unavoidable dependency in an otherwise fully
 * open-source stack — see infrastructure/social/MetaGraphClient.ts.
 */
export interface SocialPublisher {
  publish(args: {
    platform: Platform;
    imageUrl: string;
    text: string;
  }): Promise<PublishResult>;

  /** Returns a problem description if the credentials no longer work (e.g. expired token), else null. */
  checkHealth(): Promise<string | null>;
}
