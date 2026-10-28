import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (s: string) => createHash('sha256').update(s).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

export function loginConfigured(): boolean {
  return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD && process.env.AUTH_SECRET);
}

/** Constant-time check against ADMIN_USERNAME / ADMIN_PASSWORD from the environment. */
export function checkCredentials(username: string, password: string): boolean {
  const u = process.env.ADMIN_USERNAME ?? '';
  const p = process.env.ADMIN_PASSWORD ?? '';
  if (!u || !p) return false;
  // Evaluate both so timing doesn't reveal which one was wrong.
  const userOk = same(username, u);
  const passOk = same(password, p);
  return userOk && passOk;
}
