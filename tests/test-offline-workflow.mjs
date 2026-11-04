import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, rm, rename, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { Catalog } from '../src/server/catalog.mjs';
import { emptyPhotoState } from '../src/client/offline-ui.mjs';
import { renderTaskRows } from '../src/client/task-center.mjs';
import { attachmentFileName } from '../src/shared/file-names.mjs';
const root = new URL('../', import.meta.url),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('offline and filtered empty states explain the scope instead of offering a misleading import', () => {
  const state = emptyPhotoState({ query: { offline: true }, photos: 17, offline: 0 });
  assert.match(state.title, /没有离线/);
  assert.match(state.message, /原片都在线/);
  assert.ok(!state.actions.some((a) => a.action === 'import'));
  assert.ok(emptyPhotoState({ photos: 0 }).actions.some((a) => a.action === 'import'));
  assert.ok(
    !emptyPhotoState({ query: { trash: true }, photos: 17 }).actions.some(
      (a) => a.action === 'import',
    ),
  );
});
test('preview task UI distinguishes failed caches from backups and generated PDFs from saved PDFs', () => {
  const jobs = [
    {
      id: 'job',
      label: '预览',
      kind: 'previews',
      state: 'completed',
      result: {
        ready: 1,
        failed: 1,
        complete: false,
        failures: [{ id: 'missing', message: 'offline' }],
      },
    },
  ];
  const html = renderTaskRows(jobs, { E: String });
  assert.match(html, /失败 1/);
  assert.match(html, /重试生成预览/);
  assert.doesNotMatch(html, /快照缺少/);
  const pdf = renderTaskRows(
    [
      {
        id: 'pdf',
        label: 'Export',
        kind: 'book-pdf',
        state: 'completed',
        result: { file: 'a.pdf' },
      },
    ],
    { E: String },
  );
  assert.match(pdf, /PDF 已生成/);
  assert.match(pdf, /保存 PDF/);
});
test(
  'offline caches survive disconnected storage, preview jobs report real failures, and exports support HEAD and named attachments',
  { timeout: 60000 },
  async (t) => {
    const base = await mkdtemp(join(tmpdir(), 'filmalbum-offline-')),
      library = join(base, 'library'),
      external = join(base, 'drive');
    await mkdir(external);
    await mkdir(library);
    t.after(() => rm(base, { recursive: true, force: true }));
    await copyFile(
      new URL('../assets/icons/icon-256.png', import.meta.url),
      join(external, '原片.png'),
    );
    const catalog = new Catalog(library),
      storage = catalog.registerStorage({ name: 'Test drive', root: external }),
      roll = catalog.createRoll({ name: 'Test roll' });
    const media = catalog.addMedia({ storage_id: storage.id, path: '原片.png', mime: 'image/png' });
    catalog.addPhoto(roll.id, media, { name: '测试原片.png' });
    const missing = catalog.addMedia({
      storage_id: storage.id,
      path: 'missing.png',
      mime: 'image/png',
    });
    catalog.addPhoto(roll.id, missing, { name: 'Missing' });
    catalog.close();
    const child = spawn(process.execPath, ['src/server/server.mjs'], {
      cwd: root,
      env: { ...process.env, PORT: '0', FILMALBUM_DATA_DIR: library, FILMALBUM_ENGINE: 'portable' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let errors = '';
    child.stderr.on('data', (d) => (errors += d));
    t.after(async () => {
      child.kill();
      if (child.exitCode === null) await new Promise((r) => child.once('exit', r));
    });
    const origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error(errors || 'server timeout')), 10000);
      child.stdout.on('data', (d) => {
        const match = /http:\/\/127.0.0.1:\d+/.exec(String(d));
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
      child.once('exit', () => {
        clearTimeout(timer);
        reject(Error(errors));
      });
    });
    const api = async (path, data) => {
      const response = await fetch(origin + '/api/v2' + path, {
        method: data ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: data ? JSON.stringify(data) : undefined,
      });
      const result = await response.json();
      assert.ok(response.ok, result.error);
      return result;
    };
    const task = async (kind, data = {}) => {
      const row = await api('/jobs', { kind, ...data });
      for (let n = 0; n < 400; n++) {
        const job = await api('/jobs/' + row.id);
        if (job.state === 'completed') return job;
        if (job.state === 'failed') throw Error(job.error);
        await sleep(50);
      }
      throw Error('job timeout');
    };
    const previews = await task('previews', { selection: { query: {} } });
    assert.equal(previews.result.ready, 1);
    assert.equal(previews.result.failed, 1);
    assert.equal(previews.result.complete, false);
    for (const edge of [640, 1600])
      assert.ok((await stat(join(library, 'previews', media + '-' + edge + '.jpg'))).size > 0);
    const health = await api('/health');
    assert.equal(health.previews.ready, 1);
    assert.equal(health.previews.large, 1);
    let response = await fetch(origin + '/api/v2/media/' + media + '?download=1', {
      method: 'HEAD',
    });
    assert.equal(response.status, 200);
    assert.equal(
      attachmentFileName(response.headers.get('content-disposition'), 'fallback'),
      '测试原片.png',
    );
    const pdf = (await task('pdf', { mode: 'labels', selection: { query: {} }, title: '片袋标签' }))
      .result;
    response = await fetch(origin + '/api/v2/exports/' + pdf.file, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.ok(Number(response.headers.get('content-length')) > 0);
    assert.equal(
      attachmentFileName(response.headers.get('content-disposition'), 'fallback'),
      '片袋标签.pdf',
    );
    await rename(external, external + '-removed');
    await task('index', { all: true });
    const offline = await api(
      '/photos?filter=' + encodeURIComponent(JSON.stringify({ offline: true })),
    );
    assert.equal(offline.total, 2);
    response = await fetch(origin + '/api/v2/preview/' + media + '?edge=320');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-filmalbum-preview'), 'offline-cache');
    assert.equal(
      (await fetch(origin + '/api/v2/media/' + media + '?download=1', { method: 'HEAD' })).status,
      404,
    );
    // Removing the small cache must still allow a grid preview from the larger cache.
    await rm(join(library, 'previews', media + '-640.jpg'));
    assert.equal((await fetch(origin + '/api/v2/preview/' + media + '?edge=640')).status, 200);
  },
);
