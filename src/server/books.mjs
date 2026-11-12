import { MASKS, STICKERS } from '../shared/book-graphics.mjs';
import { uid, json, parse, fail } from './catalog.mjs';
import { PAGE_ROLES, BOOK_THEMES, pageMargins } from '../shared/book-model.mjs';
import { rollCoordinates } from '../shared/geolocation.mjs';
import { textOverflow } from './book-fonts.mjs';
export const BOOK_SIZES = {
  a4: [210, 297],
  a5: [148, 210],
  square: [210, 210],
  landscape: [297, 210],
};
export function validateBook(input) {
  const book = structuredClone(input);
  if (!book || !Array.isArray(book.pages) || book.pages.length > 200 || !book.pages.length)
    fail('画册需为 1–200 页');
  book.width = Number(book.width);
  book.height = Number(book.height);
  book.bleed = Number(book.bleed ?? 3);
  book.safe = Number(book.safe ?? 8);
  if (
    ![book.width, book.height].every((n) => Number.isFinite(n) && n >= 80 && n <= 450) ||
    !Number.isFinite(book.bleed) ||
    book.bleed < 0 ||
    book.bleed > 10 ||
    !Number.isFinite(book.safe) ||
    book.safe < 0 ||
    book.safe > 30
  )
    fail('画册尺寸或出血范围不正确');
  book.name = String(book.name || 'Untitled').slice(0, 120);
  book.schemaVersion = 2;
  book.theme = BOOK_THEMES[book.theme] ? book.theme : 'quiet';
  book.innerMargin = Number(book.innerMargin ?? book.safe);
  book.spine = Number(book.spine ?? 0);
  if (
    !Number.isFinite(book.innerMargin) ||
    book.innerMargin < 0 ||
    book.innerMargin > 40 ||
    !Number.isFinite(book.spine) ||
    book.spine < 0 ||
    book.spine > 80
  )
    fail('装订尺寸无效');
  book.binding = ['layflat', 'glue', 'saddle'].includes(book.binding) ? book.binding : 'layflat';
  book.captionFields = Array.isArray(book.captionFields)
    ? book.captionFields.filter((v) =>
        ['name', 'location', 'date', 'frameNo', 'camera', 'stock'].includes(v),
      )
    : [];
  book.assets =
    book.assets && typeof book.assets === 'object' && !Array.isArray(book.assets)
      ? book.assets
      : {};
  if (Object.keys(book.assets).length > 2000) fail('每册最多 2000 份照片资料');
  book.pending = Array.isArray(book.pending) ? book.pending : [];
  if (book.pending.length > 4000) fail('待排区内容过多，请分册整理');
  book.updatedAt = Date.now();
  const pageIds = new Set();
  for (const page of book.pages) {
    if (!Array.isArray(page.elements) || page.elements.length > 100)
      fail('每页最多 100 个图文元素');
    page.id = String(page.id || uid());
    if (pageIds.has(page.id)) fail('页面编号重复');
    pageIds.add(page.id);
    page.role = PAGE_ROLES[page.role] ? page.role : 'content';
    page.chapter = String(page.chapter || '').slice(0, 120);
    page.todo = String(page.todo || '').slice(0, 2000);
    page.locked = Boolean(page.locked);
    page.background = /^#[a-f0-9]{6}$/i.test(page.background) ? page.background : '#ffffff';
    for (const el of page.elements) {
      el.id = String(el.id || uid());
      if (!['image', 'text', 'map', 'sticker'].includes(el.type)) fail('元素类型无效');
      for (const key of ['x', 'y', 'w', 'h']) {
        el[key] = Number(el[key]);
        if (!Number.isFinite(el[key]) || Math.abs(el[key]) > 1000) fail('元素位置无效');
      }
      if (el.w < 1 || el.h < 1) fail('元素大小无效');
      el.fontFamily = el.fontFamily === 'serif' ? 'serif' : 'sans';
      el.lineHeight = Math.max(1, Math.min(2.5, Number(el.lineHeight) || 1.35));
      if (el.type === 'map') {
        if (
          el.mapCrop &&
          (!['x', 'y', 'w', 'h'].every((k) => Number.isFinite(el.mapCrop[k])) ||
            el.mapCrop.x < 0 ||
            el.mapCrop.y < 0 ||
            el.mapCrop.w <= 0 ||
            el.mapCrop.h <= 0 ||
            el.mapCrop.x + el.mapCrop.w > 1.000001 ||
            el.mapCrop.y + el.mapCrop.h > 1.000001)
        )
          fail('地图框选范围无效');
        if (el.mapStyle && !['street', 'offline'].includes(el.mapStyle)) fail('地图样式无效');
        if (
          el.snapshot &&
          (typeof el.snapshot !== 'string' ||
            el.snapshot.length > 5600000 ||
            !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(el.snapshot))
        )
          fail('地图需为不超过 4 MB 的 PNG 快照');
        if (
          el.mapView &&
          (!Number.isFinite(el.mapView.latitude) ||
            Math.abs(el.mapView.latitude) > 85 ||
            !Number.isFinite(el.mapView.longitude) ||
            Math.abs(el.mapView.longitude) > 180 ||
            !Number.isFinite(el.mapView.zoom) ||
            el.mapView.zoom < 0 ||
            el.mapView.zoom > 19)
        )
          fail('地图视野无效');
        if (
          !Array.isArray(el.points) ||
          el.points.length > 12 ||
          el.points.some((p) => !rollCoordinates(p))
        )
          fail('地图坐标无效');
        el.points = el.points.map((p) => ({
          ...rollCoordinates(p),
          name: String(p.name || '').slice(0, 160),
        }));
        el.connect = Boolean(el.connect);
      }
      el.mask = MASKS[el.mask] ? el.mask : 'rect';
      el.opacity = Math.max(0, Math.min(1, Number(el.opacity ?? 1) || 0));
      if (el.type === 'sticker') {
        if (el.dataUrl) {
          if (
            typeof el.dataUrl !== 'string' ||
            el.dataUrl.length > 5600000 ||
            !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(el.dataUrl)
          )
            fail('贴图需为不超过 4 MB 的 PNG、JPEG 或 WebP 图片');
        } else if (!STICKERS[el.sticker]) fail('贴图类型无效');
      }
      el.rotation = Math.max(-180, Math.min(180, Number(el.rotation) || 0));
      el.fontSize = Math.max(6, Math.min(120, Number(el.fontSize) || 14));
      el.text = String(el.text || '').slice(0, 10000);
      el.color = /^#[a-f0-9]{6}$/i.test(el.color) ? el.color : '#222222';
      el.fit = el.fit === 'contain' ? 'contain' : 'cover';
      el.align = ['left', 'center', 'right'].includes(el.align) ? el.align : 'left';
      el.cropX = Math.max(0, Math.min(1, Number(el.cropX ?? 0.5)));
      el.cropY = Math.max(0, Math.min(1, Number(el.cropY ?? 0.5)));
    }
  }
  return book;
}
export function bookStore(c) {
  c.db.exec(
    'CREATE TABLE IF NOT EXISTS books(id TEXT PRIMARY KEY,name TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,deleted_at INTEGER,data TEXT NOT NULL)',
  );
  return {
    list: () =>
      c.db
        .prepare('SELECT id,name,version,data FROM books WHERE deleted_at IS NULL')
        .all()
        .map((r) => {
          const b = parse(r.data);
          return {
            id: r.id,
            name: r.name,
            version: r.version,
            width: b.width,
            height: b.height,
            theme: b.theme,
            safe: b.safe,
            innerMargin: b.innerMargin,
            cover: b.pages?.find((p) => p.role === 'cover') || b.pages?.[0],
            pageCount: b.pages?.length || 0,
            todoCount: b.pages?.filter((p) => p.todo).length || 0,
            updatedAt: b.updatedAt || 0,
          };
        })
        .sort((a, b) => b.updatedAt - a.updatedAt),
    get(id) {
      const row = c.db.prepare('SELECT * FROM books WHERE id=?').get(id);
      if (!row) fail('画册不存在', 404);
      return { ...parse(row.data), id: row.id, version: row.version };
    },
    save(input, id) {
      const data = validateBook(input);
      return c.transaction(() => {
        const old = id ? c.raw('books', id) : null;
        if (id && !old) fail('画册不存在', 404);
        if (old && old.version !== input.version) fail('画册已在其他窗口修改，请重新打开', 409);
        id ||= uid();
        if (old)
          c.db
            .prepare('UPDATE books SET name=?,data=?,version=version+1 WHERE id=?')
            .run(data.name, json(data), id);
        else
          c.db
            .prepare('INSERT INTO books(id,name,data) VALUES(?,?,?)')
            .run(id, data.name, json(data));
        c.record(old ? '保存画册' : '新建画册', [
          { table: 'books', id, before: old, after: c.raw('books', id) },
        ]);
        return this.get(id);
      });
    },
    remove(id) {
      return c.transaction(() => {
        const before = c.raw('books', id);
        if (!before) fail('画册不存在', 404);
        c.db
          .prepare('UPDATE books SET deleted_at=?,version=version+1 WHERE id=?')
          .run(Date.now(), id);
        c.record('删除画册', [{ table: 'books', id, before, after: c.raw('books', id) }]);
        return { ok: true };
      });
    },
  };
}
export function bookPhoto(catalog, id, mediaId) {
  const photo = catalog.query({ id, limit: 1 }).items[0];
  if (!photo) return null;
  if (!mediaId || mediaId === photo.mediaId) return photo;
  const v = catalog.db
    .prepare(
      'SELECT v.data,m.availability FROM versions v JOIN media m ON m.id=v.media_id WHERE v.photo_id=? AND v.media_id=? AND v.deleted_at IS NULL',
    )
    .get(id, mediaId);
  return v
    ? { ...photo, mediaId, exif: parse(v.data).exif || {}, availability: v.availability }
    : null;
}
export function bookPreflight(book, lookup) {
  const warnings = [];
  if (book.binding === 'saddle' && book.pages.length % 4)
    warnings.push({
      page: book.pages.length,
      issue: 'binding',
      message: '骑马订页数通常需要为 4 的倍数，请按印厂规格补齐空白页',
    });
  for (const [i, page] of book.pages.entries()) {
    const m = pageMargins(book, i);
    if (page.todo) warnings.push({ page: i + 1, issue: 'todo', message: '待办：' + page.todo });
    for (const el of page.elements) {
      const add = (issue, message) =>
        warnings.push({ page: i + 1, elementId: el.id, issue, message });
      if (el.type === 'text') {
        if (textOverflow(el)) add('text-overflow', '文字超出文字框，请调整字号、行距或框高');
        if (
          !el.generated &&
          (el.x < m.left - 0.1 ||
            el.y < m.top - 0.1 ||
            el.x + el.w > book.width - m.right + 0.1 ||
            el.y + el.h > book.height - m.bottom + 0.1)
        )
          add('safe', '文字进入裁切或装订安全边距');
      }
      if (el.type !== 'image') continue;
      const photo = el.photoId ? lookup(el.photoId, el.mediaId) : null;
      if (!photo) {
        add('missing', el.photoId ? '照片已删除或无法读取' : '空照片框尚未放入照片');
        continue;
      }
      if (['offline', 'missing', 'changed'].includes(photo.availability))
        add('offline', photo.name + ' 原片离线或内容变化');
      const w = photo.exif?.width || 0,
        h = photo.exif?.height || 0,
        dpi =
          (el.fit === 'contain' ? Math.max(w / el.w, h / el.h) : Math.min(w / el.w, h / el.h)) *
          25.4;
      if (!w || !h || dpi < 240)
        add('resolution', photo.name + ' 有效分辨率 ' + Math.round(dpi) + ' DPI');
      if (
        book.binding === 'glue' &&
        (i % 2 === 0 ? el.x < m.left : el.x + el.w > book.width - m.right)
      )
        add('gutter', '照片靠近装订内侧，请检查主体是否被遮挡');
    }
  }
  return {
    pages: book.pages.length,
    width: book.width,
    height: book.height,
    bleed: book.bleed,
    colorSpace: 'RGB',
    warnings,
  };
}
