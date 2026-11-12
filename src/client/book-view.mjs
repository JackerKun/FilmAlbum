import { maskCss, stickerSvg } from '../shared/book-graphics.mjs';
import { mapSvg } from '../shared/book-map.mjs';
import { pageMargins, PAGE_ROLES } from '../shared/book-model.mjs';
let land;
export async function loadBookLand() {
  if (!land) land = await fetch('/world-land.json').then((r) => r.json());
}
export const escapeBook = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function pageContent(
  book,
  p,
  index,
  {
    thumb,
    mini = false,
    selected = new Set(),
    cropMode = false,
    guides = false,
    edit = false,
  } = {},
) {
  const E = escapeBook,
    m = pageMargins(book, index);
  return `${guides ? `<div class="book-safe" style="left:${(m.left / book.width) * 100}%;right:${(m.right / book.width) * 100}%;top:${(m.top / book.height) * 100}%;bottom:${(m.bottom / book.height) * 100}%"></div>` : ''}${p.elements.map((el) => `<div ${mini ? '' : `data-element="${E(el.id)}"`} class="book-element ${selected.has(el.id) ? 'selected' : ''} ${el.locked ? 'locked' : ''} ${cropMode && selected.has(el.id) ? 'cropping' : ''}" style="left:${(el.x / book.width) * 100}%;top:${(el.y / book.height) * 100}%;width:${(el.w / book.width) * 100}%;height:${(el.h / book.height) * 100}%;transform:rotate(${el.rotation || 0}deg)">${el.type === 'image' ? (el.mediaId ? `<img src="${thumb(el.mediaId, mini ? 320 : 1600)}" loading="lazy" draggable="false" alt="${E(el.name)}" style="clip-path:${maskCss(el.mask)};opacity:${el.opacity ?? 1};object-fit:${el.fit || 'contain'};object-position:${el.fit === 'contain' ? 50 : (el.cropX ?? 0.5) * 100}% ${el.fit === 'contain' ? 50 : (el.cropY ?? 0.5) * 100}%">` : '<div class="book-empty-frame">＋ 照片</div>') : el.type === 'sticker' ? `<img alt="贴图" draggable="false" style="object-fit:fill;opacity:${el.opacity ?? 1}" src="${el.dataUrl || 'data:image/svg+xml,' + encodeURIComponent(stickerSvg(el.sticker, el.color))}">` : el.type === 'map' ? `<img alt="拍摄地点地图" draggable="false" style="object-fit:contain" src="${el.snapshot || 'data:image/svg+xml,' + encodeURIComponent(mapSvg(el.points || [], land, el.connect))}">` : `<div class="book-text" style="font-family:${el.fontFamily === 'serif' ? 'BookSerif' : 'BookSans'};font-size:${((el.fontSize || 12) / (book.width * 2.83464567)) * 100}cqw;line-height:${el.lineHeight || 1.35};color:${el.color || '#222222'};text-align:${el.align || 'left'}">${E(el.text)}</div>`}${edit && selected.has(el.id) && !el.locked && !p.locked ? `${['nw', 'ne', 'sw', 'se'].map((h) => `<i class="book-resize book-resize-${h}" data-resize="${h}"></i>`).join('')}${cropMode ? '<span class="book-crop-grid"></span>' : ''}` : ''}</div>`).join('')}`;
}
export function pageThumbnail(book, p, i, thumb) {
  return `<div class="book-mini-paper" style="aspect-ratio:${book.width}/${book.height};background:${p.background || '#ffffff'}">${pageContent(book, p, i, { thumb, mini: true })}</div>`;
}
export function pageLabel(p, i) {
  return `${String(i + 1).padStart(2, '0')} · ${PAGE_ROLES[p.role] || '正文'}${p.chapter ? ' / ' + p.chapter : ''}`;
}
