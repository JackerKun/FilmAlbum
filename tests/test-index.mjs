import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rename, rm, access, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
const exists = (path) =>
  access(path).then(
    () => true,
    () => false,
  );
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
async function start(dir, port = 0) {
  const child = spawn(process.execPath, ['src/server/server.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: String(port), FILMALBUM_DATA_DIR: dir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (data) => (stderr += data));
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(stderr || 'Server start timeout'));
    }, 8000);
    child.stdout.on('data', (data) => {
      const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[0]);
      }
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exit ${code}: ${stderr}`));
    });
  });
  return {
    child,
    url,
    request: (path, options) => fetch(`${url}/api/${path}`, options),
    async stop() {
      child.kill();
      await new Promise((resolve) =>
        child.exitCode !== null ? resolve() : child.once('exit', resolve),
      );
    },
  };
}
async function fixture(frames, files = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'filmalbum-index-'));
  await mkdir(join(dir, 'media'));
  const catalog = JSON.stringify(
    {
      version: 1,
      revision: 7,
      rolls: [
        {
          id: 'r',
          name: 'Test roll',
          frames: frames.map((id) => ({ id, name: `${id}.png`, type: 'image', rating: 4 })),
        },
      ],
      settings: {
        collections: [{ id: 'c', name: 'Favorite', refs: frames.map((id) => `r:${id}`) }],
      },
    },
    null,
    2,
  );
  await writeFile(join(dir, 'library.json'), catalog);
  for (const [id, body] of Object.entries(files)) {
    await writeFile(join(dir, 'media', `${id}.bin`), body);
    await writeFile(
      join(dir, 'media', `${id}.json`),
      JSON.stringify({ contentType: 'image/png', size: body.length }),
    );
  }
  return { dir, catalog };
}
async function waitReport(server, predicate) {
  const end = Date.now() + 10000;
  let last;
  while (Date.now() < end) {
    last = await (await server.request('index')).json();
    if (last.available && !last.status.running && last.status.phase === 'idle' && predicate(last))
      return last;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Index timed out: ${JSON.stringify(last)}`);
}
function png(width, height, color) {
  const crc = (buffer) => {
    let value = -1;
    for (const byte of buffer) {
      value ^= byte;
      for (let i = 0; i < 8; i++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
    return (value ^ -1) >>> 0;
  };
  const chunk = (type, body) => {
    const name = Buffer.from(type),
      size = Buffer.alloc(4),
      checksum = Buffer.alloc(4);
    size.writeUInt32BE(body.length);
    checksum.writeUInt32BE(crc(Buffer.concat([name, body])));
    return Buffer.concat([size, name, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (let c = 0; c < 3; c++) pixels[y * (width * 3 + 1) + x * 3 + 1 + c] = color[c];
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test(
  'SQLite legacy indexing preserves JSON and originals, detects duplicates/missing/orphans and protects static files',
  { timeout: 20000 },
  async () => {
    const original = Buffer.from('same-original'),
      { dir, catalog } = await fixture(['a', 'b', 'missing'], {
        a: original,
        b: original,
        orphan: Buffer.from('unreferenced'),
      });
    const server = await start(dir);
    try {
      const report = await waitReport(server, (r) => r.counts.frames === 3);
      assert.equal(report.revision, 7);
      assert.equal(report.counts.duplicateGroups, 1);
      assert.equal(report.duplicates[0].hash, sha(original));
      assert.equal(report.counts.missing, 1);
      assert.equal(report.missing[0].id, 'missing');
      assert.equal(report.counts.orphans, 1);
      assert.equal(report.counts.duplicateBytes, original.length);
      assert.equal(await readFile(join(dir, 'library.json'), 'utf8'), catalog);
      assert.equal(sha(await readFile(join(dir, 'media/a.bin'))), sha(original));
      const db = new DatabaseSync(join(dir, 'index.sqlite'), { readOnly: true });
      try {
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM frames').get().n, 3);
        assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
      } finally {
        db.close();
      }
      const repairable = new DatabaseSync(join(dir, 'index.sqlite'));
      try {
        repairable.exec('DELETE FROM frames');
      } finally {
        repairable.close();
      }
      assert.equal((await server.request('index/scan?force=1', { method: 'POST' })).status, 202);
      await waitReport(server, (r) => r.counts.frames === 3);
      for (const path of [
        '/data/library.json',
        '/data/index.sqlite',
        '/.git/config',
        '/server.mjs',
      ])
        assert.equal((await fetch(server.url + path)).status, 403);
      assert.equal((await fetch(server.url + '/library-health.mjs')).status, 200);
    } finally {
      await server.stop();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  'watcher detects moved media, preserves hash, refuses wrong files and safely copies a verified candidate',
  { timeout: 20000 },
  async () => {
    const original = Buffer.from('original-photo-content'),
      { dir, catalog } = await fixture(['a'], { a: original });
    const server = await start(dir);
    try {
      await waitReport(server, (r) => r.counts.files === 1);
      await rename(join(dir, 'media/a.bin'), join(dir, 'media/moved.bin'));
      const report = await waitReport(
        server,
        (r) => r.counts.missing === 1 && r.counts.orphans === 1,
      );
      assert.equal(report.status.watching, true);
      assert.equal(report.missing[0].expectedHash, sha(original));
      assert.equal(report.missing[0].candidates[0].id, 'moved');
      assert.equal(
        (
          await server.request('repair/a', {
            method: 'PUT',
            headers: { 'Content-Type': 'image/png' },
            body: 'wrong-image',
          })
        ).status,
        409,
      );
      assert.equal(await exists(join(dir, 'media/a.bin')), false);
      const restored = await server.request('repair/a', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: 'moved' }),
      });
      assert.equal(restored.status, 200);
      assert.equal((await restored.json()).verified, true);
      assert.equal(sha(await readFile(join(dir, 'media/a.bin'))), sha(original));
      assert.equal(await exists(join(dir, 'media/moved.bin')), true);
      await waitReport(server, (r) => r.counts.missing === 0);
      assert.equal(
        (await server.request('repair/a', { method: 'PUT', body: original })).status,
        409,
      );
      assert.equal(await readFile(join(dir, 'library.json'), 'utf8'), catalog);
    } finally {
      await server.stop();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  'manual repair without an old hash requires a referenced missing target and preserves metadata',
  { timeout: 20000 },
  async () => {
    const { dir, catalog } = await fixture(['missing']);
    const server = await start(dir);
    try {
      await waitReport(server, (r) => r.counts.missing === 1);
      assert.equal(
        (await server.request('repair/not-in-library', { method: 'PUT', body: 'data' })).status,
        404,
      );
      assert.equal(
        (
          await server.request('repair/missing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceId: 'not-hashed' }),
          })
        ).status,
        400,
      );
      assert.equal(
        (await server.request('repair/missing', { method: 'PUT', body: '' })).status,
        400,
      );
      const body = png(40, 20, [220, 150, 60]),
        response = await server.request('repair/missing', {
          method: 'PUT',
          headers: { 'Content-Type': 'image/png' },
          body,
        });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).verified, false);
      await waitReport(server, (r) => r.counts.missing === 0 && r.counts.files === 1);
      assert.equal(await readFile(join(dir, 'library.json'), 'utf8'), catalog);
      assert.equal(sha(await readFile(join(dir, 'media/missing.bin'))), sha(body));
    } finally {
      await server.stop();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  'native thumbnails preserve originals, resize, reuse/invalidate cache, fall back and clean up with media',
  { timeout: 25000, skip: process.platform !== 'darwin' },
  async () => {
    const original = png(1000, 500, [220, 60, 50]),
      { dir } = await fixture(['photo'], {
        photo: original,
        unsupported: Buffer.from('not an image'),
      });
    const server = await start(dir);
    try {
      const first = await server.request('thumbnail/photo');
      assert.equal(first.status, 200);
      assert.match(first.headers.get('content-type'), /image\/jpeg/);
      const bytes = Buffer.from(await first.arrayBuffer());
      assert.equal(bytes[0], 255);
      assert.equal(bytes[1], 216);
      const cache = join(dir, 'thumbnails/photo.jpg'),
        marker = join(dir, 'thumbnails/photo.json'),
        modified = (await stat(cache)).mtimeMs;
      const result = await promisify(execFile)('/usr/bin/sips', [
        '-g',
        'pixelWidth',
        '-g',
        'pixelHeight',
        cache,
      ]);
      assert.match(result.stdout, /pixelWidth: 640/);
      assert.match(result.stdout, /pixelHeight: 320/);
      await (await server.request('thumbnail/photo')).arrayBuffer();
      assert.equal((await stat(cache)).mtimeMs, modified);
      assert.equal(sha(await readFile(join(dir, 'media/photo.bin'))), sha(original));
      const fallback = await server.request('thumbnail/unsupported', { redirect: 'manual' });
      assert.equal(fallback.status, 302);
      assert.equal(fallback.headers.get('location'), '/api/media/unsupported');
      const changed = png(1000, 500, [30, 180, 80]);
      assert.equal(
        (
          await server.request('media/photo', {
            method: 'PUT',
            headers: { 'Content-Type': 'image/png' },
            body: changed,
          })
        ).status,
        200,
      );
      assert.notEqual(
        sha(Buffer.from(await (await server.request('thumbnail/photo')).arrayBuffer())),
        sha(bytes),
      );
      const state = await (await server.request('state')).json();
      assert.equal(
        (
          await server.request('state', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...state, rolls: [] }),
          })
        ).status,
        200,
      );
      assert.equal(await exists(cache), false);
      assert.equal(await exists(marker), false);
      assert.equal(await exists(join(dir, 'media/photo.bin')), false);
    } finally {
      await server.stop();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  'index hashes survive a restart and port conflicts fail with a useful message without creating another index',
  { timeout: 20000 },
  async () => {
    const original = Buffer.from('persistent-original'),
      { dir } = await fixture(['a'], { a: original });
    let server = await start(dir);
    try {
      await waitReport(server, (r) => r.counts.files === 1);
      await server.stop();
      await rm(join(dir, 'media/a.bin'));
      server = await start(dir);
      assert.equal(
        (await waitReport(server, (r) => r.counts.missing === 1)).missing[0].expectedHash,
        sha(original),
      );
      const other = await mkdtemp(join(tmpdir(), 'filmalbum-port-'));
      try {
        const child = spawn(process.execPath, ['src/server/server.mjs'], {
          cwd: new URL('../', import.meta.url),
          env: { ...process.env, PORT: new URL(server.url).port, FILMALBUM_DATA_DIR: other },
          stdio: ['ignore', 'ignore', 'pipe'],
        });
        let output = '';
        child.stderr.on('data', (data) => (output += data));
        const exit = await new Promise((resolve) => child.once('exit', resolve));
        assert.equal(exit, 1);
        assert.match(output, /端口.*已被占用/);
        assert.doesNotMatch(output, /Unhandled/);
        assert.equal(await exists(join(other, 'index.sqlite')), false);
      } finally {
        await rm(other, { recursive: true, force: true });
      }
    } finally {
      await server.stop();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  'original media is streamed with correct full, partial, suffix, HEAD and unsatisfiable-range responses',
  { timeout: 20000 },
  async () => {
    const original = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz'),
      { dir } = await fixture(['a'], { a: original });
    const server = await start(dir);
    try {
      const full = await server.request('media/a');
      assert.equal(full.status, 200);
      assert.equal(full.headers.get('accept-ranges'), 'bytes');
      assert.equal(Number(full.headers.get('content-length')), original.length);
      assert.deepEqual(Buffer.from(await full.arrayBuffer()), original);
      const partial = await server.request('media/a', { headers: { Range: 'bytes=2-8' } });
      assert.equal(partial.status, 206);
      assert.equal(partial.headers.get('content-range'), `bytes 2-8/${original.length}`);
      assert.equal(await partial.text(), '2345678');
      const suffix = await server.request('media/a', { headers: { Range: 'bytes=-3' } });
      assert.equal(suffix.status, 206);
      assert.equal(await suffix.text(), 'xyz');
      const open = await server.request('media/a', { headers: { Range: 'bytes=33-' } });
      assert.equal(await open.text(), 'xyz');
      for (const range of ['bytes=1000-', 'bytes=8-2', 'bytes=-0', 'bytes=', 'bytes=1-2,3-4']) {
        const response = await server.request('media/a', { headers: { Range: range } });
        assert.equal(response.status, 416, range);
        assert.equal(response.headers.get('content-range'), `bytes */${original.length}`);
      }
      const head = await server.request('media/a', { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');
      assert.equal(Number(head.headers.get('content-length')), original.length);
      const ifRange = await server.request('media/a', {
        headers: { Range: 'bytes=0-1', 'If-Range': 'stale-validator' },
      });
      assert.equal(ifRange.status, 200);
      assert.deepEqual(Buffer.from(await ifRange.arrayBuffer()), original);
    } finally {
      await server.stop();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  'watchers reattach after media directory replacement and detect catalog edits even with an unchanged revision',
  { timeout: 20000 },
  async () => {
    const original = Buffer.from('watched-photo'),
      { dir } = await fixture(['a', 'b'], { a: original, b: original });
    const server = await start(dir);
    try {
      await waitReport(server, (r) => r.counts.duplicateGroups === 1);
      const library = JSON.parse(await readFile(join(dir, 'library.json'), 'utf8'));
      library.rolls[0].frames[0].name = 'Renamed externally.png';
      await writeFile(join(dir, 'library.json'), JSON.stringify(library));
      await waitReport(server, (r) =>
        r.duplicates.some((group) =>
          group.files.some((file) =>
            file.refs.some((ref) => ref.name === 'Renamed externally.png'),
          ),
        ),
      );
      await rename(join(dir, 'media'), join(dir, 'media-old'));
      await waitReport(server, (r) => r.counts.missing === 2);
      await mkdir(join(dir, 'media'));
      for (const id of ['a', 'b']) await writeFile(join(dir, 'media', `${id}.bin`), original);
      const restored = await waitReport(
        server,
        (r) => r.counts.missing === 0 && r.counts.duplicateGroups === 1 && r.status.watching,
      );
      assert.equal(restored.revision, 7);
      assert.equal(sha(await readFile(join(dir, 'media-old/a.bin'))), sha(original));
    } finally {
      await server.stop();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
