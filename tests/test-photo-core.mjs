import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  entryKey,
  allEntries,
  resolveRefs,
  mergeRefs,
  matchesFrame,
  fitRatio,
  viewGeometry,
  histogramBins,
} from '../src/shared/photo-core.mjs';
const rolls = [
  {
    id: 'r1',
    name: '上海',
    date: '2026-10-01',
    frames: [
      {
        id: 'same',
        name: 'night.jpg',
        type: 'image',
        rating: 5,
        color: 'red',
        tags: ['夜景'],
        exif: { width: 3000, height: 2000, date: '2025:12:31 21:00:00', model: 'Leica M6' },
      },
      {
        id: 'b',
        name: 'day.jpg',
        type: 'image',
        rating: 0,
        tags: [],
        rejected: true,
        exif: { width: 1500, height: 3000 },
      },
    ],
  },
  {
    id: 'r2',
    frames: [
      { id: 'same', type: 'image' },
      { id: 'v', type: 'video' },
    ],
  },
];
test('collections use roll+frame references, preserve order and ignore deleted members', () => {
  const keys = ['r2:same', 'r1:same', 'deleted:gone', 'r1:same'];
  assert.deepEqual(resolveRefs(rolls, keys).map(entryKey), ['r2:same', 'r1:same']);
  assert.deepEqual(mergeRefs(keys.slice(0, 2), ['r1:same', 'r1:b']), [
    'r2:same',
    'r1:same',
    'r1:b',
  ]);
  assert.equal(allEntries(rolls).length, 4);
  assert.equal(rolls[0].frames.length, 2);
});
test('photo facets apply to the same image, combine with quick filters and prefer EXIF date', () => {
  const [entry, rejected] = allEntries(rolls);
  const criteria = {
    query: 'leica 夜景',
    rating: '4',
    color: 'red',
    type: 'image',
    review: 'kept',
    orientation: 'landscape',
    tag: '夜景',
    from: '2025-12-31',
    to: '2025-12-31',
  };
  assert.equal(matchesFrame(entry, criteria, 'favorites'), true);
  for (const changed of [
    { color: 'blue' },
    { from: '2026-01-01' },
    { to: '2025-12-30' },
    { tag: '街头' },
    { orientation: 'portrait' },
    { type: 'video' },
    { rating: 'unrated' },
    { query: 'nikon' },
  ])
    assert.equal(matchesFrame(entry, { ...criteria, ...changed }), false, JSON.stringify(changed));
  assert.equal(matchesFrame(entry, criteria, 'unrated'), false);
  assert.equal(
    matchesFrame(
      rejected,
      { rating: 'unrated', orientation: 'portrait', from: '2026-10-01', to: '2026-10-01' },
      'rejected',
    ),
    true,
  );
  assert.equal(matchesFrame(rejected, { review: 'kept' }), false);
  assert.equal(matchesFrame(allEntries(rolls)[2], { from: '2020-01-01' }), false);
  assert.equal(matchesFrame(allEntries(rolls)[2], { orientation: 'unknown', color: 'none' }), true);
});
test('fit and actual-pixel views use native dimensions and clamp pan to image bounds', () => {
  assert.equal(fitRatio(3000, 2000, 600, 600), 0.2);
  const fit = viewGeometry(3000, 2000, 600, 600, { ratio: null, cx: 0.5, cy: 0.5 });
  assert.equal(fit.width, 600);
  assert.equal(fit.height, 400);
  const actual = viewGeometry(3000, 2000, 600, 600, { ratio: 1, cx: 0.5, cy: 0.5 });
  assert.equal(actual.width, 3000);
  assert.equal(actual.height, 2000);
  assert.equal(actual.ratio, 1);
  const edge = viewGeometry(3000, 2000, 600, 600, { ratio: 1, cx: -4, cy: 7 });
  assert.equal(edge.cx, 0.1);
  assert.equal(edge.cy, 0.85);
  const small = viewGeometry(200, 100, 600, 600, { ratio: 1, cx: 0, cy: 1 });
  assert.equal(small.cx, 0.5);
  assert.equal(small.cy, 0.5);
  assert.equal(small.width, 200);
  assert.equal(fitRatio(0, 0, 600, 600), 1);
});
test('RGB histogram counts real channel bins and ignores transparent pixels', () => {
  const bins = histogramBins(
    new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 7, 8, 9, 0]),
  );
  assert.equal(bins[0][255], 1);
  assert.equal(bins[1][255], 1);
  assert.equal(bins[2][255], 1);
  assert.equal(bins[0][0], 2);
  assert.equal(bins[0][7], 0);
  for (const channel of bins)
    assert.equal(
      channel.reduce((a, b) => a + b, 0),
      3,
    );
});
