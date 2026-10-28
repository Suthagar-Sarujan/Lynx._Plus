import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/infrastructure/container';
import { whoIs } from '@/infrastructure/audit/request';

export const dynamic = 'force-dynamic';

/** "Run now": asks the worker to run one autopilot tick immediately (it still obeys the caps and the on/off switch). */
export async function POST(req: NextRequest) {
  try {
    await container.triggerAutopilotTick();
    await container.audit.record({ ...(await whoIs(req)), action: 'automation.run', entityType: 'feed', summary: 'Ran the autopilot now' });
    return NextResponse.json({ status: 'queued' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 503 });
  }
}
