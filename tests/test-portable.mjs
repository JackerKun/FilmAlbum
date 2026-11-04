import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { portableNative, portableCapabilities } from '../src/server/portable-native.mjs';
import { qrSvg } from '../src/shared/qr.mjs';
async function fixture(t, name) {
  const dir = process.env.FILMALBUM_QA_DIR
    ? join(resolve(process.env.FILMALBUM_QA_DIR), name)
    : await mkdtemp(join(tmpdir(), 'film-portable-'));
  await mkdir(dir, { recursive: true });
  if (!process.env.FILMALBUM_QA_DIR) t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
test('portable metadata and full-size / bounded TIFF previews work without Swift and preserve originals', async (t) => {
  const dir = await fixture(t, 'images'),
    image = join(dir, 'original.tiff'),
    before = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: '#a33322' },
    })
      .tiff()
      .toBuffer();
  await writeFile(image, before);
  const m = await portableNative(dir, 'metadata', image);
  assert.equal(m.width, 1200);
  assert.equal(m.height, 800);
  const small = join(dir, 'small.jpg'),
    full = join(dir, 'full.jpg');
  await portableNative(dir, 'preview', image, small, 320);
  await portableNative(dir, 'preview', image, full, 0);
  assert.equal((await sharp(small).metadata()).width, 320);
  assert.equal((await sharp(full).metadata()).width, 1200);
  assert.deepEqual(await readFile(image), before);
  assert.equal(portableCapabilities().classify, false);
});
test('portable QR decoder reads existing sleeve labels', async (t) => {
  const dir = await fixture(t, 'qr'),
    path = join(dir, 'label.png');
  await sharp(Buffer.from(qrSvg('FILMALBUM:FA-2026-000123')))
    .resize(800, 800, { kernel: 'nearest' })
    .png()
    .toFile(path);
  assert.deepEqual((await portableNative(dir, 'barcode', path)).codes, [
    'FILMALBUM:FA-2026-000123',
  ]);
});
test('portable photobook PDF embeds Chinese text, physical boxes, crop and rotation across pages', async (t) => {
  const dir = await fixture(t, 'book'),
    image = join(dir, 'landscape.png'),
    manifest = join(dir, 'book.json'),
    out = join(dir, 'book.pdf');
  await portableNative(dir, 'demo', image, 2);
  const b = {
    name: '打印验证',
    width: 210,
    height: 148,
    bleed: 3,
    pages: [
      {
        background: '#ffffff',
        elements: [
          {
            type: 'text',
            x: 12,
            y: 12,
            w: 180,
            h: 20,
            text: '胶片手记 · Film Album',
            fontSize: 22,
            color: '#252a24',
          },
          {
            type: 'image',
            x: 12,
            y: 38,
            w: 120,
            h: 90,
            path: image,
            fit: 'cover',
            cropX: 0.2,
            cropY: 0.5,
          },
          {
            type: 'text',
            x: 140,
            y: 40,
            w: 56,
            h: 70,
            text: '杭州 / 西湖\n2026.11.03\n中英文排版与\n毫米坐标验证。',
            fontSize: 14,
            color: '#84723c',
          },
        ],
      },
      {
        background: '#eee9db',
        elements: [
          { type: 'image', x: 50, y: 25, w: 110, h: 75, path: image, fit: 'contain', rotation: 12 },
          {
            type: 'text',
            x: 15,
            y: 115,
            w: 180,
            h: 20,
            text: '第二页 · Crop / rotate / contain',
            fontSize: 16,
            color: '#252a24',
            align: 'center',
          },
        ],
      },
    ],
  };
  await writeFile(manifest, JSON.stringify(b));
  const result = await portableNative(dir, 'bookpdf', manifest, out),
    pdf = await PDFDocument.load(await readFile(out));
  assert.equal(result.pages, 2);
  assert.equal(pdf.getPageCount(), 2);
  const page = pdf.getPage(0),
    mm = 72 / 25.4;
  assert.ok(Math.abs(page.getTrimBox().width - 210 * mm) < 0.001);
  assert.ok(Math.abs(page.getBleedBox().width - 216 * mm) < 0.001);
  assert.ok(Math.abs(page.getMediaBox().width - 228 * mm) < 0.001);
  assert.ok((await stat(out)).size > 20000);
});
test('portable contact sheets preserve page count and Chinese captions', async (t) => {
  const dir = await fixture(t, 'contact'),
    manifest = join(dir, 'contact.json'),
    out = join(dir, 'contact.pdf');
  await writeFile(
    manifest,
    JSON.stringify({
      title: '摄影年鉴 / Contact sheet',
      items: Array.from({ length: 7 }, (_, i) => ({
        name: '照片 ' + (i + 1),
        caption: '杭州 · 135 · PORTRA 400',
      })),
    }),
  );
  assert.equal((await portableNative(dir, 'pdf', manifest, out)).pages, 2);
  assert.equal((await portableNative(dir, 'pdfinfo', out)).pages, 2);
});
test(
  'portable OCR uses bundled models offline and reports text rather than invented classification',
  { timeout: 120000 },
  async (t) => {
    const dir = await fixture(t, 'ocr'),
      path = join(dir, 'text.png');
    await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="360"><rect width="1400" height="360" fill="white"/><text x="70" y="230" font-family="sans-serif" font-weight="bold" font-size="160" fill="black">FILM ALBUM</text></svg>',
      ),
    )
      .png()
      .toFile(path);
    const result = await portableNative(dir, 'analyze', path);
    assert.match(result.text, /FILM\s+ALBUM/i);
    assert.equal(result.classificationAvailable, false);
    assert.deepEqual(result.labels, []);
  },
);
