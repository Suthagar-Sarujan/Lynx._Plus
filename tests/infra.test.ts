import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, utimes, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebhookNotifier } from '@/infrastructure/notify/WebhookNotifier';
import { cleanupExports } from '@/infrastructure/social/cleanupExports';

test('alerts are delivered to the webhook as JSON', async () => {
  const received: any[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push(JSON.parse(body));
      res.end('ok');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  try {
    await new WebhookNotifier(`http://127.0.0.1:${port}/hook`).notify('error', 'Could not publish', 'Post 42\nToken expired');
    assert.equal(received.length, 1);
    assert.match(received[0].text, /Could not publish/);
    assert.match(received[0].text, /Token expired/);
    assert.equal(received[0].content, received[0].text);
  } finally {
    server.close();
  }
});

test('an unreachable webhook never throws', async () => {
  await new WebhookNotifier('http://127.0.0.1:9/nope').notify('warn', 'x');
});

test('cleanup removes only old temporary exports', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lynx-clean-'));
  const id = '123e4567-e89b-12d3-a456-426614174000';
  const old = new Date(Date.now() - 3 * 24 * 3_600_000);
  try {
    for (const name of [`ig-${id}.jpg`, `fb-${id}.jpg`, `post-${id}.png`, 'logo.png']) await writeFile(path.join(dir, name), 'x');
    await utimes(path.join(dir, `ig-${id}.jpg`), old, old);
    await utimes(path.join(dir, `post-${id}.png`), old, old);
    const removed = await cleanupExports(24 * 3_600_000, Date.now(), dir);
    assert.equal(removed, 1);
    assert.deepEqual((await readdir(dir)).sort(), [`fb-${id}.jpg`, 'logo.png', `post-${id}.png`].sort());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
