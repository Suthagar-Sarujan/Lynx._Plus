import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/infrastructure/container';

/** POST: render (or re-render) the template image for this post. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const post = await container.renderPostImage.execute(params.id);
    return NextResponse.json(post.toProps());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
