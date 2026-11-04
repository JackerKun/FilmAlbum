import { safeFileName } from '../shared/file-names.mjs';
import { seedDemo } from './demo.mjs';
import { bookStore, bookPreflight } from './books.mjs';
import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync, backup } from 'node:sqlite';
import {
  mkdir,
  readdir,
  opendir,
  readFile,
  writeFile,
  stat,
  rename,
  unlink,
  copyFile,
  access,
} from 'node:fs/promises';
import { createReadStream, createWriteStream, watch } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import { join, resolve, relative, extname, basename } from 'node:path';
import { Catalog, uid, json, parse } from './catalog.mjs';
import { Jobs } from './jobs.mjs';
import { native } from './native.mjs';
import { qrMatrix } from '../shared/qr.mjs';
const home = workerData.home,
  jobs = new Jobs(home);
let running = false,
  current = null,
  watchers = [],
  watchRoot = null,
  indexTimer;
const pending = new Set();
const exists = (p) =>
  access(p).then(
    () => true,
    () => false,
  );
const hashFile = async (path) => {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest('hex');
};
const mime = (path) =>
  ({
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.heic': 'image/heic',
    '.gif': 'image/gif',
    '.avif': 'image/avif',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.m4v': 'video/mp4',
    '.svg': 'image/svg+xml',
  })[extname(path).toLowerCase()] || 'application/octet-stream';
const imageExt =
  /\.(jpg|jpeg|png|webp|tif|tiff|heic|gif|avif|bmp|dng|nef|arw|cr2|cr3|raf|mp4|mov|m4v|svg)$/i;
function control(job) {
  const state = jobs.get(job.id)?.state;
  if (['pause_requested', 'cancel_requested', 'cancelled', 'paused'].includes(state))
    throw Object.assign(new Error(state), {
      control: state.startsWith('cancel') ? 'cancelled' : 'paused',
    });
}
function tick(job, done, total, phase, cursor) {
  control(job);
  jobs.update(job.id, {
    done,
    total,
    phase,
    ...(cursor !== undefined ? { payload: { ...jobs.get(job.id).payload, cursor } } : {}),
  });
  parentPort.postMessage({ type: 'progress', id: job.id });
}
async function* walk(root, path = root) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) yield* walk(root, child);
    else if (entry.isFile() && imageExt.test(entry.name))
      yield { path: child, relative: relative(root, child) };
  }
}
async function ensurePreview(catalog, media, edge = 640, strictEdge = false) {
  const source = catalog.mediaPath(media.id),
    dir = join(catalog.root, 'previews');
  await mkdir(dir, { recursive: true });
  const target = join(dir, `${media.id}-${edge}.jpg`);
  let info;
  try {
    info = await stat(source.absolute);
  } catch {
    if (await exists(target)) return target;
    const small = join(catalog.root, 'previews', `${media.id}-640.jpg`);
    if (!strictEdge && (await exists(small))) return small;
    throw new Error('原片离线且没有所需缓存预览，请连接存储盘后生成');
  }
  const signature = `${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
  try {
    if (
      parse(await readFile(target + '.json', 'utf8')).signature === signature &&
      (await stat(target).then(
        (s) => s.isFile() && s.size > 0,
        () => false,
      ))
    )
      return target;
  } catch {}
  const temp = target + '.' + uid() + '.tmp.jpg';
  try {
    await native(home, 'preview', source.absolute, temp, edge);
    const after = await stat(source.absolute);
    if (`${after.size}:${after.mtimeMs}:${after.ctimeMs}` !== signature)
      throw new Error('生成预览时原片发生变化，请重新检查');
    await rename(temp, target);
    await writeFile(target + '.json', json({ signature }));
    return target;
  } finally {
    await unlink(temp).catch(() => {});
  }
}
async function* mediaPages(catalog, ids = null, cursor = '') {
  let last = cursor;
  while (true) {
    const condition = ids?.length ? ` AND id IN(${ids.map(() => '?').join(',')})` : '';
    const page = catalog.db
      .prepare(`SELECT * FROM media WHERE id>?${condition} ORDER BY id LIMIT 100`)
      .all(last, ...(ids || []));
    if (!page.length) break;
    for (const row of page) yield row;
    last = page.at(-1).id;
  }
}
async function index(job, catalog) {
  let done = job.done || 0;
  const total = catalog.db.prepare('SELECT COUNT(*) AS n FROM media').get().n,
    volumeStatus = new Map();
  for await (const row of mediaPages(
    catalog,
    job.payload.ids?.length && !job.payload.all ? job.payload.ids : null,
    job.payload.cursor || '',
  )) {
    control(job);
    const media = catalog.mediaPath(row.id);
    try {
      let online = volumeStatus.get(media.storage_id);
      if (online === undefined) {
        online = await stat(media.root).then(
          (s) => s.isDirectory(),
          () => false,
        );
        volumeStatus.set(media.storage_id, online);
      }
      if (!online)
        catalog.db.prepare("UPDATE media SET availability='offline' WHERE id=?").run(row.id);
      else {
        const before = await stat(media.absolute);
        if (!before.isFile()) throw new Error('不是普通文件');
        let hash = row.hash;
        if (
          job.payload.force ||
          row.availability === 'changed' ||
          !hash ||
          row.size !== before.size ||
          row.mtime !== before.mtimeMs ||
          row.ctime !== before.ctimeMs
        )
          hash = await hashFile(media.absolute);
        const after = await stat(media.absolute);
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
          catalog.db.prepare("UPDATE media SET availability='changing' WHERE id=?").run(row.id);
        else if (row.hash && row.hash !== hash)
          catalog.db
            .prepare("UPDATE media SET availability='changed',mtime=?,ctime=? WHERE id=?")
            .run(after.mtimeMs, after.ctimeMs, row.id);
        else
          catalog.db
            .prepare(
              "UPDATE media SET availability='ready',size=?,hash=?,mtime=?,ctime=? WHERE id=?",
            )
            .run(after.size, hash, after.mtimeMs, after.ctimeMs, row.id);
      }
    } catch (error) {
      catalog.db
        .prepare('UPDATE media SET availability=? WHERE id=?')
        .run(error.code === 'ENOENT' ? 'missing' : 'error', row.id);
    }
    tick(job, ++done, total, '核对原片与哈希', row.id);
  }
  let orphanCount = 0;
  const orphans = [];
  try {
    for await (const entry of await opendir(join(catalog.root, 'media'))) {
      if (!entry.isFile() || !entry.name.endsWith('.bin')) continue;
      if (
        !catalog.db
          .prepare("SELECT id FROM media WHERE storage_id='managed' AND path=?")
          .get('media/' + entry.name)
      ) {
        orphanCount++;
        if (orphans.length < 200) {
          const info = await stat(join(catalog.root, 'media', entry.name));
          orphans.push({ path: 'media/' + entry.name, size: info.size });
        }
      }
    }
  } catch {}
  catalog.setMeta('orphans', { count: orphanCount, files: orphans, checkedAt: Date.now() });
  return { indexed: done, orphans: orphanCount };
}
async function externalImport(job, catalog) {
  const storage = catalog.raw('storages', job.payload.storageId);
  if (!storage) throw new Error('存储卷不存在');
  const groups = new Map(),
    counts = { added: 0, existing: 0, ready: 0, failed: 0, failures: [] };
  let done = 0;
  for await (const file of walk(storage.root)) {
    control(job);
    const old = catalog.db
      .prepare('SELECT id FROM media WHERE storage_id=? AND path=?')
      .get(storage.id, file.relative);
    let mediaId = old?.id;
    if (old) counts.existing++;
    else {
      const group = relative(storage.root, resolve(file.path, '..')) || basename(storage.root);
      let rollId = groups.get(group);
      if (!rollId) {
        const previous = catalog.db
          .prepare(
            "SELECT id FROM rolls WHERE json_extract(data,'$.sourceStorage')=? AND json_extract(data,'$.sourceFolder')=? AND deleted_at IS NULL",
          )
          .get(storage.id, group);
        rollId =
          previous?.id ||
          catalog.transaction(() =>
            catalog.createRoll({
              ...job.payload.metadata,
              name: group,
              sourceStorage: storage.id,
              sourceFolder: group,
            }),
          ).id;
        groups.set(group, rollId);
      }
      const info = await stat(file.path),
        exif = await native(home, 'metadata', file.path).catch(() => ({})),
        hash = await hashFile(file.path);
      mediaId = catalog.addMedia({
        storage_id: storage.id,
        path: file.relative,
        mime: mime(file.path),
        size: info.size,
        hash,
        mtime: info.mtimeMs,
        ctime: info.ctimeMs,
      });
      catalog.addPhoto(rollId, mediaId, {
        name: basename(file.path),
        type: mime(file.path).startsWith('video/') ? 'video' : 'image',
        exif,
      });
      counts.added++;
    }
    if (job.payload.offlinePreviews && !mime(file.path).startsWith('video/'))
      try {
        await ensurePreview(catalog, { id: mediaId }, 640, true);
        await ensurePreview(catalog, { id: mediaId }, 1600, true);
        counts.ready++;
      } catch (error) {
        counts.failed++;
        if (counts.failures.length < 50)
          counts.failures.push({ id: mediaId, message: error.message });
      }
    tick(job, ++done, done, '引用导入并检查预览');
  }
  return { ...counts, visited: done, complete: counts.failed === 0 };
}
const translations = {
  night: '夜景',
  nighttime: '夜景',
  rain: '雨',
  mountain: '山地',
  mountains: '山地',
  beach: '海边',
  ocean: '海边',
  sea: '海边',
  person: '人像',
  people: '人像',
  portrait: '人像',
  street: '街拍',
  city: '城市',
  urban: '城市',
  flower: '花卉',
  flowers: '花卉',
  tree: '树林',
  forest: '树林',
  snow: '雪景',
  sunset: '日落',
  building: '建筑',
  architecture: '建筑',
  animal: '动物',
  dog: '狗',
  cat: '猫',
  food: '美食',
  red: '红色',
  blue: '蓝色',
  green: '绿色',
};
async function imageJob(job, catalog, analyze = false) {
  let rows;
  if (job.payload.selection?.ids?.length) {
    rows = job.payload.selection.ids
      .map((id) => catalog.query({ id, limit: 1 }).items[0])
      .filter(Boolean)
      .map((row) => ({ id: row.mediaId }));
  } else {
    const filter = catalog.filters(job.payload.selection?.query || {});
    rows = catalog.db
      .prepare(
        `SELECT DISTINCT m.id FROM photos p JOIN rolls r ON r.id=p.roll_id JOIN versions v ON v.id=p.primary_version JOIN media m ON m.id=v.media_id WHERE ${filter.sql} ORDER BY m.id`,
      )
      .all(...filter.args);
  }
  rows = [...new Map(rows.map((row) => [row.id, row])).values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const counts = { ready: 0, failed: 0, skipped: 0, failures: [], ...job.payload.imageProgress };
  let done = job.done || 0;
  const total = rows.length;
  for (const { id } of rows.filter((row) => row.id > (job.payload.cursor || ''))) {
    control(job);
    const media = catalog.mediaPath(id);
    if (media.mime.startsWith('video/')) counts.skipped++;
    else
      try {
        if (analyze) {
          const result = await native(home, 'analyze', media.absolute);
          result.words = [
            ...new Set(
              [
                ...(result.labels || [])
                  .flatMap((label) => [label.label, ...label.label.split(/[_ ,]+/)])
                  .flatMap((word) => [word, translations[word]].filter(Boolean)),
                result.dominant,
                translations[result.dominant],
              ].filter(Boolean),
            ),
          ];
          result.analyzedAt = Date.now();
          result.hash = media.hash;
          catalog.db.prepare('UPDATE media SET analysis=? WHERE id=?').run(json(result), id);
          for (const photo of catalog.db
            .prepare('SELECT photo_id FROM versions WHERE media_id=?')
            .all(id))
            catalog.indexPhoto(photo.photo_id);
        } else {
          await ensurePreview(catalog, { id }, 640, true);
          await ensurePreview(catalog, { id }, 1600, true);
        }
        counts.ready++;
      } catch (error) {
        counts.failed++;
        if (counts.failures.length < 50) counts.failures.push({ id, message: error.message });
      }
    jobs.update(job.id, { payload: { ...jobs.get(job.id).payload, imageProgress: counts } });
    tick(job, ++done, total, analyze ? '本地识图与 OCR' : '缓存离线浏览影像（640 / 1600）', id);
  }
  return {
    processed: done,
    ...counts,
    complete: counts.failed === 0,
    previewEdges: analyze ? undefined : [640, 1600],
  };
}
async function backupLibrary(job, catalog) {
  const base = resolve(job.payload.backupRoot || join(home, 'backups')),
    snapshots = join(base, 'snapshots'),
    objects = join(base, 'objects'),
    id = job.payload.snapshotId || uid(),
    folder = join(snapshots, id);
  await mkdir(folder, { recursive: true });
  await mkdir(objects, { recursive: true });
  const dbPath = join(folder, 'catalog.sqlite');
  await backup(catalog.db, dbPath, { rate: 128 }); // Snapshot retains its original volume roots until media objects have been copied.
  const db = new DatabaseSync(dbPath);
  const media = db
    .prepare('SELECT m.*,s.root FROM media m JOIN storages s ON s.id=m.storage_id ORDER BY m.id')
    .all();
  let done = 0,
    newBytes = 0;
  const manifest = {
    version: 1,
    id,
    title: job.payload.title || `备份 ${new Date().toLocaleString('zh-CN')}`,
    createdAt: Date.now(),
    sourceRoot: catalog.root,
    files: [],
    missing: [],
    complete: false,
  };
  try {
    for (const m of media) {
      control(job);
      const path = resolve(m.root, m.path);
      const part = join(objects, '.' + uid() + '.tmp');
      try {
        const before = await stat(path),
          h = createHash('sha256');
        let size = 0;
        const transform = new Transform({
          transform(chunk, encoding, callback) {
            h.update(chunk);
            size += chunk.length;
            callback(null, chunk);
          },
        });
        await pipeline(createReadStream(path), transform, createWriteStream(part, { flags: 'wx' }));
        const after = await stat(path);
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
          throw new Error('原片在备份时发生变化');
        const hash = h.digest('hex');
        if (m.hash && m.hash !== hash) throw new Error('原片与已记录 SHA-256 不一致');
        const target = join(objects, hash);
        if (await exists(target)) {
          if ((await stat(target)).size !== size || (await hashFile(target)) !== hash)
            throw new Error('已有备份对象校验失败');
          await unlink(part);
        } else {
          await rename(part, target);
          newBytes += size;
        }
        manifest.files.push({ id: m.id, hash, size, mime: m.mime });
        db.prepare('UPDATE media SET hash=?,size=? WHERE id=?').run(hash, size, m.id);
      } catch (error) {
        manifest.missing.push({ id: m.id, path, error: error.message });
        await unlink(part).catch(() => {});
      }
      done++;
      tick(job, done, media.length, '备份原片对象', m.id);
    }
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {
    db.close();
  }
  manifest.catalogHash = await hashFile(dbPath);
  manifest.complete = manifest.missing.length === 0;
  manifest.newBytes = newBytes;
  await writeFile(join(folder, 'manifest.json.tmp'), json(manifest));
  await rename(join(folder, 'manifest.json.tmp'), join(folder, 'manifest.json'));
  catalog.setMeta('lastBackup', Date.now());
  return {
    snapshotId: id,
    backupRoot: base,
    complete: manifest.complete,
    files: manifest.files.length,
    missing: manifest.missing.length,
    newBytes,
  };
}
async function verifyBackup(job) {
  const root = resolve(job.payload.backupRoot || join(home, 'backups')),
    id = job.payload.snapshotId;
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('无效备份编号');
  const folder = join(root, 'snapshots', id),
    manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
  if ((await hashFile(join(folder, 'catalog.sqlite'))) !== manifest.catalogHash)
    throw new Error('备份目录数据库校验失败');
  let done = 0;
  for (const file of manifest.files) {
    control(job);
    if (!/^[a-f0-9]{64}$/.test(file.hash)) throw new Error('备份对象编号无效');
    if ((await hashFile(join(root, 'objects', file.hash))) !== file.hash)
      throw new Error(`备份原片校验失败：${file.id}`);
    tick(job, ++done, manifest.files.length, '校验备份对象');
  }
  const db = new DatabaseSync(join(folder, 'catalog.sqlite'), { readOnly: true });
  try {
    const check = db.prepare('PRAGMA integrity_check').get().integrity_check;
    if (check !== 'ok') throw new Error(check);
    return {
      verified: true,
      complete: manifest.complete,
      files: manifest.files.length,
      missing: manifest.missing.length,
      rolls: db.prepare('SELECT COUNT(*) AS n FROM rolls WHERE deleted_at IS NULL').get().n,
      photos: db.prepare('SELECT COUNT(*) AS n FROM photos').get().n,
    };
  } finally {
    db.close();
  }
}
async function restoreBackup(job) {
  const verification = await verifyBackup(job);
  if (!verification.complete && !job.payload.allowPartial)
    throw new Error('此备份缺少原片；需在恢复预览中明确允许部分恢复');
  const base = resolve(job.payload.backupRoot || join(home, 'backups')),
    folder = join(base, 'snapshots', job.payload.snapshotId),
    manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8')),
    destination = resolve(job.payload.destination);
  if (destination === home || destination === job.payload.root)
    throw new Error('恢复必须使用新的资料库文件夹');
  if (await exists(destination)) {
    if ((await readdir(destination)).length) {
      const marker = parse(
        await readFile(join(destination, 'RESTORE-INCOMPLETE.json'), 'utf8').catch(() => ''),
      );
      if (marker.snapshotId !== manifest.id) throw new Error('恢复目标文件夹必须为空');
    }
  }
  await mkdir(join(destination, 'media'), { recursive: true });
  const staging = join(destination, '.restore-' + uid());
  await mkdir(staging);
  try {
    await copyFile(join(folder, 'catalog.sqlite'), join(staging, 'catalog.sqlite'));
    let done = 0;
    for (const file of manifest.files) {
      control(job);
      if (!/^[a-zA-Z0-9._-]+$/.test(file.id)) throw new Error('备份媒体编号无效');
      const target = join(destination, 'media', `${file.id}.bin`);
      if (await exists(target)) {
        if ((await hashFile(target)) !== file.hash)
          throw new Error('恢复目录出现其他文件，已停止以免覆盖');
      } else await copyFile(join(base, 'objects', file.hash), target);
      await writeFile(
        join(destination, 'media', `${file.id}.json`),
        json({ contentType: file.mime, size: file.size }),
      );
      tick(job, ++done, manifest.files.length, '恢复到新资料库');
    }
    const db = new DatabaseSync(join(staging, 'catalog.sqlite'));
    try {
      db.exec('PRAGMA foreign_keys=OFF');
      db.prepare(
        "INSERT OR REPLACE INTO storages(id,name,root,managed,enabled,data) VALUES('managed','本资料库',?,1,1,'{}')",
      ).run(destination);
      db.exec(
        "UPDATE media SET storage_id='managed',path='media/'||id||'.bin',availability='missing';DELETE FROM storages WHERE id<>'managed';DELETE FROM history;",
      );
      for (const file of manifest.files)
        db.prepare("UPDATE media SET availability='ready' WHERE id=?").run(file.id);
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } finally {
      db.close();
    }
    await rename(join(staging, 'catalog.sqlite'), join(destination, 'catalog.sqlite'));
    await writeFile(
      join(destination, 'RESTORED.json'),
      json({ snapshotId: manifest.id, time: Date.now(), verification }),
    );
    await unlink(join(destination, 'RESTORE-INCOMPLETE.json')).catch(() => {});
    return { destination, ...verification };
  } catch (error) {
    await writeFile(
      join(destination, 'RESTORE-INCOMPLETE.json'),
      json({ error: error.message, snapshotId: manifest.id }),
    );
    throw error;
  } finally {
    await import('node:fs/promises').then((fs) => fs.rm(staging, { recursive: true, force: true }));
  }
}
async function exportPdf(job, catalog) {
  const items = [];
  if (job.payload.mode === 'labels') {
    const ids = catalog.selectIds('rolls', job.payload.selection || { query: {} });
    for (const id of ids) {
      const roll = catalog.row('rolls', id);
      items.push({ code: roll.code, name: roll.name, matrix: qrMatrix(`FILMALBUM:${roll.code}`) });
    }
  } else {
    const query = {
      ...(job.payload.selection?.query || {}),
      ...(job.payload.year ? { year: job.payload.year } : {}),
      limit: 200,
    };
    const ids = job.payload.selection?.ids;
    let page = 0;
    while (true) {
      const result = ids
        ? {
            items: ids.map((id) => catalog.query({ id, limit: 1 }).items[0]).filter(Boolean),
            pages: 1,
          }
        : catalog.query({ ...query, page });
      for (const photo of result.items) {
        control(job);
        const path = await ensurePreview(catalog, { id: photo.mediaId }, 1600).catch(() => null);
        items.push({
          path,
          name: photo.name,
          caption: `${photo.rollName} · ${photo.frameNo} · ${photo.rating ? '★'.repeat(photo.rating) : ''}`,
        });
        tick(job, items.length, ids?.length || result.total, '准备摄影年鉴');
      }
      if (++page >= result.pages || !result.items.length) break;
    }
  }
  const dir = join(home, 'exports');
  await mkdir(dir, { recursive: true });
  const file = job.id + '.pdf',
    manifest = join(dir, job.id + '.json');
  await writeFile(
    manifest,
    json({ title: job.payload.title || 'Film Album 摄影年鉴', mode: job.payload.mode, items }),
  );
  const result = await native(home, 'pdf', manifest, join(dir, file));
  return {
    file,
    filename: safeFileName(
      (job.payload.title || (job.payload.mode === 'labels' ? '胶卷二维码标签' : '胶片摄影年鉴')) +
        '.pdf',
    ),
    ...result,
  };
}
async function exportBook(job, catalog) {
  const book = bookStore(catalog).get(job.payload.bookId),
    check = bookPreflight(book, (id) => catalog.query({ id, limit: 1 }).items[0]);
  if (check.warnings.some((w) => ['missing', 'offline'].includes(w.issue)))
    throw new Error('存在未装入、离线或内容变化的原片，请修复后导出');
  const pages = structuredClone(book.pages),
    verified = new Set();
  let done = 0;
  for (const page of pages)
    for (const el of page.elements) {
      control(job);
      if (el.type === 'image') {
        const photo = catalog.query({ id: el.photoId, limit: 1 }).items[0];
        const media = catalog.mediaPath(photo.mediaId);
        await stat(media.absolute);
        if (!verified.has(photo.mediaId)) {
          if (media.hash && (await hashFile(media.absolute)) !== media.hash)
            throw new Error('原片哈希发生变化，已停止打印导出');
          verified.add(photo.mediaId);
        }
        el.path = await ensurePreview(catalog, { id: photo.mediaId }, 0);
        if (el.path !== join(catalog.root, 'previews', photo.mediaId + '-0.jpg'))
          throw new Error('打印需要全尺寸原片，不能使用离线缩略图');
        await stat(media.absolute);
        tick(job, ++done, 0, '准备全尺寸画册影像');
      }
    }
  const dir = join(home, 'exports');
  await mkdir(dir, { recursive: true });
  const file = job.id + '.pdf',
    manifest = join(dir, job.id + '.json');
  await writeFile(manifest, json({ ...book, pages }));
  return {
    file,
    filename: safeFileName(book.name + '-打印稿.pdf'),
    ...(await native(home, 'bookpdf', manifest, join(dir, file))),
    preflight: check,
  };
}
async function run() {
  if (running) return;
  running = true;
  try {
    while (true) {
      const row = jobs.db
        .prepare(
          "SELECT id FROM jobs WHERE state='queued' AND kind<>'upload' ORDER BY created_at LIMIT 1",
        )
        .get();
      if (!row) break;
      const job = jobs.get(row.id);
      current = job;
      const claimed = jobs.db
        .prepare("UPDATE jobs SET state='running',updated_at=? WHERE id=? AND state='queued'")
        .run(Date.now(), job.id).changes;
      if (!claimed) continue;
      let catalog;
      try {
        if (!['verify', 'restore', 'demo'].includes(job.kind))
          catalog = new Catalog(job.payload.root, { migrate: false });
        let result;
        switch (job.kind) {
          case 'demo':
            result = await seedDemo(home, (done, total, phase) => tick(job, done, total, phase));
            break;
          case 'index':
            result = await index(job, catalog);
            break;
          case 'external-import':
            result = await externalImport(job, catalog);
            break;
          case 'previews':
            result = await imageJob(job, catalog);
            break;
          case 'analyze':
            result = await imageJob(job, catalog, true);
            break;
          case 'backup':
            result = await backupLibrary(job, catalog);
            break;
          case 'verify':
            result = await verifyBackup(job);
            break;
          case 'restore':
            result = await restoreBackup(job);
            break;
          case 'pdf':
            result = await exportPdf(job, catalog);
            break;
          case 'book-pdf':
            result = await exportBook(job, catalog);
            break;
          case 'integrity':
            result = {
              integrity: catalog.db.prepare('PRAGMA integrity_check').get().integrity_check,
              time: Date.now(),
            };
            catalog.setMeta('integrity', result);
            break;
          default:
            throw new Error('未知任务类型');
        }
        control(job);
        jobs.update(job.id, {
          state: 'completed',
          phase: result.failed ? '处理完成，有 ' + result.failed + ' 项失败' : '已完成',
          error: null,
          result,
        });
      } catch (error) {
        jobs.update(job.id, {
          state: error.control || 'failed',
          error: error.control ? null : error.message,
          phase:
            error.control === 'paused'
              ? '已暂停'
              : error.control === 'cancelled'
                ? '已取消'
                : '失败，可重试',
        });
      } finally {
        catalog?.close();
        current = null;
        parentPort.postMessage({ type: 'completed', id: job.id });
      }
    }
  } finally {
    running = false;
  }
}
function setupWatch(root) {
  for (const w of watchers) w.close();
  watchers = [];
  watchRoot = root;
  try {
    const catalog = new Catalog(root, { migrate: false });
    const queue = (storageId, name) => {
      clearTimeout(indexTimer);
      pending.add(storageId + ':' + String(name || ''));
      indexTimer = setTimeout(() => {
        let c;
        try {
          c = new Catalog(root, { migrate: false });
          const ids = [];
          let all = false;
          for (const key of pending) {
            const [sid, ...rest] = key.split(':'),
              path = rest.join(':');
            if (sid === 'managed') {
              if (/^[\w.-]+\.bin$/.test(path)) ids.push(path.slice(0, -4));
              else if (!path) all = true;
            } else {
              const m = c.db
                .prepare('SELECT id FROM media WHERE storage_id=? AND path=?')
                .get(sid, path);
              if (m) ids.push(m.id);
              else if (parse(c.raw('storages', sid)?.data).watch)
                jobs.enqueue('external-import', '目录自动导入', {
                  root,
                  storageId: sid,
                  offlinePreviews: true,
                });
            }
          }
          pending.clear();
          if (ids.length || all)
            jobs.enqueue('index', '后台文件检查', { root, ids: [...new Set(ids)], all });
          run();
        } finally {
          c?.close();
        }
      }, 500);
    };
    for (const storage of catalog.db.prepare('SELECT * FROM storages WHERE enabled=1').all()) {
      const path = storage.id === 'managed' ? join(root, 'media') : storage.root;
      try {
        const w = watch(path, { recursive: storage.id !== 'managed' }, (event, name) =>
          queue(storage.id, name),
        );
        w.on('error', () => {});
        watchers.push(w);
      } catch {}
    }
    catalog.close();
    const parent = watch(root, (event, name) => {
      if (String(name) === 'media') {
        setupWatch(root);
        jobs.enqueue('index', '重新连接媒体目录', { root, all: true });
        run();
      }
    });
    parent.on('error', () => {});
    watchers.push(parent);
  } catch {}
}
parentPort.on('message', (message) => {
  if (message.op === 'watch') setupWatch(message.root);
  run();
});
setInterval(run, 1500).unref();
run();
