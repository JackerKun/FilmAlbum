import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile, readFile, stat, rename, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (b) => createHash('sha256').update(b).digest('hex');
test(
  'Studio HTTP import resume, integrity, external volumes, incremental backup and verified new-folder restore',
  { timeout: 120000, skip: process.platform !== 'darwin' },
  async (t) => {
    const base = await mkdtemp(join(tmpdir(), 'filmalbum-studio-http-')),
      root = join(base, 'library'),
      external = join(base, 'external');
    await mkdir(root);
    await mkdir(external);
    // Reuse the compiled helper if a development runtime exists; production compiles automatically.
    const runtime = join(root, 'runtime');
    try {
      await mkdir(runtime);
      await copyFile(
        new URL('../tests/fixtures/runtime/filmalbum-native', import.meta.url),
        join(runtime, 'filmalbum-native'),
      );
    } catch {}
    const child = spawn(process.execPath, ['src/server/server.mjs'], {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, PORT: '0', FILMALBUM_DATA_DIR: root },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    t.after(async () => {
      child.kill();
      if (child.exitCode === null) await new Promise((r) => child.once('exit', r));
      await rm(base, { recursive: true, force: true });
    });
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(stderr)), 10000);
      child.stdout.on('data', (d) => {
        const m = String(d).match(/http:\/\/127.0.0.1:\d+/);
        if (m) {
          clearTimeout(timer);
          resolve(m[0]);
        }
      });
      child.once('exit', () => {
        clearTimeout(timer);
        reject(new Error(stderr));
      });
    });
    const api = async (path, body, method = body === undefined ? 'GET' : 'POST') => {
      const r = await fetch(url + '/api/v2' + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const value = await r.json();
      if (!r.ok) throw Object.assign(new Error(value.error), { status: r.status });
      return value;
    };
    const task = async (kind, payload = {}) => {
      const job = await api('/jobs', { kind, ...payload });
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        const state = await api('/jobs/' + job.id);
        if (['completed', 'failed', 'paused', 'cancelled'].includes(state.state)) {
          if (state.state !== 'completed') throw new Error(kind + ': ' + JSON.stringify(state));
          return state.result;
        }
        await sleep(50);
      }
      throw new Error('Job timed out: ' + kind);
    };
    assert.equal((await fetch(url + '/sha256.mjs')).status, 200);
    assert.equal((await fetch(url + '/studio-review.mjs')).status, 200);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5L0AAAAASUVORK5CYII=',
      'base64',
    );
    const batch = await api('/imports', {
      files: [{ path: 'Tokyo/frame-01.png', size: png.length, mtime: 1 }],
      metadata: { camera: 'Leica M6', date: '2024-05-01' },
      dedup: 'skip',
    });
    const key = batch.files[0].key;
    let r = await fetch(url + `/api/v2/imports/${batch.id}/${key}?offset=0`, {
      method: 'PUT',
      body: png.subarray(0, 20),
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).offset, 20);
    await api('/jobs/' + batch.id + '/pause', {});
    assert.equal((await api('/jobs/' + batch.id)).state, 'paused');
    await api('/jobs/' + batch.id + '/resume', {});
    r = await fetch(url + `/api/v2/imports/${batch.id}/${key}?offset=20`, {
      method: 'PUT',
      headers: { 'X-File-SHA256': sha(png) },
      body: png.subarray(20),
    });
    assert.equal(r.status, 200, await r.clone().text());
    assert.equal((await r.json()).state, 'done');
    assert.equal((await api('/jobs/' + batch.id)).state, 'completed');
    const photo = (await api('/photos')).items[0];
    assert.equal(photo.frameNo, '01');
    assert.equal(photo.camera, 'Leica M6');
    assert.equal((await api('/stats')).rolls, 1);
    await writeFile(join(root, 'media', 'unreferenced.bin'), 'keep orphan');
    await task('index', { all: true });
    assert.equal((await api('/health')).orphans.count, 1);
    assert.equal((await task('integrity')).integrity, 'ok');
    const snapshot = await task('backup');
    assert.equal(snapshot.complete, true);
    const second = await task('backup');
    assert.equal(second.newBytes, 0);
    const verified = await task('verify', { snapshotId: snapshot.snapshotId });
    assert.equal(verified.verified, true);
    const destination = join(base, 'restored');
    const restored = await task('restore', { snapshotId: snapshot.snapshotId, destination });
    assert.equal(restored.photos, 1);
    assert.equal(
      await sha(await readFile(join(destination, 'media', photo.mediaId + '.bin'))),
      sha(png),
    );
    assert.ok((await stat(join(root, 'catalog.sqlite'))).size > 0);
    await api('/switch', { root: destination });
    assert.equal((await api('/photos')).total, 1);
    await api('/switch', { root });
    await writeFile(join(external, 'frame-02.png'), png);
    const storage = await api('/storages', { root: external, name: '测试盘' });
    assert.equal(
      (await task('external-import', { storageId: storage.id, offlinePreviews: true })).added,
      1,
    );
    const externalPhoto = (await api('/photos?storageId=' + storage.id)).items[0];
    await rename(external, external + '-offline');
    await task('index', { all: true });
    assert.equal((await api('/photos?storageId=' + storage.id)).items[0].availability, 'offline');
    assert.equal(
      (await fetch(url + '/api/v2/preview/' + externalPhoto.mediaId + '?edge=640')).status,
      200,
    );
    await api('/storages/' + storage.id, { root: external + '-offline' }, 'PATCH');
    await task('index', { all: true });
    assert.equal((await api('/photos?storageId=' + storage.id)).items[0].availability, 'ready');
    const pdf = await task('pdf', { mode: 'labels', selection: { query: {} } });
    const content = await fetch(url + '/api/v2/exports/' + pdf.file);
    assert.equal(content.status, 200);
    assert.ok(
      Buffer.from(await content.arrayBuffer())
        .subarray(0, 4)
        .equals(Buffer.from('%PDF')),
    );
    // Changed source bytes remain flagged and cannot silently become a verified original.
    await writeFile(join(root, 'media', photo.mediaId + '.bin'), 'changed source');
    await task('index', { all: true });
    await task('index', { all: true });
    assert.equal(
      (await api('/photos?filter=' + encodeURIComponent(JSON.stringify({ id: photo.id })))).items[0]
        .availability,
      'changed',
    );
    const partial = await task('backup');
    assert.equal(partial.complete, false);
    // Corrupt object must make verification fail before restoration starts.
    const manifest = JSON.parse(
      await readFile(join(root, 'backups', 'snapshots', snapshot.snapshotId, 'manifest.json')),
    );
    await writeFile(join(root, 'backups', 'objects', manifest.files[0].hash), 'tamper');
    const job = await api('/jobs', { kind: 'verify', snapshotId: snapshot.snapshotId });
    let state;
    for (let i = 0; i < 400; i++) {
      state = await api('/jobs/' + job.id);
      if (state.state === 'failed') break;
      await sleep(25);
    }
    assert.equal(state.state, 'failed');
    assert.match(state.error, /校验失败/);
  },
);
