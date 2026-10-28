/** Port: copies a remote image into our own storage so we don't hotlink publisher CDNs. */
export interface ImageStore {
  /** Returns the stored image's public URL, or null if it couldn't be fetched or isn't a usable image. */
  saveFromUrl(url: string): Promise<string | null>;
}
