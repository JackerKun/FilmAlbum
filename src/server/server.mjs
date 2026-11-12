import { STATIC_FILES } from './static-files.mjs';
import { StudioService } from './studio-service.mjs';
import { MediaIndex } from './media-index.mjs';
import { Thumbnails } from './thumbnails.mjs';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, readFile, rename, stat, unlink, writeFile, link } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DATA_DIR = resolve(process.env.FILMALBUM_DATA_DIR || join(ROOT, 'data'));
const MEDIA_DIR = join(DATA_DIR, 'media');
const LIBRARY_FILE = join(DATA_DIR, 'library.json');
const PORT = Number(process.env.PORT || 8091);
const MAX_BODY = 1024 * 1024 * 1024;
let mediaIndex;
let studio;
function legacyIndex() {
  if (!mediaIndex)
    mediaIndex = new MediaIndex(DATA_DIR, { watch: process.env.FILMALBUM_WATCH !== '0' });
  return mediaIndex;
}
const thumbnails = new Thumbnails(DATA_DIR);

const MIME = {
  '.otf': 'font/otf',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

await mkdir(MEDIA_DIR, { recursive: true });

function send(response, status, body = '', headers = {}) {
  if (process.env.FILMALBUM_DESKTOP_TOKEN)
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
    );
  response.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  response.end(body);
}

function safeId(value = '') {
  return /^[a-zA-Z0-9._-]{1,160}$/.test(value) ? value : '';
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readLibrary() {
  try {
    return JSON.parse(await readFile(LIBRARY_FILE, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, rolls: [], settings: {} };
    throw error;
  }
}

let mutationQueue = Promise.resolve();
function mutate(operation) {
  const result = mutationQueue.catch(() => {}).then(operation);
  mutationQueue = result;
  return result;
}
function validateLibrary(payload) {
  if (
    !payload ||
    !Array.isArray(payload.rolls) ||
    !payload.settings ||
    typeof payload.settings !== 'object' ||
    Array.isArray(payload.settings)
  )
    throw new Error('INVALID_LIBRARY');
  const rolls = new Set();
  for (const roll of payload.rolls) {
    if (!safeId(roll?.id) || rolls.has(roll.id) || !Array.isArray(roll.frames))
      throw new Error('INVALID_LIBRARY');
    rolls.add(roll.id);
    if (roll.frames.some((frame) => !safeId(frame?.id))) throw new Error('INVALID_LIBRARY');
  }
}
function mediaIds(library) {
  return new Set(
    (library.rolls || [])
      .flatMap((roll) => (roll.frames || []).map((frame) => frame.id))
      .filter(safeId),
  );
}
async function atomicWrite(next) {
  const temp = `${LIBRARY_FILE}.tmp`;
  await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`);
  await rename(temp, LIBRARY_FILE);
}
async function writeLibrary(payload) {
  validateLibrary(payload);
  const previous = await readLibrary();
  studio?.legacyGuard(payload.revision);
  if (payload.revision !== (previous.revision || 0)) throw new Error('STALE_LIBRARY');
  const referenced = mediaIds(payload);
  const removed = new Set([
    ...(previous.pendingCleanup || []),
    ...[...mediaIds(previous)].filter((id) => !referenced.has(id)),
  ]);
  const pendingCleanup = [...removed].filter((id) => safeId(id) && !referenced.has(id));
  // Commit the index and a durable cleanup list before removing original files.
  const next = {
    version: 1,
    revision: (previous.revision || 0) + 1,
    updatedAt: new Date().toISOString(),
    rolls: payload.rolls,
    settings: payload.settings,
    pendingCleanup,
  };
  await atomicWrite(next);
  const failed = [];
  for (const id of pendingCleanup) {
    try {
      for (const extension of ['bin', 'json'])
        await unlink(join(MEDIA_DIR, `${id}.${extension}`)).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
      await thumbnails.remove(id);
    } catch {
      failed.push(id);
    }
  }
  next.pendingCleanup = failed;
  // Cleanup has already committed; retain the durable retry list if this final write fails.
  await atomicWrite(next).catch((error) =>
    console.error('Could not update cleanup list:', error.message),
  );
  studio?.legacyWrite(next);
  mediaIndex?.scan().catch(() => {});
  return { ok: true, revision: next.revision, cleanupPending: failed.length };
}

async function writeMedia(id, body, contentType, exclusive = false) {
  await mkdir(MEDIA_DIR, { recursive: true });
  const token = randomUUID();
  const temporary = join(MEDIA_DIR, `.${id}-${token}.tmp`);
  const metadataTemp = join(MEDIA_DIR, `.${id}-${token}.json.tmp`);
  try {
    await writeFile(temporary, body);
    await writeFile(
      metadataTemp,
      JSON.stringify({ contentType, size: body.length, updatedAt: new Date().toISOString() }),
    );
    if (exclusive) await link(temporary, join(MEDIA_DIR, `${id}.bin`));
    else await rename(temporary, join(MEDIA_DIR, `${id}.bin`));
    await rename(metadataTemp, join(MEDIA_DIR, `${id}.json`));
    await thumbnails.remove(id).catch(() => {});
  } finally {
    await unlink(temporary).catch(() => {});
    await unlink(metadataTemp).catch(() => {});
  }
  mediaIndex?.scan().catch(() => {});
}
async function streamMedia(request, response, mediaPath, metaPath) {
  const [info, meta] = await Promise.all([
    stat(mediaPath),
    typeof metaPath === 'string'
      ? readFile(metaPath, 'utf8')
          .then(JSON.parse)
          .catch(() => ({}))
      : Promise.resolve(metaPath),
  ]);
  if (!info.isFile()) return send(response, 404, 'Media not found');
  const headers = {
    'Cache-Control': 'private, no-cache',
    'Content-Type': meta.contentType || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Last-Modified': info.mtime.toUTCString(),
  };
  let start = 0,
    end = info.size - 1,
    status = 200;
  const range = request.method === 'GET' && !request.headers['if-range'] && request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2]))
      return send(response, 416, '', { ...headers, 'Content-Range': `bytes */${info.size}` });
    if (!match[1]) {
      const suffix = Number(match[2]);
      start = Math.max(0, info.size - suffix);
      if (suffix === 0) start = info.size;
    } else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
    }
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      start >= info.size
    )
      return send(response, 416, '', { ...headers, 'Content-Range': `bytes */${info.size}` });
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
  }
  headers['Content-Length'] = String(Math.max(0, end - start + 1));
  response.writeHead(status, headers);
  if (request.method === 'HEAD' || !info.size) {
    response.end();
    return;
  }
  const stream = createReadStream(mediaPath, { start, end });
  stream.on('error', () => response.destroy());
  response.on('close', () => stream.destroy());
  stream.pipe(response);
}
async function fileHash(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
async function repairMedia(id, source) {
  if (!mediaIds(await readLibrary()).has(id))
    return { status: 404, message: '此文件不在当前资料库中' };
  const path = join(MEDIA_DIR, `${id}.bin`);
  try {
    await stat(path);
    return { status: 409, message: '原文件已存在，请刷新检查，修复不会覆盖原片' };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const indexed = await mediaIndex.lookup(id);
  const expectedHash = indexed?.sha256;
  let contentType, body;
  if (source.sourceId) {
    if (!safeId(source.sourceId) || !expectedHash)
      return { status: 400, message: '没有可靠的哈希匹配，不能自动修复' };
    const sourcePath = join(MEDIA_DIR, `${source.sourceId}.bin`);
    if ((await fileHash(sourcePath)) !== expectedHash)
      return { status: 409, message: '候选文件已变化或哈希不匹配，请重新检查' };
    body = await readFile(sourcePath);
    contentType = await readFile(join(MEDIA_DIR, `${id}.json`), 'utf8')
      .then(JSON.parse)
      .then((meta) => meta.contentType)
      .catch(() =>
        readFile(join(MEDIA_DIR, `${source.sourceId}.json`), 'utf8')
          .then(JSON.parse)
          .then((meta) => meta.contentType)
          .catch(() => 'application/octet-stream'),
      );
  } else {
    body = source.body;
    contentType = source.contentType;
    if (!contentType || contentType === 'application/octet-stream')
      contentType = await readFile(join(MEDIA_DIR, `${id}.json`), 'utf8')
        .then(JSON.parse)
        .then((meta) => meta.contentType)
        .catch(() => contentType);
  }
  if (!body?.length) return { status: 400, message: '请选择非空的原始媒体文件' };
  const hash = createHash('sha256').update(body).digest('hex');
  if (expectedHash && hash !== expectedHash)
    return { status: 409, message: '所选文件与原始 SHA-256 不一致，未写入任何文件' };
  // The serialized mutation queue prevents a simultaneous import/delete from replacing this target.
  try {
    await writeMedia(id, body, contentType || 'application/octet-stream', true);
  } catch (error) {
    if (error.code === 'EEXIST')
      return { status: 409, message: '原片已由其他操作恢复，未覆盖现有文件' };
    throw error;
  }
  return { status: 200, result: { ok: true, verified: Boolean(expectedHash), hash } };
}

async function handleApi(request, response, url) {
  if (url.pathname.startsWith('/api/v2/')) {
    if (!studio)
      return send(response, 503, JSON.stringify({ error: '资料库正在启动' }), {
        'Content-Type': MIME['.json'],
      });
    return studio.handle(request, response, url);
  }
  if (url.pathname === '/api/health')
    return send(response, 200, JSON.stringify({ ok: true, dataDir: DATA_DIR }), {
      'Content-Type': MIME['.json'],
    });
  if (url.pathname === '/api/state' && request.method === 'GET')
    return send(response, 200, JSON.stringify(await readLibrary()), {
      'Content-Type': MIME['.json'],
    });
  if (url.pathname === '/api/state' && request.method === 'PUT') {
    const payload = JSON.parse((await readBody(request)).toString('utf8') || '{}');
    const result = await mutate(() => writeLibrary(payload));
    return send(response, 200, JSON.stringify(result), { 'Content-Type': MIME['.json'] });
  }
  if (url.pathname === '/api/index' && request.method === 'GET') {
    const report = await legacyIndex().report();
    report.thumbnails = await thumbnails.stats();
    return send(response, 200, JSON.stringify(report), { 'Content-Type': MIME['.json'] });
  }
  if (url.pathname === '/api/index/scan' && request.method === 'POST') {
    await legacyIndex().scan(url.searchParams.get('force') === '1');
    return send(response, 202, JSON.stringify({ accepted: true }), {
      'Content-Type': MIME['.json'],
    });
  }
  const thumbnailMatch = url.pathname.match(/^\/api\/thumbnail\/([^/]+)$/);
  if (thumbnailMatch && request.method === 'GET') {
    const id = safeId(decodeURIComponent(thumbnailMatch[1]));
    if (!id) return send(response, 400, 'Invalid media id');
    try {
      const path = await thumbnails.get(id);
      if (!path)
        return send(response, 302, '', { Location: `/api/media/${encodeURIComponent(id)}` });
      return send(response, 200, await readFile(path), {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-cache',
      });
    } catch {
      return send(response, 404, 'Media not found');
    }
  }
  const repairMatch = url.pathname.match(/^\/api\/repair\/([^/]+)$/);
  if (repairMatch && ['PUT', 'POST'].includes(request.method)) {
    const id = safeId(decodeURIComponent(repairMatch[1]));
    if (!id) return send(response, 400, 'Invalid media id');
    legacyIndex();
    const body = await readBody(request);
    const source =
      request.method === 'POST'
        ? JSON.parse(body.toString('utf8') || '{}')
        : { body, contentType: request.headers['content-type'] };
    const result = await mutate(() => repairMedia(id, source));
    return send(response, result.status, result.message || JSON.stringify(result.result), {
      'Content-Type': result.message ? 'text/plain; charset=utf-8' : MIME['.json'],
    });
  }
  const mediaMatch = url.pathname.match(/^\/api\/media\/([^/]+)$/);
  if (!mediaMatch) return false;
  const id = safeId(decodeURIComponent(mediaMatch[1]));
  if (!id) return send(response, 400, 'Invalid media id');
  const mediaPath = join(MEDIA_DIR, `${id}.bin`);
  const metaPath = join(MEDIA_DIR, `${id}.json`);
  if (request.method === 'PUT') {
    const body = await readBody(request);
    const contentType = request.headers['content-type'] || 'application/octet-stream';
    await mutate(() => writeMedia(id, body, contentType));
    return send(response, 200, JSON.stringify({ ok: true }), { 'Content-Type': MIME['.json'] });
  }
  if (['GET', 'HEAD'].includes(request.method)) {
    try {
      await streamMedia(request, response, mediaPath, metaPath);
    } catch {
      if (!response.headersSent) send(response, 404, 'Media not found');
      else response.destroy();
    }
    return;
  }
  if (request.method === 'DELETE') {
    return mutate(async () => {
      if (mediaIds(await readLibrary()).has(id))
        return send(response, 409, 'Media is referenced by the library');
      for (const path of [mediaPath, metaPath])
        await unlink(path).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
      await thumbnails.remove(id);
      mediaIndex?.scan().catch(() => {});
      return send(response, 200, JSON.stringify({ ok: true }), { 'Content-Type': MIME['.json'] });
    });
  }
  return send(response, 405, 'Method not allowed');
}

async function serveStatic(response, pathname) {
  const relative = STATIC_FILES.get(pathname);
  if (!relative) return send(response, 403, 'Forbidden');
  const filePath = join(ROOT, relative);
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return send(response, 404, 'Not found');
    return send(response, 200, await readFile(filePath), {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
    });
  } catch {
    return send(response, 404, 'Not found');
  }
}

const desktopToken = process.env.FILMALBUM_DESKTOP_TOKEN;
const server = createServer(async (request, response) => {
  try {
    if (desktopToken) {
      const token = Buffer.from(String(request.headers['x-filmalbum-token'] || '')),
        expected = Buffer.from(desktopToken);
      if (token.length !== expected.length || !timingSafeEqual(token, expected))
        return send(response, 403, 'Desktop session required');
    }

    const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
    if (url.pathname.startsWith('/api/')) {
      if (
        request.headers.origin &&
        new URL(request.headers.origin).host !== request.headers.host &&
        !['GET', 'HEAD'].includes(request.method)
      )
        return send(response, 403, 'Origin rejected');
      const handled = await handleApi(request, response, url);
      if (handled === false) send(response, 404, 'Not found');
      return;
    }
    await serveStatic(response, decodeURIComponent(url.pathname));
  } catch (error) {
    const status =
      error.status ||
      (error.message === 'STALE_LIBRARY'
        ? 409
        : error.message === 'PAYLOAD_TOO_LARGE'
          ? 413
          : error.message === 'INVALID_LIBRARY' || error instanceof SyntaxError
            ? 400
            : 500);
    send(
      response,
      status,
      status === 409
        ? 'Library changed in another window; reload before saving'
        : status === 413
          ? 'Payload too large'
          : status === 400
            ? 'Invalid library payload'
            : 'Server error',
    );
    console.error(error);
  }
});
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE')
    console.error(
      `FilmAlbum 的端口 ${PORT} 已被占用。已有服务可直接访问 http://127.0.0.1:${PORT}，或用 PORT=8092 npm run serve 更换端口。`,
    );
  else console.error(`FilmAlbum 启动失败：${error.message}`);
  process.exitCode = 1;
});
server.listen(PORT, '127.0.0.1', () => {
  studio = new StudioService(DATA_DIR, (request, response, path, mime) =>
    streamMedia(request, response, path, { contentType: mime }),
  );
  console.log(`FilmAlbum: http://127.0.0.1:${server.address().port}`);
  process.parentPort?.postMessage({ type: 'ready', port: server.address().port });
});
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  mediaIndex?.close().catch(() => {});
  studio?.close();
  server.close(() => process.exit(0));
  setTimeout(() => {
    server.closeAllConnections();
  }, 500).unref();
}
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, shutdown);
process.parentPort?.on('message', (event) => {
  if (event.data?.op === 'shutdown') shutdown();
});
