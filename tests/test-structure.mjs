import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, stat, readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATIC_FILES } from '../src/server/static-files.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (/\.(mjs|cjs|js)$/.test(entry.name)) yield path;
  }
}
test('organized source keeps every relative module import resolvable and server modules private', async () => {
  for (const folder of ['src', 'desktop', 'scripts', 'tests'])
    for await (const path of files(join(root, folder))) {
      const code = await readFile(path, 'utf8');
      for (const match of code.matchAll(
        /(?:from\s*|import\s*\(\s*|\bimport\s+|require\s*\(\s*)['"](\.[^'"]+\.(?:mjs|cjs|js))['"]/g,
      )) {
        assert.ok((await stat(resolve(dirname(path), match[1]))).isFile(), path + ' → ' + match[1]);
      }
    }
  for (const [url, path] of STATIC_FILES) {
    assert.ok(!path.startsWith('src/server/'), url);
    assert.ok((await stat(join(root, path))).isFile(), path);
  }
  assert.ok(STATIC_FILES.has('/studio.mjs'));
  assert.ok(STATIC_FILES.has('/shared/stock-catalog.mjs'));
  assert.ok(!STATIC_FILES.has('/server.mjs'));
});
test('package scripts and native sources follow the new layout without moving default library data', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.serve, 'node src/server/server.mjs');
  assert.equal(pkg.scripts.test, 'node scripts/test.mjs');
  assert.ok((await stat(join(root, 'native/Native.swift'))).isFile());
  const server = await readFile(join(root, 'src/server/server.mjs'), 'utf8');
  assert.match(server, /join\(ROOT, 'data'\)/);
  assert.match(server, /new URL\('\.\.\/\.\.\//);
});
