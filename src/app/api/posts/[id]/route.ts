import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/infrastructure/container';
import { UpdatePostSchema } from '@/application/dto/CreatePostDto';
import { whoIs } from '@/infrastructure/audit/request';

const titleOf = (p: { bodyText?: string | null; caption?: string | null }) =>
  (p.bodyText ?? p.caption ?? 'Untitled').replace(/\*\*/g, '').slice(0, 80);

const short = (v: unknown) => (typeof v === 'string' && v.length > 120 ? `${v.slice(0, 119)}…` : v);

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const post = await container.postRepository.findById(params.id);
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(post.toProps());
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = UpdatePostSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const before = (await container.postRepository.findById(params.id))?.toProps() as Record<string, unknown> | undefined;
    const post = await container.updatePost.execute(params.id, parsed.data);

    // Only fields whose value really changed go into the trail.
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [key, to] of Object.entries(parsed.data)) {
      if (before && before[key] !== to) changes[key] = { from: short(before[key]), to: short(to) };
    }
    if (Object.keys(changes).length > 0) {
      await container.audit.record({
        ...(await whoIs(req)),
        action: 'post.update',
        entityType: 'post',
        entityId: params.id,
        summary: `Edited story (${Object.keys(changes).join(', ')}): ${titleOf(post.toProps())}`,
        detail: changes
      });
    }
    return NextResponse.json(post.toProps());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.message?.includes('not found') ? 404 : 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const before = (await container.postRepository.findById(params.id))?.toProps();
  await container.postRepository.delete(params.id);
  await container.audit.record({
    ...(await whoIs(req)),
    action: 'post.delete',
    entityType: 'post',
    entityId: params.id,
    summary: `Deleted story: ${before ? titleOf(before) : params.id}`,
    detail: before ? { status: before.status, category: before.category, language: before.language } : undefined
  });
  return NextResponse.json({ ok: true });
}
