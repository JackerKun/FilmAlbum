import { Worker } from 'node:worker_threads';
export class MediaIndex {
  constructor(dataDir, { watch = true } = {}) {
    this.pending = new Map();
    this.sequence = 0;
    this.error = null;
    this.worker = new Worker(new URL('./index-worker.mjs', import.meta.url), {
      workerData: { dataDir, watch },
    });
    this.worker.on('message', (message) => {
      if (message.type === 'status') this.status = message.status;
      const pending = this.pending.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pending.delete(message.id);
        message.error ? pending.reject(new Error(message.error)) : pending.resolve(message.result);
      }
    });
    this.worker.on('error', (error) => this.fail(error));
    this.worker.on('exit', (code) => {
      if (code !== 0 && !this.closed) this.fail(new Error(`索引进程退出：${code}`));
    });
    this.worker.unref();
  }
  fail(error) {
    this.error = error.message;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
  request(op, extra = {}) {
    if (this.error || this.closed) return Promise.reject(new Error(this.error || '索引服务已关闭'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('索引服务响应超时'));
      }, 15000);
      this.pending.set(id, { resolve, reject, timeout });
      this.worker.postMessage({ id, op, ...extra });
    });
  }
  scan(force = false) {
    return this.request('scan', { force });
  }
  lookup(mediaId) {
    return this.request('lookup', { mediaId });
  }
  async report() {
    try {
      return await this.request('report');
    } catch (error) {
      return { available: false, status: { running: false, phase: 'error', error: error.message } };
    }
  }
  close() {
    this.closed = true;
    this.fail(new Error('索引服务已关闭'));
    return this.worker.terminate();
  }
}
