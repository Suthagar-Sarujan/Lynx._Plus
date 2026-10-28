import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { cleanPath, publicBaseUrl } from '@/infrastructure/config/publicUrl';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

/** Reads an image from our own public folder when the URL points there, otherwise downloads it. */
export async function loadImageBuffer(imageUrl: string): Promise<Buffer> {
  const local = new URL(imageUrl, publicBaseUrl());
  const pathname = cleanPath(local.pathname); // stored URLs may contain "//generated/..."
  if (/^\/(generated|uploads)\//.test(pathname)) {
    const file = path.join(PUBLIC_DIR, decodeURIComponent(pathname));
    if (file.startsWith(PUBLIC_DIR + path.sep)) {
      try {
        return await readFile(file);
      } catch {
        /* not on this machine's disk: fall through to download */
      }
    }
  }
  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Could not download the image (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}
