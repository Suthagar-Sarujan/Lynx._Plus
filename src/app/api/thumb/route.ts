import { NextRequest, NextResponse } from 'next/server';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';

const SIZE = 112; // shown at 56px; 2x for sharp screens
const CACHE_DIR = path.join(process.cwd(), '.thumbs');
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const SOURCE = /^(generated|uploads)\/[\w.-]+\.(png|jpe?g|webp)$/i;

// Cut-down copies of the 1500x2000 renders, so a page of thumbnails is kilobytes, not tens of megabytes.
// Decoding is CPU-bound in this one process, so only a couple run at a time and repeat requests share one job.
const jobs = new Map<string, Promise<Buffer>>();
let running = 0;
const waiting: (() => void)[] = [];

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

async function makeThumb(rel: string, cacheFile: string): Promise<Buffer> {
  try {
    return await readFile(cacheFile);
  } catch {
    /* not cached yet */
  }
  const img = await loadImage(path.join(PUBLIC_DIR, rel));
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  const scale = Math.max(SIZE / img.width, SIZE / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  // Cover-fit, anchored to the top: story images keep their headline area in the thumbnail.
  ctx.drawImage(img, (SIZE - w) / 2, 0, w, h);
  const jpg = canvas.toBuffer('image/jpeg', 80);
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cacheFile, jpg).catch(() => undefined);
  return jpg;
}

export async function GET(req: NextRequest) {
  const rel = new URL(req.url).searchParams.get('f') ?? '';
  if (!SOURCE.test(rel)) return NextResponse.json({ error: 'Bad image path' }, { status: 400 });

  const cacheFile = path.join(CACHE_DIR, rel.replace(/\//g, '__') + '.jpg');
  let job = jobs.get(cacheFile);
  if (!job) {
    job = slot(() => makeThumb(rel, cacheFile)).finally(() => jobs.delete(cacheFile));
    jobs.set(cacheFile, job);
  }
  try {
    const jpg = await job;
    return new NextResponse(new Uint8Array(jpg), {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' }
    });
  } catch {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }
}
