import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, access, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// An isolated catalog and synthetic blobs: never opens the user's data directory.
test('catalog deletion reclaims only unreferenced media and preserves durable cleanup retries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'filmalbum-test-'));
  const port = 18100 + Math.floor(Math.random() * 500);
  const server = spawn(process.execPath, ['src/server/server.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: String(port), FILMALBUM_DATA_DIR: dir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise((resolve, reject) => {
      server.stdout.once('data', resolve);
      server.once('error', reject);
      server.once('exit', (code) => reject(new Error(`server exit ${code}`)));
    });
    const api = async (path, method = 'GET', body) => {
      if (path === 'state' && method === 'PUT' && body.revision === undefined) {
        const current = await fetch(`http://127.0.0.1:${port}/api/state`);
        if (current.ok) body.revision = (await current.json()).revision || 0;
      }
      return fetch(`http://127.0.0.1:${port}/api/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    };
    const exists = async (id) =>
      access(join(dir, 'media', id)).then(
        () => true,
        () => false,
      );
    for (const id of ['shared', 'exclusive', 'retry'])
      assert.equal((await api(`media/${id}`, 'PUT', { sample: id })).status, 200);
    const a = {
      id: 'roll-a',
      frames: [{ id: 'shared' }, { id: 'exclusive' }, { id: 'already-missing' }],
    };
    const b = { id: 'roll-b', frames: [{ id: 'shared' }] };
    assert.equal((await api('state', 'PUT', { rolls: [a, b], settings: {} })).status, 200);
    assert.equal((await api('media/shared', 'DELETE')).status, 409);
    assert.equal((await api('state', 'PUT', { revision: 0, rolls: [], settings: {} })).status, 409);
    assert.equal(await exists('shared.bin'), true);
    assert.equal(await exists('exclusive.bin'), true);
    assert.equal((await api('state', 'PUT', { rolls: 'invalid', settings: {} })).status, 400);
    assert.equal(
      (await api('state', 'PUT', { rolls: [{ id: '../escape', frames: [] }], settings: {} }))
        .status,
      400,
    );
    assert.equal((await api('state', 'PUT', { rolls: [a, a], settings: {} })).status, 400);
    assert.equal((await api('state', 'PUT', { rolls: [b], settings: {} })).status, 200);
    assert.equal(await exists('exclusive.bin'), false);
    assert.equal(await exists('exclusive.json'), false);
    assert.equal(await exists('shared.bin'), true);
    assert.equal(await exists('shared.json'), true);
    // A previous cleanup interrupted by a crash is retried on the next successful save.
    const catalog = JSON.parse(await readFile(join(dir, 'library.json'), 'utf8'));
    catalog.pendingCleanup = ['retry', 'shared'];
    await writeFile(join(dir, 'library.json'), JSON.stringify(catalog));
    await api('state', 'PUT', { rolls: [b], settings: {} });
    assert.equal(await exists('retry.bin'), false);
    assert.equal(await exists('shared.bin'), true);
    // Force a real unlink failure without platform-specific file permissions.
    await mkdir(join(dir, 'media', 'blocked.bin'));
    const current = JSON.parse(await readFile(join(dir, 'library.json'), 'utf8'));
    current.pendingCleanup = ['blocked'];
    await writeFile(join(dir, 'library.json'), JSON.stringify(current));
    assert.equal(
      (await (await api('state', 'PUT', { rolls: [b], settings: {} })).json()).cleanupPending,
      1,
    );
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'library.json'), 'utf8')).pendingCleanup, [
      'blocked',
    ]);
    await rm(join(dir, 'media', 'blocked.bin'), { recursive: true });
    await api('state', 'PUT', { rolls: [], settings: {} });
    assert.equal(await exists('shared.bin'), false);
    assert.deepEqual(
      JSON.parse(await readFile(join(dir, 'library.json'), 'utf8')).pendingCleanup,
      [],
    );
    // Corruption must never be mistaken for an empty library and overwritten.
    await writeFile(join(dir, 'library.json'), '{broken');
    assert.equal((await api('state', 'PUT', { rolls: [], settings: {} })).status, 400);
    assert.equal(await readFile(join(dir, 'library.json'), 'utf8'), '{broken');
  } finally {
    server.kill();
    await new Promise((resolve) =>
      server.exitCode !== null ? resolve() : server.once('exit', resolve),
    );
    await rm(dir, { recursive: true, force: true });
  }
});
