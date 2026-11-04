import { uid, json, parse, fail } from './catalog.mjs';
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
  for (const page of book.pages) {
    if (!Array.isArray(page.elements) || page.elements.length > 100)
      fail('每页最多 100 个图文元素');
    page.background = /^#[a-f0-9]{6}$/i.test(page.background) ? page.background : '#ffffff';
    for (const el of page.elements) {
      if (!['image', 'text'].includes(el.type)) fail('元素类型无效');
      for (const key of ['x', 'y', 'w', 'h']) {
        el[key] = Number(el[key]);
        if (!Number.isFinite(el[key]) || Math.abs(el[key]) > 1000) fail('元素位置无效');
      }
      if (el.w < 1 || el.h < 1) fail('元素大小无效');
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
        .prepare('SELECT id,name,version FROM books WHERE deleted_at IS NULL ORDER BY name')
        .all(),
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
export function bookPreflight(book, lookup) {
  const warnings = [];
  for (const [i, page] of book.pages.entries())
    for (const el of page.elements) {
      if (el.type !== 'image') continue;
      const photo = el.photoId ? lookup(el.photoId) : null;
      if (!photo) {
        warnings.push({ page: i + 1, issue: 'missing', message: '照片已删除或无法读取' });
        continue;
      }
      if (['offline', 'missing', 'changed'].includes(photo.availability))
        warnings.push({
          page: i + 1,
          issue: 'offline',
          message: photo.name + ' 原片离线或内容变化',
        });
      const w = photo.exif?.width || 0,
        h = photo.exif?.height || 0;
      const dpi =
        el.fit === 'contain'
          ? Math.max(w / el.w, h / el.h) * 25.4
          : Math.min(w / el.w, h / el.h) * 25.4;
      if (!w || !h || dpi < 240)
        warnings.push({
          page: i + 1,
          issue: 'resolution',
          message: photo.name + ' 有效分辨率 ' + Math.round(dpi) + ' DPI',
        });
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
