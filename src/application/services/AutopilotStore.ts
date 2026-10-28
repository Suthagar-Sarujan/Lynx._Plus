import type { Category } from '@/domain/entities/Post';

export interface AutopilotCandidate {
  postId: string;
  storyId: string;
  category: Category;
  headline: string;
  photoUrl: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  createdAt: Date;
}

export interface FailedJob {
  postId: string;
  platform: 'FACEBOOK' | 'INSTAGRAM';
  headline: string;
  error: string;
  attempts: number;
  at: Date;
}

/** Port — the queries the autopilot needs that don't belong on the Post/Story repositories. */
export interface AutopilotStore {
  /** Fresh feed-imported English drafts with a rendered image that the autopilot has not claimed yet. */
  findCandidates(createdAfter: Date): Promise<AutopilotCandidate[]>;
  /** Atomically claims a story; false if another tick got there first. */
  claimStory(storyId: string): Promise<boolean>;
  countStoriesQueuedSince(since: Date): Promise<number>;
  /** When the autopilot last queued a story in each category (missing = never). */
  lastQueuedByCategory(): Promise<Partial<Record<Category, Date>>>;
  lastQueuedAt(): Promise<Date | null>;
  /** True if this post was queued by the autopilot (as opposed to scheduled by a person). */
  isQueuedByAutopilot(postId: string): Promise<boolean>;
  /** Takes a not-yet-published autopilot post back to a plain draft and frees its story for a later run. */
  releaseQueued(postId: string): Promise<void>;
  /** The latest time any autopilot story is (or was) scheduled to go out; new stories are spaced after it. */
  lastScheduledAt(): Promise<Date | null>;
  /** Headlines of English posts that were published or are scheduled to be, since `since`. */
  recentSentHeadlines(since: Date): Promise<string[]>;
  /** Publish jobs that failed and have not succeeded since, newest first. */
  listFailedJobs(limit: number): Promise<FailedJob[]>;
}
