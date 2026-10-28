import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/infrastructure/auth/session';

/** Who is making this request (from the signed session cookie) and from where. */
export async function whoIs(req: NextRequest): Promise<{ actor: string; ip?: string }> {
  const actor = (await verifySession(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null)) ?? 'unknown';
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
  return { actor, ip };
}
