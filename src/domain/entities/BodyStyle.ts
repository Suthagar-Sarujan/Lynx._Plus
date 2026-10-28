// How a post's news text is typeset on the image. Everything else in the
// template stays fixed; these are the only styling choices a user can make.

export const BODY_FONTS = [
  { key: 'poppins', label: 'Poppins (default)' },
  { key: 'opensans', label: 'Open Sans' },
  { key: 'inter', label: 'Inter' },
  { key: 'oswald', label: 'Oswald (condensed)' },
  { key: 'playfair', label: 'Playfair Display (serif)' },
  { key: 'lora', label: 'Lora (serif)' }
] as const;

export type BodyFontKey = (typeof BODY_FONTS)[number]['key'];
export const BODY_FONT_KEYS = BODY_FONTS.map((f) => f.key) as [BodyFontKey, ...BodyFontKey[]];

export const BODY_ALIGNS = ['left', 'center', 'right'] as const;
export type BodyAlign = (typeof BODY_ALIGNS)[number];

export const BODY_SIZE = { min: 24, max: 64, auto: 44 } as const; // px on the 1500x2000 image
export const BODY_LINE_HEIGHT = { min: 100, max: 200 } as const; // percent of the font size

/** null on any field means "use the template default". */
export interface BodyStyle {
  font?: BodyFontKey | null;
  size?: number | null;
  align?: BodyAlign | null;
  lineHeight?: number | null;
}
