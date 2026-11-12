import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { PDFDocument, PDFName, decodePDFRawStream } from 'pdf-lib';
import {
  BOOK_THEMES,
  createPhotobook,
  applyLayout,
  applyTheme,
  textElement,
  photoUsage,
  reflowChapter,
  movePage,
  assetSnapshot,
  mapPages,
  createCoverDocument,
  makePanorama,
  syncPanorama,
  refreshDecorations,
} from '../src/shared/book-model.mjs';
import { bookPreflight, validateBook } from '../src/server/books.mjs';
import { portableNative } from '../src/server/portable-native.mjs';
const photos = Array.from({ length: 40 }, (_, i) => ({
  id: 'p' + i,
  mediaId: 'm' + i,
  name: '照片 ' + i,
  roll_id: 'r' + Math.floor(i / 14),
  rollName: '胶卷 ' + Math.floor(i / 14),
  rollCode: 'FA-' + i,
  frameNo: String(i + 1),
  rollDate: '1998',
  rollDatePrecision: 'year',
  date: '2026-11-12',
  fileDateSource: 'scan',
  exif: { width: 6000, height: 4000, date: '2026-11-12' },
  rollCoordinates: { latitude: 35 + i * 0.2, longitude: 110 + i * 0.2 },
  location: '拍摄地 ' + i,
  camera: 'Leica M6',
  stock: 'portra400',
}));
const identities = (b) =>
  new Set([...Object.keys(photoUsage(b)), ...b.pending.map((e) => e.photoId).filter(Boolean)]);
function assertTextWidths(pdf, page) {
  const fonts = page.node.Resources().lookup(PDFName.of('Font'));
  const tables = new Map();
  for (const key of fonts.keys()) {
    const font = fonts.lookup(key);
    const descendant = font.lookup(PDFName.of('DescendantFonts')).lookup(0);
    const w = descendant.lookup(PDFName.of('W'));
    const ids = new Set();
    for (let i = 0; i < w.size(); i += 2) {
      const start = w.lookup(i).asNumber(),
        widths = w.lookup(i + 1);
      for (let n = 0; n < widths.size(); n++) ids.add(start + n);
    }
    tables.set(key.toString().slice(1), ids);
  }
  let used = 0,
    active;
  const contents = page.node.Contents();
  for (let i = 0; i < contents.size(); i++) {
    const data = Buffer.from(decodePDFRawStream(contents.lookup(i)).decode()).toString();
    for (const m of data.matchAll(/\/([^\s]+)\s+[\d.]+\s+Tf|<([\da-fA-F]+)>\s*Tj/g)) {
      if (m[1]) active = tables.get(m[1]);
      else
        for (let n = 0; n < m[2].length; n += 4) {
          assert.ok(
            active?.has(parseInt(m[2].slice(n, n + 4), 16)),
            'Every printed glyph needs its actual width, including Noto numeric alternates',
          );
          used++;
        }
    }
  }
  assert.ok(used > 10);
}
test('a forty-photo film book keeps all sources, chapters, map coordinates, index and coarse dates', () => {
  const b = createPhotobook(photos, {
    theme: 'archive',
    groupBy: 'roll',
    rollNotes: true,
    map: true,
    contact: true,
  });
  assert.equal(Object.keys(b.assets).length, 40);
  assert.equal(b.pages.filter((p) => p.role === 'chapter').length, 3);
  assert.ok(b.pages.some((p) => p.role === 'contact'));
  assert.ok(b.pages.some((p) => p.role === 'notes'));
  assert.ok(b.pages.some((p) => p.role === 'map'));
  assert.equal(b.assets.p0.date, '1998');
  assert.equal(b.assets.p0.datePrecision, 'year');
  assert.equal(identities(b).size, 40);
  assert.doesNotThrow(() => validateBook(b));
  const map = b.pages.find((p) => p.role === 'map').elements.find((e) => e.type === 'map');
  assert.equal(map.connect, false);
  assert.equal(map.points[0].latitude, 35);
  assert.equal(mapPages(b, [{ coordinates: { latitude: null, longitude: null } }]).length, 0);
});
test('layout experiments retain hand-written text and move excess photographs into the pending tray', () => {
  const b = createPhotobook(photos.slice(0, 4), { density: 'compact' }),
    index = b.pages.findIndex((p) => p.role === 'content'),
    p = b.pages[index];
  const note = textElement('这段手写文字必须保留', 20, 190, 150, 30);
  p.elements.push(note);
  applyLayout(b, index, 'single');
  assert.equal(b.pending.filter((e) => e.photoId).length, 3);
  assert.equal(identities(b).size, 4);
  assert.ok(p.elements.some((e) => e.id === note.id));
  applyLayout(b, index, 'blank');
  assert.equal(b.pending.filter((e) => e.photoId).length, 4);
  assert.ok(p.elements.some((e) => e.text === note.text));
});
test('theme changes and chapter reflow preserve locked and manually tuned pages', () => {
  const b = createPhotobook(photos, { groupBy: 'roll', density: 'compact' }),
    pages = b.pages.filter((p) => p.role === 'content');
  pages[0].locked = true;
  pages[1].manual = true;
  const locked = structuredClone(pages[0]),
    manual = structuredClone(pages[1]);
  applyTheme(b, 'city', { preserveManual: true });
  assert.deepEqual(pages[0], locked);
  assert.deepEqual(pages[1], manual);
  const before = identities(b);
  reflowChapter(b, '胶卷 0', 'airy', true);
  assert.deepEqual(
    b.pages.find((p) => p.id === locked.id),
    locked,
  );
  assert.deepEqual(identities(b), before);
  assert.equal(reflowChapter(b, '不存在的章节', 'airy'), false);
});
test('moving a chapter keeps its contents together and updates contact-sheet page references', () => {
  const b = createPhotobook(photos, { groupBy: 'roll', contact: true });
  const source = b.pages.findIndex((p) => p.chapter === '胶卷 0'),
    target = b.pages.findLastIndex((p) => p.chapter === '胶卷 2');
  movePage(b, source, target, true);
  const indices = b.pages.map((p, i) => (p.chapter === '胶卷 0' ? i : -1)).filter((i) => i >= 0);
  assert.equal(indices.at(-1) - indices[0] + 1, indices.length);
  const pno = photoUsage(b).p1.find((n) => b.pages[n - 1].role === 'content');
  assert.ok(
    b.pages
      .filter((p) => p.role === 'contact')
      .flatMap((p) => p.elements)
      .some((e) => e.generated === 'index-caption' && e.text.includes('p.' + pno)),
  );
});
test('preflight identifies overflow and binding problems with exact element targets', () => {
  const b = createPhotobook([]);
  b.binding = 'glue';
  b.innerMargin = 25;
  const el = textElement('文字'.repeat(300), 0, 0, 15, 8, { fontSize: 18 });
  b.pages[0].elements = [el];
  const warnings = bookPreflight(b, () => null).warnings;
  assert.ok(warnings.some((w) => w.issue === 'text-overflow' && w.elementId === el.id));
  assert.ok(warnings.some((w) => w.issue === 'safe'));
  const invalid = structuredClone(b);
  invalid.pages[0].elements.push({
    id: 'map',
    type: 'map',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    points: [{ latitude: 100, longitude: 0 }],
  });
  assert.throws(() => validateBook(invalid));
});
test('reading, print and wraparound cover PDFs have correct boxes, embedded typography and maps', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'film-book-studio-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const image = join(dir, 'original.jpg');
  await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#7f9272' } })
    .jpeg()
    .toFile(image);
  const b = createPhotobook(photos.slice(0, 1), {
    theme: 'quiet',
    map: true,
    name: '旅行 2026 · 135 / 400',
  });
  b.pages[0].elements.find((e) => e.type === 'image').mask = 'heart';
  b.pages[0].elements.push({
    id: 'sticker-test',
    type: 'sticker',
    sticker: 'rangefinder',
    color: '#b39a61',
    opacity: 0.6,
    x: 15,
    y: 15,
    w: 25,
    h: 25,
  });
  assert.doesNotThrow(() => validateBook(b));
  const bad = structuredClone(b);
  bad.pages[0].elements.at(-1).dataUrl = 'https://example.com/image.png';
  assert.throws(() => validateBook(bad));
  b.spine = 9;
  // Two real pages cover text, images and vector-generated map imagery.
  b.pages = [b.pages[0], b.pages.find((p) => p.role === 'map')];
  const snapshotMap = structuredClone(b.pages[1].elements.find((e) => e.type === 'map'));
  snapshotMap.id = 'saved-street-map';
  snapshotMap.snapshot =
    'data:image/png;base64,' +
    (
      await sharp({ create: { width: 800, height: 480, channels: 3, background: '#e8efe8' } })
        .png()
        .toBuffer()
    ).toString('base64');
  snapshotMap.mapView = { latitude: 35, longitude: 110, zoom: 12 };
  snapshotMap.mapCrop = { x: 0.25, y: 0.2, w: 0.5, h: 0.6 };
  snapshotMap.mapStyle = 'street';
  b.pages[1].elements.push(snapshotMap);
  assert.doesNotThrow(() => validateBook(b));
  const unsafe = structuredClone(b);
  unsafe.pages[1].elements.at(-1).snapshot = 'https://example.com/tile.png';
  assert.throws(() => validateBook(unsafe));
  const invalidCrop = structuredClone(b);
  invalidCrop.pages[1].elements.at(-1).mapCrop.w = 2;
  assert.throws(() => validateBook(invalidCrop));
  for (const mode of ['reading', 'print', 'cover']) {
    const payload = mode === 'cover' ? createCoverDocument(b) : structuredClone(b);
    payload.exportMode = mode === 'reading' ? 'reading' : 'print';
    payload.pages.forEach((p) =>
      p.elements.forEach((e) => {
        if (e.type === 'image') e.path = image;
      }),
    );
    const manifest = join(dir, mode + '.json'),
      out = join(dir, mode + '.pdf');
    await writeFile(manifest, JSON.stringify(payload));
    const result = await portableNative(dir, 'bookpdf', manifest, out),
      pdf = await PDFDocument.load(await readFile(out));
    const page = pdf.getPage(0),
      width = ((mode === 'cover' ? b.width * 2 + 9 : b.width) * 72) / 25.4;
    assert.ok(Math.abs(page.getTrimBox().width - width) < 0.01);
    assert.equal(pdf.getPageCount(), mode === 'cover' ? 1 : 2);
    assert.ok(
      Math.abs(
        page.getWidth() - (width + (mode === 'reading' ? 0 : ((b.bleed + 6) * 2 * 72) / 25.4)),
      ) < 0.01,
    );
    assert.equal(result.colorSpace, 'RGB');
    assert.equal(pdf.getTitle(), b.name);
    assertTextWidths(pdf, page);
  }
});

test('panoramic spreads remain continuous while cropping, and preserve displaced photographs', () => {
  const b = createPhotobook(photos.slice(0, 8), { density: 'balanced' });
  const i = b.pages.findIndex(
    (p, index) => index % 2 === 1 && p.role === 'content' && b.pages[index + 1]?.role === 'content',
  );
  const before = identities(b);
  makePanorama(b, i);
  const left = b.pages[i].elements.find((e) => e.spreadId),
    right = b.pages[i + 1].elements.find((e) => e.spreadId);
  assert.equal(left.spreadId, right.spreadId);
  assert.equal(left.x - right.x, b.width);
  left.cropX = 0.72;
  left.cropY = 0.21;
  syncPanorama(b, i, left);
  assert.equal(right.cropX, 0.72);
  assert.equal(right.cropY, 0.21);
  assert.deepEqual(identities(b), before);
  assert.doesNotThrow(() => validateBook(b));
  b.pages[i + 1].locked = true;
  assert.equal(applyLayout(b, i, 'single'), false);
  assert.equal(right.spreadId, left.spreadId);
  b.pages[i + 1].locked = false;
  applyLayout(b, i, 'single');
  assert.ok(!right.spreadId);
  assert.deepEqual(identities(b), before);
});
test('locked captions and elements survive regeneration while page references remain current', () => {
  const b = createPhotobook(photos.slice(0, 8), { density: 'balanced', contact: true });
  const index = b.pages.findIndex((p) => p.role === 'content');
  const p = b.pages[index];
  const caption = p.elements.find((e) => e.generated === 'caption');
  caption.locked = true;
  const before = structuredClone(p);
  refreshDecorations(b);
  assert.deepEqual(
    p.elements.find((e) => e.id === caption.id),
    caption,
  );
  reflowChapter(b, p.chapter, 'compact', false);
  assert.deepEqual(
    b.pages.find((item) => item.id === p.id),
    before,
  );
  p.locked = true;
  movePage(b, b.pages.indexOf(p), b.pages.length - 2);
  assert.equal(
    p.elements.find((e) => e.generated === 'folio').text,
    String(b.pages.indexOf(p) + 1).padStart(2, '0'),
  );
});
test('cover and hero choices preserve sequence and manual dates on scanned frames', () => {
  const b = createPhotobook(photos.slice(0, 8), {
    coverId: 'p4',
    heroIds: ['p3'],
    density: 'compact',
  });
  assert.equal(b.pages[0].elements.find((e) => e.type === 'image').photoId, 'p4');
  const content = b.pages.filter((p) => p.role === 'content');
  assert.deepEqual(
    content.flatMap((p) => p.elements.filter((e) => e.type === 'image').map((e) => e.photoId)),
    photos.slice(0, 8).map((p) => p.id),
  );
  assert.equal(
    content
      .find((p) => p.elements.some((e) => e.photoId === 'p3'))
      .elements.filter((e) => e.type === 'image').length,
    1,
  );
  assert.equal(assetSnapshot({ ...photos[0], date: '2004-05-02' }).date, '2004-05-02');
});

test('all twelve styles keep photographs and protect manually edited and locked pages', () => {
  assert.equal(Object.keys(BOOK_THEMES).length, 12);
  const arrangements = new Set();
  for (const theme of Object.keys(BOOK_THEMES)) {
    const b = createPhotobook(photos.slice(0, 8), { theme, density: 'balanced' });
    assert.equal(Object.keys(photoUsage(b)).length, 8);
    const pages = b.pages.filter((p) => p.role === 'content');
    arrangements.add(
      JSON.stringify(
        pages[0].elements.filter((e) => e.type === 'image').map((e) => [e.x, e.y, e.w, e.h]),
      ),
    );
    pages[0].locked = true;
    pages[1].manual = true;
    const snapshots = pages.slice(0, 2).map((p) => JSON.stringify(p));
    const original = identities(b);
    applyTheme(b, 'noir');
    assert.deepEqual(identities(b), original);
    assert.deepEqual(
      pages.slice(0, 2).map((p) => JSON.stringify(p)),
      snapshots,
    );
    validateBook(b);
  }
  assert.ok(arrangements.size >= 6, 'styles offer different image layouts');
});

test('PDF embeds CFF charset CIDs instead of OpenType glyph indices', async () => {
  const { embedPDFFont } = await import('../src/server/pdf-fonts.mjs');
  const { default: fontkit } = await import('@pdf-lib/fontkit');
  for (const face of ['Sans', 'Serif']) {
    const bytes = await readFile(
      new URL(`../assets/fonts/Noto${face}SC-Regular.otf`, import.meta.url),
    );
    const source = fontkit.create(bytes);
    const cids = [0];
    for (const range of source['CFF '].topDict.charset.ranges)
      for (let i = 0; i <= range.nLeft; i++) cids.push(range.first + i);
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await embedPDFFont(doc, bytes);
    const sample = '我的摄影画册 北京 上海 2026 Aa 123';
    const expected = source
      .layout(sample, { locl: false, liga: false })
      .glyphs.map((g) => cids[g.id]);
    const actual = font
      .encodeText(sample)
      .asString()
      .match(/.{4}/g)
      .map((n) => parseInt(n, 16));
    assert.deepEqual(actual, expected);
    assert.notDeepEqual(
      actual,
      source.layout(sample, { locl: false, liga: false }).glyphs.map((g) => g.id),
    );
    const page = doc.addPage();
    page.drawText(sample, { font });
    const pdf = await PDFDocument.load(await doc.save());
    assertTextWidths(pdf, pdf.getPage(0));
    const streams = pdf.context
      .enumerateIndirectObjects()
      .map(([, o]) => o)
      .filter((o) => o.dict?.get(PDFName.of('Subtype'))?.toString() === '/CIDFontType0C');
    assert.equal(streams.length, 1);
    assert.equal(
      decodePDFRawStream(streams[0]).decode()[0],
      1,
      'raw CFF v1, not an OpenType wrapper',
    );
  }
});
