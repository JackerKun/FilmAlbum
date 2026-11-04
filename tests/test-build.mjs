import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const plan = (...args) => {
  const result = spawnSync(process.execPath, ['scripts/build.mjs', ...args, '--plan'], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};
test('build plan covers macOS and Windows on both architectures without touching files', () => {
  const rows = plan('all');
  assert.equal(rows.length, 4);
  assert.deepEqual(new Set(rows.map((r) => r.platform)), new Set(['mac', 'win']));
  assert.deepEqual(new Set(rows.map((r) => r.arch)), new Set(['arm64', 'x64']));
  assert.ok(
    rows
      .filter((r) => r.platform === 'mac')
      .every((r) => r.requiresMacHost && r.formats.includes('dmg')),
  );
});
test('architecture host value does not accidentally change requested target platforms', () => {
  const rows = plan('all', '--arch', 'host');
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.arch === process.arch));
  assert.equal(plan('win', '--arch', 'x64').length, 1);
  const bad = spawnSync(process.execPath, ['scripts/build.mjs', 'mac', '--arch'], {
    encoding: 'utf8',
  });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /--arch must/);
});
test('runtime staging allowlist excludes personal data, test fixtures, build output and source tools', () => {
  const names = JSON.parse(
    readFileSync(new URL('../packaging/runtime-files.json', import.meta.url)),
  );
  assert.ok(names.includes('src/server'));
  assert.ok(names.includes('src/client'));
  assert.ok(names.includes('src/shared'));
  assert.ok(names.includes('public'));
  assert.ok(!names.some((n) => /^(data|do|test|dist|\.git|qa|scripts)/.test(n)));
  assert.ok(!names.some((n) => n.includes('catalog.sqlite')));
});
