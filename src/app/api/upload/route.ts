import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { publicBaseUrl } from '@/infrastructure/config/publicUrl';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

/**
 * Minimal local-disk upload endpoint. Swap this for an S3-compatible,
 * open-source object store (MinIO) adapter if you need multi-instance
 * deployment — the API shape (POST multipart "file" -> { url }) stays
 * the same either way.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const ext = path.extname(file.name) || '.png';
  const filename = `${randomUUID()}${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  const base = publicBaseUrl();
  return NextResponse.json({ url: `${base}/uploads/${filename}` });
}
