import sharp from 'sharp';
import exifr from 'exifr';
import jsQR from 'jsqr';
import {
  PDFDocument,
  PDFName,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
  rectangle,
  clip,
  endPath,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const assets =
    process.env.FILMALBUM_ASSET_DIR || fileURLToPath(new URL('../../assets/', import.meta.url)),
  MM = 72 / 25.4;
const color = (hex) => {
  const n = parseInt(String(hex || '#ffffff').replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
export function portableCapabilities() {
  return {
    provider: 'portable',
    metadata: true,
    preview: true,
    pdf: true,
    qr: true,
    ocr: true,
    classify: false,
    formats: ['JPEG', 'PNG', 'TIFF', 'WebP', 'AVIF', 'GIF', 'SVG'],
    notes:
      'HEIC / camera RAW decoding and object classification depend on the macOS engine; Windows supports local Chinese/English OCR and dominant color.',
  };
}
async function metadata(path) {
  const [image, exif] = await Promise.allSettled([sharp(path).metadata(), exifr.parse(path)]);
  if (image.status === 'rejected' && exif.status === 'rejected')
    throw Error('无法读取影像元数据 / Unsupported image format');
  const m = image.value || {},
    e = exif.value || {};
  let width = m.width || e.ExifImageWidth || e.ImageWidth || 0,
    height = m.height || e.ExifImageHeight || e.ImageHeight || 0;
  if ((m.orientation || e.Orientation) >= 5) [width, height] = [height, width];
  const date = e.DateTimeOriginal || e.CreateDate;
  return Object.fromEntries(
    Object.entries({
      width,
      height,
      make: e.Make,
      model: e.Model,
      lens: e.LensModel,
      date: date instanceof Date ? date.toISOString().replace('T', ' ').slice(0, 19) : date,
      aperture: e.FNumber,
      exposure: e.ExposureTime,
      focalLength: e.FocalLength,
      iso: e.ISO,
      latitude: e.latitude,
      longitude: e.longitude,
    }).filter(([, v]) => v !== undefined),
  );
}
async function preview(path, destination, edge) {
  let pipeline = sharp(path, { failOn: 'error' })
    .rotate()
    .flatten({ background: '#ffffff' })
    .toColourspace('srgb');
  if (Number(edge) > 0)
    pipeline = pipeline.resize({
      width: Number(edge),
      height: Number(edge),
      fit: 'inside',
      withoutEnlargement: true,
    });
  await mkdir(dirname(destination), { recursive: true });
  await pipeline.jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toFile(destination);
  return { ok: true };
}
async function bitmap(path, edge = 1800) {
  const { data, info } = await sharp(path)
    .rotate()
    .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), ...info };
}
async function barcode(path) {
  const image = await bitmap(path),
    result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
  return { codes: result ? [result.data] : [] };
}
async function analyze(root, path) {
  const model = join(assets, 'ocr', 'eng.traineddata.gz');
  if (
    !(await stat(model).then(
      (s) => s.isFile(),
      () => false,
    ))
  )
    throw Error('缺少离线 OCR 模型，请运行 node scripts/prepare-assets.mjs');
  const cachePath = join(root, 'runtime', 'ocr-cache');
  await mkdir(cachePath, { recursive: true });
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(['eng', 'chi_sim'], 1, {
    langPath: join(assets, 'ocr'),
    cachePath,
    logger: () => {},
  });
  try {
    const normalized = await sharp(path)
        .rotate()
        .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer(),
      { data } = await worker.recognize(normalized);
    const { dominant: c } = await sharp(path).rotate().resize(32, 32, { fit: 'fill' }).stats(),
      { r, g, b } = c;
    const dominant =
      r > g * 1.12 && r > b * 1.12
        ? 'red'
        : g > r * 1.12 && g > b * 1.12
          ? 'green'
          : b > r * 1.12 && b > g * 1.12
            ? 'blue'
            : 'neutral';
    return {
      labels: [],
      text: data.text.trim(),
      dominant,
      provider: 'tesseract',
      classificationAvailable: false,
    };
  } finally {
    await worker.terminate();
  }
}
async function savePDF(ctx) {
  await ctx.doc.flush();
  // A full OpenType CFF font must declare OpenType, not the raw CFF subset subtype.
  // pdf-lib 1.17 otherwise labels the complete OTF stream as CIDFontType0C.
  for (const [, object] of ctx.doc.context.enumerateIndirectObjects())
    if (object.dict?.get(PDFName.of('Subtype'))?.toString() === '/CIDFontType0C')
      object.dict.set(PDFName.of('Subtype'), PDFName.of('OpenType'));
  return ctx.doc.save();
}
async function createPDF() {
  const doc = await PDFDocument.create();
  doc.registerFontkit({
    create: (bytes, ...args) => {
      const font = fontkit.create(bytes, ...args);
      if (Buffer.from(bytes).subarray(0, 4).toString() === 'OTTO') font.cff = true;
      return font;
    },
  });
  const bytes = await readFile(join(assets, 'fonts', 'NotoSansSC-Regular.otf'));
  const font = await doc.embedFont(bytes, { subset: false }),
    characters = new Set(font.getCharacterSet());
  return {
    doc,
    font,
    clean: (text) =>
      [...String(text || '')]
        .map((ch) => (characters.has(ch.codePointAt(0)) ? ch : ch === '\n' ? '\n' : '?'))
        .join(''),
  };
}
function linesFor(text, font, size, width) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const ch of paragraph) {
      if (line && font.widthOfTextAtSize(line + ch, size) > width) {
        lines.push(line);
        line = ch;
      } else line += ch;
    }
    lines.push(line);
  }
  return lines;
}
function text(
  page,
  ctx,
  value,
  { x, y, w, h, size = 12, align = 'left', fill = rgb(0.13, 0.15, 0.12) },
) {
  const lines = linesFor(ctx.clean(value), ctx.font, size, w),
    leading = size * 1.25;
  for (const [i, line] of lines.entries()) {
    const baseline = y + h - size - i * leading;
    if (baseline < y - size * 0.1) break;
    const lineWidth = ctx.font.widthOfTextAtSize(line, size),
      offset = align === 'center' ? (w - lineWidth) / 2 : align === 'right' ? w - lineWidth : 0;
    page.drawText(line, { x: x + offset, y: baseline, size, font: ctx.font, color: fill });
  }
}
async function embedImage(ctx, path, cache) {
  if (cache.has(path)) return cache.get(path);
  const bytes = await sharp(path)
      .rotate()
      .flatten({ background: '#fff' })
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
      .toBuffer(),
    image = await ctx.doc.embedJpg(bytes);
  cache.set(path, image);
  return image;
}
function drawCropped(page, image, rect, el = {}) {
  const contain = el.fit === 'contain',
    scale = (contain ? Math.min : Math.max)(rect.w / image.width, rect.h / image.height),
    w = image.width * scale,
    h = image.height * scale,
    cx = contain ? 0.5 : (el.cropX ?? 0.5),
    cy = contain ? 0.5 : (el.cropY ?? 0.5);
  page.drawImage(image, {
    x: rect.x + (rect.w - w) * cx,
    y: rect.y + (rect.h - h) * (1 - cy),
    width: w,
    height: h,
  });
}
async function bookPDF(manifest, destination) {
  const book = JSON.parse(await readFile(manifest, 'utf8')),
    ctx = await createPDF(),
    cache = new Map(),
    margin = book.bleed + 6,
    width = book.width,
    height = book.height;
  for (const source of book.pages) {
    const page = ctx.doc.addPage([(width + 2 * margin) * MM, (height + 2 * margin) * MM]);
    page.setTrimBox(margin * MM, margin * MM, width * MM, height * MM);
    page.setBleedBox(6 * MM, 6 * MM, (width + book.bleed * 2) * MM, (height + book.bleed * 2) * MM);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: page.getWidth(),
      height: page.getHeight(),
      color: rgb(1, 1, 1),
    });
    const bleed = {
      x: 6 * MM,
      y: 6 * MM,
      w: (width + book.bleed * 2) * MM,
      h: (height + book.bleed * 2) * MM,
    };
    page.drawRectangle({
      x: bleed.x,
      y: bleed.y,
      width: bleed.w,
      height: bleed.h,
      color: color(source.background),
    });
    page.pushOperators(
      pushGraphicsState(),
      rectangle(bleed.x, bleed.y, bleed.w, bleed.h),
      clip(),
      endPath(),
    );
    for (const el of source.elements) {
      const rect = {
          x: (margin + el.x) * MM,
          y: (margin + height - el.y - el.h) * MM,
          w: el.w * MM,
          h: el.h * MM,
        },
        r = (-(el.rotation || 0) * Math.PI) / 180,
        c = Math.cos(r),
        s = Math.sin(r),
        cx = rect.x + rect.w / 2,
        cy = rect.y + rect.h / 2;
      page.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy),
        rectangle(rect.x, rect.y, rect.w, rect.h),
        clip(),
        endPath(),
      );
      if (el.type === 'image' && el.path)
        drawCropped(page, await embedImage(ctx, el.path, cache), rect, el);
      else if (el.type === 'text')
        text(page, ctx, el.text, {
          ...rect,
          size: el.fontSize || 14,
          align: el.align,
          fill: color(el.color || '#222222'),
        });
      page.pushOperators(popGraphicsState());
    }
    page.pushOperators(popGraphicsState());
    for (const x of [margin, margin + width])
      for (const y of [margin, margin + height]) {
        const sx = x === margin ? -1 : 1,
          sy = y === margin ? -1 : 1;
        page.drawLine({
          start: { x: (x + sx * (book.bleed + 1)) * MM, y: y * MM },
          end: { x: (x + sx * (book.bleed + 4)) * MM, y: y * MM },
          thickness: 0.25,
          color: rgb(0, 0, 0),
        });
        page.drawLine({
          start: { x: x * MM, y: (y + sy * (book.bleed + 1)) * MM },
          end: { x: x * MM, y: (y + sy * (book.bleed + 4)) * MM },
          thickness: 0.25,
          color: rgb(0, 0, 0),
        });
      }
  }
  const bytes = await savePDF(ctx);
  await writeFile(destination, bytes);
  return {
    pages: book.pages.length,
    bytes: bytes.length,
    colorSpace: 'RGB',
    trimWidthMM: width,
    trimHeightMM: height,
    provider: 'portable',
  };
}
async function pdf(manifest, destination) {
  const source = JSON.parse(await readFile(manifest, 'utf8')),
    ctx = await createPDF(),
    cache = new Map(),
    items = source.items || [],
    labels = source.mode === 'labels',
    contact = source.mode === 'contact',
    perPage = labels ? 12 : contact ? 36 : 6,
    pages = Math.max(1, Math.ceil(items.length / perPage));
  for (let n = 0; n < pages; n++) {
    const page = ctx.doc.addPage([595, 842]);
    text(page, ctx, source.title, { x: 30, y: 787, w: source.matrix ? 470 : 535, h: 28, size: 20 });
    if (source.matrix) {
      const step = 1.5;
      source.matrix.forEach((row, y) =>
        row.forEach((cell, x) => {
          if (cell)
            page.drawRectangle({
              x: 512 + (x + 4) * step,
              y: 835 - (y + 5) * step,
              width: step,
              height: step,
              color: rgb(0, 0, 0),
            });
        }),
      );
    }
    text(page, ctx, `FILM ALBUM / ${n + 1} · ${pages}`, { x: 30, y: 20, w: 535, h: 17, size: 9 });
    for (const [position, item] of items.slice(n * perPage, (n + 1) * perPage).entries()) {
      const columns = labels ? 3 : contact ? 6 : 2,
        w = labels ? 172 : contact ? 82 : 260,
        h = labels ? 170 : contact ? 107 : 230,
        x = 30 + (position % columns) * (w + (contact ? 8 : 15)),
        y = 770 - (Math.floor(position / columns) + 1) * (h + 12);
      if (labels) {
        const matrix = item.matrix || [],
          step = Math.min(3, 145 / (matrix.length + 8));
        for (let yy = 0; yy < matrix.length; yy++)
          for (let xx = 0; xx < matrix.length; xx++)
            if (matrix[yy][xx])
              page.drawRectangle({
                x: x + (xx + 4) * step,
                y: y + h - (yy + 5) * step,
                width: step,
                height: step,
                color: rgb(0, 0, 0),
              });
        text(page, ctx, item.code, { x, y: y + 27, w, h: 18, size: 11 });
        text(page, ctx, item.name, { x, y: y + 10, w, h: 17, size: 10 });
      } else {
        const rect = { x, y: y + (contact ? 25 : 38), w, h: h - (contact ? 28 : 42) };
        page.drawRectangle({
          x: rect.x,
          y: rect.y,
          width: rect.w,
          height: rect.h,
          color: rgb(0.94, 0.94, 0.94),
        });
        if (item.path)
          drawCropped(page, await embedImage(ctx, item.path, cache), rect, { fit: 'contain' });
        text(page, ctx, item.name, {
          x,
          y: y + (contact ? 11 : 17),
          w,
          h: contact ? 13 : 18,
          size: 10,
        });
        text(page, ctx, item.caption, {
          x,
          y: y + 2,
          w,
          h: 15,
          size: 8,
          fill: rgb(0.45, 0.45, 0.45),
        });
      }
    }
  }
  const bytes = await savePDF(ctx);
  await writeFile(destination, bytes);
  return { pages, bytes: bytes.length, provider: 'portable' };
}
async function demo(destination, index) {
  const palettes = [
      ['#14243d', '#993d2e'],
      ['#2e5947', '#ccbf85'],
      ['#8c4a2b', '#f2bf7a'],
    ],
    p = palettes[Number(index) % 3],
    mountains = Array.from(
      { length: 8 },
      (_, i) =>
        `<path d="M0 2000V${1700 - i * 90}L${500 + index * 70} ${1100 + i * 50}L3000 ${1600 - i * 45}V2000Z" fill="rgb(${8 + i * 4},${8 + i * 4},${8 + i * 4})" opacity=".45"/>`,
    ).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="2000"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${p[1]}"/><stop offset="1" stop-color="${p[0]}"/></linearGradient></defs><path fill="url(#sky)" d="M0 0h3000v2000H0z"/><circle cx="${450 + index * 120}" cy="750" r="150" fill="#f2d187"/>${mountains}<text x="150" y="1860" fill="#eee" opacity=".7" font-size="44" font-family="sans-serif">SYNTHETIC FIELD NOTES / FRAME ${Number(index) + 1}</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(destination);
  return { width: 3000, height: 2000 };
}
export async function portableNative(root, mode, ...args) {
  switch (mode) {
    case 'metadata':
      return metadata(args[0]);
    case 'preview':
      return preview(args[0], args[1], args[2]);
    case 'barcode':
      return barcode(args[0]);
    case 'analyze':
      return analyze(root, args[0]);
    case 'bookpdf':
      return bookPDF(args[0], args[1]);
    case 'pdf':
      return pdf(args[0], args[1]);
    case 'pdfinfo':
      return { pages: (await PDFDocument.load(await readFile(args[0]))).getPageCount() };
    case 'demo':
      return demo(args[0], Number(args[1]));
    default:
      throw Error('Unsupported portable native mode: ' + mode);
  }
}
