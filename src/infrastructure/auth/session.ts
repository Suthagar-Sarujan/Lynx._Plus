// Signed session cookie. Web Crypto only, so it runs in both the Edge middleware and Node routes.
export const SESSION_COOKIE = 'lynx_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

const enc = new TextEncoder();

function toB64Url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET must be set (at least 32 characters).');
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function createSession(user: string): Promise<string> {
  const payload = toB64Url(enc.encode(JSON.stringify({ u: user, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(payload));
  return `${payload}.${toB64Url(new Uint8Array(sig))}`;
}

/** The signed-in username, or null when the cookie is missing, tampered with or expired. */
export async function verifySession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(), fromB64Url(sig), enc.encode(payload));
    if (!ok) return null;
    const { u, exp } = JSON.parse(new TextDecoder().decode(fromB64Url(payload))) as { u: string; exp: number };
    return exp > Date.now() / 1000 ? u : null;
  } catch {
    return null;
  }
}
