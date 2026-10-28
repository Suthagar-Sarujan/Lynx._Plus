import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@/infrastructure/container';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  q: z.string().max(60).default(''),
  text: z.string().max(4000).default(''),
  category: z.enum(['SRI_LANKA', 'INDIA', 'FOREIGN']).default('FOREIGN'),
  language: z.string().default('en')
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const suggestions = await container.suggestHashtags.execute(parsed.data);
  return NextResponse.json({ suggestions });
}
