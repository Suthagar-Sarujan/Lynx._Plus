import { NextRequest, NextResponse } from 'next/server';
import { whoIs } from '@/infrastructure/audit/request';

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (actor === 'unknown') return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  return NextResponse.json({ username: actor });
}
