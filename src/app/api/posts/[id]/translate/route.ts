import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@/infrastructure/container';
import { whoIs } from '@/infrastructure/audit/request';

const BodySchema = z.object({
  languages: z.array(z.string()).min(1) // ISO codes: ["si", "ta", "hi", ...]
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const posts = await container.translatePost.execute(params.id, parsed.data.languages);
    await container.audit.record({
      ...(await whoIs(req)), action: 'post.translate', entityType: 'post', entityId: params.id,
      summary: `Created ${posts.length} translated draft(s): ${parsed.data.languages.join(', ')}`,
      detail: { languages: parsed.data.languages, newPostIds: posts.map((p) => p.id) }
    });
    return NextResponse.json(posts.map((p) => p.toProps()));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
