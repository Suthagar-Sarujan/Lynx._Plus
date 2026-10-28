import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/container';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await container.autopilotStatus.execute());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
