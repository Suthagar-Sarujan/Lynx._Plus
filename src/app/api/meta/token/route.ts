import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@/infrastructure/container';
import { whoIs } from '@/infrastructure/audit/request';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({ token: z.string().min(20) });

/** Signed-in admins only (middleware). Exchanges a fresh Facebook token for the permanent Page token. */
export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Send { "token": "..." }.' }, { status: 400 });

  try {
    const result = await container.metaTokens.connect(parsed.data.token);
    const problem = await container.socialHealth();
    await container.audit.record({
      ...(await whoIs(req)), action: 'meta.connect', entityType: 'feed',
      summary: `Reconnected Facebook Page "${result.pageName}"`, detail: { via: result.via, healthy: !problem }
    });
    return NextResponse.json({ ...result, healthy: !problem, problem });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
