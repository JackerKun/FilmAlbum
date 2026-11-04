import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createReadStream, watch } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const { dataDir } = workerData;
const mediaDir = join(dataDir, 'media');
const libraryFile = join(dataDir, 'library.json');
const db = new DatabaseSync(join(dataDir, 'index.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
if (db.prepare('PRAGMA user_version').get().user_version > 1)
  throw new Error('索引版本高于当前程序，请使用更新的 FilmAlbum');
db.exec(`CREATE TABLE IF NOT EXISTS index_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rolls (id TEXT PRIMARY KEY,name TEXT NOT NULL,position INTEGER NOT NULL,metadata TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS frames (entry_key TEXT PRIMARY KEY,roll_id TEXT NOT NULL,media_id TEXT NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL,position INTEGER NOT NULL,rating INTEGER NOT NULL,color TEXT NOT NULL,metadata TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS frames_media ON frames(media_id);
CREATE INDEX IF NOT EXISTS frames_rating ON frames(rating,color);
CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY,size INTEGER NOT NULL DEFAULT 0,mtime REAL,ctime REAL,sha256 TEXT,status TEXT NOT NULL,error TEXT,seen INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS files_hash ON files(sha256,status);
PRAGMA user_version=1;`);
const fileQuery = db.prepare('SELECT * FROM files WHERE id=?');
const putFile = db.prepare(
  'INSERT INTO files(id,size,mtime,ctime,sha256,status,error,seen) VALUES(?,?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET size=excluded.size,mtime=excluded.mtime,ctime=excluded.ctime,sha256=excluded.sha256,status=excluded.status,error=excluded.error,seen=1',
);
const safeId = (value) => typeof value === 'string' && /^[a-zA-Z0-9._-]{1,160}$/.test(value);
let status = {
  running: false,
  phase: 'waiting',
  done: 0,
  total: 0,
  lastScan: null,
  error: null,
  watching: false,
};
let running = false,
  dirty = false,
  force = false,
  debounce;
function publish() {
  parentPort.postMessage({ type: 'status', status });
}
function putMeta(key, value) {
  db.prepare('INSERT OR REPLACE INTO index_meta(key,value) VALUES(?,?)').run(key, String(value));
}
function meta(key) {
  return db.prepare('SELECT value FROM index_meta WHERE key=?').get(key)?.value;
}
function updateCatalog(library, signature, full) {
  if (!full && meta('catalogSignature') === signature) return;
  if (!Array.isArray(library.rolls)) throw new Error('资料库目录格式无效');
  const putRoll = db.prepare('INSERT INTO rolls VALUES(?,?,?,?)');
  const putFrame = db.prepare('INSERT INTO frames VALUES(?,?,?,?,?,?,?,?,?)');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DELETE FROM frames; DELETE FROM rolls;');
    library.rolls.forEach((roll, position) => {
      if (!safeId(roll.id) || !Array.isArray(roll.frames)) throw new Error('胶卷目录格式无效');
      const { frames, ...metadata } = roll;
      putRoll.run(roll.id, String(roll.name || ''), position, JSON.stringify(metadata));
      frames.forEach((frame, index) => {
        if (!safeId(frame.id)) throw new Error('照片编号格式无效');
        putFrame.run(
          `${roll.id}:${frame.id}`,
          roll.id,
          frame.id,
          String(frame.name || frame.id),
          frame.type || 'image',
          index,
          Number(frame.rating) || 0,
          String(frame.color || ''),
          JSON.stringify(frame),
        );
        db.prepare("INSERT OR IGNORE INTO files(id,status,seen) VALUES(?,'missing',0)").run(
          frame.id,
        );
      });
    });
    putMeta('revision', library.revision || 0);
    putMeta('catalogSignature', signature);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
async function scan(full) {
  status = { ...status, running: true, phase: 'catalog', done: 0, total: 0, error: null };
  publish();
  let library, raw;
  try {
    raw = await readFile(libraryFile, 'utf8');
    library = JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT' && !db.prepare('SELECT COUNT(*) AS n FROM rolls').get().n) {
      library = { rolls: [] };
      raw = '{}';
    } else throw error;
  }
  updateCatalog(library, createHash('sha256').update(raw).digest('hex'), full);
  const names = (
    await readdir(mediaDir).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    })
  ).filter((name) => name.endsWith('.bin') && safeId(name.slice(0, -4)));
  db.exec('UPDATE files SET seen=0');
  status = { ...status, phase: 'hashing', total: names.length };
  publish();
  for (const name of names) {
    const id = name.slice(0, -4),
      path = join(mediaDir, name),
      previous = fileQuery.get(id);
    try {
      const before = await stat(path);
      if (!before.isFile()) throw new Error('媒体路径不是普通文件');
      let sha256 = previous?.sha256;
      if (
        full ||
        previous?.status !== 'ready' ||
        before.size !== previous?.size ||
        before.mtimeMs !== previous?.mtime ||
        before.ctimeMs !== previous?.ctime
      )
        sha256 = await digest(path);
      const after = await stat(path);
      if (
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs
      ) {
        putFile.run(
          id,
          after.size,
          after.mtimeMs,
          after.ctimeMs,
          null,
          'changing',
          '文件仍在写入，等待重新索引',
        );
        dirty = true;
      } else putFile.run(id, after.size, after.mtimeMs, after.ctimeMs, sha256, 'ready', null);
    } catch (error) {
      putFile.run(
        id,
        previous?.size || 0,
        previous?.mtime || null,
        previous?.ctime || null,
        previous?.sha256 || null,
        error.code === 'ENOENT' ? 'missing' : 'error',
        error.message,
      );
    }
    status.done++;
    if (status.done % 10 === 0) publish();
  }
  db.exec(
    "UPDATE files SET status='missing',error=NULL WHERE seen=0; DELETE FROM files WHERE status='missing' AND NOT EXISTS(SELECT 1 FROM frames WHERE media_id=files.id)",
  );
  putMeta('lastScan', new Date().toISOString());
  status = { ...status, running: false, phase: 'idle', lastScan: meta('lastScan'), error: null };
  publish();
}
function schedule(full = false, delay = 250) {
  dirty = true;
  force ||= full;
  clearTimeout(debounce);
  debounce = setTimeout(run, delay);
}
async function run() {
  if (running) return;
  running = true;
  try {
    while (dirty) {
      const full = force;
      dirty = false;
      force = false;
      await scan(full);
    }
  } catch (error) {
    status = { ...status, running: false, phase: 'error', error: error.message };
    publish();
  } finally {
    running = false;
  }
}
function fileRefs(id) {
  return db
    .prepare(
      'SELECT frames.entry_key AS key,frames.name,rolls.name AS rollName FROM frames JOIN rolls ON rolls.id=frames.roll_id WHERE media_id=? ORDER BY rolls.position,frames.position',
    )
    .all(id);
}
function report() {
  const referenced = db.prepare('SELECT COUNT(DISTINCT media_id) AS n FROM frames').get().n;
  const missingRows = db
    .prepare(
      "SELECT files.* FROM files WHERE status='missing' AND EXISTS(SELECT 1 FROM frames WHERE media_id=files.id) ORDER BY id",
    )
    .all();
  const missing = missingRows.slice(0, 200).map((file) => ({
    id: file.id,
    expectedHash: file.sha256,
    refs: fileRefs(file.id),
    candidates: file.sha256
      ? db
          .prepare("SELECT id,size FROM files WHERE sha256=? AND status='ready' LIMIT 10")
          .all(file.sha256)
      : [],
  }));
  const duplicateHashes = db
    .prepare(
      "SELECT sha256,COUNT(*) AS copies,MIN(size) AS size FROM files WHERE status='ready' AND EXISTS(SELECT 1 FROM frames WHERE media_id=files.id AND type='image') GROUP BY sha256 HAVING COUNT(*)>1 ORDER BY size DESC",
    )
    .all();
  const duplicates = duplicateHashes.slice(0, 200).map((group) => ({
    hash: group.sha256,
    bytesPerCopy: group.size,
    copies: group.copies,
    files: db
      .prepare(
        "SELECT id,size FROM files WHERE sha256=? AND status='ready' AND EXISTS(SELECT 1 FROM frames WHERE media_id=files.id AND type='image')",
      )
      .all(group.sha256)
      .map((file) => ({ ...file, refs: fileRefs(file.id) })),
  }));
  const orphanRows = db
    .prepare(
      "SELECT id,size,sha256 AS hash FROM files WHERE status='ready' AND NOT EXISTS(SELECT 1 FROM frames WHERE media_id=files.id) ORDER BY size DESC",
    )
    .all();
  const errors = db
    .prepare("SELECT id,status,error FROM files WHERE status IN ('error','changing') LIMIT 200")
    .all();
  const sum = db
    .prepare(
      "SELECT COUNT(*) AS files,COALESCE(SUM(size),0) AS bytes FROM files WHERE status='ready'",
    )
    .get();
  return {
    available: true,
    status,
    revision: Number(meta('revision') || 0),
    counts: {
      rolls: db.prepare('SELECT COUNT(*) AS n FROM rolls').get().n,
      frames: db.prepare('SELECT COUNT(*) AS n FROM frames').get().n,
      referenced,
      ...sum,
      missing: missingRows.length,
      duplicateGroups: duplicateHashes.length,
      duplicateBytes: duplicateHashes.reduce((n, group) => n + group.size * (group.copies - 1), 0),
      orphans: orphanRows.length,
      orphanBytes: orphanRows.reduce((n, row) => n + row.size, 0),
      errors: errors.length,
    },
    missing,
    duplicates,
    orphans: orphanRows.slice(0, 200),
    errors,
    limitedTo: 200,
  };
}
parentPort.on('message', (message) => {
  try {
    if (message.op === 'scan') {
      schedule(Boolean(message.force), 0);
      parentPort.postMessage({ id: message.id, result: { accepted: true } });
    } else if (message.op === 'report')
      parentPort.postMessage({ id: message.id, result: report() });
    else if (message.op === 'lookup')
      parentPort.postMessage({ id: message.id, result: fileQuery.get(message.mediaId) || null });
  } catch (error) {
    parentPort.postMessage({ id: message.id, error: error.message });
  }
});
if (workerData.watch !== false) {
  let mediaWatcher, catalogWatcher;
  const failed = (error) => {
    status.watching = false;
    status.watchError = error.message;
    publish();
  };
  function watchMedia() {
    mediaWatcher?.close();
    try {
      mediaWatcher = watch(mediaDir, (event, name) => {
        if (!name || /\.(bin|json)$/.test(String(name))) schedule();
      });
      mediaWatcher.on('error', failed);
      status.watching = true;
      delete status.watchError;
    } catch (error) {
      failed(error);
    }
  }
  try {
    catalogWatcher = watch(dataDir, (event, name) => {
      if (String(name) === 'media') {
        watchMedia();
        schedule();
      } else if (!name || String(name) === 'library.json') schedule();
    });
    catalogWatcher.on('error', failed);
    watchMedia();
  } catch (error) {
    failed(error);
  }
}
parentPort.postMessage({ type: 'ready' });
schedule(false, 0);
