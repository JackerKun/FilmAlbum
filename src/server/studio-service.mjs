import { attachmentHeader, mediaFileName, safeFileName } from '../shared/file-names.mjs';
import { previewStatus } from './preview-status.mjs';
import { PlaceSearch } from './map-geocode.mjs';
import { validateCustomStock } from '../shared/stock-catalog.mjs';
import { bookStore, bookPreflight } from './books.mjs';
import { Worker } from 'node:worker_threads';
import { Catalog, uid, json, parse, fail } from './catalog.mjs';
import { Jobs } from './jobs.mjs';
import { PreviewCache } from './previews.mjs';
import { native, nativeCapabilities } from './native.mjs';
import { qrSvg } from '../shared/qr.mjs';
import {
  mkdir,
  readFile,
  writeFile,
  stat,
  readdir,
  rename,
  unlink,
  realpath,
  open,
} from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { join, resolve, extname, basename, sep, parse as parsePath } from 'node:path';
const safe = (value) => typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,220}$/.test(value);
const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
};
async function body(request, limit = 16 * 1024 * 1024) {
  let n = 0;
  const parts = [];
  for await (const chunk of request) {
    n += chunk.length;
    if (n > limit) fail('请求内容过大', 413);
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}
const hashFile = async (path) => {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest('hex');
};
export class StudioService {
  constructor(home, stream) {
    this.home = resolve(home);
    this.placeSearch = new PlaceSearch(this.home);
    this.root = this.home;
    this.stream = stream;
    this.previews = new PreviewCache(this.home);
    this.locks = new Map();
    this.jobs = new Jobs(this.home, true);
    this.initialize();
  }
  initialize() {
    let config = {};
    try {
      config = JSON.parse(requireRead(join(this.home, 'session.json')));
    } catch {}
    this.root = config.activeRoot || this.home;
    try {
      this.catalog = new Catalog(this.root);
      this.error = null;
    } catch (error) {
      this.catalog = null;
      this.error = error.message;
    }
    if (process.env.FILMALBUM_BACKGROUND !== '0') {
      this.worker = new Worker(new URL('./background.mjs', import.meta.url), {
        workerData: { home: this.home },
      });
      this.worker.on('error', (error) => {
        this.workerError = error.message;
      });
      this.worker.on('message', (message) => {
        if (message.type === 'completed') this.lastJobUpdate = Date.now();
      });
      this.worker.unref();
      this.worker.postMessage({ op: 'watch', root: this.root });
      if (this.catalog) this.enqueue('index', '首次检查原片', { all: true });
      this.auto = setInterval(() => this.autoBackup(), 60000).unref();
    }
  }
  c() {
    if (!this.catalog)
      fail('资料库无法打开：' + this.error + '。可在资料库管理中恢复到新文件夹。', 503);
    return this.catalog;
  }
  enqueue(kind, label, payload = {}) {
    const job = this.jobs.enqueue(kind, label, { ...payload, root: this.root });
    this.worker?.postMessage({ op: 'wake' });
    return job;
  }
  async autoBackup() {
    try {
      const c = this.c(),
        settings = c.getMeta('settings') || {},
        hours = Number(settings.backupHours) || 0;
      if (
        hours > 0 &&
        Date.now() - Number(c.getMeta('lastBackup') || 0) > hours * 3600000 &&
        !this.jobs
          .list()
          .some((j) => j.kind === 'backup' && ['running', 'queued'].includes(j.state))
      )
        this.enqueue('backup', '自动增量备份', {
          backupRoot: settings.backupRoot || join(this.home, 'backups'),
        });
    } catch {}
  }
  close() {
    clearInterval(this.auto);
    this.worker?.terminate();
    this.jobs.close();
    this.catalog?.close();
  }
  legacyGuard(revision) {
    if (this.root !== this.home || (this.catalog && this.catalog.revision() !== revision))
      fail('目录已升级或发生修改，请刷新后使用新工作台', 409);
  }
  legacyWrite(state) {
    this.catalog?.replaceLegacy(state);
  }
  async switchRoot(root) {
    root = await realpath(resolve(root));
    if (
      !(await stat(join(root, 'catalog.sqlite')).then(
        (s) => s.isFile(),
        () => false,
      ))
    )
      fail('请选择包含 catalog.sqlite 的资料库文件夹');
    const next = new Catalog(root, { migrate: false });
    this.catalog?.close();
    this.catalog = next;
    this.root = root;
    this.error = null;
    await writeFile(
      join(this.home, 'session.json.tmp'),
      json({
        ...parse(await readFile(join(this.home, 'session.json'), 'utf8').catch(() => '{}')),
        activeRoot: root,
      }),
    );
    await rename(join(this.home, 'session.json.tmp'), join(this.home, 'session.json'));
    this.worker?.postMessage({ op: 'watch', root });
    return { root, ...next.lists() };
  }
  async backups(root) {
    root = resolve(
      root || this.catalog?.getMeta('settings')?.backupRoot || join(this.home, 'backups'),
    );
    const list = [];
    for (const entry of await readdir(join(root, 'snapshots'), { withFileTypes: true }).catch(
      () => [],
    )) {
      if (!entry.isDirectory()) continue;
      try {
        const m = JSON.parse(
          await readFile(join(root, 'snapshots', entry.name, 'manifest.json'), 'utf8'),
        );
        list.push({
          id: entry.name,
          title: m.title,
          createdAt: m.createdAt,
          complete: m.complete,
          files: m.files.length,
          missing: m.missing.length,
          newBytes: m.newBytes,
          sourceRoot: m.sourceRoot,
        });
      } catch {}
    }
    return { root, items: list.sort((a, b) => b.createdAt - a.createdAt) };
  }
  health() {
    const c = this.c(),
      db = c.db;
    const missing = db
      .prepare(
        "SELECT m.id,m.path,m.hash,m.availability,(SELECT p.id FROM versions v JOIN photos p ON p.id=v.photo_id WHERE v.media_id=m.id LIMIT 1) AS photoId FROM media m WHERE availability IN('missing','offline','error','changed') ORDER BY availability,id LIMIT 200",
      )
      .all();
    const duplicateGroups = db
      .prepare(
        "SELECT hash,COUNT(*) AS copies,MIN(size) AS size FROM media WHERE hash IS NOT NULL AND availability='ready' GROUP BY hash HAVING COUNT(*)>1 ORDER BY size DESC LIMIT 200",
      )
      .all()
      .map((group) => ({
        ...group,
        files: db
          .prepare(
            'SELECT m.id,m.path,(SELECT p.name FROM versions v JOIN photos p ON p.id=v.photo_id WHERE v.media_id=m.id LIMIT 1) AS name,(SELECT p.id FROM versions v JOIN photos p ON p.id=v.photo_id WHERE v.media_id=m.id LIMIT 1) AS photoId FROM media m WHERE hash=? LIMIT 100',
          )
          .all(group.hash),
      }));
    return {
      ...c.stats(),
      orphans: c.getMeta('orphans') || { count: 0, files: [] },
      missing,
      duplicates: duplicateGroups,
      duplicateGroupTotal: db
        .prepare(
          "SELECT COUNT(*) AS n FROM(SELECT hash FROM media WHERE hash IS NOT NULL AND availability='ready' GROUP BY hash HAVING COUNT(*)>1)",
        )
        .get().n,
      integrity: c.getMeta('integrity') || '尚未检查',
      workerError: this.workerError || null,
      root: this.root,
    };
  }
  async repair(id, request) {
    const c = this.c(),
      m = c.mediaPath(id);
    if (
      await stat(m.absolute).then(
        () => true,
        () => false,
      )
    )
      fail('原片已经存在，修复不会覆盖已有文件', 409);
    if (!m.managed) fail('请重新连接外部存储卷，或先把此版本复制回本资料库', 409);
    const temp = join(this.root, 'media', 'repair-' + uid() + '.tmp');
    let size = 0;
    try {
      await pipeline(
        request,
        new Transform({
          transform(chunk, enc, done) {
            size += chunk.length;
            if (size > 1024 * 1024 * 1024) done(new Error('文件超过 1GB'));
            else done(null, chunk);
          },
        }),
        createWriteStream(temp, { flags: 'wx' }),
      );
      const hash = await hashFile(temp);
      if (m.hash && m.hash !== hash) fail('SHA-256 与原片不一致，未覆盖任何文件', 409);
      const { link } = await import('node:fs/promises');
      try {
        await link(temp, m.absolute);
      } catch (error) {
        if (error.code === 'EEXIST') fail('原片已由其他操作恢复，未覆盖', 409);
        throw error;
      }
      c.db
        .prepare("UPDATE media SET availability='ready',hash=?,size=? WHERE id=?")
        .run(hash, size, id);
      this.enqueue('index', '复核恢复文件', { ids: [id] });
      return { ok: true, verified: Boolean(m.hash) };
    } finally {
      await unlink(temp).catch(() => {});
    }
  }
  async uploadCreate(input) {
    const files = input.files;
    if (!Array.isArray(files) || !files.length || files.length > 10000)
      fail('每批需包含 1–10000 个文件');
    const paths = new Set();
    for (const file of files) {
      if (!file.path || paths.has(file.path)) fail('同批来源路径重复，请分批导入');
      paths.add(file.path);
    }
    const payload = {
      root: this.root,
      metadata: input.metadata || {},
      dedup: ['skip', 'reuse', 'keep'].includes(input.dedup) ? input.dedup : 'skip',
      targetRoll: input.targetRoll || null,
      targetPhoto: input.targetPhoto || null,
      kind: input.kind || 'scan',
      groupMode: input.groupMode || 'folders',
      numbering: input.numbering || 'sequential',
      rolls: {},
    };
    if (payload.targetRoll) this.c().row('rolls', payload.targetRoll);
    if (payload.targetPhoto) this.c().row('photos', payload.targetPhoto);
    const job = this.jobs.enqueue('upload', input.name || '批量导入', payload);
    this.jobs.update(job.id, {
      state: 'waiting_source',
      total: files.length,
      phase: '等待来源文件',
    });
    const insert = this.jobs.db.prepare(
      'INSERT INTO upload_files(batch_id,key,path,name,size,mtime) VALUES(?,?,?,?,?,?)',
    );
    this.jobs.db.exec('BEGIN');
    try {
      for (const [i, file] of files.entries()) {
        if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > 1024 * 1024 * 1024)
          fail('单文件需为 1B–1GB');
        const key = createHash('sha256')
          .update(`${file.path}|${file.size}|${file.mtime}`)
          .digest('hex');
        insert.run(
          job.id,
          key,
          String(file.path).slice(0, 1000),
          basename(file.path),
          file.size,
          file.mtime || 0,
        );
      }
      this.jobs.db.exec('COMMIT');
    } catch (error) {
      this.jobs.db.exec('ROLLBACK');
      throw error;
    }
    return this.uploadState(job.id);
  }
  uploadState(id) {
    const job = this.jobs.get(id);
    if (!job || job.kind !== 'upload') fail('导入任务不存在', 404);
    return {
      ...job,
      files: this.jobs.db
        .prepare('SELECT * FROM upload_files WHERE batch_id=? ORDER BY path')
        .all(id),
    };
  }
  async uploadChunk(jobId, key, offset, request) {
    const lockKey = jobId + ':' + key;
    const previous = this.locks.get(lockKey) || Promise.resolve();
    let release;
    const lock = new Promise((resolve) => (release = resolve));
    this.locks.set(lockKey, lock);
    await previous.catch(() => {});
    try {
      const job = this.jobs.get(jobId),
        file = this.jobs.db
          .prepare('SELECT * FROM upload_files WHERE batch_id=? AND key=?')
          .get(jobId, key);
      if (!job || !file) fail('导入文件记录不存在', 404);
      if (['cancelled', 'cancel_requested', 'paused', 'pause_requested'].includes(job.state))
        fail('导入任务已暂停或取消', 409);
      if (['done', 'skipped'].includes(file.state))
        return { offset: file.size, state: file.state, result: parse(file.result) };
      const root = job.payload.root,
        folder = join(root, 'uploads');
      await mkdir(folder, { recursive: true });
      const temp = join(folder, jobId + '-' + key + '.part'),
        actual = await stat(temp).then(
          (s) => s.size,
          () => 0,
        );
      if (Number(offset) !== actual) fail(`上传断点为 ${actual}，请按服务器断点重试`, 409);
      let written = actual;
      const cap = Math.min(file.size, actual + 8 * 1024 * 1024);
      await pipeline(
        request,
        new Transform({
          transform(chunk, encoding, callback) {
            written += chunk.length;
            if (written > cap) callback(new Error('上传片段长度不正确'));
            else callback(null, chunk);
          },
        }),
        createWriteStream(temp, { flags: 'a' }),
      );
      this.jobs.db
        .prepare("UPDATE upload_files SET offset=?,state='uploading' WHERE batch_id=? AND key=?")
        .run(written, jobId, key);
      const state = this.jobs.get(jobId).state;
      if (['paused', 'pause_requested', 'cancelled', 'cancel_requested'].includes(state)) {
        if (state.startsWith('cancel')) {
          await unlink(temp).catch(() => {});
          this.jobs.db
            .prepare(
              "UPDATE upload_files SET offset=0,state='cancelled' WHERE batch_id=? AND key=?",
            )
            .run(jobId, key);
        }
        return { offset: written, state };
      }
      this.jobs.update(jobId, {
        state: 'waiting_source',
        phase: `装入 ${file.name} · ${Math.floor((written / file.size) * 100)}%`,
      });
      if (written < file.size) return { offset: written, state: 'uploading' };
      const expected = request.headers['x-file-sha256'];
      if (!/^[a-f0-9]{64}$/.test(expected || '')) fail('上传完成后需要原始文件 SHA-256', 400);
      const hash = await hashFile(temp);
      if (hash !== expected) fail('上传内容与来源文件哈希不一致，请从头重传此文件', 409);
      this.jobs.update(jobId, { phase: '核对原片并读取 EXIF' });
      const exif = await native(this.home, 'metadata', temp).catch(() => ({}));
      const own = root !== this.root,
        cat = own ? new Catalog(root, { migrate: false }) : this.c();
      let result;
      try {
        const current = this.jobs.get(jobId),
          p = current.payload,
          duplicate = cat.db
            .prepare('SELECT id FROM media WHERE hash=? AND size=? LIMIT 1')
            .get(hash, file.size);
        if (duplicate && p.dedup === 'skip') {
          result = { skipped: true, existingMedia: duplicate.id };
          await unlink(temp);
          this.jobs.db
            .prepare("UPDATE upload_files SET state='skipped',result=? WHERE batch_id=? AND key=?")
            .run(json(result), jobId, key);
        } else {
          let mediaId = duplicate && p.dedup === 'reuse' ? duplicate.id : null;
          if (!mediaId) {
            mediaId = uid();
            await rename(temp, join(root, 'media', mediaId + '.bin'));
            const type = MIME[extname(file.name).toLowerCase()] || 'application/octet-stream';
            await writeFile(
              join(root, 'media', mediaId + '.json'),
              json({ contentType: type, size: file.size }),
            );
            cat.addMedia({
              id: mediaId,
              path: `media/${mediaId}.bin`,
              mime: type,
              size: file.size,
              hash,
            });
          } else await unlink(temp);
          let rollId = p.targetRoll;
          if (p.targetPhoto) rollId = cat.row('photos', p.targetPhoto).roll_id;
          if (!rollId) {
            const group =
              p.groupMode === 'single'
                ? '未分组'
                : file.path.includes('/')
                  ? file.path.split('/').slice(0, -1).join('/')
                  : '未分组';
            rollId = p.rolls[group];
            if (!rollId) {
              rollId = cat.transaction(() =>
                cat.createRoll({
                  ...p.metadata,
                  name:
                    group === '未分组' ? p.metadata.name || '导入胶卷' : group.split('/').at(-1),
                }),
              ).id;
              p.rolls[group] = rollId;
              this.jobs.update(jobId, { payload: p });
            }
          }
          result = cat.addPhoto(
            rollId,
            mediaId,
            {
              name: file.name,
              frameNo:
                p.numbering === 'filename'
                  ? file.name.match(/(?:^|[ _-])(\d{1,3}[a-z]?)(?=\.[^.]+$)/i)?.[1] || undefined
                  : undefined,
              kind: p.kind,
              type: (MIME[extname(file.name).toLowerCase()] || '').startsWith('video/')
                ? 'video'
                : 'image',
              exif,
            },
            p.targetPhoto,
          );
          this.jobs.db
            .prepare("UPDATE upload_files SET state='done',result=? WHERE batch_id=? AND key=?")
            .run(json(result), jobId, key);
        }
      } finally {
        if (own) cat.close();
      }
      const done = this.jobs.db
        .prepare(
          "SELECT COUNT(*) AS n FROM upload_files WHERE batch_id=? AND state IN('done','skipped')",
        )
        .get(jobId).n;
      this.jobs.update(jobId, {
        done,
        state: done === job.total ? 'completed' : 'waiting_source',
        phase: done === job.total ? '导入完成' : '等待后续文件',
      });
      return { offset: written, state: result.skipped ? 'skipped' : 'done', result };
    } catch (error) {
      const job = this.jobs.get(jobId);
      if (job) {
        const temp = join(job.payload.root, 'uploads', jobId + '-' + key + '.part');
        const actual = await stat(temp).then(
          (s) => s.size,
          () => 0,
        );
        this.jobs.db
          .prepare(
            "UPDATE upload_files SET offset=?,state='error',error=? WHERE batch_id=? AND key=? AND state NOT IN('done','skipped')",
          )
          .run(actual, error.message, jobId, key);
        this.jobs.update(jobId, {
          state: 'failed',
          error: error.message,
          phase: '导入中断，可重选来源继续',
        });
      }
      throw error;
    } finally {
      release();
      if (this.locks.get(lockKey) === lock) this.locks.delete(lockKey);
    }
  }
  async handle(request, response, url) {
    const path = url.pathname.replace(/^\/api\/v2/, '');
    const method = request.method;
    const send = (value, status = 200, headers = {}) => {
      response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...headers,
      });
      response.end(json(value));
      return true;
    };
    const input = async () =>
      parse((await body(request)).toString(), null) || fail('JSON 请求格式不正确');
    const filter = () =>
      url.searchParams.has('filter')
        ? parse(url.searchParams.get('filter'), null) || fail('查询条件无效')
        : Object.fromEntries(url.searchParams);
    try {
      if (path === '/places' && method === 'GET')
        return send(await this.placeSearch.query(Object.fromEntries(url.searchParams)));
      if (path === '/stocks' && method === 'POST') {
        const c = this.c(),
          data = await input(),
          stock = validateCustomStock(data, 'custom-' + uid()),
          items = c.getMeta('customStocks') || [];
        if (items.length >= 2000) fail('自定义胶片已达 2000 种');
        items.push(stock);
        c.setMeta('customStocks', items);
        return send(stock, 201);
      }
      if (path === '/demo/open' && method === 'POST') {
        const data = await input();
        const marker = JSON.parse(await readFile(join(data.root, 'DEMO-LIBRARY.json'), 'utf8'));
        if (!marker.demo) fail('不是演示资料库');
        const old = this.root;
        const result = await this.switchRoot(data.root);
        let cfg = parse(await readFile(join(this.home, 'session.json'), 'utf8'));
        if (
          !(await stat(join(old, 'DEMO-LIBRARY.json')).then(
            () => true,
            () => false,
          ))
        )
          cfg.demoPreviousRoot = old;
        await writeFile(join(this.home, 'session.json'), json(cfg));
        return send(result);
      }
      if (path === '/demo/return' && method === 'POST') {
        const cfg = parse(await readFile(join(this.home, 'session.json'), 'utf8'));
        if (!cfg.demoPreviousRoot) fail('没有记录正式资料库位置，请使用打开资料库');
        return send(await this.switchRoot(cfg.demoPreviousRoot));
      }
      if (path === '/books' && method === 'GET') return send(bookStore(this.c()).list());
      if (path === '/books' && method === 'POST')
        return send(bookStore(this.c()).save(await input()), 201);
      const bookRoute = /^\/books\/([^/]+)(?:\/(preflight))?$/.exec(path);
      if (bookRoute) {
        const store = bookStore(this.c());
        if (method === 'GET') {
          const book = store.get(bookRoute[1]);
          return send(
            bookRoute[2]
              ? bookPreflight(book, (id) => this.c().query({ id, limit: 1 }).items[0])
              : book,
          );
        }
        if (method === 'PATCH') {
          const data = await input(),
            c = this.c();
          if (data.patch?.deleted_at !== null) fail('此接口仅用于恢复画册');
          return send(
            c.transaction(() => {
              const before = c.raw('books', bookRoute[1]);
              if (!before) fail('画册不存在', 404);
              c.db
                .prepare('UPDATE books SET deleted_at=NULL,version=version+1 WHERE id=?')
                .run(bookRoute[1]);
              c.record('恢复画册', [
                { table: 'books', id: bookRoute[1], before, after: c.raw('books', bookRoute[1]) },
              ]);
              return store.get(bookRoute[1]);
            }),
          );
        }
        if (method === 'PUT') return send(store.save(await input(), bookRoute[1]));
        if (method === 'DELETE') return send(store.remove(bookRoute[1]));
      }
      if (path === '/bootstrap' && method === 'GET')
        return send({
          version: 2,
          experimentalMode:
            process.argv.includes('--debug') ||
            process.argv.includes('--demo') ||
            process.env.FILMALBUM_DEBUG === '1',
          root: this.root,
          home: this.home,
          error: this.error,
          lists: this.catalog?.lists(),
          facets: this.catalog?.facets(),
          stats: this.catalog?.stats(),
          native: process.platform === 'darwin',
          capabilities: nativeCapabilities(),
        });
      if (path === '/jobs' && method === 'GET') return send(this.jobs.list());
      const jobRoute = /^\/jobs\/([^/]+)(?:\/(pause|resume|cancel))?$/.exec(path);
      if (jobRoute) {
        const id = decodeURIComponent(jobRoute[1]);
        if (method === 'GET') return send(this.jobs.get(id));
        if (method === 'POST' && jobRoute[2]) {
          const result = this.jobs.control(id, jobRoute[2]);
          if (result.kind === 'upload' && result.state === 'cancelled') {
            for (const file of this.jobs.db
              .prepare(
                "SELECT key FROM upload_files WHERE batch_id=? AND state NOT IN('done','skipped')",
              )
              .all(id)) {
              if (!this.locks.has(id + ':' + file.key))
                await unlink(
                  join(result.payload.root, 'uploads', id + '-' + file.key + '.part'),
                ).catch(() => {});
            }
          }
          this.worker?.postMessage({ op: 'wake' });
          return send(result);
        }
      }
      if (path === '/backups' && method === 'GET')
        return send(await this.backups(url.searchParams.get('root')));
      if (path === '/switch' && method === 'POST')
        return send(await this.switchRoot((await input()).root));
      if (path === '/jobs' && method === 'POST') {
        const data = await input();
        if (
          ![
            'index',
            'external-import',
            'previews',
            'analyze',
            'backup',
            'verify',
            'restore',
            'pdf',
            'book-pdf',
            'demo',
            'integrity',
          ].includes(data.kind)
        )
          fail('任务类型无效');
        if (['verify', 'restore'].includes(data.kind)) {
          if (!safe(data.snapshotId)) fail('备份编号无效');
        } else if (data.kind !== 'demo') this.c();
        return send(
          this.enqueue(
            data.kind,
            data.label ||
              {
                index: '检查原片',
                'external-import': '引用导入',
                previews: '生成离线预览',
                analyze: '本地识图',
                backup: '增量备份',
                verify: '验证备份',
                restore: '恢复资料库',
                pdf: '导出摄影文档',
                'book-pdf': '导出定制画册',
                demo: '生成演示资料库',
                integrity: '数据库完整性检查',
              }[data.kind],
            data,
          ),
          202,
        );
      }
      if (path === '/imports' && method === 'POST')
        return send(await this.uploadCreate(await input()), 201);
      const imp = /^\/imports\/([^/]+)(?:\/([^/]+))?$/.exec(path);
      if (imp) {
        if (method === 'POST' && imp[2] && url.searchParams.has('reset')) {
          const job = this.jobs.get(imp[1]);
          if (!job || job.kind !== 'upload') fail('导入任务不存在', 404);
          if (this.locks.has(imp[1] + ':' + imp[2])) fail('当前文件仍在传输，请稍后重试', 409);
          await unlink(join(job.payload.root, 'uploads', imp[1] + '-' + imp[2] + '.part')).catch(
            () => {},
          );
          this.jobs.db
            .prepare(
              "UPDATE upload_files SET offset=0,state='pending',error=NULL WHERE batch_id=? AND key=? AND state NOT IN('done','skipped')",
            )
            .run(imp[1], imp[2]);
          return send({ ok: true });
        }
        if (method === 'GET') return send(this.uploadState(imp[1]));
        if (method === 'PUT' && imp[2])
          return send(
            await this.uploadChunk(imp[1], imp[2], url.searchParams.get('offset'), request),
          );
      }
      if (path === '/settings' && method === 'PUT') {
        const data = await input(),
          c = this.c();
        c.setMeta('settings', { ...c.getMeta('settings'), ...data });
        if (data.libraryName) c.setMeta('libraryName', data.libraryName);
        return send({ ok: true });
      }
      if (path === '/presets' && method === 'POST') {
        const c = this.c(),
          data = await input(),
          presets = c.getMeta('presets') || [];
        presets.push({ id: uid(), name: data.name, metadata: data.metadata });
        c.setMeta('presets', presets.slice(-100));
        return send(presets);
      }
      if (path === '/trash-lists' && method === 'GET')
        return send(
          ['collections', 'projects', 'books'].flatMap((table) =>
            this.c()
              .db.prepare(
                `SELECT * FROM ${table} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 200`,
              )
              .all()
              .map((row) => ({ ...this.c().dto(table, row), entity: table })),
          ),
        );
      if (path === '/history' && method === 'GET') return send(this.c().history());
      const history = /^\/history\/([^/]+)\/(undo|redo)$/.exec(path);
      if (history && method === 'POST')
        return send(this.c().undo(history[1], history[2] === 'redo'));
      if (path === '/facets' && method === 'GET') return send(this.c().facets());
      if (path === '/stats' && method === 'GET') return send(this.c().stats());
      if (path === '/health' && method === 'GET')
        return send({ ...this.health(), previews: await previewStatus(this.c()) });
      if (path === '/atlas' && method === 'GET') return send(this.c().atlas(filter()));
      if (path === '/random' && method === 'GET') {
        const row = this.c()
          .db.prepare(
            'SELECT r.id FROM rolls r WHERE r.deleted_at IS NULL AND EXISTS(SELECT 1 FROM photos WHERE roll_id=r.id AND deleted_at IS NULL) ORDER BY random() LIMIT 1',
          )
          .get();
        return send(row || null);
      }
      if (path === '/batch-preview' && method === 'POST') {
        const data = await input(),
          c = this.c();
        return send({
          count: c.selectIds(data.entity, data.selection).length,
          revision: c.revision(),
        });
      }
      if (path === '/batch' && method === 'POST') {
        const data = await input();
        return send(this.c().batch(data.entity, data.selection, data.patch, data.label));
      }
      if (path === '/purge-plan' && method === 'GET') return send(this.c().purgePlan());
      if (path === '/purge' && method === 'POST') {
        const data = await input();
        if (data.confirm !== '永久清空回收站') fail('请先输入完整确认文字');
        const result = this.c().purge();
        let removed = 0;
        for (const m of result.unused) {
          if (m.managed) {
            const path = resolve(m.root, m.path);
            if (!path.startsWith(resolve(m.root) + sep)) continue;
            await unlink(path).catch(() => {});
            await unlink(path.replace(/\.bin$/, '.json')).catch(() => {});
            removed++;
          }
          for (const edge of [0, 320, 640, 1600, 2048]) {
            const cache = join(this.root, 'previews', `${m.id}-${edge}.jpg`);
            await unlink(cache).catch(() => {});
            await unlink(cache + '.json').catch(() => {});
          }
        }
        return send({ photos: result.photos, removed });
      }
      if (path === '/rolls' && method === 'GET') return send(this.c().query(filter(), 'rolls'));
      if (path === '/rolls' && method === 'POST') {
        const data = await input();
        return send(
          this.c().transaction(() => this.c().createRoll(data)),
          201,
        );
      }
      if (path === '/photos' && method === 'GET') return send(this.c().query(filter(), 'photos'));
      const detail = /^\/(rolls|photos|projects|collections|versions)\/([^/]+)$/.exec(path);
      if (detail) {
        const entity = detail[1],
          id = decodeURIComponent(detail[2]);
        if (method === 'GET') {
          if (entity === 'photos') {
            const value = this.c().query({ id, trash: url.searchParams.has('trash'), limit: 1 })
              .items[0];
            if (!value) fail('照片不存在', 404);
            return send({ ...value, versions: this.c().versions(id) });
          }
          return send(this.c().row(entity, id));
        }
        if (method === 'PATCH') {
          const data = await input();
          return send(
            this.c().patch(entity, id, data.patch || data, data.expectedVersion, data.label),
          );
        }
      }
      const labels = /^\/rolls\/([^/]+)\/qr\.svg$/.exec(path);
      if (labels && method === 'GET') {
        const roll = this.c().row('rolls', decodeURIComponent(labels[1]));
        response.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' });
        response.end(qrSvg(`FILMALBUM:${roll.code}`));
        return true;
      }
      if (path === '/barcode' && method === 'POST') {
        const buffer = await body(request, 24 * 1024 * 1024),
          folder = join(this.home, 'uploads');
        await mkdir(folder, { recursive: true });
        const temp = join(folder, 'barcode-' + uid());
        try {
          await writeFile(temp, buffer);
          const result = await native(this.home, 'barcode', temp);
          const code = result.codes?.find((code) => code.startsWith('FILMALBUM:'))?.slice(10);
          return send({
            codes: result.codes,
            roll: code
              ? this.c().db.prepare('SELECT id,code,name FROM rolls WHERE code=?').get(code)
              : null,
          });
        } finally {
          await unlink(temp).catch(() => {});
        }
      }
      if (['/collections', '/projects'].includes(path) && method === 'POST')
        return send(this.c().createList(path.slice(1), await input()), 201);
      const members = /^\/(collections|projects)\/([^/]+)\/members$/.exec(path);
      if (members && method === 'POST') {
        const data = await input();
        return send(this.c().membership(members[1], members[2], data.ids, Boolean(data.remove)));
      }
      const colOrder = /^\/collections\/([^/]+)\/reorder$/.exec(path);
      if (colOrder && method === 'POST') {
        const data = await input();
        return send(this.c().reorderCollection(colOrder[1], data.photoId, data.beforeId));
      }
      const reorder = /^\/projects\/([^/]+)\/reorder$/.exec(path);
      if (reorder && method === 'POST') {
        const data = await input();
        return send(this.c().reorder(reorder[1], data.photoId, data.beforeId));
      }
      const organize = /^\/projects\/([^/]+)\/organize$/.exec(path);
      if (organize && method === 'POST') {
        const data = await input();
        return send(this.c().organize(organize[1], data.ids, data.patch || {}));
      }
      const items = /^\/projects\/([^/]+)\/items$/.exec(path);
      if (items && method === 'GET') return send(this.c().projectItems(items[1]));
      const item = /^\/items\/([^/]+)$/.exec(path);
      if (item && method === 'PATCH') {
        const data = await input();
        return send(this.c().patchItem(item[1], data.patch, data.expectedVersion));
      }
      if (path === '/storages' && method === 'POST') {
        const value = await input();
        const storage = this.c().registerStorage(value);
        this.worker?.postMessage({ op: 'watch', root: this.root });
        return send(storage, 201);
      }
      const storage = /^\/storages\/([^/]+)$/.exec(path);
      if (storage && method === 'PATCH') {
        const data = await input();
        if (storage[1] === 'managed') fail('主资料库存储位置通过资料库切换管理');
        const old = this.c().raw('storages', storage[1]);
        if (!old) fail('存储卷不存在', 404);
        const root = data.root ? await realpath(resolve(data.root)) : old.root;
        if (
          root === parsePath(root).root ||
          !(await stat(root).then(
            (s) => s.isDirectory(),
            () => false,
          ))
        )
          fail('请选择具体的照片文件夹');
        for (const item of this.c()
          .db.prepare('SELECT id,root FROM storages WHERE id<>?')
          .all(old.id))
          if (
            root === item.root ||
            root.startsWith(item.root + sep) ||
            item.root.startsWith(root + sep)
          )
            fail('此目录与其他存储卷重叠');
        if (
          await stat(join(root, 'catalog.sqlite')).then(
            () => true,
            () => false,
          )
        )
          fail('请选择照片文件夹，资料库请通过打开资料库切换');
        this.c()
          .db.prepare('UPDATE storages SET root=?,name=?,enabled=?,data=? WHERE id=?')
          .run(
            root,
            data.name || old.name,
            data.enabled === undefined ? old.enabled : data.enabled ? 1 : 0,
            json({ ...parse(old.data), watch: data.watch ?? parse(old.data).watch }),
            old.id,
          );
        this.worker?.postMessage({ op: 'watch', root: this.root });
        this.enqueue('index', '重连存储卷', { all: true });
        return send({ ok: true });
      }
      const media = /^\/(media|preview)\/([^/]+)$/.exec(path);
      if (media && ['GET', 'HEAD'].includes(method)) {
        const id = decodeURIComponent(media[2]),
          m = this.c().mediaPath(id);
        let target = { path: m.absolute, mime: m.mime };
        if (media[1] === 'preview') {
          target = await this.previews.get(
            this.c(),
            id,
            Number(url.searchParams.get('edge') || 640),
          );
          if (target.offline) response.setHeader('X-FilmAlbum-Preview', 'offline-cache');
        } else if (url.searchParams.get('download') === '1') {
          if (
            !(await stat(m.absolute).then(
              (s) => s.isFile(),
              () => false,
            ))
          )
            fail('原片当前不在线，请连接存储盘并检查原片；离线预览不能作为原片导出。', 404);
          const photo = this.c()
            .db.prepare(
              'SELECT p.name FROM photos p JOIN versions v ON v.photo_id=p.id WHERE v.media_id=? LIMIT 1',
            )
            .get(id);
          response.setHeader(
            'Content-Disposition',
            attachmentHeader(
              mediaFileName(
                url.searchParams.get('name') || photo?.name || basename(m.path),
                m.mime,
              ),
            ),
          );
        }
        await this.stream(request, response, target.path, target.mime);
        return true;
      }

      const repair = /^\/repair\/([^/]+)$/.exec(path);
      if (repair && method === 'PUT')
        return send(await this.repair(decodeURIComponent(repair[1]), request));
      const download = /^\/exports\/([a-zA-Z0-9-]+\.pdf)$/.exec(path);
      if (download && ['GET', 'HEAD'].includes(method)) {
        const file = download[1];
        if (
          !(await stat(join(this.home, 'exports', file)).then(
            (s) => s.isFile(),
            () => false,
          ))
        )
          fail('导出文件不存在，请重新生成 PDF。', 404);
        const filename = this.jobs.get(file.slice(0, -4))?.result?.filename || 'FilmAlbum-' + file;
        response.setHeader('Content-Disposition', attachmentHeader(filename));
        await this.stream(request, response, join(this.home, 'exports', file), 'application/pdf');
        return true;
      }

      return send({ error: '接口不存在' }, 404);
    } catch (error) {
      if (!response.headersSent) return send({ error: error.message }, error.status || 500);
      response.destroy();
      return true;
    }
  }
}
import { readFileSync as requireRead } from 'node:fs';
