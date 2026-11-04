import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Catalog } from '../src/server/catalog.mjs';
import { bookStore, bookPreflight, validateBook } from '../src/server/books.mjs';
const sample = () => ({
  name: 'Book',
  width: 210,
  height: 297,
  bleed: 3,
  safe: 8,
  pages: [
    { elements: [{ id: 'e', type: 'text', x: 12, y: 12, w: 100, h: 40, text: 'Hello 世界' }] },
  ],
});
test('photobook saves exact physical layout with optimistic locking and reversible deletion', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'filmalbum-book-')),
    c = new Catalog(root),
    store = bookStore(c);
  t.after(() => {
    c.close();
    rmSync(root, { recursive: true, force: true });
  });
  const b = store.save(sample());
  assert.equal(store.get(b.id).width, 210);
  const next = store.save({ ...b, name: 'Edited' }, b.id);
  assert.equal(next.version, 2);
  assert.throws(() => store.save(b, b.id), { status: 409 });
  store.remove(b.id);
  assert.equal(store.list().length, 0);
  c.undo(c.history().find((h) => h.label === '删除画册').id);
  assert.equal(store.list().length, 1);
});
test('print preflight rejects blank frames and flags offline and insufficient resolution', () => {
  const b = sample();
  b.pages[0].elements = [{ type: 'image', x: 0, y: 0, w: 210, h: 297 }];
  assert.equal(bookPreflight(b, () => ({})).warnings[0].issue, 'missing');
  b.pages[0].elements[0].photoId = 'p';
  const result = bookPreflight(b, () => ({
    name: 'Tiny',
    availability: 'offline',
    exif: { width: 100, height: 100 },
  }));
  assert.deepEqual(
    result.warnings.map((w) => w.issue),
    ['offline', 'resolution'],
  );
});
test('book validation bounds pages, dimensions, element types and malformed geometry', () => {
  assert.throws(() => validateBook({ ...sample(), width: 1000 }));
  assert.throws(() => validateBook({ ...sample(), pages: [] }));
  const b = sample();
  b.pages[0].elements[0].w = -1;
  assert.throws(() => validateBook(b));
  const r = validateBook(sample());
  assert.equal(r.pages[0].elements[0].fontSize, 14);
});
