import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
function checkDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) checkDirectory(path);
    else if (/\.(?:mjs|cjs|js)$/.test(entry.name))
      execFileSync(process.execPath, ['--check', path]);
  }
}
for (const directory of ['src', 'desktop', 'scripts', 'tests'])
  checkDirectory(join(root, directory));
for (const [file, modules] of [
  [
    'src/client/legacy/legacy.html',
    ['src/client/legacy/app.js', 'src/client/legacy/library-health.mjs'],
  ],
  [
    'src/client/index.html',
    ['src/client/studio.mjs', 'src/client/studio-review.mjs', 'src/client/timeline.mjs'],
  ],
]) {
  const html = readFileSync(join(root, file), 'utf8'),
    app = modules.map((name) => readFileSync(join(root, name), 'utf8')).join('\n');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  if (new Set(ids).size !== ids.length) throw Error(file + ': duplicate ids');
  const queried = [...app.matchAll(/\$\(['"]#([A-Za-z0-9_-]+)['"]\)/g)].map((m) => m[1]),
    generated = [...app.matchAll(/\bid\s*=\s*["']([A-Za-z0-9_-]+)["']/g)].map((m) => m[1]);
  const missing = [
    ...new Set(queried.filter((id) => !ids.includes(id) && !generated.includes(id))),
  ];
  if (missing.length) throw Error(file + ': missing ' + missing.join(', '));
  console.log(file + ': UI contract OK (' + ids.length + ' static elements)');
}
