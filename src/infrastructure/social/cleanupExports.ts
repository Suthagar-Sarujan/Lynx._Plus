import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'generated');
/** Only the throw-away JPEG copies made for Meta (ig-*.jpg / fb-*.jpg); rendered posts (post-*.jpg / .png) are never touched. */
const EXPORT_NAME = /^(ig|fb)-[0-9a-f-]{36}\.jpg$/i;

/** Deletes temporary Facebook/Instagram export files older than `maxAgeMs`. Returns how many were removed. */
export async function cleanupExports(maxAgeMs = 24 * 60 * 60 * 1000, now = Date.now(), dir = OUTPUT_DIR): Promise<number> {
  let removed = 0;
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return 0; // folder doesn't exist yet
  }
  for (const name of names) {
    if (!EXPORT_NAME.test(name)) continue;
    const file = path.join(dir, name);
    try {
      if (now - (await stat(file)).mtimeMs > maxAgeMs) {
        await unlink(file);
        removed++;
      }
    } catch {
      /* already gone or locked: skip */
    }
  }
  return removed;
}
