import type { Category } from './Post';

export interface StoryProps {
  id: string;
  category: Category;
  sourceUrl?: string | null;
  sourceName?: string | null;
  autoQueuedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A Story groups every language variant (Post) of the same real-world event. */
export class Story {
  private constructor(private props: StoryProps) {}

  static create(props: StoryProps): Story {
    return new Story(props);
  }

  get id() { return this.props.id; }
  get category() { return this.props.category; }
  get sourceUrl() { return this.props.sourceUrl ?? null; }
  get sourceName() { return this.props.sourceName ?? null; }

  toProps(): StoryProps {
    return { ...this.props };
  }
}
