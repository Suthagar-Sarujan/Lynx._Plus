/** How much a hashtag was really used on the public network over the last 7 days. */
export interface TagUsage {
  tag: string; // as people write it, with the leading "#" (e.g. "#BreakingNews")
  uses: number; // posts using it
  accounts: number; // distinct accounts posting it
}

/**
 * Port: a source of real-world hashtag usage. Methods throw when the source is unreachable,
 * so callers can tell "nobody uses this tag" (uses = 0) apart from "couldn't check".
 */
export interface HashtagDirectory {
  /** Real hashtags starting with / containing `query`, most used first. */
  search(query: string, limit: number): Promise<TagUsage[]>;
  /** Usage of one exact hashtag (uses = 0 if it exists nowhere). */
  lookup(name: string): Promise<TagUsage>;
}
