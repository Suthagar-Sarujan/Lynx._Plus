// Usage:
//   npx tsx scripts/rerender-recent-drafts.ts            # dry run: only counts
//   npx tsx scripts/rerender-recent-drafts.ts --apply    # switches Breaking off and re-renders
//   add --hours 48 to change the window (default 24)
//
// For recent, still-unpublished template drafts that were saved with "Breaking" on, switch it off
// and re-render the 4K image so the image says "NEWS". Published and scheduled posts are never touched.
// Each old image file is deleted after its replacement is saved (if nothing else uses it), so disk
// use stays flat. Stops if free disk space drops below MIN_FREE_MB.
import { statfsSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import { container } from '../src/infrastructure/container';
import { prisma } from '../src/infrastructure/db/prisma';

const MIN_FREE_MB = 40;
const apply = process.argv.includes('--apply');
const hoursArg = process.argv.indexOf('--hours');
const hours = hoursArg > -1 ? Number(process.argv[hoursArg + 1]) : 24;

const freeMb = () => {
  const s = statfsSync(process.cwd().slice(0, 3));
  return Math.round((s.bavail * s.bsize) / 1048576);
};

/** public/generated/post-xxx.png for a URL we generated; null for anything else. */
function localFile(url: string | null): string | null {
  if (!url) return null;
  const m = /\/generated\/(post-[0-9a-f-]+\.(?:png|jpg))$/i.exec(url.split('?')[0]!);
  return m ? path.join(process.cwd(), 'public', 'generated', m[1]!) : null;
}

(async () => {
  const where = {
    status: 'DRAFT' as const,
    mode: 'TEMPLATE' as const,
    showBreaking: true,
    createdAt: { gte: new Date(Date.now() - hours * 3_600_000) }
  };
  const posts = await prisma.post.findMany({ where, select: { id: true, renderedImageUrl: true }, orderBy: { createdAt: 'desc' } });
  console.log(`${posts.length} draft(s) from the last ${hours} h have Breaking on. Free disk: ${freeMb()} MB.`);
  if (!apply) {
    console.log('Dry run. Re-run with --apply to switch Breaking off and re-render.');
    return;
  }

  let done = 0;
  let failed = 0;
  for (const p of posts) {
    if (freeMb() < MIN_FREE_MB) {
      console.error(`Stopping: only ${freeMb()} MB of disk space left (minimum ${MIN_FREE_MB} MB).`);
      break;
    }
    try {
      // Turning Breaking off invalidates the image; UpdatePost re-renders it at 4K.
      const updated = await container.updatePost.execute(p.id, { showBreaking: false });
      const oldFile = localFile(p.renderedImageUrl);
      const newUrl = updated.renderedImageUrl;
      if (oldFile && newUrl && newUrl !== p.renderedImageUrl && existsSync(oldFile)) {
        const stillUsed = await prisma.post.count({ where: { renderedImageUrl: p.renderedImageUrl, NOT: { id: p.id } } });
        if (!stillUsed) unlinkSync(oldFile);
      }
      done++;
      if (done % 10 === 0) console.log(`  ${done}/${posts.length} done, ${freeMb()} MB free`);
    } catch (err) {
      failed++;
      console.error(`  ${p.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  // Second pass: drafts whose image was cleared (e.g. by an interrupted earlier run) but never re-drawn.
  const missing = await prisma.post.findMany({
    where: { status: 'DRAFT', mode: 'TEMPLATE', renderedImageUrl: null, photoUrl: { not: null }, createdAt: { gte: new Date(Date.now() - hours * 3_600_000) } },
    select: { id: true }
  });
  console.log(`${missing.length} draft(s) have a photo but no rendered image.`);
  for (const p of missing) {
    if (freeMb() < MIN_FREE_MB) {
      console.error(`Stopping: only ${freeMb()} MB of disk space left (minimum ${MIN_FREE_MB} MB).`);
      break;
    }
    try {
      await container.renderPostImage.execute(p.id);
      done++;
    } catch (err) {
      failed++;
      console.error(`  ${p.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`Done: ${done} re-rendered, ${failed} failed. Free disk: ${freeMb()} MB.`);
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 100));
