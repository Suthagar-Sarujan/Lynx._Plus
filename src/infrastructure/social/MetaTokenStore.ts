import type { PrismaClient } from '@prisma/client';

const CACHE_MS = 30_000;

/**
 * Where the live Page token is kept. The database row (written by MetaTokenService) wins over
 * META_PAGE_ACCESS_TOKEN in .env. Reads are cached for a few seconds so publishing stays cheap,
 * yet a renewed token reaches the already-running worker within half a minute.
 */
export class MetaTokenStore {
  private cached: { token: string | null; at: number } | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  async get(): Promise<string> {
    if (!this.cached || Date.now() - this.cached.at > CACHE_MS) {
      const row = await this.prisma.metaCredential.findUnique({ where: { id: 'default' } });
      this.cached = { token: row?.pageToken ?? null, at: Date.now() };
    }
    const token = this.cached.token ?? process.env.META_PAGE_ACCESS_TOKEN;
    if (!token) {
      throw new Error('No Meta Page token configured. Run `npm run meta:connect -- <token>` (see README) or set META_PAGE_ACCESS_TOKEN.');
    }
    return token;
  }

  async set(pageToken: string): Promise<void> {
    await this.prisma.metaCredential.upsert({ where: { id: 'default' }, create: { id: 'default', pageToken }, update: { pageToken } });
    this.cached = { token: pageToken, at: Date.now() };
  }
}
