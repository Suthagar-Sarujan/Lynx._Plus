import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { loadImageBuffer } from '@/infrastructure/image/loadImageBuffer';
import { publicBaseUrl } from '@/infrastructure/config/publicUrl';

// Instagram's Graph API accepts JPEG only, with an aspect ratio between 4:5 and 1.91:1,
// and it downscales anything wider than 1440px, so that is the best Instagram can show.
const MIN_RATIO = 4 / 5;
const MAX_RATIO = 1.91;
const IG_MAX_WIDTH = 1440;
// Facebook keeps full resolution; photos must stay under 10 MB, so keep a safety margin.
const FB_MAX_BYTES = 9 * 1024 * 1024;
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'generated');

const publicBase = publicBaseUrl;

async function save(prefix: string, jpeg: Buffer): Promise<string> {
  const name = `${prefix}-${randomUUID()}.jpg`;
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(path.join(OUTPUT_DIR, name), jpeg);
  return `${publicBase()}/generated/${name}`;
}

/**
 * Makes an Instagram-valid copy of the post image: JPEG, at most 1440px wide, and padded
 * (never cropped, so no headline text is lost) up to the nearest allowed aspect ratio.
 * Returns a public URL Meta can fetch.
 */
export async function prepareForInstagram(imageUrl: string): Promise<string> {
  const flat = await sharp(await loadImageBuffer(imageUrl)).rotate().flatten({ background: '#ffffff' }).toBuffer();
  const { width = 0, height = 0 } = await sharp(flat).metadata();
  if (!width || !height) throw new Error('The post image could not be read.');

  let img = sharp(flat);
  const ratio = width / height;
  if (ratio < MIN_RATIO) {
    const pad = Math.ceil(height * MIN_RATIO) - width;
    img = sharp(await img.extend({ left: Math.floor(pad / 2), right: Math.ceil(pad / 2), extendWith: 'copy' }).toBuffer());
  } else if (ratio > MAX_RATIO) {
    const pad = Math.ceil(width / MAX_RATIO) - height;
    img = sharp(await img.extend({ top: Math.floor(pad / 2), bottom: Math.ceil(pad / 2), extendWith: 'copy' }).toBuffer());
  }

  const out = await img
    .resize({ width: IG_MAX_WIDTH, withoutEnlargement: true, kernel: 'lanczos3' })
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer();
  return save('ig', out);
}

/**
 * Full-resolution JPEG for Facebook. A 4K PNG can exceed Facebook's 10 MB photo limit, so the
 * JPEG quality steps down only as far as needed to fit; the pixel size is never reduced.
 */
export async function prepareForFacebook(imageUrl: string): Promise<string> {
  const flat = await sharp(await loadImageBuffer(imageUrl)).rotate().flatten({ background: '#ffffff' }).toBuffer();
  let out = flat;
  for (const quality of [95, 90, 85, 80]) {
    out = await sharp(flat).jpeg({ quality, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
    if (out.length <= FB_MAX_BYTES) break;
  }
  if (out.length > FB_MAX_BYTES) throw new Error('The post image is too large for Facebook even at reduced quality.');
  return save('fb', out);
}
