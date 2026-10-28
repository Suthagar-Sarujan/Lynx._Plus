import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/container';

export const dynamic = 'force-dynamic';

export async function GET() {
  const stats = await container.getDashboardStats.execute();
  return NextResponse.json({
    byCategory: stats.byCategory,
    byStatus: stats.byStatus,
    recent: stats.recent.map((p) => p.toProps())
  });
}
