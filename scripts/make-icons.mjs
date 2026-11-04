import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)),
  source = root + 'assets/logo-source.png',
  dir = root + 'assets/icons';
await mkdir(dir, { recursive: true });
const pngs = new Map();
for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
  const png = await sharp(source).resize(size, size, { fit: 'contain' }).png().toBuffer();
  pngs.set(size, png);
  await writeFile(`${dir}/icon-${size}.png`, png);
}
await writeFile(`${dir}/icon.png`, pngs.get(1024));
// ICO entries use the PNG encoding supported by current Windows versions.
const sizes = [16, 24, 32, 48, 64, 128, 256],
  header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (const [i, size] of sizes.entries()) {
  const p = 6 + i * 16,
    png = pngs.get(size);
  header[p] = size === 256 ? 0 : size;
  header[p + 1] = header[p];
  header.writeUInt16LE(1, p + 4);
  header.writeUInt16LE(32, p + 6);
  header.writeUInt32LE(png.length, p + 8);
  header.writeUInt32LE(offset, p + 12);
  offset += png.length;
}
await writeFile(`${dir}/icon.ico`, Buffer.concat([header, ...sizes.map((size) => pngs.get(size))]));
// Modern ICNS chunks contain PNG payloads, so no platform-specific converter is needed.
const chunks = [];
for (const [type, size] of [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32],
  ['ic12', 64],
  ['ic13', 256],
  ['ic14', 512],
]) {
  const png = pngs.get(size),
    h = Buffer.alloc(8);
  h.write(type, 0, 4, 'ascii');
  h.writeUInt32BE(8 + png.length, 4);
  chunks.push(h, png);
}
const ih = Buffer.alloc(8);
ih.write('icns', 0);
ih.writeUInt32BE(8 + chunks.reduce((n, c) => n + c.length, 0), 4);
await writeFile(`${dir}/icon.icns`, Buffer.concat([ih, ...chunks]));
console.log('Generated PNG, ICO and ICNS application icons.');
