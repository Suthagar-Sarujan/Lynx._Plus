import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/infrastructure/auth/session';

/** Everything needs a signed-in session except the login page/API and the public image folders. */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);

  const isLoginPage = pathname === '/login';
  const isAuthApi = pathname.startsWith('/api/auth/');

  if (isAuthApi) return NextResponse.next();
  if (user) return isLoginPage ? NextResponse.redirect(new URL('/', req.url)) : NextResponse.next();
  if (isLoginPage) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const url = new URL('/login', req.url);
  if (pathname !== '/') url.searchParams.set('next', pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Static assets and the image folders stay public: Facebook/Instagram must be able to fetch /generated and /uploads.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/|generated/|uploads/).*)']
};
