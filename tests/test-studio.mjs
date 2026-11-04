import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Catalog } from '../src/server/catalog.mjs';
import { Sha256 } from '../src/shared/sha256.mjs';
import { createHash } from 'node:crypto';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'filmalbum-studio-'));
  const c = new Catalog(root);
  t.after(() => {
    c.close();
    rmSync(root, { recursive: true, force: true });
  });
  const r = c.transaction(() =>
    c.createRoll({
      name: '雨夜东京',
      camera: 'Leica M6',
      date: '2024-10-01',
      latitude: 35.68,
      longitude: 139.76,
    }),
  );
  const media = c.addMedia({ path: 'media/a.bin', size: 3, mime: 'image/png' });
  const p = c.addPhoto(r.id, media, { name: 'Street 01', exif: { width: 1600, height: 1000 } });
  return { c, r, p, media, root };
}
test('primary catalog supports indexed cross-field search, filters and bounded pages', (t) => {
  const { c, r, p } = fixture(t);
  assert.equal(c.query({ query: '雨夜 M6 PORTRA' }, 'rolls').total, 1);
  c.patch('photos', p.id, { rating: 5, tags: ['街拍'] }, 1);
  assert.equal(c.query({ query: '东京 街拍', rating: 4 }).total, 1);
  assert.equal(c.query({ rating: 'unrated' }).total, 0);
  assert.equal(c.query({ limit: 9999 }).limit, 200);
  assert.equal(c.atlas().total, 1);
  assert.equal(c.atlas({ bounds: { west: 0, east: 100, south: 0, north: 60 } }).total, 0);
  assert.equal(c.row('rolls', r.id).code, r.code);
});
test('conflict-safe record/batch undo and redo preserve later edits', (t) => {
  const { c, p } = fixture(t);
  c.patch('photos', p.id, { rating: 4 }, 1, 'Rating test');
  const h = c.history().find((h) => h.label === 'Rating test');
  assert.throws(() => c.patch('photos', p.id, { rating: 2 }, 1), { status: 409 });
  c.undo(h.id);
  assert.equal(c.row('photos', p.id).rating, 0);
  c.undo(h.id, true);
  assert.equal(c.row('photos', p.id).rating, 4);
  const rev = c.revision();
  c.batch('photos', { ids: [p.id], expectedRevision: rev }, { color: 'red' }, 'Color test');
  assert.throws(
    () => c.batch('photos', { ids: [p.id], expectedRevision: rev }, { color: 'blue' }),
    { status: 409 },
  );
  assert.throws(() => c.undo(h.id), { status: 409 });
});
test('versions keep one logical frame and primary metadata switches independently', (t) => {
  const { c, p, r } = fixture(t);
  const mid = c.addMedia({ path: 'media/b.bin', size: 8, mime: 'image/tiff' });
  const added = c.addPhoto(
    r.id,
    mid,
    { name: '重扫', kind: 'rescan', exif: { width: 4000, height: 3000 } },
    p.id,
  );
  assert.equal(c.query({}).total, 1);
  assert.equal(c.versions(p.id).length, 2);
  c.patch('photos', p.id, { primary_version: added.newVersion }, c.row('photos', p.id).version);
  assert.equal(c.query({ id: p.id }).items[0].mediaId, mid);
  assert.equal(c.query({ id: p.id }).items[0].exif.width, 4000);
});
test('collection membership and project curation can be undone without deleting originals', (t) => {
  const { c, p, media } = fixture(t);
  const col = c.createList('collections', { name: '精选' });
  c.membership('collections', col.id, [p.id]);
  assert.equal(c.query({ collectionId: col.id }).total, 1);
  const event = c.history().find((h) => h.label.startsWith('加入收藏'));
  c.undo(event.id);
  assert.equal(c.query({ collectionId: col.id }).total, 0);
  c.undo(event.id, true);
  assert.equal(c.query({ collectionId: col.id }).total, 1);
  const project = c.createList('projects', { name: '东京', chapters: ['夜色'] });
  c.membership('projects', project.id, [p.id]);
  c.organize(project.id, [p.id], { chapter: '夜色', stage: 'final' });
  assert.equal(c.query({ projectId: project.id, chapter: '夜色', stage: 'final' }).total, 1);
  const item = c.projectItems(project.id)[0];
  c.patchItem(item.id, { x: 99, w: 400 }, item.version);
  const h = c.history().find((h) => h.label === '调整项目照片');
  c.undo(h.id);
  assert.equal(c.projectItems(project.id)[0].x, 0);
  assert.ok(c.raw('media', media));
});
test('trash is recoverable, purge keeps unrelated media, permanent codes never repeat', (t) => {
  const { c, r, p, media, root } = fixture(t);
  const orphan = c.addMedia({ path: 'media/orphan.bin' });
  writeFileSync(join(root, 'media', 'orphan.bin'), 'keep');
  c.batch('rolls', { ids: [r.id] }, { deleted_at: Date.now() });
  assert.equal(c.query({}).total, 0);
  assert.equal(c.query({ trash: true }).total, 1);
  c.batch('rolls', { ids: [r.id] }, { deleted_at: null });
  assert.equal(c.query({}).total, 1);
  c.batch('rolls', { ids: [r.id] }, { deleted_at: Date.now() });
  const result = c.purge();
  assert.equal(result.photos, 1);
  assert.equal(result.unused.length, 1);
  assert.equal(result.unused[0].id, media);
  assert.ok(c.raw('media', orphan));
  const next = c.transaction(() => c.createRoll());
  assert.ok(next.seq > r.seq);
  assert.notEqual(next.code, r.code);
});
test('streaming browser SHA-256 agrees with native SHA-256 across uneven chunk boundaries', () => {
  for (const data of [Buffer.alloc(0), Buffer.from('abc'), Buffer.alloc(1000003, 97)]) {
    const hash = new Sha256();
    for (let i = 0; i < data.length; i += 127) hash.update(data.subarray(i, i + 127));
    assert.equal(hash.hex(), createHash('sha256').update(data).digest('hex'));
  }
});

test('undo supports successive edits in reverse order while detecting later curation edits', (t) => {
  const { c, p } = fixture(t);
  c.patch('photos', p.id, { rating: 3 }, 1, 'First');
  c.patch('photos', p.id, { color: 'red' }, 2, 'Second');
  const first = c.history().find((h) => h.label === 'First'),
    second = c.history().find((h) => h.label === 'Second');
  c.undo(second.id);
  c.undo(first.id);
  assert.equal(c.row('photos', p.id).rating, 0);
  c.undo(first.id, true);
  assert.equal(c.row('photos', p.id).rating, 3);
  const project = c.createList('projects', { name: 'Series' });
  c.membership('projects', project.id, [p.id]);
  const membership = c.history().find((h) => h.label.startsWith('加入项目'));
  const item = c.projectItems(project.id)[0];
  c.patchItem(item.id, { x: 120 }, item.version);
  assert.throws(() => c.undo(membership.id), { status: 409 });
  const layout = c.history().find((h) => h.label === '调整项目照片');
  c.undo(layout.id);
  c.undo(membership.id);
  assert.equal(c.projectItems(project.id).length, 0);
});

test('manual collection order is persistent and undoable', (t) => {
  const { c, p, r, media } = fixture(t),
    second = c.addPhoto(r.id, media, { name: 'Second' }),
    col = c.createList('collections', { name: 'Sequence' });
  c.membership('collections', col.id, [p.id, second.id]);
  c.reorderCollection(col.id, second.id, p.id);
  assert.deepEqual(
    c.query({ collectionId: col.id }).items.map((p) => p.id),
    [second.id, p.id],
  );
  c.undo(c.history().find((h) => h.label === '调整收藏顺序').id);
  assert.deepEqual(
    c.query({ collectionId: col.id }).items.map((p) => p.id),
    [p.id, second.id],
  );
});
