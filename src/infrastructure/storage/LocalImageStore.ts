import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ImageStore } from '@/application/services/ImageStore';
import { publicBaseUrl } from '@/infrastructure/config/publicUrl';

// Same directory and URL shape as POST /api/upload, so stored images are interchangeable.
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const MAX_BYTES = 8 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

export class LocalImageStore implements ImageStore {
  async saveFromUrl(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (LYNX-Plus feed reader)' },
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store'
      });
      if (!res.ok) return null;

      const type = (res.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? ''.toLowerCase();
      const ext = EXT_BY_TYPE[type];
      if (!ext) return null;

      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length === 0 || buffer.length > MAX_BYTES) return null;

      const filename = `${randomUUID()}${ext}`;
      await mkdir(UPLOAD_DIR, { recursive: true });
      await writeFile(path.join(UPLOAD_DIR, filename), buffer);

      const base = publicBaseUrl();
      return `${base}/uploads/${filename}`;
    } catch {
      return null;
    }
  }
}
