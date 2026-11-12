import { BOOK_PRESETS } from '../shared/book-tools.mjs';
import { escapeBook as E } from './book-view.mjs';
const presets = [
  { id: 'journal', name: '摄影竖册', width: 210, height: 260 },
  { id: 'travel', name: '旅行横册', width: 260, height: 200 },
  ...BOOK_PRESETS,
];
const category = (p) =>
  /^(a|b)\d/.test(p.id)
    ? '标准纸张'
    : /in|US Letter/.test(p.name)
      ? '英寸画册'
      : p.width / p.height >= 2 || p.height / p.width >= 2
        ? '全景与长幅'
        : '摄影与手记';
export function openBookSizePicker({ width, height, onSelect }) {
  const host = document.createElement('dialog');
  host.className = 'book-panel-dialog book-size-picker';
  host.innerHTML = `<header><div><h2>选择画册规格</h2><small>按比例预览尺寸 · 单位 mm</small></div><button data-size-close aria-label="关闭规格选择">×</button></header><div class="book-size-controls"><input type="search" placeholder="搜索名称或尺寸，例如 A4、210" aria-label="搜索画册规格"><select aria-label="规格分类"><option value="">全部分类</option>${['摄影与手记', '标准纸张', '英寸画册', '全景与长幅'].map((g) => `<option>${g}</option>`).join('')}</select><nav>${[
    ['', '全部'],
    ['portrait', '竖册'],
    ['landscape', '横册'],
    ['square', '方册'],
  ]
    .map(([v, n]) => `<button data-size-shape="${v}" aria-pressed="${!v}">${n}</button>`)
    .join(
      '',
    )}</nav></div><main class="book-size-results"></main><footer><span>当前 ${width} × ${height} mm</span><button data-size-custom>自定义尺寸</button></footer>`;
  let shape = '';
  function render() {
    const query = host.querySelector('input').value.trim().toLowerCase(),
      group = host.querySelector('select').value;
    const rows = presets.filter(
      (p) =>
        (!group || category(p) === group) &&
        (!shape ||
          (p.width === p.height ? 'square' : p.width > p.height ? 'landscape' : 'portrait') ===
            shape) &&
        `${p.name} ${p.width} ${p.height}`.toLowerCase().includes(query),
    );
    host.querySelector('main').innerHTML =
      ['摄影与手记', '标准纸张', '英寸画册', '全景与长幅']
        .map((g) => {
          const items = rows.filter((p) => category(p) === g);
          return items.length
            ? `<section><h3>${g}</h3><div class="book-size-grid">${items.map((p) => `<button data-size-id="${p.id}" aria-pressed="${p.width === width && p.height === height}"><span class="book-size-preview"><i style="width:${(p.width / 450) * 100}px;height:${(p.height / 450) * 100}px"></i></span><b>${E(p.name)}</b><small>${p.width} × ${p.height} mm</small></button>`).join('')}</div></section>`
            : '';
        })
        .join('') || '<p>没有匹配规格，试试其他关键词或自定义尺寸。</p>';
  }
  host.oninput = render;
  host.onchange = render;
  host.onclick = (e) => {
    const shapeButton = e.target.closest('[data-size-shape]');
    if (shapeButton) {
      shape = shapeButton.dataset.sizeShape;
      host
        .querySelectorAll('[data-size-shape]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b === shapeButton)));
      render();
    }
    const pick = e.target.closest('[data-size-id]');
    if (pick) {
      onSelect(presets.find((p) => p.id === pick.dataset.sizeId));
      host.close();
    }
    if (e.target.closest('[data-size-custom]')) {
      onSelect(null);
      host.close();
    }
    if (e.target.closest('[data-size-close]')) host.close();
  };
  host.addEventListener('close', () => host.remove(), { once: true });
  document.body.append(host);
  render();
  host.showModal();
}
