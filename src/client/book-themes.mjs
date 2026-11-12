import { BOOK_THEMES, layoutRects } from '../shared/book-model.mjs';
export function themeGallery(selected = 'quiet') {
  return `<div class="book-theme-gallery"><label class="book-theme-filter">风格分类<select data-theme-filter><option value="">全部 · ${Object.keys(BOOK_THEMES).length} 种风格</option>${[...new Set(Object.values(BOOK_THEMES).map((t) => t.group))].map((g) => `<option>${g}</option>`).join('')}</select></label><div class="book-theme-options">${Object.entries(
    BOOK_THEMES,
  )
    .map(([key, t]) => {
      const sample = {
        width: 100,
        height: 125,
        safe: t.margin / 2,
        innerMargin: t.margin / 2,
        bleed: 0,
      };
      const preview = [t.single, t.pair]
        .map(
          (layout, index) =>
            `<g transform="translate(${index * 104},0)"><rect width="100" height="125" fill="${t.background}"/>${layoutRects(
              sample,
              layout,
            )
              .map(
                ([x, y, w, h], i) =>
                  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${i ? t.accent : t.ink}" opacity="${i ? '.65' : '.24'}"/>`,
              )
              .join('')}<path d="M8 116h20" stroke="${t.accent}" stroke-width="1.5"/></g>`,
        )
        .join('');
      return `<button type="button" data-theme="${key}" data-theme-group="${t.group}" class="${key === selected ? 'active' : ''}" aria-pressed="${key === selected}" style="--theme-bg:${t.background};--theme-ink:${t.ink};--theme-accent:${t.accent}"><svg viewBox="0 0 204 125" aria-hidden="true">${preview}</svg><b>${t.name}</b><small>${t.description}</small></button>`;
    })
    .join('')}</div></div>`;
}
export function filterThemeGallery(event) {
  if (!event.target.matches('[data-theme-filter]')) return false;
  const group = event.target.value;
  event.target
    .closest('.book-theme-gallery')
    .querySelectorAll('[data-theme]')
    .forEach((b) => {
      b.hidden = !!group && b.dataset.themeGroup !== group;
    });
  return true;
}
