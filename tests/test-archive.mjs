import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
function harness() {
  const nodes = new Map();
  const document = {
    querySelector(selector) {
      if (!nodes.has(selector))
        nodes.set(selector, { value: '', innerHTML: '', textContent: '', append() {} });
      return nodes.get(selector);
    },
    createElement() {
      return { remove() {} };
    },
  };
  const context = { document, setTimeout, clearTimeout };
  const source = readFileSync(new URL('../src/client/legacy/app.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(
      "  initialize().catch(error => { console.error(error); toast('FilmAlbum 初始化失败', 'warning'); });",
      '  globalThis.api = { matchesRoll, renderNewRollPicker };',
    );
  runInNewContext(source, context);
  return { ...context.api, node: (selector) => document.querySelector(selector) };
}
const roll = {
  id: 'r',
  name: '雨夜',
  stock: 'portra400',
  camera: 'Leica M6',
  lens: '35mm',
  format: '135',
  status: 'scanned',
  date: '2025-12-31',
  location: '上海',
  process: 'C41',
  notes: '推一档',
  project: '城市纪实',
  frames: [
    { name: '桥.jpg', rating: 5, color: 'red', tags: ['夜景'] },
    { name: '街.jpg', rating: 0 },
  ],
};
test('archive search combines terms across metadata and frame tags without case sensitivity', () => {
  const { matchesRoll } = harness();
  for (const query of [
    'kodak 400 上海',
    'LEICA 35mm 夜景',
    '2025 C41 推一档',
    '城市纪实 已扫描 桥.jpg',
  ])
    assert.equal(matchesRoll(roll, query, 'all', {}), true, query);
  assert.equal(matchesRoll(roll, 'kodak 北京', 'all', {}), false);
});
test('combined facets, empty rolls, rating and color rules remain distinct', () => {
  const { matchesRoll } = harness();
  assert.equal(
    matchesRoll(roll, '', 'with-media', {
      brand: 'KODAK',
      stock: 'portra400',
      year: '2025',
      camera: 'Leica M6',
      lens: '35mm',
      format: '135',
      project: '城市纪实',
      status: 'scanned',
      color: 'red',
      rating: 'favorites',
    }),
    true,
  );
  for (const facet of [
    { year: '2026' },
    { color: 'blue' },
    { rating: 'unrated' },
    { location: '北京' },
  ])
    assert.equal(matchesRoll(roll, '', 'all', facet), false);
  const empty = { ...roll, frames: [] };
  assert.equal(matchesRoll(empty, '', 'empty', {}), true);
  assert.equal(matchesRoll(empty, '', 'with-media', {}), false);
  assert.equal(matchesRoll(empty, '', 'all', { rating: 'unrated' }), false);
  assert.equal(
    matchesRoll({ ...roll, frames: [{ rating: 0 }] }, '', 'all', { rating: 'unrated' }),
    true,
  );
  assert.equal(
    matchesRoll({ ...roll, frames: [{ rating: 3 }] }, '', 'all', { rating: 'favorites' }),
    false,
  );
});
test('stock search supports multiple terms, no-result feedback and retains the selected stock', () => {
  const { renderNewRollPicker, node } = harness();
  node('#new-roll-format').value = '135';
  node('#new-roll-stock').value = 'portra400';
  node('#new-roll-stock-search').value = 'FUJI 100';
  renderNewRollPicker();
  assert.match(node('#new-stock-count').textContent, /^3 款/);
  assert.match(node('#new-roll-stock-grid').innerHTML, /ACROS II/);
  assert.doesNotMatch(node('#new-roll-stock-grid').innerHTML, /KODAK/);
  node('#new-roll-stock-search').value = 'no-such-film';
  renderNewRollPicker();
  assert.match(node('#new-roll-stock-grid').innerHTML, /没有匹配/);
  assert.equal(node('#new-roll-stock').value, 'portra400');
});
