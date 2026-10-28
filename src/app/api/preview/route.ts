import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@/infrastructure/container';
import { BodyAlignSchema, BodyFontSchema, BodyLineHeightSchema, BodySizeSchema } from '@/application/dto/CreatePostDto';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  photoUrl: z.string().min(1),
  dateLabel: z.string().default(''),
  yearLabel: z.string().default(''),
  bodyText: z.string().min(1),
  language: z.string().default('en'),
  showBreaking: z.boolean().default(false),
  showNews: z.boolean().default(true),
  bodyFont: BodyFontSchema.nullish(),
  bodyFontSize: BodySizeSchema.nullish(),
  bodyAlign: BodyAlignSchema.nullish(),
  bodyLineHeight: BodyLineHeightSchema.nullish()
});

/** Renders the template for unsaved edits and returns the PNG (nothing is stored). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { photoUrl, bodyFont, bodyFontSize, bodyAlign, bodyLineHeight, ...rest } = parsed.data;

  try {
    const png = await container.previewTemplate.execute({
      photoPath: photoUrl,
      ...rest,
      bodyStyle: { font: bodyFont, size: bodyFontSize, align: bodyAlign, lineHeight: bodyLineHeight }
    });
    return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
