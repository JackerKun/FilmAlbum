import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { timelineDate, groupTimelineRolls } from '../src/client/timeline.mjs';
import { Catalog } from '../src/server/catalog.mjs';
test('chronicle groups year and month without inventing missing date precision', () => {
  const rows = [
    { id: 'a', date: '2024-06-12', frameCount: 12 },
    { id: 'b', date: '2025-01-01', datePrecision: 'year', frameCount: 36 },
    { id: 'c', date: '2024-06-13', frameCount: 10 },
    { id: 'd', date: '2024-03', datePrecision: 'month', frameCount: 8 },
    { id: 'e', date: '', frameCount: 5 },
    { id: 'f', date: '2025-08-02', frameCount: 6 },
  ];
  const groups = groupTimelineRolls(rows);
  assert.deepEqual(
    groups.map((g) => g.key),
    ['2025', '2024', 'undated'],
  );
  assert.deepEqual(
    groups[0].months.map((m) => m.key),
    ['08', 'unknown'],
  );
  assert.deepEqual(
    groups[1].months.map((m) => m.key),
    ['06', '03'],
  );
  assert.equal(groups[1].months[0].rolls.length, 2);
  assert.equal(groups[1].frames, 30);
  assert.equal(groups[2].frames, 5);
  assert.deepEqual(
    groupTimelineRolls(rows, 'asc').map((g) => g.key),
    ['2024', '2025', 'undated'],
  );
  assert.equal(timelineDate(rows[1]).date, '2025');
  assert.equal(timelineDate(rows[3]).date, '2024-03');
  assert.equal(timelineDate({ date: '2024-06-12', datePrecision: 'month' }).date, '2024-06');
  assert.equal(timelineDate({ date: 'garbage' }).year, null);
  assert.equal(rows[0].id, 'a');
});
test('timeline sorts globally before pagination, ignores creation sequence and keeps undated rolls last in both directions', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'film-timeline-')),
    c = new Catalog(root);
  t.after(() => {
    c.close();
    rmSync(root, { recursive: true, force: true });
  });
  const dates = ['2025-01-02', '2022-01-01', '', '2024-06-12', '2025-06-12', '2023', ''];
  for (const [i, date] of dates.entries())
    c.createRoll({ name: 'Roll ' + i, date, location: i === 4 ? '杭州' : '上海' });
  const all = c.query({ sort: 'timeline-desc', limit: 200 }, 'rolls');
  assert.deepEqual(
    all.items.map((r) => r.date),
    ['2025-06-12', '2025-01-02', '2024-06-12', '2023', '2022-01-01', '', ''],
  );
  const actual = [];
  for (let page = 0; page < 4; page++)
    actual.push(...c.query({ sort: 'timeline-desc', limit: 2, page }, 'rolls').items);
  assert.deepEqual(
    actual.map((r) => r.id),
    all.items.map((r) => r.id),
  );
  assert.equal(new Set(actual.map((r) => r.id)).size, 7);
  assert.deepEqual(
    c.query({ sort: 'timeline-asc', limit: 200 }, 'rolls').items.map((r) => r.date),
    ['2022-01-01', '2023', '2024-06-12', '2025-01-02', '2025-06-12', '', ''],
  );
  assert.equal(c.query({ sort: 'timeline-desc', location: '杭州' }, 'rolls').total, 1);
});
