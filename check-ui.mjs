import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
const referenced = [...app.matchAll(/\$\(['"]#([A-Za-z0-9_-]+)['"]\)/g)].map(match => match[1]);
const missing = [...new Set(referenced.filter(id => !ids.includes(id)))];

if (duplicates.length || missing.length) {
  if (duplicates.length) console.error(`Duplicate ids: ${[...new Set(duplicates)].join(', ')}`);
  if (missing.length) console.error(`Missing UI ids: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`UI contract OK: ${ids.length} unique elements, ${new Set(referenced).size} queried ids.`);
