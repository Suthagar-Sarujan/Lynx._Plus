import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/infrastructure/container';

export const dynamic = 'force-dynamic';

/** Read-only: newest first. ?entityId= narrows it to one story. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 500, 1), 1000);
  const entityId = searchParams.get('entityId') ?? undefined;
  return NextResponse.json(await container.audit.list({ limit, entityId }));
}
