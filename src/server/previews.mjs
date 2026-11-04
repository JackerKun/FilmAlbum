import { mkdir, readFile, stat, rename, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { native } from './native.mjs';
import { uid, parse } from './catalog.mjs';
export class PreviewCache {
  constructor(home) {
    this.home = home;
    this.active = 0;
    this.queue = [];
    this.pending = new Map();
  }
  async get(catalog, id, edge = 640) {
    edge = [320, 640, 1600, 2048, 0].includes(Number(edge)) ? Number(edge) : 640;
    const m = catalog.mediaPath(id),
      dir = join(catalog.root, 'previews'),
      path = join(dir, `${id}-${edge}.jpg`);
    let info;
    try {
      info = await stat(m.absolute);
    } catch {
      const edges = [
        ...new Set([edge, ...(edge >= 1600 ? [2048, 1600, 640, 320] : [640, 1600, 320, 2048])]),
      ];
      for (const cachedEdge of edges) {
        const cached = join(dir, `${id}-${cachedEdge}.jpg`);
        if (
          await stat(cached).then(
            (s) => s.isFile() && s.size > 0,
            () => false,
          )
        )
          return { path: cached, mime: 'image/jpeg', offline: true, cachedEdge };
      }
      throw Object.assign(new Error('原片离线且没有缓存预览；请连接存储盘后生成离线预览。'), {
        status: 404,
      });
    }
    const signature = `${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
    try {
      if (
        parse(await readFile(path + '.json', 'utf8')).signature === signature &&
        (await stat(path).then(
          (s) => s.isFile(),
          () => false,
        ))
      )
        return { path, mime: 'image/jpeg' };
    } catch {}
    if (m.mime.startsWith('video/')) return { path: m.absolute, mime: m.mime };
    const key = catalog.root + ':' + id + ':' + edge;
    if (this.pending.has(key)) return this.pending.get(key);
    const promise = new Promise((resolve, reject) => {
      this.queue.push({
        run: async () => {
          await mkdir(dir, { recursive: true });
          const temp = path + '.' + uid() + '.jpg';
          try {
            await native(this.home, 'preview', m.absolute, temp, edge);
            const after = await stat(m.absolute);
            if (`${after.size}:${after.mtimeMs}:${after.ctimeMs}` !== signature)
              throw new Error('原片变化，请重新生成预览');
            await rename(temp, path);
            await writeFile(path + '.json', JSON.stringify({ signature }));
            return { path, mime: 'image/jpeg' };
          } catch (error) {
            if (
              [
                'image/svg+xml',
                'image/jpeg',
                'image/png',
                'image/webp',
                'image/gif',
                'image/avif',
              ].includes(m.mime)
            )
              return { path: m.absolute, mime: m.mime };
            throw error;
          } finally {
            await unlink(temp).catch(() => {});
          }
        },
        resolve,
        reject,
        key,
      });
      this.drain();
    });
    this.pending.set(key, promise);
    return promise;
  }
  drain() {
    while (this.active < 2 && this.queue.length) {
      const job = this.queue.shift();
      this.active++;
      job
        .run()
        .then(job.resolve, job.reject)
        .finally(() => {
          this.pending.delete(job.key);
          this.active--;
          this.drain();
        });
    }
  }
}
