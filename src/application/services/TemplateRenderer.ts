import type { BodyStyle } from '@/domain/entities/BodyStyle';

// The template itself (logo, "BREAKING NEWS", fonts, colours, icons, credit tag)
// is fixed inside the renderer. Per post, only the photo, the date and the news
// text vary, plus optional typesetting of that text (font, size, alignment, spacing).
export interface RenderTemplateInput {
  photoPath: string; // local path or URL to the source photo
  dateLabel: string; // e.g. "October 18"
  yearLabel: string; // e.g. "2026"
  bodyText: string; // may contain **gold-highlighted** terms
  showBreaking?: boolean; // mark as breaking: the image says "BREAKING NEWS" instead of "NEWS" (default false)
  showNews?: boolean; // "NEWS" is always drawn; BREAKING appears only together with it (default true)
  language: string; // drives which font is used for the body (si/ta get native fonts)
  bodyStyle?: BodyStyle; // optional typesetting of the body text
}

/** Port — implemented with @napi-rs/canvas, composites the Lynx Plus template. */
export interface TemplateRenderer {
  render(input: RenderTemplateInput): Promise<{ filePath: string; url: string }>;
  /** Same image as render(), returned as PNG bytes without saving it. */
  renderToBuffer(input: RenderTemplateInput): Promise<Buffer>;
}
