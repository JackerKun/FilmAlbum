import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Catalog } from '../src/server/catalog.mjs';
import { rollCoordinates, rollPosition, coordinateLabel } from '../src/shared/geolocation.mjs';
import { mapRollQuery, createMapRollPicker } from '../src/client/map-roll-picker.mjs';

test('location status comes from valid coordinates, including zero, independent of place names', () => {
  assert.equal(rollPosition({ latitude: 31.2, longitude: 121.4, location: '' }).kind, 'located');
  assert.deepEqual(rollCoordinates({ latitude: 0, longitude: 0 }), { latitude: 0, longitude: 0 });
  assert.equal(coordinateLabel({ latitude: 0, longitude: 0 }), '0.00000, 0.00000');
  assert.equal(rollPosition({ location: '杭州' }).kind, 'name-only');
  assert.equal(rollPosition({}).kind, 'unlocated');
  for (const value of ['', null, undefined, '   ', 'not-a-number', true, [], {}, 91])
    assert.equal(rollCoordinates({ latitude: value, longitude: 121 }), null, String(value));
  assert.equal(rollCoordinates({ latitude: 31, longitude: 181 }), null);
  assert.deepEqual(rollCoordinates({ latitude: '31.2', longitude: '121.4' }), {
    latitude: 31.2,
    longitude: 121.4,
  });
});
function catalogFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'filmalbum-map-picker-')),
    c = new Catalog(dir);
  t.after(() => {
    c.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return c;
}
test('roll filters and atlas agree on persisted location status and update after saving unnamed coordinates', (t) => {
  const c = catalogFixture(t),
    located = c.createRoll({ name: 'Coordinates without place', latitude: 0, longitude: 0 }),
    named = c.createRoll({ name: 'Place without coordinates', location: '杭州' }),
    blank = c.createRoll({ name: 'Blank coordinate strings', latitude: '', longitude: '' }),
    legacy = c.createRoll({ name: 'Legacy numeric strings', latitude: '31.2', longitude: '121.4' });
  assert.deepEqual(
    new Set(c.query({ geolocation: 'located' }, 'rolls').items.map((r) => r.id)),
    new Set([located.id, legacy.id]),
  );
  assert.equal(c.atlas({}).total, 2);
  assert.equal(c.query({ geolocation: 'named' }, 'rolls').items[0].id, named.id);
  assert.equal(c.query({ geolocation: 'unlocated' }, 'rolls').total, 2);
  c.patch('rolls', blank.id, { latitude: 30.5, longitude: 120.5, location: '' }, blank.version);
  assert.equal(c.query({ id: blank.id, geolocation: 'located' }, 'rolls').total, 1);
  assert.equal(c.atlas({}).total, 3);
  assert.equal(rollPosition(c.row('rolls', blank.id)).kind, 'located');
});
test('picker filters intersect stock, format, dates, equipment, location, photo tags and pagination', (t) => {
  const c = catalogFixture(t),
    roll = c.createRoll({
      name: 'Shanghai evening',
      stock: 'hp5',
      format: '120 · 6×6',
      date: '2026-07-13',
      camera: 'Hasselblad',
      lens: '80mm',
      location: '上海市黄浦区',
      project: '夏日',
      latitude: 31.23,
      longitude: 121.47,
    });
  const m = c.addMedia({ path: 'media/test.bin', mime: 'image/jpeg' });
  const photo = c.addPhoto(roll.id, m);
  c.patch('photos', photo.id, { tags: ['街拍'] }, photo.version);
  c.createRoll({ name: 'Another', stock: 'portra400', format: '135', date: '2025-01-01' });
  const filter = mapRollQuery({
    query: 'Shanghai',
    medium: '120',
    stockType: 'bw',
    year: '2026',
    from: '2026-07-01',
    to: '2026-07-31',
    camera: 'Hasselblad',
    lens: '80mm',
    place: '黄浦',
    project: '夏日',
    tag: '街拍',
    hasPhotos: true,
    geolocation: 'located',
  });
  assert.equal(c.query(filter, 'rolls').items[0].id, roll.id);
  assert.equal(c.query({ ...filter, medium: '135' }, 'rolls').total, 0);
  assert.equal(c.query({ ...filter, tag: '风景' }, 'rolls').total, 0);
  for (let i = 0; i < 50; i++) c.createRoll({ name: 'Undated ' + i });
  const page = c.query(mapRollQuery({ geolocation: 'unlocated' }, 1), 'rolls');
  assert.equal(page.items.length, 24);
  assert.equal(page.total, 51);
  assert.equal(page.pages, 3);
});
test('an old async result cannot replace newer picker filters or a closed dialog', async (t) => {
  const oldDocument = globalThis.document;
  globalThis.document = { documentElement: { lang: 'zh-CN' } };
  t.after(() => {
    globalThis.document = oldDocument;
  });
  const nodes = new Map();
  const host = {
    innerHTML: '',
    querySelector(selector) {
      if (!nodes.has(selector))
        nodes.set(selector, {
          innerHTML: '',
          textContent: '',
          disabled: false,
          setAttribute() {},
          removeAttribute() {},
          focus() {},
        });
      return nodes.get(selector);
    },
    querySelectorAll() {
      return [];
    },
  };
  const requests = [];
  const picker = createMapRollPicker({
    api: (path) => new Promise((resolve) => requests.push({ path, resolve })),
    E: String,
    thumb: (id) => '/preview/' + id,
    stocks: {},
    onSelect() {},
    toast() {},
  });
  picker.mount(host);
  const control = {
    tagName: 'SELECT',
    dataset: { pickerFilter: 'geolocation' },
    type: 'select-one',
    value: 'located',
  };
  host.onchange({ target: { closest: () => control } });
  assert.equal(requests.length, 2);
  assert.equal(
    JSON.parse(new URL(requests[1].path, 'http://test').searchParams.get('filter')).geolocation,
    'located',
  );
  requests[1].resolve({
    items: [
      {
        id: 'new',
        name: 'Fresh row',
        code: 'NEW',
        latitude: 31,
        longitude: 121,
        location: '',
        frameCount: 1,
      },
    ],
    total: 1,
    pages: 1,
  });
  await new Promise((r) => setImmediate(r));
  const html = host.querySelector('[data-picker-results]').innerHTML;
  assert.match(html, /Fresh row/);
  assert.match(html, /map-geo-badge located/);
  requests[0].resolve({ items: [{ id: 'old', name: 'Stale row' }], total: 1, pages: 1 });
  await new Promise((r) => setImmediate(r));
  assert.equal(host.querySelector('[data-picker-results]').innerHTML, html);
  picker.destroy();
  assert.equal(host.onclick, null);
});
