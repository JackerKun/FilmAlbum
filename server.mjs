import { createServer } from 'node:http';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const DATA_DIR = join(ROOT, 'data');
const MEDIA_DIR = join(DATA_DIR, 'media');
const LIBRARY_FILE = join(DATA_DIR, 'library.json');
const PORT = Number(process.env.PORT || 8091);
const MAX_BODY = 1024 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
};

await mkdir(MEDIA_DIR, { recursive: true });

function send(response, status, body = '', headers = {}) {
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
  try { return JSON.parse(await readFile(LIBRARY_FILE, 'utf8')); }
  catch { return { version: 1, rolls: [], settings: {} }; }
}

async function writeLibrary(payload) {
  const next = { version: 1, updatedAt: new Date().toISOString(), rolls: Array.isArray(payload.rolls) ? payload.rolls : [], settings: payload.settings || {} };
  const temp = `${LIBRARY_FILE}.tmp`;
  await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`);
  await rename(temp, LIBRARY_FILE);
}

async function handleApi(request, response, url) {
  if (url.pathname === '/api/health') return send(response, 200, JSON.stringify({ ok: true, dataDir: DATA_DIR }), { 'Content-Type': MIME['.json'] });
  if (url.pathname === '/api/state' && request.method === 'GET') return send(response, 200, JSON.stringify(await readLibrary()), { 'Content-Type': MIME['.json'] });
  if (url.pathname === '/api/state' && request.method === 'PUT') {
    const payload = JSON.parse((await readBody(request)).toString('utf8') || '{}');
    await writeLibrary(payload);
    return send(response, 200, JSON.stringify({ ok: true }), { 'Content-Type': MIME['.json'] });
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
    await writeFile(mediaPath, body);
    await writeFile(metaPath, JSON.stringify({ contentType, size: body.length, updatedAt: new Date().toISOString() }));
    return send(response, 200, JSON.stringify({ ok: true }), { 'Content-Type': MIME['.json'] });
  }
  if (request.method === 'GET') {
    try {
      const [body, meta] = await Promise.all([readFile(mediaPath), readFile(metaPath, 'utf8').then(JSON.parse).catch(() => ({}))]);
      return send(response, 200, body, { 'Content-Type': meta.contentType || 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' });
    } catch { return send(response, 404, 'Media not found'); }
  }
  if (request.method === 'DELETE') {
    await Promise.all([unlink(mediaPath).catch(() => {}), unlink(metaPath).catch(() => {})]);
    return send(response, 200, JSON.stringify({ ok: true }), { 'Content-Type': MIME['.json'] });
  }
  return send(response, 405, 'Method not allowed');
}

async function serveStatic(response, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = resolve(ROOT, normalize(relative));
  if (!filePath.startsWith(`${resolve(ROOT)}/`) || filePath.startsWith(`${resolve(DATA_DIR)}/`)) return send(response, 403, 'Forbidden');
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return send(response, 404, 'Not found');
    return send(response, 200, await readFile(filePath), { 'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream' });
  } catch { return send(response, 404, 'Not found'); }
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
    if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(request, response, url);
      if (handled === false) send(response, 404, 'Not found');
      return;
    }
    await serveStatic(response, decodeURIComponent(url.pathname));
  } catch (error) {
    const status = error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 500;
    send(response, status, status === 413 ? 'Payload too large' : 'Server error');
    console.error(error);
  }
}).listen(PORT, '127.0.0.1', () => console.log(`FilmAlbum: http://127.0.0.1:${PORT}`));
