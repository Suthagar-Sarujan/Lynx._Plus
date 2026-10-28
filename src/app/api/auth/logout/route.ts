import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/infrastructure/auth/session';
import { container } from '@/infrastructure/container';
import { whoIs } from '@/infrastructure/audit/request';

export async function POST(req: NextRequest) {
  const who = await whoIs(req);
  if (who.actor !== 'unknown') await container.audit.record({ ...who, action: 'auth.logout', summary: 'Signed out' });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
