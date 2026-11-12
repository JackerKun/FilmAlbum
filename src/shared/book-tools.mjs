import { elementBounds } from './book-snapping.mjs';
export const BOOK_PRESETS = [
  ['b6p', 'B6 小竖册', 125, 176],
  ['b6l', 'B6 小横册', 176, 125],
  ['sq7in', '7 × 7 in 方册', 177.8, 177.8],
  ['sq8in', '8 × 8 in 方册', 203.2, 203.2],
  ['sq10in', '10 × 10 in 方册', 254, 254],
  ['sq12in', '12 × 12 in 方册', 304.8, 304.8],
  ['5x7in', '5 × 7 in 竖册', 127, 177.8],
  ['7x5in', '7 × 5 in 横册', 177.8, 127],
  ['6x9in', '6 × 9 in 竖册', 152.4, 228.6],
  ['9x6in', '9 × 6 in 横册', 228.6, 152.4],
  ['6x8in', '6 × 8 in 竖册', 152.4, 203.2],
  ['8x6in', '8 × 6 in 横册', 203.2, 152.4],
  ['9x12in', '9 × 12 in 竖册', 228.6, 304.8],
  ['12x9in', '12 × 9 in 横册', 304.8, 228.6],
  ['12x16in', '12 × 16 in 竖册', 304.8, 406.4],
  ['16x12in', '16 × 12 in 横册', 406.4, 304.8],
  ['a6p', 'A6 口袋竖册', 105, 148],
  ['a6l', 'A6 口袋横册', 148, 105],
  ['a5p', 'A5 标准竖册', 148, 210],
  ['a5l', 'A5 标准横册', 210, 148],
  ['a4p', 'A4 大竖册', 210, 297],
  ['a4l', 'A4 大横册', 297, 210],
  ['a3p', 'A3 展览竖册', 297, 420],
  ['a3l', 'A3 展览横册', 420, 297],
  ['b5p', 'B5 竖册', 176, 250],
  ['b5l', 'B5 横册', 250, 176],
  ['b4p', 'B4 大竖册', 250, 353],
  ['b4l', 'B4 大横册', 353, 250],
  ['sq120', '迷你方册 120', 120, 120],
  ['sq150', '旅行方册 150', 150, 150],
  ['sq180', '方册 180', 180, 180],
  ['sq200', '方册 200', 200, 200],
  ['sq210', '方册 210', 210, 210],
  ['sq250', '方册 250', 250, 250],
  ['sq300', '大方册 300', 300, 300],
  ['8x10', '8 × 10 in 竖册', 203.2, 254],
  ['10x8', '10 × 8 in 横册', 254, 203.2],
  ['11x14', '11 × 14 in 竖册', 279.4, 355.6],
  ['14x11', '14 × 11 in 横册', 355.6, 279.4],
  ['letter', 'US Letter 竖册', 215.9, 279.4],
  ['letterl', 'US Letter 横册', 279.4, 215.9],
  ['pano2', '2:1 全景册', 300, 150],
  ['pano25', '2.5:1 全景册', 350, 140],
  ['pano3', '3:1 长幅册', 360, 120],
  ['tall2', '1:2 长竖册', 150, 300],
  ['tall3', '1:3 长竖册', 120, 360],
  ['35land', '3:2 摄影横册', 300, 200],
  ['35portrait', '2:3 摄影竖册', 200, 300],
  ['169', '16:9 宽屏横册', 320, 180],
  ['wide450', '超宽全景 450', 450, 180],
].map(([id, name, width, height]) => ({
  id,
  name,
  width,
  height,
  orientation: width === height ? 'square' : width > height ? 'landscape' : 'portrait',
  ratio: (width / height).toFixed(2),
}));
export function alignElements(
  elements,
  ids,
  operation,
  { width, height, safe = 0, reference = 'page' } = {},
) {
  const chosen = elements.filter((e) => ids.includes(e.id) && !e.locked);
  if (!chosen.length) return;
  const box =
    reference === 'selection' && chosen.length > 1
      ? {
          left: Math.min(...chosen.map((e) => elementBounds(e).x)),
          top: Math.min(...chosen.map((e) => elementBounds(e).y)),
          right: Math.max(
            ...chosen.map((e) => {
              const b = elementBounds(e);
              return b.x + b.w;
            }),
          ),
          bottom: Math.max(
            ...chosen.map((e) => {
              const b = elementBounds(e);
              return b.y + b.h;
            }),
          ),
        }
      : { left: safe, top: safe, right: width - safe, bottom: height - safe };
  for (const e of chosen) {
    const b = elementBounds(e);
    if (operation === 'left') e.x += box.left - b.x;
    if (operation === 'right') e.x += box.right - b.x - b.w;
    if (operation === 'center-x') e.x += (box.left + box.right - b.w) / 2 - b.x;
    if (operation === 'top') e.y += box.top - b.y;
    if (operation === 'bottom') e.y += box.bottom - b.y - b.h;
    if (operation === 'center-y') e.y += (box.top + box.bottom - b.h) / 2 - b.y;
  }
  if (operation === 'distribute-x' || operation === 'distribute-y') {
    if (chosen.length < 3) return;
    const horizontal = operation.endsWith('x'),
      key = horizontal ? 'x' : 'y',
      size = horizontal ? 'w' : 'h',
      rows = [...chosen].sort((a, b) => elementBounds(a)[key] - elementBounds(b)[key]),
      start = elementBounds(rows[0])[key],
      end = elementBounds(rows.at(-1))[key] + elementBounds(rows.at(-1))[size],
      gap =
        (end - start - rows.reduce((n, e) => n + elementBounds(e)[size], 0)) / (rows.length - 1);
    let cursor = start;
    for (const e of rows) {
      const b = elementBounds(e);
      e[key] += cursor - b[key];
      cursor += b[size] + gap;
    }
  }
}
export function nudgeElements(elements, ids, dx, dy) {
  for (const e of elements)
    if (ids.includes(e.id) && !e.locked) {
      e.x += dx;
      e.y += dy;
    }
}

// Resize around the opposite corner, including rotated frames (all units are mm).
export function resizeBookElement(
  original,
  handle,
  dx,
  dy,
  { keepAspect = false, snap = false } = {},
) {
  const sx = handle.includes('w') ? -1 : 1,
    sy = handle.includes('n') ? -1 : 1,
    angle = ((original.rotation || 0) * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const lx = c * dx + s * dy,
    ly = -s * dx + c * dy;
  let w = original.w + sx * lx,
    h = original.h + sy * ly;
  if (keepAspect) {
    const scale =
      Math.abs(lx / original.w) > Math.abs(ly / original.h) ? w / original.w : h / original.h;
    const bounded = Math.max(
      5 / Math.min(original.w, original.h),
      Math.min(1000 / Math.max(original.w, original.h), scale),
    );
    w = original.w * bounded;
    h = original.h * bounded;
    if (snap) {
      w = Math.round(w);
      h = (w * original.h) / original.w;
    }
  } else {
    w = Math.max(5, Math.min(1000, snap ? Math.round(w) : w));
    h = Math.max(5, Math.min(1000, snap ? Math.round(h) : h));
  }
  const mx = (sx * (w - original.w)) / 2,
    my = (sy * (h - original.h)) / 2;
  return {
    x: original.x + original.w / 2 + c * mx - s * my - w / 2,
    y: original.y + original.h / 2 + s * mx + c * my - h / 2,
    w,
    h,
  };
}
export function cropBookImage(original, dx, dy, imageWidth, imageHeight) {
  if (original.fit === 'contain' || !imageWidth || !imageHeight)
    return { cropX: original.cropX ?? 0.5, cropY: original.cropY ?? 0.5 };
  const angle = ((original.rotation || 0) * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle),
    lx = c * dx + s * dy,
    ly = -s * dx + c * dy;
  const scale = Math.max(original.w / imageWidth, original.h / imageHeight),
    ox = original.w - imageWidth * scale,
    oy = original.h - imageHeight * scale,
    clamp = (n) => Math.max(0, Math.min(1, n));
  return {
    cropX: Math.abs(ox) < 0.00001 ? 0.5 : clamp((original.cropX ?? 0.5) + lx / ox),
    cropY: Math.abs(oy) < 0.00001 ? 0.5 : clamp((original.cropY ?? 0.5) + ly / oy),
  };
}
