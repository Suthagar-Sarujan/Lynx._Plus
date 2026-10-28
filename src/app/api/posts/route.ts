import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/infrastructure/container';
import { whoIs } from '@/infrastructure/audit/request';
import { CreatePostSchema } from '@/application/dto/CreatePostDto';
import type { Category, PostStatus } from '@/domain/entities/Post';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') as Category | null;
  const status = searchParams.get('status') as PostStatus | null;

  const posts = await container.listPosts.execute({
    category: category ?? undefined,
    status: status ?? undefined
  });

  return NextResponse.json(posts.map((p) => p.toProps()));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreatePostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const post = await container.createPost.execute(parsed.data);
  const props = post.toProps();
  await container.audit.record({
    ...(await whoIs(req)),
    action: 'post.create',
    entityType: 'post',
    entityId: post.id,
    summary: `Created ${parsed.data.category.replace('_', ' ').toLowerCase()} story: ${(props.bodyText ?? props.caption ?? 'Untitled').replace(/\*\*/g, '').slice(0, 80)}`,
    detail: { category: parsed.data.category, mode: parsed.data.mode, language: parsed.data.language }
  });
  return NextResponse.json(post.toProps(), { status: 201 });
}
