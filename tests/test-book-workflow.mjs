import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Catalog } from '../src/server/catalog.mjs';
import { resizeBookElement, cropBookImage } from '../src/shared/book-tools.mjs';
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.00001, `${a} ≈ ${b}`);
function corner(el, sx, sy) {
  const r = ((el.rotation || 0) * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r);
  return [
    el.x + el.w / 2 + (c * sx * el.w) / 2 - (s * sy * el.h) / 2,
    el.y + el.h / 2 + (s * sx * el.w) / 2 + (c * sy * el.h) / 2,
  ];
}
test('all four resize corners preserve the opposite anchor, including rotated frames and aspect lock', () => {
  for (const rotation of [0, 30, 90, -60])
    for (const handle of ['nw', 'ne', 'sw', 'se']) {
      const el = { x: 18, y: 22, w: 80, h: 50, rotation },
        sx = handle.includes('w') ? -1 : 1,
        sy = handle.includes('n') ? -1 : 1;
      for (const keepAspect of [false, true]) {
        const next = { ...el, ...resizeBookElement(el, handle, 12, 7, { keepAspect }) };
        const before = corner(el, -sx, -sy),
          after = corner(next, -sx, -sy);
        near(before[0], after[0]);
        near(before[1], after[1]);
        if (keepAspect) near(next.w / next.h, el.w / el.h);
      }
    }
  const tiny = resizeBookElement({ x: 0, y: 0, w: 20, h: 10 }, 'se', -100, -100, {
    keepAspect: true,
  });
  assert.ok(tiny.h >= 5 && tiny.w >= 5);
});
test('crop dragging follows image motion, clamps to available overflow and respects rotation and fit', () => {
  const el = { x: 0, y: 0, w: 100, h: 100, cropX: 0.5, cropY: 0.5, fit: 'cover' };
  assert.deepEqual(cropBookImage(el, 25, 50, 2000, 1000), { cropX: 0.25, cropY: 0.5 });
  assert.equal(cropBookImage(el, -1000, 0, 2000, 1000).cropX, 1);
  assert.equal(cropBookImage(el, 1000, 0, 2000, 1000).cropX, 0);
  near(cropBookImage({ ...el, rotation: 90 }, 0, 25, 2000, 1000).cropX, 0.25);
  assert.deepEqual(cropBookImage({ ...el, fit: 'contain' }, 20, 20, 2000, 1000), {
    cropX: 0.5,
    cropY: 0.5,
  });
  assert.deepEqual(cropBookImage(el, 5, 5, 0, 0), { cropX: 0.5, cropY: 0.5 });
});
test('book asset filtering intersects location, roll, dates, format, type, tags, orientation and versions across bounded pages', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'film-book-assets-')),
    c = new Catalog(dir);
  t.after(() => {
    c.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const a = c.createRoll({
      name: '杭州散步',
      location: '浙江省杭州市西湖区',
      format: '120 · 6×6',
      stock: 'hp5',
      date: '2024-06-20',
      camera: 'Rolleiflex',
    }),
    b = c.createRoll({
      name: '上海街头',
      location: '上海黄浦区',
      format: '135',
      stock: 'portra400',
      date: '2023-06-20',
    });
  const m = c.addMedia({ path: 'media/a.bin', mime: 'image/png' }),
    n = c.addMedia({ path: 'media/b.bin', mime: 'image/png' });
  const p = c.addPhoto(a.id, m, {
      name: '湖畔',
      exif: { date: '2024:06:21', width: 3000, height: 2000 },
    }),
    q = c.addPhoto(a.id, n, {
      name: '古树',
      exif: { date: '2024:06:22', width: 2000, height: 3000 },
    });
  c.addPhoto(b.id, m, { name: '街景', exif: { width: 3000, height: 2000 } });
  c.patch('photos', p.id, { tags: ['风景'], rating: 5, color: 'green' }, p.version);
  c.addPhoto(a.id, n, { name: '重扫', exif: { width: 4000, height: 3000 } }, p.id);
  const filters = {
    place: '西湖',
    rollId: a.id,
    from: '2024-06-21',
    to: '2024-06-21',
    medium: '120',
    stockType: 'bw',
    camera: 'Rolleiflex',
    rating: 4,
    tag: '风景',
    orientation: 'landscape',
    minVersions: 2,
    type: 'image',
  };
  assert.equal(c.query(filters).total, 1);
  assert.equal(c.query({ ...filters, stockType: 'color' }).total, 0);
  assert.equal(c.query({ ...filters, orientation: 'portrait' }).total, 0);
  assert.equal(c.query({ ...filters, dateSource: 'roll' }).total, 0);
  assert.equal(
    c.query({ rollId: a.id, from: '2024-06-20', to: '2024-06-20', dateSource: 'roll' }).total,
    2,
  );
  assert.equal(c.query({ place: '浙江省', medium: '135' }).total, 0);
  assert.equal(c.query({ place: '上海', stockType: 'color', medium: '135' }).total, 1);
  assert.equal(c.query({ rollId: a.id, sort: 'date-asc', limit: 1, page: 1 }).items[0].id, q.id);
  assert.equal(c.query({ rollId: a.id, limit: 1 }).pages, 2);
  assert.ok(c.facets().tags.some((t) => t.value === '风景'));
  c.batch('rolls', { ids: [a.id] }, { deleted_at: Date.now() });
  assert.equal(c.query(filters).total, 0);
  assert.equal(c.facets().tags.length, 0);
});
