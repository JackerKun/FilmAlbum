import { mkdir, readFile, rename, stat, unlink, readdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
export class Thumbnails {
  constructor(dataDir) {
    this.mediaDir = join(dataDir, 'media');
    this.cacheDir = join(dataDir, 'thumbnails');
    this.pending = new Map();
    this.unsupported = new Map();
    this.queue = [];
    this.running = 0;
  }
  async signature(id) {
    const info = await stat(join(this.mediaDir, `${id}.bin`));
    if (!info.isFile()) throw new Error('Not a file');
    return `${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
  }
  async get(id) {
    const signature = await this.signature(id);
    if (this.unsupported.get(id) === signature) return null;
    const path = join(this.cacheDir, `${id}.jpg`);
    try {
      const marker = await readFile(join(this.cacheDir, `${id}.json`), 'utf8').then(JSON.parse);
      if (marker.signature === signature && (await stat(path)).isFile()) return path;
    } catch {}
    if (this.pending.has(id)) return this.pending.get(id);
    const task = new Promise((resolve) => {
      this.queue.push({ id, signature, resolve });
      this.drain();
    });
    this.pending.set(id, task);
    return task;
  }
  drain() {
    while (this.running < 2 && this.queue.length) {
      const job = this.queue.shift();
      this.running++;
      this.generate(job.id, job.signature)
        .catch(() => null)
        .then(job.resolve)
        .finally(() => {
          this.pending.delete(job.id);
          this.running--;
          this.drain();
        });
    }
  }
  async generate(id, signature) {
    if (process.platform !== 'darwin') {
      this.unsupported.set(id, signature);
      return null;
    }
    await mkdir(this.cacheDir, { recursive: true });
    const temp = join(this.cacheDir, `.${id}-${randomUUID()}.jpg`);
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(
          '/usr/bin/sips',
          ['-s', 'format', 'jpeg', '-Z', '640', join(this.mediaDir, `${id}.bin`), '--out', temp],
          { stdio: 'ignore' },
        );
        const timeout = setTimeout(() => {
          child.kill();
          reject(new Error('Thumbnail conversion timeout'));
        }, 15000);
        child.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.once('exit', (code) => {
          clearTimeout(timeout);
          code === 0 ? resolve() : reject(new Error('Unsupported thumbnail format'));
        });
      });
      if ((await this.signature(id)) !== signature) return null;
      const path = join(this.cacheDir, `${id}.jpg`);
      await rename(temp, path);
      const markerTemp = join(this.cacheDir, `.${id}-${randomUUID()}.json`);
      try {
        await writeFile(
          markerTemp,
          JSON.stringify({ signature, edge: 640, createdAt: new Date().toISOString() }),
        );
        await rename(markerTemp, join(this.cacheDir, `${id}.json`));
      } finally {
        await unlink(markerTemp).catch(() => {});
      }
      return path;
    } catch {
      this.unsupported.set(id, signature);
      return null;
    } finally {
      await unlink(temp).catch(() => {});
    }
  }
  async remove(id) {
    // Finish any in-flight derivative before deleting it, so a late conversion cannot recreate it.
    await this.pending.get(id)?.catch(() => {});
    this.unsupported.delete(id);
    for (const extension of ['jpg', 'json'])
      await unlink(join(this.cacheDir, `${id}.${extension}`)).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
  }
  async stats() {
    let names;
    try {
      names = await readdir(this.cacheDir);
    } catch {
      return {
        files: 0,
        bytes: 0,
        provider: process.platform === 'darwin' ? 'sips' : 'original',
        queued: this.queue.length + this.running,
      };
    }
    let bytes = 0,
      files = 0;
    for (const name of names.filter((name) => !name.startsWith('.') && name.endsWith('.jpg'))) {
      const info = await stat(join(this.cacheDir, name)).catch(() => null);
      if (info?.isFile()) {
        files++;
        bytes += info.size;
      }
    }
    return {
      files,
      bytes,
      provider: process.platform === 'darwin' ? 'sips' : 'original',
      queued: this.queue.length + this.running,
    };
  }
}
