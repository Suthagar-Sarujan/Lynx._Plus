import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@/infrastructure/container';
import { whoIs } from '@/infrastructure/audit/request';

export const dynamic = 'force-dynamic';

const hour = z.number().int().min(0).max(23);
const validTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const PatchSchema = z
  .object({
    enabled: z.boolean(), // the kill switch
    platforms: z.array(z.enum(['FACEBOOK', 'INSTAGRAM'])),
    languages: z.array(z.string().min(2).max(8)).min(1),
    dailyCap: z.number().int().min(1).max(90), // Instagram allows 100 API posts per 24h; stay below it
    minGapMinutes: z.number().int().min(0).max(1440),
    languageStaggerMinutes: z.number().int().min(0).max(240),
    activeFromHour: hour,
    activeToHour: hour,
    timezone: z.string().refine(validTimezone, 'Unknown timezone'),
    maxAgeHours: z.number().int().min(1).max(72),
    minPhotoWidth: z.number().int().min(0).max(4000),
    blockedKeywords: z.array(z.string()),
    reviewKeywords: z.array(z.string())
  })
  .partial()
  .strict();

export async function GET() {
  return NextResponse.json(await container.automationSettings.get());
}

export async function PATCH(req: NextRequest) {
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const settings = await container.automationSettings.update(parsed.data);
  await container.audit.record({
    ...(await whoIs(req)),
    action: 'automation.update',
    entityType: 'feed',
    summary: parsed.data.enabled === undefined ? 'Changed autopilot settings' : `Autopilot turned ${parsed.data.enabled ? 'ON' : 'OFF'}`,
    detail: parsed.data
  });
  return NextResponse.json(settings);
}
