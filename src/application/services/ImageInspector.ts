export interface ImageSize {
  width: number;
  height: number;
}

/** Port — reads an image's pixel size without the application layer knowing how. Null if unreadable. */
export interface ImageInspector {
  size(imageUrl: string): Promise<ImageSize | null>;
}
