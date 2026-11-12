import { rollCoordinates } from '../shared/geolocation.mjs';
import { mergeCustomStocks } from '../shared/stock-catalog.mjs';
import { STOCKS } from '../shared/film-stocks.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, existsSync, copyFileSync, realpathSync, statSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, sep, parse as parsePath } from 'node:path';
import { randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
export const uid = () => randomUUID();
export const json = (value) => JSON.stringify(value);
export const parse = (value, fallback = {}) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};
export function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
export function tokens(value) {
  const result = new Set();
  for (const word of String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .match(/[a-z0-9]+|[\p{Script=Han}]+/gu) || []) {
    if (/\p{Script=Han}/u.test(word) && word.length > 1)
      for (let i = 0; i < word.length - 1; i++) result.add(word.slice(i, i + 2));
    else result.add(word);
  }
  return [...result].filter((term) => term.length <= 100);
}
const synonyms = {
  夜: ['night', 'nighttime', 'dark', '夜景'],
  雨: ['rain', 'rainy', '雨'],
  山: ['mountain', 'mountains', '山地'],
  海: ['ocean', 'sea', 'beach', '海边'],
  人: ['person', 'people', 'portrait', '人像'],
  街: ['street', 'city', 'urban', '街拍'],
  花: ['flower', 'flowers', '花卉'],
  树: ['tree', 'forest', 'woodland', '树林'],
  雪: ['snow', 'winter', '雪景'],
  红: ['red', '红色'],
  绿: ['green', '绿色'],
  蓝: ['blue', '蓝色'],
  霓虹: ['neon', '霓虹'],
  日落: ['sunset', '日落'],
  建筑: ['building', 'architecture', '建筑'],
  动物: ['animal', 'dog', 'cat', '动物'],
};
export function searchGroups(query, semantic = false) {
  if (!semantic)
    return tokens(query)
      .slice(0, 16)
      .map((term) => [term]);
  const groups = Object.entries(synonyms)
    .filter(([word]) => query.includes(word))
    .map(([, words]) => words.flatMap(tokens));
  return groups.length
    ? groups
    : tokens(query)
        .slice(0, 16)
        .map((term) => [term]);
}
const now = () => Date.now();
const allowed = {
  rolls: new Set([
    'name',
    'stock',
    'format',
    'status',
    'camera',
    'lens',
    'location',
    'date',
    'datePrecision',
    'project',
    'notes',
    'process',
    'exposureIndex',
    'lab',
    'processType',
    'physical',
    'latitude',
    'longitude',
    'tags',
    'deleted_at',
    'coverId',
  ]),
  photos: new Set([
    'name',
    'frameNo',
    'strip',
    'placeName',
    'rating',
    'color',
    'rejected',
    'tags',
    'notes',
    'date',
    'latitude',
    'longitude',
    'primary_version',
    'deleted_at',
    'roll_id',
  ]),
  projects: new Set(['name', 'description', 'chapters', 'coverId', 'deleted_at']),
  collections: new Set(['name', 'parentId', 'rules', 'kind', 'deleted_at']),
  versions: new Set(['name', 'kind', 'notes', 'deleted_at']),
};
const sqlColumns = {
  name: 'name',
  frameNo: 'frameNo',
  rating: 'rating',
  color: 'color',
  rejected: 'rejected',
  date: 'date',
  stock: 'stock',
  format: 'format',
  status: 'status',
  camera: 'camera',
  lens: 'lens',
  location: 'location',
  project: 'project',
  roll_id: 'roll_id',
  primary_version: 'primary_version',
  deleted_at: 'deleted_at',
};
export class Catalog {
  constructor(root, { migrate = true } = {}) {
    this.root = resolve(root);
    mkdirSync(this.root, { recursive: true });
    this.db = new DatabaseSync(join(this.root, 'catalog.sqlite'));
    this.db.function('filmalbum_has_coordinates', { deterministic: true }, (value) =>
      rollCoordinates(parse(value)) ? 1 : 0,
    );
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 2) fail('资料库版本较新，请更新程序', 409);
    this.db.exec(`CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rolls(id TEXT PRIMARY KEY,seq INTEGER NOT NULL UNIQUE,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,stock TEXT,format TEXT,status TEXT,camera TEXT,lens TEXT,location TEXT,date TEXT,project TEXT,version INTEGER NOT NULL DEFAULT 1,deleted_at INTEGER,created_at INTEGER,updated_at INTEGER,data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS rolls_date ON rolls(deleted_at,date DESC,id); CREATE INDEX IF NOT EXISTS rolls_stock ON rolls(stock,deleted_at); CREATE INDEX IF NOT EXISTS rolls_project ON rolls(project,deleted_at);
    CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY,roll_id TEXT NOT NULL REFERENCES rolls(id),position INTEGER NOT NULL,frameNo TEXT,name TEXT NOT NULL,rating INTEGER NOT NULL DEFAULT 0,color TEXT NOT NULL DEFAULT '',rejected INTEGER NOT NULL DEFAULT 0,date TEXT,primary_version TEXT,version INTEGER NOT NULL DEFAULT 1,deleted_at INTEGER,created_at INTEGER,updated_at INTEGER,data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS photos_roll ON photos(roll_id,deleted_at,position,id); CREATE INDEX IF NOT EXISTS photos_date ON photos(deleted_at,date DESC,id); CREATE INDEX IF NOT EXISTS photos_rating ON photos(deleted_at,rating DESC,id); CREATE INDEX IF NOT EXISTS photos_flags ON photos(color,rejected,deleted_at);
    CREATE TABLE IF NOT EXISTS storages(id TEXT PRIMARY KEY,name TEXT NOT NULL,root TEXT NOT NULL,managed INTEGER NOT NULL DEFAULT 0,enabled INTEGER NOT NULL DEFAULT 1,data TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,storage_id TEXT NOT NULL REFERENCES storages(id),path TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL DEFAULT 0,hash TEXT,availability TEXT NOT NULL DEFAULT 'unknown',mtime REAL,ctime REAL,analysis TEXT NOT NULL DEFAULT '{}');
    CREATE INDEX IF NOT EXISTS media_hash ON media(hash,size); CREATE INDEX IF NOT EXISTS media_storage ON media(storage_id,availability,id);
    CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY,photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,media_id TEXT NOT NULL REFERENCES media(id),name TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'scan',created_at INTEGER,version INTEGER NOT NULL DEFAULT 1,deleted_at INTEGER,data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS versions_photo ON versions(photo_id,deleted_at,created_at); CREATE INDEX IF NOT EXISTS versions_media ON versions(media_id);
    CREATE TABLE IF NOT EXISTS photo_terms(term TEXT NOT NULL,photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,PRIMARY KEY(term,photo_id)) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS roll_terms(term TEXT NOT NULL,roll_id TEXT NOT NULL REFERENCES rolls(id) ON DELETE CASCADE,PRIMARY KEY(term,roll_id)) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY,name TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,deleted_at INTEGER,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS collection_items(collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,position REAL NOT NULL DEFAULT 0,PRIMARY KEY(collection_id,photo_id));
    CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,deleted_at INTEGER,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS project_items(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,position REAL NOT NULL DEFAULT 0,chapter TEXT NOT NULL DEFAULT '未分章',stage TEXT NOT NULL DEFAULT 'candidate',x REAL NOT NULL DEFAULT 0,y REAL NOT NULL DEFAULT 0,w REAL NOT NULL DEFAULT 260,h REAL NOT NULL DEFAULT 180,rotation REAL NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,UNIQUE(project_id,photo_id));
    CREATE TABLE IF NOT EXISTS books(id TEXT PRIMARY KEY,name TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,deleted_at INTEGER,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS history(id TEXT PRIMARY KEY,time INTEGER NOT NULL,label TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'applied',payload BLOB NOT NULL,expected TEXT NOT NULL DEFAULT '{}');
    CREATE INDEX IF NOT EXISTS history_time ON history(time DESC);
    CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY,name TEXT NOT NULL,state TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER,updated_at INTEGER);
    PRAGMA user_version=2;`);
    this.db
      .prepare(
        "INSERT OR IGNORE INTO storages(id,name,root,managed) VALUES('managed','本资料库',?,1)",
      )
      .run(this.root);
    this.db
      .prepare("UPDATE storages SET root=? WHERE id='managed' AND root<>?")
      .run(this.root, this.root);
    if (!this.getMeta('initialized')) {
      mkdirSync(join(this.root, 'media'), { recursive: true });
      const legacy = join(this.root, 'library.json');
      if (migrate && existsSync(legacy)) {
        const source = JSON.parse(readFileSync(legacy, 'utf8'));
        if (!Array.isArray(source.rolls)) fail('旧资料库格式不正确');
        copyFileSync(legacy, join(this.root, `library.before-studio-${now()}.json`));
        this.replaceLegacy(source);
      }
      this.setMeta('initialized', true);
      this.setMeta('libraryName', this.getMeta('libraryName') || '我的胶片档案馆');
    }
  }
  close() {
    this.db.close();
  }
  getMeta(key) {
    const row = this.db.prepare('SELECT value FROM meta WHERE key=?').get(key);
    return row ? parse(row.value, null) : null;
  }
  setMeta(key, value) {
    this.db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run(key, json(value));
  }
  revision() {
    return Number(this.getMeta('revision') || 0);
  }
  bump() {
    this.setMeta('revision', this.revision() + 1);
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  raw(table, id) {
    return this.db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id) || null;
  }
  row(table, id) {
    const row = this.raw(table, id);
    if (!row) fail('记录不存在', 404);
    return this.dto(table, row);
  }
  dto(table, row) {
    const data = parse(row.data);
    return {
      ...data,
      ...row,
      data: undefined,
      ...(table === 'photos' ? { tags: data.tags || [], rejected: Boolean(row.rejected) } : {}),
    };
  }
  indexRoll(id) {
    mergeCustomStocks(this.getMeta('customStocks') || []);
    const r = this.raw('rolls', id);
    this.db.prepare('DELETE FROM roll_terms WHERE roll_id=?').run(id);
    if (!r) return;
    const data = parse(r.data),
      stock = STOCKS[r.stock] || {};
    const words = tokens(
      [
        stock.name,
        stock.brand,
        stock.iso,
        stock.brand === 'KODAK' ? '柯达' : stock.brand === 'FUJIFILM' ? '富士' : '',
        r.code,
        r.name,
        r.stock,
        r.format,
        r.camera,
        r.lens,
        r.location,
        r.date,
        r.project,
        r.status,
        data.notes,
        data.process,
        ...(data.tags || []),
        ...Object.values(data.physical || {}),
      ].join(' '),
    );
    const put = this.db.prepare('INSERT OR IGNORE INTO roll_terms VALUES(?,?)');
    for (const word of words) put.run(word, id);
  }
  indexPhoto(id) {
    const p = this.raw('photos', id);
    this.db.prepare('DELETE FROM photo_terms WHERE photo_id=?').run(id);
    if (!p) return;
    const data = parse(p.data);
    const ai = this.db
      .prepare(
        'SELECT m.analysis FROM versions v JOIN media m ON m.id=v.media_id WHERE v.photo_id=?',
      )
      .all(id)
      .flatMap((row) => {
        const a = parse(row.analysis);
        return [...(a.words || []), a.text || ''];
      });
    const words = tokens(
      [
        p.name,
        p.frameNo,
        data.notes,
        ...(data.tags || []),
        data.exif?.model,
        data.exif?.lens,
        ...ai,
      ].join(' '),
    );
    const put = this.db.prepare('INSERT OR IGNORE INTO photo_terms VALUES(?,?)');
    for (const word of words) put.run(word, id);
  }
  createRoll(input = {}, history = true) {
    const id = input.id || uid(),
      seq =
        Math.max(
          Number(this.getMeta('rollSequence') || 0),
          Number(this.db.prepare('SELECT COALESCE(MAX(seq),0) AS n FROM rolls').get().n),
        ) + 1,
      created = input.createdAt || now(),
      code = input.code || `FA-${new Date(created).getFullYear()}-${String(seq).padStart(6, '0')}`;
    const data = {
      physical: { cabinet: '', box: '', album: '', page: '', pocket: '' },
      tags: [],
      datePrecision: 'day',
      ...input,
    };
    delete data.frames;
    this.setMeta('rollSequence', seq);
    const row = {
      id,
      seq,
      code,
      name: input.name || '未命名胶卷',
      stock: input.stock || 'portra400',
      format: input.format || '135',
      status: input.status || 'shooting',
      camera: input.camera || '',
      lens: input.lens || '',
      location: input.location || '',
      date: input.date || '',
      project: input.project || '',
      version: 1,
      deleted_at: null,
      created_at: created,
      updated_at: now(),
      data: json(data),
    };
    this.insertRaw('rolls', row);
    this.indexRoll(id);
    if (history)
      this.record('新建胶卷', [{ table: 'rolls', id, before: null, after: this.raw('rolls', id) }]);
    return this.row('rolls', id);
  }
  insertRaw(table, row) {
    const keys = Object.keys(row);
    this.db
      .prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`)
      .run(...keys.map((key) => row[key] ?? null));
  }
  replaceLegacy(state) {
    return this.transaction(() => {
      const keep = new Set();
      for (const roll of state.rolls || []) {
        if (!/^[a-zA-Z0-9._-]{1,160}$/.test(roll.id)) fail('旧目录胶卷编号无效');
        keep.add(roll.id);
        if (!this.raw('rolls', roll.id)) this.createRoll(roll, false);
        else this.applyPatch('rolls', roll.id, roll, false);
        const keepPhotos = new Set();
        for (const [position, frame] of (roll.frames || []).entries()) {
          if (!/^[a-zA-Z0-9._-]{1,160}$/.test(frame.id)) fail('旧目录媒体编号无效');
          const id = `${roll.id}:${frame.id}`;
          keepPhotos.add(id);
          let sidecar = {};
          try {
            sidecar = JSON.parse(
              readFileSync(join(this.root, 'media', frame.id + '.json'), 'utf8'),
            );
          } catch {}
          this.db
            .prepare(
              "INSERT OR IGNORE INTO media(id,storage_id,path,mime,size) VALUES(?,'managed',?,?,?)",
            )
            .run(
              frame.id,
              `media/${frame.id}.bin`,
              sidecar.contentType ||
                frame.exif?.fileType ||
                (frame.type === 'video' ? 'video/mp4' : 'image/jpeg'),
              sidecar.size || frame.exif?.fileSize || 0,
            );
          if (!this.raw('photos', id)) {
            const versionId = uid();
            this.insertRaw('photos', {
              id,
              roll_id: roll.id,
              position,
              frameNo: frame.frameNo || String(position + 1).padStart(2, '0'),
              name: frame.name || frame.id,
              rating: Number(frame.rating) || 0,
              color: frame.color || '',
              rejected: frame.rejected ? 1 : 0,
              date: String(frame.exif?.date || roll.date || '')
                .replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
                .slice(0, 10),
              primary_version: versionId,
              version: 1,
              deleted_at: null,
              created_at: frame.createdAt || now(),
              updated_at: now(),
              data: json({ ...frame, tags: frame.tags || [] }),
            });
            this.insertRaw('versions', {
              id: versionId,
              photo_id: id,
              media_id: frame.id,
              name: frame.name || frame.id,
              kind: 'scan',
              created_at: frame.createdAt || now(),
              version: 1,
              deleted_at: null,
              data: json({ exif: frame.exif || {}, type: frame.type || 'image' }),
            });
          } else this.applyPatch('photos', id, { ...frame, deleted_at: null }, false);
          this.indexPhoto(id);
        }
        for (const photo of this.db
          .prepare('SELECT id FROM photos WHERE roll_id=? AND deleted_at IS NULL')
          .all(roll.id))
          if (!keepPhotos.has(photo.id))
            this.db.prepare('UPDATE photos SET deleted_at=? WHERE id=?').run(now(), photo.id);
      }
      for (const roll of this.db.prepare('SELECT id FROM rolls WHERE deleted_at IS NULL').all())
        if (!keep.has(roll.id))
          this.db.prepare('UPDATE rolls SET deleted_at=? WHERE id=?').run(now(), roll.id);
      this.setMeta('legacySettings', state.settings || {});
      this.setMeta('revision', Number(state.revision) || 0);
      for (const col of state.settings?.collections || []) {
        if (!this.raw('collections', col.id))
          this.insertRaw('collections', {
            id: col.id,
            name: col.name,
            version: 1,
            deleted_at: null,
            data: json({ kind: 'manual' }),
          });
        for (const [i, ref] of (col.refs || []).entries())
          if (this.raw('photos', ref))
            this.db
              .prepare('INSERT OR IGNORE INTO collection_items VALUES(?,?,?)')
              .run(col.id, ref, i);
      }
      for (const smart of state.settings?.smartAlbums || [])
        if (!this.raw('collections', smart.id))
          this.insertRaw('collections', {
            id: smart.id,
            name: smart.name,
            version: 1,
            deleted_at: null,
            data: json({ kind: 'smart', rules: { query: smart.query || '', ...smart.facets } }),
          });
    });
  }
  applyPatch(table, id, patch, increment = true) {
    if (
      patch.date &&
      (!/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(patch.date) ||
        (patch.date.length === 10 &&
          new Date(patch.date).toISOString().slice(0, 10) !== patch.date))
    )
      fail('日期请填写 YYYY、YYYY-MM 或 YYYY-MM-DD');
    const before = this.raw(table, id);
    if (!before) fail('记录不存在', 404);
    const data = { ...parse(before.data) };
    const changes = {};
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed[table]?.has(key)) continue;
      if (['latitude', 'longitude'].includes(key)) {
        if (value === '' || value === null) data[key] = null;
        else {
          const n = Number(value),
            max = key === 'latitude' ? 90 : 180;
          if (!Number.isFinite(n) || Math.abs(n) > max) fail('经纬度范围不正确');
          data[key] = n;
        }
      } else data[key] = value;
      if (sqlColumns[key] && key in before)
        changes[sqlColumns[key]] = key === 'rejected' ? (value ? 1 : 0) : value;
    }
    if (
      'rating' in changes &&
      (!Number.isInteger(Number(changes.rating)) || changes.rating < 0 || changes.rating > 5)
    )
      fail('评分必须在 0 到 5 之间');
    if (table === 'photos' && patch.primary_version) {
      const v = this.raw('versions', patch.primary_version);
      if (!v || v.photo_id !== id || v.deleted_at) fail('主版本不属于这张底片');
    }
    if (table === 'photos' && patch.roll_id && !this.raw('rolls', patch.roll_id))
      fail('目标胶卷不存在');
    changes.data = json(data);
    if (increment) changes.version = before.version + 1;
    if ('updated_at' in before) changes.updated_at = now();
    const keys = Object.keys(changes);
    this.db
      .prepare(`UPDATE ${table} SET ${keys.map((key) => `${key}=?`).join(',')} WHERE id=?`)
      .run(...keys.map((key) => changes[key] ?? null), id);
    if (table === 'rolls') this.indexRoll(id);
    if (table === 'photos') this.indexPhoto(id);
    return { table, id, before, after: this.raw(table, id) };
  }
  patch(table, id, patch, expectedVersion, label = '更新档案') {
    return this.transaction(() => {
      const row = this.raw(table, id);
      if (!row) fail('记录不存在', 404);
      if (expectedVersion !== undefined && row.version !== expectedVersion)
        fail('此记录已在其他窗口修改，请刷新后重试', 409);
      const change = this.applyPatch(table, id, patch);
      this.record(label, [change]);
      return this.row(table, id);
    });
  }
  record(label, changes) {
    this.bump();
    this.db
      .prepare('INSERT INTO history(id,time,label,payload) VALUES(?,?,?,?)')
      .run(uid(), now(), label, gzipSync(Buffer.from(json(changes))));
    this.db
      .prepare(
        'DELETE FROM history WHERE id NOT IN(SELECT id FROM history ORDER BY time DESC LIMIT 100)',
      )
      .run();
  }
  history() {
    return this.db
      .prepare('SELECT id,time,label,state FROM history ORDER BY time DESC LIMIT 50')
      .all();
  }
  undo(id, redo = false) {
    return this.transaction(() => {
      const event = this.raw('history', id);
      if (!event) fail('历史记录不存在', 404);
      if (event.state !== (redo ? 'undone' : 'applied')) fail('此操作状态已变化', 409);
      const changes = JSON.parse(gunzipSync(event.payload));
      const expected = parse(event.expected);
      const nextExpected = {};
      for (const change of changes) {
        const current = this.raw(change.table, change.id),
          target = redo ? change.after : change.before;
        const version = expected[change.id] ?? (redo ? undefined : change.after?.version);
        const comparable = (row) =>
          JSON.stringify(
            Object.fromEntries(
              Object.entries(row || {})
                .filter(([k]) => !['version', 'updated_at'].includes(k))
                .sort(([a], [b]) => a.localeCompare(b)),
            ),
          );
        const source = redo ? change.before : change.after;
        if (!current || (current.version !== version && comparable(current) !== comparable(source)))
          fail('后续操作已修改这些记录，不能覆盖撤销。请先撤销后续操作。', 409);
        if (change.members) {
          const tbl = change.table === 'collections' ? 'collection_items' : 'project_items',
            col = change.table === 'collections' ? 'collection_id' : 'project_id',
            actual = this.db.prepare(`SELECT * FROM ${tbl} WHERE ${col}=?`).all(change.id),
            expectedItems = (redo ? change.beforeItems : change.afterItems) || [];
          const normalized = (items) => items.map(comparable).sort().join('\n');
          if (normalized(actual) !== normalized(expectedItems))
            fail('项目或收藏成员在后续操作中已变化，请先撤销后续操作', 409);
        }
        if (!target) {
          if (
            !['rolls', 'photos', 'projects', 'collections', 'versions', 'books'].includes(
              change.table,
            )
          )
            fail('该操作不能直接撤销');
          if (
            change.table === 'versions' &&
            this.db
              .prepare('SELECT id FROM photos WHERE primary_version=? AND deleted_at IS NULL')
              .get(change.id)
          )
            fail('请先撤销该版本的主版本设置', 409);
          this.db
            .prepare(`UPDATE ${change.table} SET deleted_at=?,version=version+1 WHERE id=?`)
            .run(now(), change.id);
        } else {
          const keys = Object.keys(target).filter((key) => key !== 'id' && key !== 'version');
          this.db
            .prepare(
              `UPDATE ${change.table} SET ${keys.map((key) => `${key}=?`).join(',')},version=version+1 WHERE id=?`,
            )
            .run(...keys.map((key) => target[key] ?? null), change.id);
        }
        if (change.members) {
          const itemTable = change.table === 'collections' ? 'collection_items' : 'project_items',
            column = change.table === 'collections' ? 'collection_id' : 'project_id';
          this.db.prepare(`DELETE FROM ${itemTable} WHERE ${column}=?`).run(change.id);
          for (const item of (redo ? change.afterItems : change.beforeItems) || [])
            this.insertRaw(itemTable, item);
        }
        nextExpected[change.id] = this.raw(change.table, change.id).version;
        if (change.table === 'photos') this.indexPhoto(change.id);
        if (change.table === 'rolls') this.indexRoll(change.id);
      }
      this.db
        .prepare('UPDATE history SET state=?,expected=? WHERE id=?')
        .run(redo ? 'applied' : 'undone', json(nextExpected), id);
      this.bump();
      return { ok: true };
    });
  }
  filters(query = {}, entity = 'photos', depth = 0) {
    if (depth > 8) fail('智能集合嵌套过深或存在循环');
    const where = [],
      args = [];
    const photo = entity === 'photos';
    where.push(
      photo
        ? query.trash
          ? '(p.deleted_at IS NOT NULL OR r.deleted_at IS NOT NULL)'
          : 'p.deleted_at IS NULL AND r.deleted_at IS NULL'
        : query.trash
          ? 'r.deleted_at IS NOT NULL'
          : 'r.deleted_at IS NULL',
    );
    const add = (sql, ...values) => {
      where.push(sql);
      args.push(...values);
    };
    if (query.id) add(`${photo ? 'p' : 'r'}.id=?`, query.id);
    if (query.bounds && !photo) {
      const b = query.bounds;
      add(
        "CAST(json_extract(r.data,'$.longitude') AS REAL) BETWEEN ? AND ? AND CAST(json_extract(r.data,'$.latitude') AS REAL) BETWEEN ? AND ?",
        Number(b.west),
        Number(b.east),
        Number(b.south),
        Number(b.north),
      );
    }
    const located = 'filmalbum_has_coordinates(r.data)=1';
    if (query.geolocation === 'located') add(located);
    if (query.geolocation === 'unlocated') add('NOT (' + located + ')');
    if (query.geolocation === 'named')
      add('NOT (' + located + ") AND trim(COALESCE(r.location,''))<>''");
    if (!photo && query.hasPhotos)
      add('EXISTS(SELECT 1 FROM photos fp WHERE fp.roll_id=r.id AND fp.deleted_at IS NULL)');
    if (!photo && query.tag)
      add(
        "(EXISTS(SELECT 1 FROM json_each(r.data,'$.tags') WHERE value=?) OR EXISTS(SELECT 1 FROM photos tp,json_each(tp.data,'$.tags') t WHERE tp.roll_id=r.id AND tp.deleted_at IS NULL AND t.value=?))",
        query.tag,
        query.tag,
      );
    if (query.rollId && photo) add('p.roll_id=?', query.rollId);
    for (const field of ['stock', 'format', 'status', 'camera', 'lens', 'location', 'project'])
      if (query[field] && query[field] !== 'all') add(`r.${field}=?`, String(query[field]));
    if (query.year && query.year !== 'all')
      add(`r.date>=? AND r.date<?`, `${query.year}`, `${Number(query.year) + 1}`);
    const dateColumn =
      photo && query.dateSource !== 'roll' ? "COALESCE(NULLIF(p.date,''),r.date)" : 'r.date';
    const rollDate = photo && query.dateSource !== 'roll' ? "NULLIF(p.date,'') IS NULL" : '1',
      monthPrecision = `(length(${dateColumn})=7 OR (${rollDate} AND json_extract(r.data,'$.datePrecision')='month'))`,
      yearPrecision = `(length(${dateColumn})=4 OR (${rollDate} AND json_extract(r.data,'$.datePrecision')='year'))`;
    if (query.from)
      add(
        `CASE WHEN ${yearPrecision} THEN substr(${dateColumn},1,4)||'-12-31' WHEN ${monthPrecision} THEN substr(${dateColumn},1,7)||'-31' ELSE ${dateColumn} END>=?`,
        query.from,
      );
    if (query.to)
      add(
        `CASE WHEN ${yearPrecision} THEN substr(${dateColumn},1,4)||'-01-01' WHEN ${monthPrecision} THEN substr(${dateColumn},1,7)||'-01' ELSE ${dateColumn} END<=? AND ${dateColumn}<>''`,
        query.to,
      );
    if (photo && Array.isArray(query.excludeIds) && query.excludeIds.length) {
      const ids = query.excludeIds.slice(0, 2000).map(String);
      add(`p.id NOT IN (${ids.map(() => '?').join(',')})`, ...ids);
    }
    if (query.place) add('instr(lower(r.location),lower(?))>0', String(query.place).trim());
    if (['135', '120', '220'].includes(query.medium))
      add('(r.format=? OR r.format LIKE ?)', query.medium, query.medium + '%');
    if (query.medium === 'large')
      add(
        "(r.format LIKE '4×5%' OR r.format LIKE '8×10%' OR r.format LIKE '4x5%' OR r.format LIKE '8x10%' OR lower(r.format) LIKE '%sheet%')",
      );
    if (['bw', 'color', 'slide', 'cinema'].includes(query.stockType)) {
      const ids = Object.entries(STOCKS)
        .filter(([, s]) => s.group === query.stockType)
        .map(([id]) => id);
      add(ids.length ? `r.stock IN(${ids.map(() => '?').join(',')})` : '0', ...ids);
    }
    if (photo) {
      if (query.availability === 'ready') add("m.availability='ready'");
      if (query.availability === 'offline')
        add("m.availability IN('offline','missing','error','changed')");
      if (Number(query.minVersions) > 1)
        add(
          '(SELECT COUNT(*) FROM versions WHERE photo_id=p.id AND deleted_at IS NULL)>=?',
          Math.min(100, Math.floor(Number(query.minVersions))),
        );
      const w = "CAST(json_extract(v.data,'$.exif.width') AS REAL)",
        h = "CAST(json_extract(v.data,'$.exif.height') AS REAL)";
      if (['landscape', 'portrait', 'square'].includes(query.orientation))
        add(
          `${w}>0 AND ${h}>0 AND ${w}${query.orientation === 'landscape' ? '>' : query.orientation === 'portrait' ? '<' : '='}${h}`,
        );
    }
    if (photo) {
      if (query.rating === 'unrated') add('p.rating=0');
      else if (Number(query.rating) > 0) add('p.rating>=?', Number(query.rating));
      if (query.color && query.color !== 'all')
        add('p.color=?', query.color === 'none' ? '' : query.color);
      if (query.review === 'kept') add('p.rejected=0');
      if (query.review === 'rejected') add('p.rejected=1');
      if (query.type && query.type !== 'all') add("json_extract(v.data,'$.type')=?", query.type);
      if (query.tag)
        add("EXISTS(SELECT 1 FROM json_each(p.data,'$.tags') WHERE value=?)", query.tag);
      if (query.hash) add('m.hash=?', query.hash);
      if (query.storageId) add('m.storage_id=?', query.storageId);
      if (query.offline) add("m.availability IN('offline','missing')");
      if (query.collectionId) {
        const col = this.row('collections', query.collectionId);
        if (col.kind === 'smart') {
          const nested = this.filters({ ...col.rules, trash: query.trash }, entity, depth + 1);
          where.push(`(${nested.sql})`);
          args.push(...nested.args);
        } else
          add(
            'p.id IN(SELECT photo_id FROM collection_items WHERE collection_id=?)',
            query.collectionId,
          );
      }
      if (query.projectId) {
        add(
          'p.id IN(SELECT photo_id FROM project_items WHERE project_id=?' +
            (query.stage ? ' AND stage=?' : '') +
            (query.chapter ? ' AND chapter=?' : '') +
            ')',
          query.projectId,
          ...(query.stage ? [query.stage] : []),
          ...(query.chapter ? [query.chapter] : []),
        );
      }
    }
    for (const group of searchGroups(String(query.query || ''), Boolean(query.semantic))) {
      const constraints = group.map(() => '(term>=? AND term<?)').join(' OR ');
      const vals = group.flatMap((term) => [term, term + '\uffff']);
      if (photo) {
        add(
          `(p.id IN(SELECT photo_id FROM photo_terms WHERE ${constraints}) OR p.roll_id IN(SELECT roll_id FROM roll_terms WHERE ${constraints}))`,
          ...vals,
          ...vals,
        );
      } else add(`r.id IN(SELECT roll_id FROM roll_terms WHERE ${constraints})`, ...vals);
    }
    const rules = (query.rules?.conditions || []).slice(0, 12),
      ruleParts = [],
      ruleArgs = [];
    for (const rule of rules) {
      const columns = {
        rating: photo ? 'p.rating' : null,
        color: photo ? 'p.color' : null,
        rejected: photo ? 'p.rejected' : null,
        name: photo ? 'p.name' : 'r.name',
        stock: 'r.stock',
        camera: 'r.camera',
        lens: 'r.lens',
        location: 'r.location',
        date: photo ? 'p.date' : 'r.date',
        project: 'r.project',
      };
      const column = columns[rule.field];
      if (!column) continue;
      const ops = { eq: '=', neq: '!=', gte: '>=', lte: '<=' };
      if (ops[rule.op]) {
        ruleParts.push(`${column}${ops[rule.op]}?`);
        ruleArgs.push(rule.value);
      } else if (rule.op === 'contains') {
        ruleParts.push(`instr(lower(${column}),lower(?))>0`);
        ruleArgs.push(String(rule.value));
      }
    }
    if (ruleParts.length) {
      where.push(`(${ruleParts.join(query.rules.match === 'any' ? ' OR ' : ' AND ')})`);
      args.push(...ruleArgs);
    }
    return { sql: where.join(' AND '), args };
  }
  query(query = {}, entity = 'photos') {
    const page = Math.min(10000000, Math.max(0, Math.floor(Number(query.page) || 0))),
      limit = Math.min(200, Math.max(1, Math.floor(Number(query.limit) || 80))),
      filter = this.filters(query, entity),
      photo = entity === 'photos';
    const from = photo
      ? 'photos p JOIN rolls r ON r.id=p.roll_id LEFT JOIN versions v ON v.id=p.primary_version LEFT JOIN media m ON m.id=v.media_id'
      : 'rolls r';
    const sorts = photo
      ? {
          date: "COALESCE(NULLIF(p.date,''),r.date) DESC,p.id",
          'date-asc': "COALESCE(NULLIF(p.date,''),r.date) ASC,p.id",
          rating: 'p.rating DESC,p.date DESC,p.id',
          name: 'p.name,p.id',
          frame: 'r.seq,p.position,p.id',
          random: 'random()',
        }
      : {
          'timeline-desc':
            "CASE WHEN r.date='' OR r.date IS NULL THEN 1 ELSE 0 END,r.date DESC,r.seq DESC",
          'timeline-asc':
            "CASE WHEN r.date='' OR r.date IS NULL THEN 1 ELSE 0 END,r.date ASC,r.seq ASC",
          date: 'r.date DESC,r.seq DESC',
          name: 'r.name,r.seq',
          code: 'r.seq DESC',
          random: 'random()',
        };
    let order = sorts[query.sort] || sorts[photo ? (query.rollId ? 'frame' : 'date') : 'code'];
    if (photo && query.collectionId && this.row('collections', query.collectionId).kind !== 'smart')
      order = `(SELECT position FROM collection_items WHERE collection_id='${query.collectionId.replaceAll("'", "''")}' AND photo_id=p.id),p.id`;
    if (photo && query.projectId)
      order = `(SELECT position FROM project_items WHERE project_id='${query.projectId.replaceAll("'", "''")}' AND photo_id=p.id),p.id`;
    const count = this.db
      .prepare(`SELECT COUNT(*) AS n FROM ${from} WHERE ${filter.sql}`)
      .get(...filter.args).n;
    const selection = photo
      ? `p.*,r.name AS rollName,r.code AS rollCode,r.date AS rollDate,r.stock,r.format,r.camera,r.lens,r.location,r.project,r.data AS rollData,m.id AS mediaId,m.availability,m.mime,m.size,m.storage_id,m.analysis,v.data AS versionData,(SELECT COUNT(*) FROM versions WHERE photo_id=p.id AND deleted_at IS NULL) AS versionCount`
      : `r.*,(SELECT COUNT(*) FROM photos WHERE roll_id=r.id AND deleted_at IS NULL) AS frameCount,(SELECT m.id FROM photos p INDEXED BY photos_roll JOIN rolls coverroll ON coverroll.id=p.roll_id JOIN versions v ON v.id=p.primary_version JOIN media m ON m.id=v.media_id WHERE p.roll_id=r.id AND p.deleted_at IS NULL ORDER BY CASE WHEN p.id=json_extract(coverroll.data,'$.coverId') OR m.id=json_extract(coverroll.data,'$.coverId') THEN 0 ELSE 1 END,p.rating DESC,p.position LIMIT 1) AS coverMedia`;
    const rows = this.db
      .prepare(
        `SELECT ${selection} FROM ${from} WHERE ${filter.sql} ORDER BY ${order} LIMIT ? OFFSET ?`,
      )
      .all(...filter.args, limit, page * limit);
    return {
      items: rows.map((row) => {
        const dto = this.dto(entity, row);
        if (photo) {
          dto.exif = parse(row.versionData).exif || {};
          dto.analysis = parse(row.analysis);
          const rollData = parse(row.rollData);
          dto.physical = rollData.physical || {};
          dto.rollDatePrecision = rollData.datePrecision;
          dto.rollNotes = rollData.notes || '';
          dto.lab = rollData.lab || '';
          dto.process = rollData.process || '';
          if (query.projectId)
            dto.chapter =
              this.db
                .prepare('SELECT chapter FROM project_items WHERE project_id=? AND photo_id=?')
                .get(query.projectId, dto.id)?.chapter || '';
          dto.fileDateSource = parse(row.versionData).fileDateSource;
          dto.rollCoordinates = rollCoordinates(rollData);
          delete dto.rollData;
          delete dto.versionData;
        }
        return dto;
      }),
      total: count,
      page,
      limit,
      pages: Math.ceil(count / limit),
      revision: this.revision(),
      interpreted: query.semantic ? searchGroups(query.query || '', true) : undefined,
    };
  }
  selectIds(entity, selection) {
    if (Array.isArray(selection.ids)) {
      if (selection.ids.length > 10000) fail('每次最多操作 10000 条记录，请分批执行');
      return [...new Set(selection.ids)];
    }
    const result = this.query({ ...selection.query, limit: 1 }, entity);
    if (result.total > 10000) fail('匹配超过 10000 条，请增加筛选条件分批执行');
    const filter = this.filters(selection.query || {}, entity);
    return this.db
      .prepare(
        entity === 'photos'
          ? `SELECT p.id FROM photos p JOIN rolls r ON r.id=p.roll_id LEFT JOIN versions v ON v.id=p.primary_version LEFT JOIN media m ON m.id=v.media_id WHERE ${filter.sql}`
          : `SELECT r.id FROM rolls r WHERE ${filter.sql}`,
      )
      .all(...filter.args)
      .map((row) => row.id);
  }
  batchTags(entity) {
    const rolls = entity === 'rolls',
      source = rolls ? 'rolls r' : 'photos r JOIN rolls roll ON roll.id=r.roll_id',
      active = rolls ? 'r.deleted_at IS NULL' : 'r.deleted_at IS NULL AND roll.deleted_at IS NULL';
    return this.db
      .prepare(
        `SELECT DISTINCT tag.value AS value FROM ${source}, json_each(r.data,'$.tags') tag WHERE ${active} AND tag.type='text' AND tag.value<>'' ORDER BY value COLLATE NOCASE`,
      )
      .all()
      .map((row) => row.value);
  }
  batch(entity, selection, patch, label = '批量修改') {
    if (!['photos', 'rolls'].includes(entity)) fail('无效批量对象');
    return this.transaction(() => {
      const ids = this.selectIds(entity, selection);
      if (
        selection.expectedRevision !== undefined &&
        selection.expectedRevision !== this.revision()
      )
        fail('匹配结果已变化，请重新预览批量操作', 409);
      const changes = ids.map((id) => this.applyPatch(entity, id, patch));
      if (changes.length) this.record(`${label} · ${changes.length} 条`, changes);
      return { changed: changes.length, revision: this.revision() };
    });
  }
  lists() {
    return {
      customStocks: this.getMeta('customStocks') || [],
      demo: Boolean(this.getMeta('demo')),
      collections: this.db
        .prepare('SELECT * FROM collections WHERE deleted_at IS NULL ORDER BY name LIMIT 2000')
        .all()
        .map((row) => this.dto('collections', row)),
      projects: this.db
        .prepare('SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY name LIMIT 2000')
        .all()
        .map((row) => this.dto('projects', row)),
      storages: this.db.prepare('SELECT * FROM storages').all(),
      presets: this.getMeta('presets') || [],
      settings: this.getMeta('settings') || {},
      libraryName: this.getMeta('libraryName'),
      revision: this.revision(),
    };
  }
  facets() {
    const out = {};
    for (const field of ['stock', 'format', 'status', 'camera', 'lens', 'location', 'project'])
      out[field] = this.db
        .prepare(
          `SELECT ${field} AS value,COUNT(*) AS count FROM rolls WHERE deleted_at IS NULL AND ${field}<>'' GROUP BY ${field} ORDER BY count DESC LIMIT 300`,
        )
        .all();
    out.tags = this.db
      .prepare(
        "SELECT j.value AS value,COUNT(*) AS count FROM photos p JOIN rolls r ON r.id=p.roll_id, json_each(p.data,'$.tags') j WHERE p.deleted_at IS NULL AND r.deleted_at IS NULL AND j.type='text' AND j.value<>'' GROUP BY j.value ORDER BY count DESC LIMIT 300",
      )
      .all();
    out.years = this.db
      .prepare(
        'SELECT substr(date,1,4) AS value,COUNT(*) AS count FROM rolls WHERE deleted_at IS NULL AND length(date)>=4 GROUP BY value ORDER BY value DESC',
      )
      .all();
    return out;
  }
  createList(table, input) {
    if (!['projects', 'collections'].includes(table)) fail('无效分组');
    return this.transaction(() => {
      const id = uid();
      const data =
        table === 'projects'
          ? { description: '', chapters: ['未分章'], ...input }
          : { kind: 'manual', ...input };
      this.insertRaw(table, {
        id,
        name: input.name || '未命名',
        version: 1,
        deleted_at: null,
        data: json(data),
      });
      this.record('新建' + (table === 'projects' ? '项目' : '收藏夹'), [
        { table, id, before: null, after: this.raw(table, id) },
      ]);
      return this.row(table, id);
    });
  }
  membership(table, id, photoIds, remove = false) {
    if (!Array.isArray(photoIds) || photoIds.length > 10000) fail('每批最多 10000 张');
    this.row(table, id);
    return this.transaction(() => {
      const itemTable = table === 'collections' ? 'collection_items' : 'project_items',
        column = table === 'collections' ? 'collection_id' : 'project_id',
        before = this.raw(table, id),
        beforeItems = this.db.prepare(`SELECT * FROM ${itemTable} WHERE ${column}=?`).all(id);
      let n = 0;
      for (const photoId of new Set(photoIds)) {
        if (!this.raw('photos', photoId)) continue;
        if (table === 'collections') {
          if (remove)
            n += this.db
              .prepare('DELETE FROM collection_items WHERE collection_id=? AND photo_id=?')
              .run(id, photoId).changes;
          else
            n += this.db
              .prepare(
                'INSERT OR IGNORE INTO collection_items VALUES(?,?,COALESCE((SELECT MAX(position)+1 FROM collection_items WHERE collection_id=?),0))',
              )
              .run(id, photoId, id).changes;
        } else {
          if (remove)
            n += this.db
              .prepare('DELETE FROM project_items WHERE project_id=? AND photo_id=?')
              .run(id, photoId).changes;
          else
            n += this.db
              .prepare(
                'INSERT OR IGNORE INTO project_items(id,project_id,photo_id,position,x,y) VALUES(?,?,?,COALESCE((SELECT MAX(position)+1 FROM project_items WHERE project_id=?),0),?,?)',
              )
              .run(uid(), id, photoId, id, (n % 4) * 290, Math.floor(n / 4) * 210).changes;
        }
      }
      if (n) {
        this.db.prepare(`UPDATE ${table} SET version=version+1 WHERE id=?`).run(id);
        this.record(
          (remove ? '移出' : '加入') + (table === 'collections' ? '收藏' : '项目') + ` · ${n} 张`,
          [
            {
              table,
              id,
              before,
              after: this.raw(table, id),
              members: true,
              beforeItems,
              afterItems: this.db.prepare(`SELECT * FROM ${itemTable} WHERE ${column}=?`).all(id),
            },
          ],
        );
      }
      return { changed: n };
    });
  }
  projectItems(id) {
    return this.db
      .prepare(
        'SELECT i.*,p.name,p.primary_version,m.id AS mediaId,m.availability FROM project_items i JOIN photos p ON p.id=i.photo_id JOIN rolls r ON r.id=p.roll_id LEFT JOIN versions v ON v.id=p.primary_version LEFT JOIN media m ON m.id=v.media_id WHERE i.project_id=? AND p.deleted_at IS NULL AND r.deleted_at IS NULL ORDER BY i.position LIMIT 2000',
      )
      .all(id);
  }
  patchItem(id, patch, expected) {
    return this.transaction(() => {
      const row = this.raw('project_items', id);
      if (!row) fail('项目照片不存在', 404);
      if (expected !== undefined && row.version !== expected) fail('布局已在别处更新', 409);
      const keys = Object.keys(patch).filter((key) =>
        ['position', 'chapter', 'stage', 'x', 'y', 'w', 'h', 'rotation'].includes(key),
      );
      for (const key of ['x', 'y', 'w', 'h', 'rotation', 'position'])
        if (key in patch && !Number.isFinite(Number(patch[key]))) fail('布局数值无效');
      if (!keys.length) return row;
      this.db
        .prepare(
          `UPDATE project_items SET ${keys.map((key) => `${key}=?`).join(',')},version=version+1 WHERE id=?`,
        )
        .run(...keys.map((key) => patch[key]), id);
      this.record('调整项目照片', [
        { table: 'project_items', id, before: row, after: this.raw('project_items', id) },
      ]);
      return this.raw('project_items', id);
    });
  }
  reorderCollection(collectionId, photoId, beforeId) {
    return this.transaction(() => {
      const before = this.raw('collections', collectionId);
      if (!before) fail('收藏不存在', 404);
      if (parse(before.data).kind === 'smart') fail('智能集合使用筛选排序，不能手动排序');
      const rows = this.db
          .prepare(
            'SELECT * FROM collection_items WHERE collection_id=? ORDER BY position,photo_id',
          )
          .all(collectionId),
        source = rows.find((r) => r.photo_id === photoId),
        target = rows.find((r) => r.photo_id === beforeId);
      if (!source || !target) fail('收藏照片不存在', 404);
      if (photoId === beforeId) return { ok: true };
      const previous = rows
        .filter((r) => r.photo_id !== photoId && r.position < target.position)
        .at(-1);
      this.db
        .prepare('UPDATE collection_items SET position=? WHERE collection_id=? AND photo_id=?')
        .run(
          previous ? (previous.position + target.position) / 2 : target.position - 1,
          collectionId,
          photoId,
        );
      this.db.prepare('UPDATE collections SET version=version+1 WHERE id=?').run(collectionId);
      this.record('调整收藏顺序', [
        {
          table: 'collections',
          id: collectionId,
          before,
          after: this.raw('collections', collectionId),
          members: true,
          beforeItems: rows,
          afterItems: this.db
            .prepare('SELECT * FROM collection_items WHERE collection_id=?')
            .all(collectionId),
        },
      ]);
      return { ok: true };
    });
  }
  reorder(projectId, photoId, beforeId) {
    const source = this.db
        .prepare('SELECT * FROM project_items WHERE project_id=? AND photo_id=?')
        .get(projectId, photoId),
      target = this.db
        .prepare('SELECT * FROM project_items WHERE project_id=? AND photo_id=?')
        .get(projectId, beforeId);
    if (!source || !target) fail('项目照片不存在', 404);
    if (source.id === target.id) return source;
    const previous = this.db
      .prepare(
        'SELECT MAX(position) AS n FROM project_items WHERE project_id=? AND position<? AND id<>?',
      )
      .get(projectId, target.position, source.id).n;
    return this.patchItem(
      source.id,
      { position: previous == null ? target.position - 1 : (previous + target.position) / 2 },
      source.version,
    );
  }
  organize(projectId, ids, patch) {
    if (!Array.isArray(ids) || ids.length > 10000) fail('每批最多 10000 张');
    return this.transaction(() => {
      const changes = [];
      for (const photoId of ids) {
        const row = this.db
          .prepare('SELECT * FROM project_items WHERE project_id=? AND photo_id=?')
          .get(projectId, photoId);
        if (!row) continue;
        const updates = {};
        if (patch.chapter !== undefined) updates.chapter = String(patch.chapter);
        if (['candidate', 'final'].includes(patch.stage)) updates.stage = patch.stage;
        if (!Object.keys(updates).length) continue;
        const keys = Object.keys(updates);
        this.db
          .prepare(
            `UPDATE project_items SET ${keys.map((k) => k + '=?').join(',')},version=version+1 WHERE id=?`,
          )
          .run(...keys.map((k) => updates[k]), row.id);
        changes.push({
          table: 'project_items',
          id: row.id,
          before: row,
          after: this.raw('project_items', row.id),
        });
      }
      if (changes.length) this.record('项目分章与选片', [...changes]);
      return { changed: changes.length };
    });
  }
  versions(photoId) {
    return this.db
      .prepare(
        'SELECT v.*,m.mime,m.availability,m.size,m.id AS mediaId FROM versions v JOIN media m ON m.id=v.media_id WHERE v.photo_id=? AND v.deleted_at IS NULL ORDER BY v.created_at',
      )
      .all(photoId)
      .map((row) => this.dto('versions', row));
  }
  addMedia(input) {
    const existing = this.db
      .prepare('SELECT * FROM media WHERE storage_id=? AND path=?')
      .get(input.storage_id || 'managed', input.path);
    if (existing) return existing.id;
    const id = input.id || uid();
    this.insertRaw('media', {
      id,
      storage_id: input.storage_id || 'managed',
      path: input.path,
      mime: input.mime || 'application/octet-stream',
      size: input.size || 0,
      hash: input.hash || null,
      availability: 'ready',
      mtime: input.mtime || null,
      ctime: input.ctime || null,
      analysis: '{}',
    });
    return id;
  }
  addPhoto(rollId, mediaId, input = {}, photoId = null) {
    return this.transaction(() => {
      const roll = this.row('rolls', rollId),
        id = photoId || uid(),
        versionId = uid();
      let created = false;
      if (!photoId) {
        const position = this.db
          .prepare('SELECT COALESCE(MAX(position),-1)+1 AS n FROM photos WHERE roll_id=?')
          .get(rollId).n;
        this.insertRaw('photos', {
          id,
          roll_id: rollId,
          position,
          frameNo: input.frameNo || String(position + 1).padStart(2, '0'),
          name: input.name || '未命名照片',
          rating: 0,
          color: '',
          rejected: 0,
          date:
            input.useFileDate === false
              ? ''
              : input.exif?.date?.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').slice(0, 10) ||
                (input.useFileDate ? '' : roll.date),
          primary_version: versionId,
          version: 1,
          deleted_at: null,
          created_at: now(),
          updated_at: now(),
          data: json({ tags: [], exif: input.exif || {} }),
        });
        created = true;
      } else this.row('photos', photoId);
      this.insertRaw('versions', {
        id: versionId,
        photo_id: id,
        media_id: mediaId,
        name: input.name || '扫描版本',
        kind: input.kind || 'scan',
        created_at: now(),
        version: 1,
        deleted_at: null,
        data: json({
          type: input.type || 'image',
          exif: input.exif || {},
          fileDateSource:
            input.useFileDate === false ? 'scan' : input.useFileDate ? 'capture' : undefined,
        }),
      });
      this.indexPhoto(id);
      this.record(created ? '装入底片' : '加入扫描版本', [
        created
          ? { table: 'photos', id, before: null, after: this.raw('photos', id) }
          : {
              table: 'versions',
              id: versionId,
              before: null,
              after: this.raw('versions', versionId),
            },
      ]);
      return { ...this.query({ id, limit: 1 }).items[0], newPhoto: created, newVersion: versionId };
    });
  }
  mediaPath(id) {
    const media = this.db
      .prepare(
        'SELECT m.*,s.root,s.managed,s.enabled FROM media m JOIN storages s ON s.id=m.storage_id WHERE m.id=?',
      )
      .get(id);
    if (!media) fail('原片不存在', 404);
    if (!media.enabled) fail('存储卷已停用', 409);
    const path = resolve(media.root, media.path);
    if (
      relative(media.root, path).startsWith('..' + sep) ||
      relative(media.root, path) === '..' ||
      isAbsolute(relative(media.root, path))
    )
      fail('媒体路径超出存储卷');
    return { ...media, absolute: path };
  }
  registerStorage(input) {
    const root = realpathSync(input.root);
    if (root === parsePath(root).root || !statSync(root).isDirectory())
      fail('请选择具体的照片文件夹');
    for (const old of this.db.prepare('SELECT root FROM storages').all())
      if (root === old.root || root.startsWith(old.root + sep) || old.root.startsWith(root + sep))
        fail('此目录与已登记存储卷重叠，请选择独立照片目录');
    if (existsSync(join(root, 'catalog.sqlite')))
      fail('这是一个资料库文件夹，请使用打开资料库功能');
    const id = uid();
    this.db
      .prepare('INSERT INTO storages VALUES(?,?,?,0,1,?)')
      .run(
        id,
        input.name || root.split(sep).at(-1),
        root,
        json({ createdAt: now(), watch: Boolean(input.watch) }),
      );
    this.bump();
    return this.raw('storages', id);
  }
  stats() {
    const scalar = (sql) => Number(this.db.prepare(sql).get().n || 0);
    return {
      rolls: scalar('SELECT COUNT(*) AS n FROM rolls WHERE deleted_at IS NULL'),
      photos: scalar(
        'SELECT COUNT(*) AS n FROM photos p JOIN rolls r ON r.id=p.roll_id WHERE p.deleted_at IS NULL AND r.deleted_at IS NULL',
      ),
      favorites: scalar(
        'SELECT COUNT(*) AS n FROM photos p JOIN rolls r ON r.id=p.roll_id WHERE p.rating>=4 AND p.deleted_at IS NULL AND r.deleted_at IS NULL',
      ),
      trash: scalar(
        'SELECT COUNT(*) AS n FROM photos p JOIN rolls r ON r.id=p.roll_id WHERE p.deleted_at IS NOT NULL OR r.deleted_at IS NOT NULL',
      ),
      bytes: scalar('SELECT SUM(size) AS n FROM media'),
      offline: scalar("SELECT COUNT(*) AS n FROM media WHERE availability IN('offline','missing')"),
      stocks: this.db
        .prepare(
          'SELECT stock AS label,COUNT(*) AS count FROM rolls WHERE deleted_at IS NULL GROUP BY stock ORDER BY count DESC LIMIT 20',
        )
        .all(),
      cameras: this.db
        .prepare(
          "SELECT camera AS label,COUNT(*) AS count FROM rolls WHERE deleted_at IS NULL AND camera<>'' GROUP BY camera ORDER BY count DESC LIMIT 20",
        )
        .all(),
      years: this.db
        .prepare(
          'SELECT substr(date,1,4) AS label,COUNT(*) AS count FROM rolls WHERE deleted_at IS NULL AND length(date)>=4 GROUP BY label ORDER BY label DESC',
        )
        .all(),
    };
  }
  atlasPhotos(query) {
    const filter = this.filters(query, 'photos'),
      exif = "json_extract(v.data,'$.exif')",
      coordinates = `CASE WHEN filmalbum_has_coordinates(p.data)=1 THEN p.data WHEN filmalbum_has_coordinates(${exif})=1 THEN ${exif} END`,
      points = `WITH candidates AS (
        SELECT p.id, p.name, p.roll_id AS rollId, m.id AS mediaId, ${coordinates} AS coordinates
        FROM photos p JOIN rolls r ON r.id=p.roll_id LEFT JOIN versions v ON v.id=p.primary_version LEFT JOIN media m ON m.id=v.media_id
        WHERE ${filter.sql}
      ), points AS (
        SELECT id,name,rollId,mediaId,CAST(json_extract(coordinates,'$.latitude') AS REAL) AS latitude,
          CAST(json_extract(coordinates,'$.longitude') AS REAL) AS longitude
        FROM candidates WHERE coordinates IS NOT NULL
      )`,
      bounds = query.bounds,
      where = bounds ? 'WHERE longitude BETWEEN ? AND ? AND latitude BETWEEN ? AND ?' : '',
      args = bounds
        ? [...filter.args, ...[bounds.west, bounds.east, bounds.south, bounds.north].map(Number)]
        : filter.args;
    if (query.points)
      return {
        items: this.db
          .prepare(`${points} SELECT * FROM points ${where} ORDER BY name,id LIMIT 200`)
          .all(...args),
      };
    const cell = 360 / 2 ** (Math.max(0, Math.min(19, Number(query.zoom) || 0)) + 3),
      total = this.db.prepare(`${points} SELECT COUNT(*) AS n FROM points ${where}`).get(...args).n,
      clusters = this.db
        .prepare(
          `${points}
        SELECT COUNT(*) AS count, AVG(latitude) AS latitude, AVG(longitude) AS longitude,
          CASE WHEN COUNT(*)=1 THEN MIN(id) END AS id, MIN(name) AS name
        FROM points ${where} GROUP BY CAST((longitude+180)/? AS INTEGER), CAST((latitude+90)/? AS INTEGER)
        ORDER BY count DESC LIMIT 2000`,
        )
        .all(...args, cell, cell);
    return { total, clusters, limit: 2000 };
  }
  atlas(query = {}) {
    if (query.mapMode === 'photos') return this.atlasPhotos(query);
    const filter = this.filters(query, 'rolls'),
      zoom = Math.max(0, Math.min(19, Number(query.zoom) || 0)),
      cell = 360 / 2 ** (zoom + 3),
      lat = "CAST(json_extract(r.data,'$.latitude') AS REAL)",
      lon = "CAST(json_extract(r.data,'$.longitude') AS REAL)";
    let where = filter.sql + ' AND filmalbum_has_coordinates(r.data)=1',
      args = [...filter.args];
    if (query.bounds) {
      const b = query.bounds;
      where += ` AND ${lon} BETWEEN ? AND ? AND ${lat} BETWEEN ? AND ?`;
      args.push(Number(b.west), Number(b.east), Number(b.south), Number(b.north));
    }
    const total = this.db
      .prepare(`SELECT COUNT(*) AS n FROM rolls r WHERE ${where}`)
      .get(...args).n;
    const clusters = this.db
      .prepare(
        `SELECT COUNT(*) AS count,AVG(${lat}) AS latitude,AVG(${lon}) AS longitude,CASE WHEN COUNT(*)=1 THEN MIN(r.id) ELSE NULL END AS id,MIN(r.name) AS name,MIN(r.date) AS date FROM rolls r WHERE ${where} GROUP BY CAST((${lon}+180)/? AS INTEGER),CAST((${lat}+90)/? AS INTEGER) ORDER BY count DESC LIMIT 2000`,
      )
      .all(...args, cell, cell);
    return { clusters, total, limit: 2000 };
  }
  purgePlan() {
    const rows = this.db
      .prepare(
        'SELECT p.id,p.roll_id FROM photos p JOIN rolls r ON r.id=p.roll_id WHERE p.deleted_at IS NOT NULL OR r.deleted_at IS NOT NULL',
      )
      .all();
    return {
      photos: rows.length,
      rolls: this.db.prepare('SELECT COUNT(*) AS n FROM rolls WHERE deleted_at IS NOT NULL').get()
        .n,
    };
  }
  purge() {
    return this.transaction(() => {
      const dead = this.db
          .prepare(
            'SELECT p.id FROM photos p JOIN rolls r ON r.id=p.roll_id WHERE p.deleted_at IS NOT NULL OR r.deleted_at IS NOT NULL',
          )
          .all(),
        deadMedia = new Set(
          dead.flatMap((p) =>
            this.db
              .prepare('SELECT media_id FROM versions WHERE photo_id=?')
              .all(p.id)
              .map((v) => v.media_id),
          ),
        );
      for (const { id } of dead) this.db.prepare('DELETE FROM photos WHERE id=?').run(id);
      this.db.exec('DELETE FROM rolls WHERE deleted_at IS NOT NULL');
      const unused = this.db
        .prepare(
          'SELECT m.*,s.root,s.managed FROM media m JOIN storages s ON s.id=m.storage_id WHERE NOT EXISTS(SELECT 1 FROM versions WHERE media_id=m.id)',
        )
        .all()
        .filter((m) => deadMedia.has(m.id));
      for (const m of unused) this.db.prepare('DELETE FROM media WHERE id=?').run(m.id);
      this.db.exec('DELETE FROM history');
      this.bump();
      return { photos: dead.length, unused };
    });
  }
}
