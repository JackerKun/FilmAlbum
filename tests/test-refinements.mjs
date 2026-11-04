import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { filmGeometry } from '../src/client/film-pull.mjs';
import {
  filterStocks,
  validateCustomStock,
  mergeCustomStocks,
} from '../src/shared/stock-catalog.mjs';
import { BOOK_PRESETS, alignElements, nudgeElements } from '../src/shared/book-tools.mjs';
import { Catalog } from '../src/server/catalog.mjs';
import { PlaceSearch } from '../src/server/map-geocode.mjs';
import { COUNTRY_VIEWS, countryOptions } from '../src/client/map-view.mjs';
test('135 is perforated cassette film; 120 has backing paper, take-up spool and frame geometry', () => {
  assert.equal(filmGeometry('135').perforated, true);
  assert.equal(filmGeometry('135').mechanism, 'cassette-leader');
  for (const format of ['120 · 6×6', '120 · 6×7', '120 · 6×17', '220 · 6×6']) {
    assert.equal(filmGeometry(format).medium, true);
    assert.equal(filmGeometry(format).perforated, false);
    assert.equal(filmGeometry(format).mechanism, 'backing-paper-takeup');
  }
  assert.equal(filmGeometry('120 · 6×6').ratio, 1);
  assert.equal(filmGeometry('120 · 6×7').ratio, 7 / 6);
  assert.equal(filmGeometry('120 · 6×4.5').ratio, 0.75);
});
test('film model lookup intersects format, BW/color, manufacturer and multi-word aliases', () => {
  assert.ok(filterStocks({}).length > 120);
  assert.ok(filterStocks({ format: '120', type: 'bw', query: 'ILFORD 400' }).length >= 2);
  assert.equal(filterStocks({ format: '120', query: 'ULTRAMAX' }).length, 0);
  assert.ok(filterStocks({ format: '135', type: 'color', query: '富士 200' }).length > 0);
  assert.ok(
    filterStocks({ format: '120', type: 'color', query: 'PORTRA 400' }).some(
      ([id]) => id === 'portra400',
    ),
  );
  assert.equal(filterStocks({ type: 'bw', query: 'PORTRA' }).length, 0);
  assert.ok(filterStocks({ format: '120', query: 'Kentmere 200' }).length);
});
test('custom film models remain searchable and survive library restart', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'film-custom-')),
    c = new Catalog(root);
  t.after(() => {
    c.close();
    rmSync(root, { recursive: true, force: true });
  });
  const custom = validateCustomStock(
    {
      name: 'Secret BW',
      brand: 'Small Lab',
      iso: 80,
      group: 'bw',
      formats: ['120'],
      aliases: '秘密胶片',
    },
    'custom-1',
  );
  c.setMeta('customStocks', [custom]);
  mergeCustomStocks(c.lists().customStocks);
  assert.equal(filterStocks({ format: '120', type: 'bw', query: '秘密' }).length, 1);
  const roll = c.transaction(() => c.createRoll({ stock: custom.id, name: 'test' }));
  assert.equal(c.query({ query: 'Secret' }, 'rolls').items[0].id, roll.id);
  const reopened = new Catalog(root);
  try {
    assert.equal(reopened.lists().customStocks[0].name, 'Secret BW');
    assert.equal(reopened.query({ query: 'Secret' }, 'rolls').items[0].id, roll.id);
  } finally {
    reopened.close();
  }
  assert.throws(() => validateCustomStock({ name: 'X', brand: 'Y', formats: [] }, 'x'));
});
test('book presets cover mini, square, panoramic, tall, ISO and inch formats within supported bounds', () => {
  assert.equal(BOOK_PRESETS.length, 50);
  assert.ok(BOOK_PRESETS.some((p) => p.width / p.height >= 3));
  assert.ok(BOOK_PRESETS.some((p) => p.height / p.width >= 3));
  assert.ok(BOOK_PRESETS.some((p) => p.width === p.height));
  assert.ok(BOOK_PRESETS.some((p) => p.width === 203.2 && p.height === 254));
  assert.ok(
    BOOK_PRESETS.every((p) => p.width >= 80 && p.height >= 80 && p.width <= 450 && p.height <= 450),
  );
});
test('alignment, safe margins, exact centering, distribution and locked element nudging use mm', () => {
  const els = [
    { id: 'a', x: 10, y: 5, w: 30, h: 20 },
    { id: 'b', x: 50, y: 40, w: 20, h: 30 },
    { id: 'c', x: 110, y: 65, w: 30, h: 20 },
    { id: 'locked', x: 11, y: 12, w: 10, h: 10, locked: true },
  ];
  alignElements(els, ['a'], 'center-x', { width: 210, height: 297, safe: 8 });
  assert.equal(els[0].x, 90);
  alignElements(els, ['a'], 'bottom', { width: 210, height: 297, safe: 8 });
  assert.equal(els[0].y, 269);
  els[0].x = 10;
  alignElements(els, ['a', 'b', 'c'], 'distribute-x', { width: 210, height: 297 });
  assert.equal(els[1].x, 65);
  nudgeElements(els, ['a', 'locked'], 0.1, -1);
  assert.equal(els[0].x, 10.1);
  assert.equal(els[3].x, 11);
});
test('county-scale map clustering separates nearby rolls, default China and worldwide country choices', (t) => {
  assert.deepEqual(COUNTRY_VIEWS.CN.center, [35, 104]);
  assert.ok(countryOptions().length > 240);
  const root = mkdtempSync(join(tmpdir(), 'film-atlas-')),
    c = new Catalog(root);
  t.after(() => {
    c.close();
    rmSync(root, { recursive: true, force: true });
  });
  c.transaction(() => {
    c.createRoll({ latitude: 30.5, longitude: 120.1 });
    c.createRoll({ latitude: 30.501, longitude: 120.101 });
  });
  assert.equal(c.atlas({ zoom: 4 }).clusters.length, 1);
  assert.equal(c.atlas({ zoom: 19 }).clusters.length, 2);
  assert.equal(
    c.query({ bounds: { west: 120.0999, east: 120.1001, south: 30.4999, north: 30.5001 } }, 'rolls')
      .total,
    1,
  );
});
test('place lookup is explicit, validates coordinates, normalizes county details and caches duplicates', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'film-places-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let requests = 0;
  const service = new PlaceSearch(root, {
    fetcher: async (url) => {
      requests++;
      assert.match(url, /countrycode=CN/);
      assert.equal(new URL(url).searchParams.get('q'), '德清县');
      return {
        ok: true,
        json: async () => ({
          features: [
            {
              geometry: { type: 'Point', coordinates: [119.98, 30.55] },
              properties: { name: '德清县', county: '德清县', state: '浙江省', countrycode: 'CN' },
            },
          ],
        }),
      };
    },
  });
  const a = await service.query({ q: '浙江省德清县', country: 'CN' }),
    b = await service.query({ q: '浙江省德清县', country: 'CN' });
  assert.equal(requests, 1);
  assert.equal(a[0].county, '德清县');
  assert.deepEqual(a, b);
  assert.throws(() => service.query({ reverse: true, lat: 100, lon: 0 }), { status: 400 });
});
