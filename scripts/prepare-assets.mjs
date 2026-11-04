import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
const root = fileURLToPath(new URL('../', import.meta.url)),
  manifestPath = resolve(root, 'scripts/asset-sources.json'),
  manifest = JSON.parse(await readFile(manifestPath, 'utf8')),
  pin = process.argv.includes('--pin');
const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');
for (const [key, item] of Object.entries(manifest)) {
  const path = resolve(root, item.file);
  let raw;
  try {
    const bytes = await readFile(path);
    raw = item.gzip ? gunzipSync(bytes) : bytes;
    if (item.sha256 && digest(raw) !== item.sha256) throw Error('hash mismatch');
  } catch {
    if (!item.sha256 && !pin)
      throw Error(`${key}: asset hash is unpinned; maintainer must run --pin once`);
    console.log('Downloading bundled asset:', key);
    const response = await fetch(item.url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw Error(`${key}: HTTP ${response.status}`);
    raw = Buffer.from(await response.arrayBuffer());
    if (item.sha256 && digest(raw) !== item.sha256) throw Error(`${key}: SHA-256 mismatch`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path + '.tmp', item.gzip ? gzipSync(raw, { level: 9 }) : raw);
    await rename(path + '.tmp', path);
  }
  if (pin) item.sha256 = digest(raw);
  if (item.licenseUrl) {
    const license = resolve(root, item.licenseFile);
    if (
      !(await stat(license).then(
        (s) => s.isFile(),
        () => false,
      ))
    ) {
      const response = await fetch(item.licenseUrl);
      if (!response.ok) throw Error('Font license download failed');
      await mkdir(dirname(license), { recursive: true });
      await writeFile(license, await response.text());
    }
  }
}
if (pin) await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Bundled font and offline OCR models verified.');
