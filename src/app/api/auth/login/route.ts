import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/infrastructure/container';
import { checkCredentials, loginConfigured } from '@/infrastructure/auth/credentials';
import { createSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/infrastructure/auth/session';

// Per-IP lockout after repeated failures (in-memory: resets on restart, fine for a single-instance tool).
const MAX_FAILS = 5;
const LOCK_MS = 60_000;
const fails = new Map<string, { count: number; until: number }>();

export async function POST(req: NextRequest) {
  if (!loginConfigured()) {
    return NextResponse.json({ error: 'Login is not configured. Set ADMIN_USERNAME, ADMIN_PASSWORD and AUTH_SECRET in .env.' }, { status: 503 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const state = fails.get(ip);
  if (state && state.count >= MAX_FAILS && state.until > Date.now()) {
    const wait = Math.ceil((state.until - Date.now()) / 1000);
    return NextResponse.json({ error: `Too many attempts. Try again in ${wait}s.` }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const username = typeof body.username === 'string' ? body.username : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!checkCredentials(username, password)) {
    const count = (state && state.until > Date.now() ? state.count : 0) + 1;
    fails.set(ip, { count, until: Date.now() + LOCK_MS });
    await container.audit.record({ actor: username.slice(0, 100) || 'unknown', action: 'auth.login_failed', summary: 'Failed sign-in attempt', ip });
    return NextResponse.json({ error: 'Wrong username or password.' }, { status: 401 });
  }

  fails.delete(ip);
  await container.audit.record({ actor: username, action: 'auth.login', summary: 'Signed in', ip });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(username), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS
  });
  return res;
}
