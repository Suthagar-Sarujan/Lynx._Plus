import { z } from 'zod';
import { BODY_ALIGNS, BODY_FONT_KEYS, BODY_LINE_HEIGHT, BODY_SIZE } from '@/domain/entities/BodyStyle';

export const BodyFontSchema = z.enum(BODY_FONT_KEYS);
export const BodyAlignSchema = z.enum(BODY_ALIGNS);
export const BodySizeSchema = z.number().int().min(BODY_SIZE.min).max(BODY_SIZE.max);
export const BodyLineHeightSchema = z.number().int().min(BODY_LINE_HEIGHT.min).max(BODY_LINE_HEIGHT.max);

export const CreatePostSchema = z.object({
  storyId: z.string().optional(), // omit to start a new Story
  sourceUrl: z.string().optional(), // origin article URL when imported from a feed
  sourceName: z.string().optional(), // feed name, for attribution
  category: z.enum(['SRI_LANKA', 'INDIA', 'FOREIGN']),
  language: z.string().default('en'),
  mode: z.enum(['TEMPLATE', 'DIRECT_IMAGE']).default('TEMPLATE'),

  dateLabel: z.string().optional(),
  yearLabel: z.string().optional(),
  badgeWord: z.string().optional(),
  showBreaking: z.boolean().optional(),
  showNews: z.boolean().optional(),
  bodyText: z.string().optional(),
  creditTag: z.string().optional(),

  bodyFont: BodyFontSchema.nullish(),
  bodyFontSize: BodySizeSchema.nullish(),
  bodyAlign: BodyAlignSchema.nullish(),
  bodyLineHeight: BodyLineHeightSchema.nullish(),

  directTitle: z.string().optional(),
  photoUrl: z.string().optional(),

  caption: z.string().optional(),
  hashtags: z.string().optional()
});

// Every field optional: only what's sent is changed. null clears a field.
export const UpdatePostSchema = z
  .object({
    dateLabel: z.string().nullable(),
    yearLabel: z.string().nullable(),
    badgeWord: z.string().nullable(),
    showBreaking: z.boolean(),
    showNews: z.boolean(),
    bodyText: z.string().nullable(),
    creditTag: z.string().nullable(),
    bodyFont: BodyFontSchema.nullable(),
    bodyFontSize: BodySizeSchema.nullable(),
    bodyAlign: BodyAlignSchema.nullable(),
    bodyLineHeight: BodyLineHeightSchema.nullable(),
    directTitle: z.string().nullable(),
    photoUrl: z.string().nullable(),
    caption: z.string().nullable(),
    hashtags: z.string().nullable()
  })
  .partial()
  .strict();

export type CreatePostInput = z.infer<typeof CreatePostSchema>;
