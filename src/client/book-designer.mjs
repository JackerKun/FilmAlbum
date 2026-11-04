import { createBookLibrary } from './book-library.mjs';
import {
  BOOK_PRESETS,
  alignElements,
  nudgeElements,
  resizeBookElement,
  cropBookImage,
} from '../shared/book-tools.mjs';
export function createBookDesigner({ api, job, toast, E, thumb }) {
  const host = document.createElement('dialog');
  host.className = 'book-designer';
  document.body.append(host);
  let book,
    page = 0,
    selected = null,
    cropMode = false,
    zoom = 100,
    guides = true,
    undo = [],
    redo = [],
    dirty = false,
    drag,
    saveBusy = false,
    autosave,
    savePromise,
    editGeneration = 0,
    selectedIds = new Set(),
    alignReference = 'safe',
    snap = true,
    keepAspect = false;
  const cn = () => document.documentElement.lang !== 'en',
    t = (a, b) => (cn() ? a : b),
    $ = (s) => host.querySelector(s),
    clone = (x) => structuredClone(x),
    id = () => crypto.randomUUID();
  const library = createBookLibrary({ api, E, thumb, t, onAdd: addPhoto, toast });
  function checkpoint() {
    editGeneration++;
    undo.push(JSON.stringify(book));
    if (undo.length > 80) undo.shift();
    redo = [];
    dirty = true;
    clearTimeout(autosave);
    autosave = setTimeout(() => {
      if (!drag && host.open) save().catch((e) => toast(e.message, 'warning'));
    }, 1800);
  }
  function element(type) {
    return {
      id: id(),
      type,
      x: book.safe,
      y: book.safe,
      w: book.width - book.safe * 2,
      h: type === 'text' ? 25 : book.height - book.safe * 2,
      fontSize: 18,
      color: '#222222',
      text: t('在这里写下故事', 'Write your story'),
      fit: 'cover',
      cropX: 0.5,
      cropY: 0.5,
      rotation: 0,
    };
  }
  function create() {
    const [width, height] = [210, 297];
    return {
      name: t('我的摄影画册', 'My photobook'),
      width,
      height,
      bleed: 3,
      safe: 8,
      pages: [{ id: id(), background: '#ffffff', elements: [] }],
    };
  }
  function current() {
    return book.pages[page];
  }
  function chosen() {
    return current().elements.find((el) => el.id === selected);
  }
  function render() {
    const restorePaper =
      selected && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    host.innerHTML = `<header><div><small>FILM ALBUM / BOOK STUDIO</small><h2>${E(book.name)} ${dirty ? '•' : ''}</h2></div><nav><button data-b="undo" ${undo.length ? '' : 'disabled'}>↶</button><button data-b="redo" ${redo.length ? '' : 'disabled'}>↷</button><button data-b="settings">${t('规格', 'Format')}</button><button data-b="save">${saveBusy ? t('保存中…', 'Saving…') : t('保存', 'Save')}</button><button data-b="proof">${t('打印检查 / PDF', 'Preflight / PDF')}</button><button data-b="close">✕</button></nav></header><div class="book-body"><aside class="book-photos" id="book-library"></aside><main class="book-main"><div class="book-toolbar">${[
      ['blank', '空白', 'Blank'],
      ['hero', '满版', 'Full bleed'],
      ['duo', '双图', 'Diptych'],
      ['grid', '四宫格', 'Grid'],
      ['editorial', '图文', 'Editorial'],
    ]
      .map(([k, a, b]) => `<button data-layout="${k}">${t(a, b)}</button>`)
      .join(
        '',
      )}<button data-b="text">＋ ${t('文字', 'Text')}</button><label>Zoom <input id="book-zoom" type="range" min="60" max="220" value="${zoom}" aria-label="Page zoom"></label><label><input id="book-guides" type="checkbox" ${guides ? 'checked' : ''}> ${t('安全线', 'Guides')}</label></div><div class="book-viewport"><div class="book-paper" tabindex="0" style="--book-zoom:${zoom / 100};--book-ratio:${book.width / book.height};aspect-ratio:${book.width}/${book.height};background:${current().background}"><div class="book-safe" ${guides ? '' : 'hidden'} style="inset:${(book.safe / book.height) * 100}% ${(book.safe / book.width) * 100}%"></div>${current()
      .elements.map(
        (el) =>
          `<div tabindex="0" data-element="${el.id}" class="book-element ${selectedIds.has(el.id) || el.id === selected ? 'selected' : ''} ${el.locked ? 'locked' : ''} ${cropMode && selected === el.id ? 'cropping' : ''}" style="left:${(el.x / book.width) * 100}%;top:${(el.y / book.height) * 100}%;width:${(el.w / book.width) * 100}%;height:${(el.h / book.height) * 100}%;transform:rotate(${el.rotation || 0}deg)">${el.type === 'image' ? `<img src="${el.mediaId ? thumb(el.mediaId, 1600) : 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E'}" draggable="false" style="object-fit:${el.fit};object-position:${el.fit === 'contain' ? 50 : el.cropX * 100}% ${el.fit === 'contain' ? 50 : el.cropY * 100}%" alt="">` : `<div class="book-text" style="font-size:${(el.fontSize / (book.width * 2.8346)) * 100}cqw;color:${el.color};text-align:${el.align || 'left'}">${E(el.text)}</div>`}${el.locked ? '<span class="book-lock">▣</span>' : `<span class="book-frame-size">${el.w.toFixed(1)} × ${el.h.toFixed(1)} mm</span>${['nw', 'ne', 'sw', 'se'].map((h) => `<i class="book-resize book-resize-${h}" data-resize="${h}" title="${t('拖动缩放 · Shift 锁定比例', 'Drag to resize · Shift locks ratio')}"></i>`).join('')}${cropMode && selected === el.id ? `<span class="book-crop-hint">${t('拖动照片调整裁切 · 双击完成', 'Drag photo to crop · double-click to finish')}</span><span class="book-crop-grid"></span>` : ''}`}</div>`,
      )
      .join(
        '',
      )}</div></div><footer><button data-b="page-prev" ${page ? '' : 'disabled'}>‹</button><span>${t('页面', 'Page')} ${page + 1} / ${book.pages.length}</span><button data-b="page-next" ${page + 1 === book.pages.length ? 'disabled' : ''}>›</button><button data-b="add-page">＋ ${t('加页', 'Add page')}</button><button data-b="duplicate-page">${t('复制页', 'Duplicate')}</button><button data-b="page-left">← ${t('移页', 'Move')}</button><button data-b="page-right">${t('移页', 'Move')} →</button><button data-b="delete-page">${t('删页', 'Delete page')}</button></footer></main><aside class="book-properties">${alignmentTools()}${properties()}${layers()}</aside></div>`;
    wire();
    library.mount($('#book-library'));
    if (restorePaper) $('.book-paper').focus({ preventScroll: true });
  }
  function alignmentTools() {
    return `<section class="book-align-tools"><h3>${t('精确对齐与分布', 'Align & distribute')}</h3><label>${t('对齐基准', 'Reference')}<select id="book-align-reference">${[
      ['safe', '安全边距'],
      ['page', '整个页面'],
      ['selection', '所选元素边界'],
    ]
      .map(
        ([k, v]) =>
          `<option value="${k}" ${alignReference === k ? 'selected' : ''}>${E(v)}</option>`,
      )
      .join('')}</select></label><div class="book-align-buttons">${[
      ['left', '靠左'],
      ['center-x', '水平居中'],
      ['right', '靠右'],
      ['top', '靠上'],
      ['center-y', '垂直居中'],
      ['bottom', '靠下'],
      ['distribute-x', '横向等距'],
      ['distribute-y', '纵向等距'],
      ['same-width', '等宽'],
      ['same-height', '等高'],
    ]
      .map(
        ([k, v]) =>
          `<button data-align="${k}" title="${v}" ${!selected ? 'disabled' : ''}>${v}</button>`,
      )
      .join(
        '',
      )}</div><label><input id="book-snap" type="checkbox" ${snap ? 'checked' : ''}> ${t('吸附 1 mm 网格（Alt 暂停）', 'Snap to 1 mm (Alt bypass)')}</label><label><input id="book-keep-aspect" type="checkbox" ${keepAspect ? 'checked' : ''}> ${t('缩放锁定比例', 'Lock aspect ratio')}</label><small>Shift 点击多选 · 方向键 1 mm · Shift 10 mm · Alt 0.1 mm</small></section>`;
  }
  function layers() {
    return `<section class="book-layer-list"><h3>${t('图层', 'Layers')}</h3>${[
      ...current().elements,
    ]
      .reverse()
      .map(
        (el, i) =>
          `<button data-select-layer="${el.id}" class="${selectedIds.has(el.id) || selected === el.id ? 'active' : ''}">${el.locked ? '▣' : '◫'} ${E(el.type === 'text' ? el.text.slice(0, 24) : el.name || '照片框')} <small>${current().elements.length - i}</small></button>`,
      )
      .join('')}</section>`;
  }
  function pickedIds() {
    return selectedIds.size ? [...selectedIds] : selected ? [selected] : [];
  }
  function align(operation) {
    if (!pickedIds().length) return;
    checkpoint();
    const rows = current().elements.filter((e) => pickedIds().includes(e.id) && !e.locked);
    if (operation === 'same-width' || operation === 'same-height') {
      const key = operation === 'same-width' ? 'w' : 'h',
        reference = chosen();
      for (const e of rows) e[key] = reference[key];
    } else
      alignElements(current().elements, pickedIds(), operation, {
        width: book.width,
        height: book.height,
        safe: alignReference === 'safe' ? book.safe : 0,
        reference: alignReference === 'selection' ? 'selection' : 'page',
      });
    render();
  }
  function properties() {
    const el = chosen();
    if (!el)
      return `<h3>${t('页面设置', 'Page settings')}</h3><p>${book.width} × ${book.height} mm</p><p>${t('出血', 'Bleed')} ${book.bleed} mm · RGB</p><label>${t('页面背景', 'Background')}<input type="color" data-page-background value="${current().background}"></label><p>${t('拖动元素调整位置；拖动四角缩放。双击照片进入裁切，拖动框内照片调整构图。数值单位为毫米。', 'Drag elements to move; drag the corner to resize. Values are millimetres.')}</p>`;
    return `<h3>${t('元素属性', 'Element properties')}</h3><div class="book-geometry-fields">${['x', 'y', 'w', 'h', 'rotation'].map((k) => `<label>${{ w: t('宽', 'Width'), h: t('高', 'Height'), rotation: t('旋转', 'Rotation') }[k] || k.toUpperCase()}<input type="number" step=".01" min="${['w', 'h'].includes(k) ? 1 : k === 'rotation' ? -180 : -1000}" max="${k === 'rotation' ? 180 : 1000}" data-prop="${k}" ${el.locked ? 'disabled' : ''} value="${Number(el[k] || 0).toFixed(2)}"></label>`).join('')}</div>${
      el.type === 'text'
        ? `<label>${t('文字', 'Text')}<textarea data-prop="text" rows="5">${E(el.text)}</textarea></label><label>${t('字号 pt', 'Font size pt')}<input type="number" data-prop="fontSize" value="${el.fontSize}"></label><input type="color" data-prop="color" value="${el.color}"><select data-prop="align">${['left', 'center', 'right'].map((a) => `<option ${el.align === a ? 'selected' : ''}>${a}</option>`).join('')}</select>`
        : `<div class="book-crop-actions"><button data-b="crop" aria-pressed="${cropMode}" ${el.locked ? 'disabled' : ''}>${cropMode ? t('✓ 完成裁切', '✓ Done cropping') : t('✂ 拖动裁切', '✂ Crop image')}</button><button data-b="crop-reset" ${el.locked ? 'disabled' : ''}>${t('居中复位', 'Center crop')}</button></div><label>${t('图片适配', 'Image fit')}<select data-prop="fit"><option value="cover" ${el.fit === 'cover' ? 'selected' : ''}>${t('裁切铺满', 'Fill / crop')}</option><option value="contain" ${el.fit === 'contain' ? 'selected' : ''}>${t('完整显示', 'Fit entire image')}</option></select></label><label>${t('裁切横向中心', 'Horizontal crop')}<input type="range" min="0" max="1" step=".01" data-prop="cropX" value="${el.cropX}"></label><label>${t('裁切纵向中心', 'Vertical crop')}<input type="range" min="0" max="1" step=".01" data-prop="cropY" value="${el.cropY}"></label><label>${t('照片框比例', 'Frame ratio')}<select data-frame-ratio ${el.locked ? 'disabled' : ''}><option value="">${t('自由比例', 'Free ratio')}</option>${[
            ['1', '1:1'],
            ['1.5', '3:2'],
            ['0.6666666667', '2:3'],
            ['1.3333333333', '4:3'],
            ['0.75', '3:4'],
            ['1.7777777778', '16:9'],
            ['2', '2:1'],
          ]
            .map(([v, l]) => `<option value="${v}">${l}</option>`)
            .join('')}</select></label>`
    }<button data-b="lock">${el.locked ? '解锁元素' : '锁定元素'}</button><button data-b="rotate90">旋转 90°</button><button data-b="back">置于底层</button><button data-b="front">${t('置于顶层', 'Bring to front')}</button><button data-b="duplicate-element">${t('复制元素', 'Duplicate element')}</button><button data-b="delete-element">${t('删除元素', 'Delete element')}</button>`;
  }
  function addPhoto(photoId) {
    const p = library.getPhoto(photoId);
    if (!p) return;
    if (chosen()?.locked) {
      toast(
        t(
          '请先解锁照片框，或取消选择后加入新照片',
          'Unlock the frame or deselect it to add a new photo',
        ),
        'warning',
      );
      return;
    }
    checkpoint();
    const empty =
      chosen()?.type === 'image'
        ? chosen()
        : current().elements.find((e) => e.type === 'image' && !e.photoId && !e.locked);
    const el = empty || element('image');
    Object.assign(el, { photoId: p.id, mediaId: p.mediaId, name: p.name, cropX: 0.5, cropY: 0.5 });
    if (!empty) current().elements.push(el);
    selected = el.id;
    selectedIds = new Set([el.id]);
    render();
  }
  function layout(name) {
    checkpoint();
    const images = current().elements.filter((e) => e.type === 'image');
    if (name === 'blank') {
      current().elements = [];
      selected = null;
      selectedIds.clear();
      render();
      return;
    }
    const s = book.safe,
      w = book.width,
      h = book.height,
      rects =
        name === 'hero'
          ? [[-book.bleed, -book.bleed, w + 2 * book.bleed, h + 2 * book.bleed]]
          : name === 'duo'
            ? [
                [s, s, (w - 3 * s) / 2, h - 2 * s],
                [2 * s + (w - 3 * s) / 2, s, (w - 3 * s) / 2, h - 2 * s],
              ]
            : name === 'grid'
              ? [
                  [s, s],
                  [w / 2 + s / 2, s],
                  [s, h / 2 + s / 2],
                  [w / 2 + s / 2, h / 2 + s / 2],
                ].map(([x, y]) => [x, y, (w - 3 * s) / 2, (h - 3 * s) / 2])
              : [[s, s, w - 2 * s, h * 0.64]];
    current().elements = rects.map(([x, y, w, h], i) => ({
      ...element('image'),
      ...(images[i] || {}),
      id: id(),
      x,
      y,
      w,
      h,
    }));
    if (name === 'editorial')
      current().elements.push({ ...element('text'), y: h * 0.74, h: h * 0.2 });
    selected = null;
    selectedIds.clear();
    render();
  }
  async function save() {
    if (saveBusy) {
      await savePromise;
      if (dirty) return save();
      return;
    }
    clearTimeout(autosave);
    saveBusy = true;
    const generation = editGeneration,
      payload = clone(book);
    savePromise = (async () => {
      const saved = await api('/books' + (book.id ? '/' + book.id : ''), {
        method: book.id ? 'PUT' : 'POST',
        body: payload,
      });
      if (generation === editGeneration) {
        book = saved;
        dirty = false;
      } else {
        book.id = saved.id;
        book.version = saved.version;
        dirty = true;
      }
      toast(t('画册已保存', 'Photobook saved'));
    })();
    try {
      await savePromise;
    } finally {
      saveBusy = false;
    }
    if (!drag && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName))
      render();
    if (dirty) {
      clearTimeout(autosave);
      autosave = setTimeout(() => save().catch((e) => toast(e.message, 'warning')), 500);
    }
  }
  async function settings() {
    const panel = document.createElement('dialog');
    panel.className = 'book-format-dialog';
    panel.innerHTML = `<form><h2>${t('画册规格', 'Book format')}</h2><div class="book-preset-tabs"><button type="button" data-preset-filter="all">全部</button><button type="button" data-preset-filter="portrait">竖版 / 长竖</button><button type="button" data-preset-filter="landscape">横版 / 全景</button><button type="button" data-preset-filter="square">方形</button></div><div class="book-preset-grid">${BOOK_PRESETS.map((p) => `<button type="button" data-book-size="${p.id}" data-size-kind="${p.orientation}" class="${p.width === book.width && p.height === book.height ? 'active' : ''}"><span class="book-size-box" style="width:${Math.round((p.width / 450) * 95)}px;height:${Math.round((p.height / 450) * 95)}px"><i></i><i></i><i></i></span><b>${E(p.name)}</b><small>${p.width} × ${p.height} mm</small><small>W:H ${p.ratio}:1</small></button>`).join('')}</div><div id="book-size-live"></div><label>${t('名称', 'Title')}<input name="name" value="${E(book.name)}" required></label><label>${t('预设', 'Preset')}<select name="preset"><option value="">Custom</option>${BOOK_PRESETS.map((p) => `<option value="${p.width},${p.height}" ${book.width === p.width && book.height === p.height ? 'selected' : ''}>${E(p.name)} · ${p.width} × ${p.height} mm</option>`).join('')}</select></label>${[
      ['width', '宽 mm', 'Width mm'],
      ['height', '高 mm', 'Height mm'],
      ['bleed', '出血 mm', 'Bleed mm'],
      ['safe', '安全边距 mm', 'Safe margin mm'],
    ]
      .map(
        ([k, a, b]) =>
          `<label>${t(a, b)}<input name="${k}" type="number" step=".01" min="${['width', 'height'].includes(k) ? 80 : 0}" max="${['width', 'height'].includes(k) ? 450 : k === 'bleed' ? 10 : 30}" value="${book[k]}" required></label>`,
      )
      .join(
        '',
      )}<p>${t('修改尺寸会按比例调整所有页面元素。PDF 使用 RGB；印厂的 ICC、CMYK 与装订要求需单独确认。', 'Resizing scales all elements. PDF uses RGB; confirm ICC, CMYK and binding requirements with your printer.')}</p><button type="submit">${t('应用', 'Apply')}</button><button type="button" id="format-cancel">${t('取消', 'Cancel')}</button></form>`;
    document.body.append(panel);
    const showSize = () => {
      const w = Number(panel.querySelector('[name=width]').value),
        h = Number(panel.querySelector('[name=height]').value);
      for (const button of panel.querySelectorAll('[data-book-size]')) {
        const p = BOOK_PRESETS.find((p) => p.id === button.dataset.bookSize);
        button.classList.toggle('active', p.width === w && p.height === h);
      }
      const match = BOOK_PRESETS.find((p) => p.width === w && p.height === h);
      panel.querySelector('[name=preset]').value = match ? w + ',' + h : '';
      panel.querySelector('#book-size-live').innerHTML =
        `<span style="width:${(w / Math.max(w, h)) * 100}px;height:${(h / Math.max(w, h)) * 100}px"></span><b>${w} × ${h} mm · ${(w / h).toFixed(2)}:1 · ${w === h ? '方形' : w > h ? '横版' : '竖版'}</b>`;
    };
    panel.querySelector('[name=preset]').onchange = (e) => {
      if (e.target.value) {
        const [w, h] = e.target.value.split(',');
        panel.querySelector('[name=width]').value = w;
        panel.querySelector('[name=height]').value = h;
        showSize();
      }
    };
    panel.querySelectorAll('[data-book-size]').forEach(
      (button) =>
        (button.onclick = () => {
          const p = BOOK_PRESETS.find((p) => p.id === button.dataset.bookSize);
          panel.querySelector('[name=width]').value = p.width;
          panel.querySelector('[name=height]').value = p.height;
          panel.querySelector('[name=preset]').value = p.width + ',' + p.height;
          panel
            .querySelectorAll('[data-book-size]')
            .forEach((b) => b.classList.toggle('active', b === button));
          showSize();
        }),
    );
    panel.querySelectorAll('[data-preset-filter]').forEach(
      (button) =>
        (button.onclick = () => {
          for (const card of panel.querySelectorAll('[data-book-size]'))
            card.hidden =
              button.dataset.presetFilter !== 'all' &&
              button.dataset.presetFilter !== card.dataset.sizeKind;
        }),
    );
    for (const key of ['width', 'height'])
      panel.querySelector('[name=' + key + ']').oninput = showSize;
    showSize();
    panel.querySelector('#format-cancel').onclick = () => panel.close();
    panel.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target)),
        sx = Number(data.width) / book.width,
        sy = Number(data.height) / book.height;
      checkpoint();
      for (const p of book.pages)
        for (const el of p.elements) {
          el.x *= sx;
          el.w *= sx;
          el.y *= sy;
          el.h *= sy;
        }
      Object.assign(book, {
        name: data.name,
        width: Number(data.width),
        height: Number(data.height),
        bleed: Number(data.bleed),
        safe: Number(data.safe),
      });
      panel.close();
      render();
    };
    panel.onclose = () => panel.remove();
    panel.showModal();
  }
  async function proof() {
    await save();
    const result = await api('/books/' + book.id + '/preflight');
    const panel = document.createElement('dialog');
    panel.className = 'book-format-dialog';
    panel.innerHTML = `<h2>${t('打印前检查', 'Print preflight')}</h2><p>${result.pages} pages · ${result.width} × ${result.height} mm · ${result.bleed} mm bleed · RGB</p>${result.warnings.map((w) => `<p>⚠ ${w.page}: ${E(w.message)}</p>`).join('') || `<p>✓ ${t('未发现缺失照片或低分辨率问题', 'No missing images or resolution warnings')}</p>`}<p>${t('输出含出血和裁切标记的单页 PDF，按页面顺序交给印厂。此文件不是 PDF/X 或自动拼版文件。', 'Exports single pages with bleed and crop marks, in reading order. This is not PDF/X or an imposed signature.')}</p><button id="book-export">${t('导出打印 PDF', 'Export print PDF')}</button><button id="proof-close">${t('返回修改', 'Back to edit')}</button>`;
    document.body.append(panel);
    panel.querySelector('#proof-close').onclick = () => panel.close();
    panel.querySelector('#book-export').onclick = async () => {
      try {
        await job('book-pdf', { bookId: book.id }, t('导出定制画册', 'Export photobook'));
        panel.close();
      } catch (e) {
        toast(e.message, 'warning');
      }
    };
    panel.onclose = () => panel.remove();
    panel.showModal();
  }
  async function action(a) {
    if (a === 'crop') {
      const el = chosen();
      if (!el || el.type !== 'image' || el.locked) return;
      cropMode = !cropMode;
      if (cropMode && el.fit !== 'cover') {
        checkpoint();
        el.fit = 'cover';
      }
      render();
      return;
    }
    if (a === 'crop-reset') {
      const el = chosen();
      if (!el || el.locked) return;
      checkpoint();
      el.cropX = 0.5;
      el.cropY = 0.5;
      render();
      return;
    }
    if (a === 'save') return save();
    if (a === 'settings') return settings();
    if (a === 'proof') return proof();
    if (a === 'close') {
      if (dirty) {
        await save();
      }
      library.close();
      cropMode = false;
      host.close();
      return;
    }
    if (a === 'undo' && undo.length) {
      redo.push(JSON.stringify(book));
      const version = book.version,
        bookId = book.id;
      book = JSON.parse(undo.pop());
      Object.assign(book, { version, id: bookId });
      dirty = true;
      editGeneration++;
    }
    if (a === 'redo' && redo.length) {
      undo.push(JSON.stringify(book));
      const version = book.version,
        bookId = book.id;
      book = JSON.parse(redo.pop());
      Object.assign(book, { version, id: bookId });
      dirty = true;
      editGeneration++;
    }
    if (a === 'page-prev' || a === 'page-next') {
      page += a === 'page-next' ? 1 : -1;
      selected = null;
      selectedIds.clear();
      cropMode = false;
    }
    if (
      [
        'add-page',
        'duplicate-page',
        'delete-page',
        'page-left',
        'page-right',
        'text',
        'delete-element',
        'duplicate-element',
        'front',
        'back',
        'lock',
        'rotate90',
      ].includes(a)
    ) {
      checkpoint();
      if (a === 'add-page' || a === 'duplicate-page') {
        if (book.pages.length >= 200) throw Error('Maximum 200 pages');
        book.pages.splice(
          page + 1,
          0,
          a === 'duplicate-page'
            ? clone(current())
            : { id: id(), background: '#ffffff', elements: [] },
        );
        page++;
      }
      if (a === 'delete-page' && book.pages.length > 1) {
        book.pages.splice(page, 1);
        page = Math.min(page, book.pages.length - 1);
      }
      if (a === 'page-left' && page > 0) {
        [book.pages[page - 1], book.pages[page]] = [book.pages[page], book.pages[page - 1]];
        page--;
      }
      if (a === 'page-right' && page < book.pages.length - 1) {
        [book.pages[page + 1], book.pages[page]] = [book.pages[page], book.pages[page + 1]];
        page++;
      }
      if (a === 'text') {
        const el = element('text');
        current().elements.push(el);
        selected = el.id;
        selectedIds = new Set([el.id]);
      }
      if (a === 'delete-element')
        current().elements = current().elements.filter(
          (e) => !pickedIds().includes(e.id) || e.locked,
        );
      if (a === 'lock') cropMode = false;
      if (a === 'lock')
        for (const el of current().elements.filter((e) => pickedIds().includes(e.id)))
          el.locked = !el.locked;
      if (a === 'rotate90')
        for (const el of current().elements.filter((e) => pickedIds().includes(e.id) && !e.locked))
          el.rotation = ((Number(el.rotation || 0) + 270) % 360) - 180;
      if (a === 'back' && chosen()) {
        const el = chosen();
        current().elements = current().elements.filter((e) => e.id !== selected);
        current().elements.unshift(el);
      }
      if (a === 'duplicate-element' && chosen()) {
        const el = { ...clone(chosen()), id: id(), x: chosen().x + 4, y: chosen().y + 4 };
        current().elements.push(el);
        selected = el.id;
        selectedIds = new Set([el.id]);
      }
      if (a === 'front' && chosen()) {
        const el = chosen();
        current().elements = current().elements.filter((e) => e.id !== selected);
        current().elements.push(el);
      }
    }
    if (selected && !current().elements.some((e) => e.id === selected)) {
      selected = null;
      selectedIds.clear();
    }
    render();
  }
  function wire() {
    host.onclick = (e) => {
      const alignment = e.target.closest('[data-align]');
      if (alignment) {
        align(alignment.dataset.align);
        return;
      }
      const layer = e.target.closest('[data-select-layer]');
      if (layer) {
        const next = layer.dataset.selectLayer;
        if (next !== selected) cropMode = false;
        if (e.shiftKey) {
          if (selectedIds.has(next)) selectedIds.delete(next);
          else selectedIds.add(next);
        } else selectedIds = new Set([next]);
        selected = selectedIds.has(next) ? next : [...selectedIds].at(-1) || null;
        render();
        return;
      }
      const b = e.target.closest('[data-b]'),
        l = e.target.closest('[data-layout]');
      if (b) action(b.dataset.b).catch((e) => toast(e.message, 'warning'));
      else if (l) layout(l.dataset.layout);
    };
    host.onchange = (e) => {
      if (e.target.hasAttribute('data-frame-ratio')) {
        const el = chosen(),
          ratio = Number(e.target.value);
        if (el && !el.locked && ratio > 0) {
          checkpoint();
          const h = el.w / ratio;
          el.y += (el.h - h) / 2;
          el.h = h;
          render();
        }
        return;
      }
      if (e.target.id === 'book-align-reference') alignReference = e.target.value;
      if (e.target.id === 'book-snap') snap = e.target.checked;
      if (e.target.id === 'book-keep-aspect') keepAspect = e.target.checked;
      if (e.target.dataset.prop) {
        const el = chosen();
        if (!el) return;
        if (el.locked) {
          render();
          return;
        }
        const k = e.target.dataset.prop;
        if (e.target.type === 'number' && !e.target.validity.valid) {
          toast(t('请输入范围内的有效数值', 'Enter a valid value within range'), 'warning');
          render();
          return;
        }
        checkpoint();
        if (k === 'fit' && e.target.value === 'contain') cropMode = false;
        el[k] = ['text', 'color', 'fit', 'align'].includes(k)
          ? e.target.value
          : Number(e.target.value);
        render();
      }
      if (e.target.hasAttribute('data-page-background')) {
        checkpoint();
        current().background = e.target.value;
        render();
      }
      if (e.target.id === 'book-zoom') {
        zoom = Number(e.target.value);
        $('.book-paper').style.setProperty('--book-zoom', zoom / 100);
      }
      if (e.target.id === 'book-guides') {
        guides = e.target.checked;
        $('.book-safe').hidden = !guides;
      }
    };
    const paper = $('.book-paper');
    paper.ondblclick = (e) => {
      const node = e.target.closest('[data-element]');
      if (
        node &&
        chosen()?.id === node.dataset.element &&
        chosen().type === 'image' &&
        !chosen().locked
      )
        action('crop');
    };
    paper.onpointerdown = (e) => {
      if (e.button !== 0) return;
      const node = e.target.closest('[data-element]');
      if (!node) {
        selected = null;
        selectedIds.clear();
        cropMode = false;
        paper
          .querySelectorAll('[data-element]')
          .forEach((n) => n.classList.remove('selected', 'cropping'));
        $('.book-properties').innerHTML = alignmentTools() + properties() + layers();
        return;
      }
      const clicked = node.dataset.element,
        previous = selected;
      if (e.shiftKey && !e.target.closest('[data-resize]') && !cropMode) {
        if (selectedIds.has(clicked)) selectedIds.delete(clicked);
        else selectedIds.add(clicked);
      } else if (!selectedIds.has(clicked)) selectedIds = new Set([clicked]);
      selected = selectedIds.has(clicked) ? clicked : [...selectedIds].at(-1) || null;
      if (previous !== selected) cropMode = false;
      paper.querySelectorAll('[data-element]').forEach((n) => {
        n.classList.toggle('selected', selectedIds.has(n.dataset.element));
        n.classList.toggle('cropping', cropMode && selected === n.dataset.element);
      });
      $('.book-properties').innerHTML = alignmentTools() + properties() + layers();
      if (!chosen() || chosen().locked || selected !== clicked) return;
      const handle = e.target.closest('[data-resize]')?.dataset.resize,
        image = node.querySelector('img');
      drag = {
        x: e.clientX,
        y: e.clientY,
        element: clone(chosen()),
        node,
        rect: paper.getBoundingClientRect(),
        handle,
        crop: cropMode && !handle,
        iw: image?.naturalWidth,
        ih: image?.naturalHeight,
        originals: clone(
          current().elements.filter((el) => pickedIds().includes(el.id) && !el.locked),
        ),
        moved: false,
      };
      paper.focus({ preventScroll: true });
      paper.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    paper.onpointermove = (e) => {
      if (!drag) return;
      const dx = ((e.clientX - drag.x) / drag.rect.width) * book.width,
        dy = ((e.clientY - drag.y) / drag.rect.height) * book.height;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 2) {
        checkpoint();
        drag.moved = true;
      }
      if (!drag.moved) return;
      const el = chosen();
      if (drag.crop) {
        Object.assign(el, cropBookImage(drag.element, dx, dy, drag.iw, drag.ih));
        drag.node.querySelector('img').style.objectPosition =
          `${el.cropX * 100}% ${el.cropY * 100}%`;
      } else if (drag.handle) {
        Object.assign(
          el,
          resizeBookElement(drag.element, drag.handle, dx, dy, {
            keepAspect: keepAspect || e.shiftKey,
            snap: snap && !e.altKey,
          }),
        );
      } else {
        const tx = snap && !e.altKey ? Math.round(dx) : dx,
          ty = snap && !e.altKey ? Math.round(dy) : dy;
        for (const original of drag.originals) {
          const target = current().elements.find((el) => el.id === original.id);
          target.x = original.x + tx;
          target.y = original.y + ty;
          const n = paper.querySelector('[data-element="' + original.id + '"]');
          if (n) {
            n.style.left = (target.x / book.width) * 100 + '%';
            n.style.top = (target.y / book.height) * 100 + '%';
          }
        }
      }
      Object.assign(drag.node.style, {
        left: (el.x / book.width) * 100 + '%',
        top: (el.y / book.height) * 100 + '%',
        width: (el.w / book.width) * 100 + '%',
        height: (el.h / book.height) * 100 + '%',
      });
      const size = drag.node.querySelector('.book-frame-size');
      if (size) size.textContent = `${el.w.toFixed(1)} × ${el.h.toFixed(1)} mm`;
      for (const input of host.querySelectorAll('[data-prop]'))
        if (['x', 'y', 'w', 'h', 'cropX', 'cropY'].includes(input.dataset.prop))
          input.value = el[input.dataset.prop];
    };
    const endDrag = () => {
      const moved = drag?.moved;
      drag = null;
      if (moved) {
        render();
        clearTimeout(autosave);
        autosave = setTimeout(() => save().catch((e) => toast(e.message, 'warning')), 1800);
      }
    };
    paper.onpointerup = paper.onpointercancel = paper.onlostpointercapture = endDrag;
    paper.ondragover = (e) => e.preventDefault();
    paper.ondrop = (e) => {
      e.preventDefault();
      addPhoto(e.dataTransfer.getData('application/film-photo'));
    };
  }
  host.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cropMode) {
      e.preventDefault();
      e.stopPropagation();
      cropMode = false;
      render();
      return;
    }
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      action(e.shiftKey ? 'redo' : 'undo').catch((e) => toast(e.message, 'warning'));
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && selected) {
      e.preventDefault();
      checkpoint();
      const step = e.altKey ? 0.1 : e.shiftKey ? 10 : 1;
      nudgeElements(
        current().elements,
        pickedIds(),
        e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0,
        e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0,
      );
      render();
      $('.book-paper').focus();
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      e.preventDefault();
      action('delete-element').catch((e) => toast(e.message));
    }
  });
  host.addEventListener('cancel', (e) => {
    e.preventDefault();
    action('close').catch((e) => toast(e.message, 'warning'));
  });
  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  return {
    async open(id) {
      book = id ? await api('/books/' + id) : create();
      page = 0;
      selected = null;
      selectedIds.clear();
      editGeneration = 0;
      undo = [];
      redo = [];
      dirty = !id;
      cropMode = false;
      zoom = 100;
      guides = true;
      await library.open();
      render();
      host.showModal();
    },
    async list() {
      const books = await api('/books');
      return books;
    },
  };
}
