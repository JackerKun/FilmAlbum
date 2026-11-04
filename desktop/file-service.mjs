import { createWriteStream } from 'node:fs';
import { mkdir, rename, unlink } from 'node:fs/promises';
import { dirname, join, resolve, basename } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { attachmentFileName, safeFileName } from '../src/shared/file-names.mjs';

export function downloadURL(origin, input) {
  if (!origin || typeof input !== 'string' || input.length > 2000)
    throw Error('无效的文件保存请求');
  const url = new URL(input, origin);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.hash ||
    !/^\/api\/v2\/(?:exports\/[a-zA-Z0-9-]+\.pdf|media\/[a-zA-Z0-9._:-]+)$/.test(url.pathname)
  )
    throw Error('只能保存当前资料库中的原片或导出 PDF');
  url.searchParams.set('download', '1');
  return url.href;
}
async function checkResponse(response) {
  if (response.ok) return;
  let message =
    response.status === 404
      ? '文件已不存在，或原片离线，请连接存储盘后重试'
      : '文件保存失败（HTTP ' + response.status + '）';
  try {
    message = (await response.json()).error || message;
  } catch {}
  throw Error(message);
}

// Destination comes from a native Save dialog, never from a renderer-provided path.
// Stream to a sibling temporary file so cancelled/failed transfers preserve an
// existing destination and never expose a partially written original or PDF.
export function createFileService({ getOrigin, getToken, chooseDestination, fetcher = fetch }) {
  const saved = new Set();
  let tail = Promise.resolve();
  async function save(request) {
    const url = downloadURL(getOrigin(), request?.url),
      headers = { 'X-FilmAlbum-Token': getToken() };
    const head = await fetcher(url, {
      method: 'HEAD',
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    await checkResponse(head);
    const filename = attachmentFileName(
      head.headers.get('content-disposition'),
      safeFileName(request.filename, 'FilmAlbum-download'),
    );
    const target = await chooseDestination(filename);
    if (!target) return { status: 'cancelled' };
    const destination = resolve(target),
      temp = join(dirname(destination), '.' + basename(destination) + '.' + randomUUID() + '.part');
    try {
      const response = await fetcher(url, {
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(30 * 60 * 1000),
      });
      await checkResponse(response);
      if (!response.body) throw Error('文件内容为空，未保存');
      await mkdir(dirname(destination), { recursive: true });
      await pipeline(
        Readable.fromWeb(response.body),
        createWriteStream(temp, { flags: 'wx', mode: 0o600 }),
      );
      await rename(temp, destination);
      saved.add(destination);
      return { status: 'saved', filename: basename(destination), path: destination };
    } finally {
      await unlink(temp).catch(() => {});
    }
  }
  return {
    saveFile(request) {
      const task = tail.then(() => save(request));
      tail = task.catch(() => {});
      return task;
    },
    canReveal(path) {
      return typeof path === 'string' && saved.has(resolve(path));
    },
  };
}
