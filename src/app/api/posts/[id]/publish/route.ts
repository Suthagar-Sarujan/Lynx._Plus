import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@/infrastructure/container';
import { whoIs } from '@/infrastructure/audit/request';

const BodySchema = z.object({
  platforms: z.array(z.enum(['FACEBOOK', 'INSTAGRAM'])).min(1),
  scheduledAt: z.string().datetime().optional() // omit to publish immediately
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { platforms, scheduledAt } = parsed.data;

  try {
    if (scheduledAt) {
      await container.schedulePost.execute(params.id, new Date(scheduledAt), platforms);
      await container.audit.record({
        ...(await whoIs(req)), action: 'post.schedule', entityType: 'post', entityId: params.id,
        summary: `Scheduled story for ${new Date(scheduledAt).toLocaleString()}`, detail: { platforms, scheduledAt }
      });
      return NextResponse.json({ status: 'scheduled', runAt: scheduledAt });
    }

    // Publish now, to every requested platform.
    await Promise.all(platforms.map((platform) => container.publishPostNow.execute(params.id, platform)));
    await container.audit.record({
      ...(await whoIs(req)), action: 'post.publish', entityType: 'post', entityId: params.id,
      summary: `Published story to ${platforms.join(' + ')}`, detail: { platforms }
    });
    return NextResponse.json({ status: 'published' });
  } catch (err: any) {
    await container.audit.record({
      ...(await whoIs(req)), action: 'post.publish_failed', entityType: 'post', entityId: params.id,
      summary: `Publish failed: ${String(err.message).slice(0, 200)}`, detail: { platforms }
    });
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
