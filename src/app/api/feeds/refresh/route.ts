import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/infrastructure/container';
import { whoIs } from '@/infrastructure/audit/request';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const who = await whoIs(req);
  const result = await container.importFeedNews.execute();
  await container.audit.record({
    ...who,
    action: 'feed.refresh',
    entityType: 'feed',
    summary: `Fetched latest news: ${result.imported} new, ${result.skipped} skipped, ${result.errors.length} failed`,
    detail: { imported: result.imported, skipped: result.skipped, errors: result.errors }
  });
  return NextResponse.json(result);
}
