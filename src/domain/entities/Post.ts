// Domain entity: Post. No framework, no ORM, no HTTP knowledge lives here —
// this is the one source of truth for what a "post" IS and what it can legally do.

import type { BodyAlign, BodyFontKey } from './BodyStyle';

export type Category ='SRI_LANKA' | 'INDIA' | 'FOREIGN';
export type PostStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED';
export type PostMode = 'TEMPLATE' | 'DIRECT_IMAGE';
export type Platform = 'FACEBOOK' | 'INSTAGRAM';

export interface PostProps {
  id: string;
  storyId: string;
  category: Category;
  language: string;
  mode: PostMode;
  status: PostStatus;

  dateLabel?: string | null;
  yearLabel?: string | null;
  badgeWord?: string | null;
  showBreaking?: boolean; // image says "BREAKING NEWS" when true, "NEWS" otherwise (default false)
  showNews?: boolean;
  bodyText?: string | null;
  creditTag?: string | null;

  // Typesetting of bodyText (null = template default). See BodyStyle.ts.
  bodyFont?: BodyFontKey | null;
  bodyFontSize?: number | null;
  bodyAlign?: BodyAlign | null;
  bodyLineHeight?: number | null;

  directTitle?: string | null;

  photoUrl?: string | null;
  renderedImageUrl?: string | null;

  caption?: string | null;
  hashtags?: string | null;

  scheduledAt?: Date | null;
  publishedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export type PostEdit = Partial<
  Pick<
    PostProps,
    | 'dateLabel' | 'yearLabel' | 'badgeWord' | 'showBreaking' | 'showNews' | 'bodyText' | 'creditTag' | 'directTitle' | 'photoUrl' | 'caption' | 'hashtags'
    | 'bodyFont' | 'bodyFontSize' | 'bodyAlign' | 'bodyLineHeight'
  >
>;

export class Post {
  private constructor(private props: PostProps) {}

  static create(props: PostProps): Post {
    if (props.mode === 'TEMPLATE' && !props.bodyText) {
      throw new DomainError('A template post needs body text before it can be saved.');
    }
    if (props.mode === 'DIRECT_IMAGE' && !props.photoUrl) {
      throw new DomainError('A direct-image post needs an uploaded photo before it can be saved.');
    }
    return new Post(props);
  }

  get id() { return this.props.id; }
  get storyId() { return this.props.storyId; }
  get category() { return this.props.category; }
  get language() { return this.props.language; }
  get mode() { return this.props.mode; }
  get status() { return this.props.status; }
  get caption() { return this.props.caption ?? ''; }
  get hashtags() { return this.props.hashtags ?? ''; }
  get bodyText() { return this.props.bodyText ?? ''; }
  get photoUrl() { return this.props.photoUrl ?? null; }
  get renderedImageUrl() { return this.props.renderedImageUrl ?? null; }
  get scheduledAt() { return this.props.scheduledAt ?? null; }

  toProps(): PostProps {
    return { ...this.props };
  }

  /** Posts can only move DRAFT -> SCHEDULED -> PUBLISHED, or anything -> FAILED. */
  canTransitionTo(next: PostStatus): boolean {
    const allowed: Record<PostStatus, PostStatus[]> = {
      DRAFT: ['SCHEDULED', 'PUBLISHED', 'FAILED'],
      SCHEDULED: ['PUBLISHED', 'FAILED', 'DRAFT'],
      PUBLISHED: [],
      FAILED: ['DRAFT', 'SCHEDULED', 'PUBLISHED']
    };
    return allowed[this.props.status].includes(next);
  }

  schedule(at: Date): void {
    if (!this.canTransitionTo('SCHEDULED')) {
      throw new DomainError(`Cannot schedule a post that is already ${this.props.status}.`);
    }
    if (at.getTime() <= Date.now()) {
      throw new DomainError('Scheduled time must be in the future.');
    }
    this.props.status = 'SCHEDULED';
    this.props.scheduledAt = at;
    this.props.updatedAt = new Date();
  }

  /** Applies user edits. Published posts are frozen; edits to content invalidate the rendered image. */
  edit(changes: PostEdit): void {
    if (this.props.status === 'PUBLISHED') {
      throw new DomainError('A published post can no longer be edited.');
    }
    const next = { ...this.props, ...changes };
    if (next.mode === 'TEMPLATE' && !next.bodyText?.trim()) {
      throw new DomainError('A template post needs body text.');
    }
    if (next.mode === 'DIRECT_IMAGE' && !next.photoUrl) {
      throw new DomainError('A direct-image post needs a photo.');
    }

    const imageInputs = [
      'dateLabel', 'yearLabel', 'badgeWord', 'showBreaking', 'showNews', 'bodyText', 'creditTag', 'photoUrl',
      'bodyFont', 'bodyFontSize', 'bodyAlign', 'bodyLineHeight'
    ] as const;
    if (imageInputs.some((k) => k in changes && changes[k] !== this.props[k])) {
      next.renderedImageUrl = null;
    }
    next.updatedAt = new Date();
    this.props = next;
  }

  markPublished(): void {
    // Publishing to several platforms calls this once per platform; later calls are no-ops.
    if (this.props.status === 'PUBLISHED') return;
    if (!this.canTransitionTo('PUBLISHED')) {
      throw new DomainError(`Cannot publish a post that is ${this.props.status}.`);
    }
    this.props.status = 'PUBLISHED';
    this.props.publishedAt = new Date();
    this.props.updatedAt = new Date();
  }

  markFailed(): void {
    this.props.status = 'FAILED';
    this.props.updatedAt = new Date();
  }

  attachRenderedImage(url: string): void {
    this.props.renderedImageUrl = url;
    this.props.updatedAt = new Date();
  }

  /** The full text the social post will carry: caption + hashtags on their own line. */
  composeSocialText(): string {
    const parts = [this.props.caption?.trim()].filter(Boolean) as string[];
    if (this.props.hashtags?.trim()) parts.push(this.props.hashtags.trim());
    return parts.join('\n\n');
  }
}

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
