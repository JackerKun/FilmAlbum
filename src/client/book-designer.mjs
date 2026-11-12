import { snapBookMove, snapBookResize } from '../shared/book-snapping.mjs';
import { openBookMap } from './book-map-picker.mjs';
import { themeGallery, filterThemeGallery } from './book-themes.mjs';
import { MASKS, STICKERS, STICKER_GROUPS, stickerSvg } from '../shared/book-graphics.mjs';
import { openBookSizePicker } from './book-size-picker.mjs';
import { createBookLibrary } from './book-library.mjs';
import { createBookBuilder } from './book-builder.mjs';
import {
  alignElements,
  nudgeElements,
  resizeBookElement,
  cropBookImage,
} from '../shared/book-tools.mjs';
import {
  BOOK_THEMES,
  PAGE_ROLES,
  CAPTION_FIELDS,
  normalizeBook,
  assetSnapshot,
  textElement,
  imageElement,
  applyLayout,
  applyTheme,
  refreshDecorations,
  photoUsage,
  contactPages,
  mapPages,
  rollNotePages,
  movePage,
  spreadIndices,
  pageMargins,
  makePanorama,
  syncPanorama,
} from '../shared/book-model.mjs';
import { pageContent, pageThumbnail, pageLabel, loadBookLand } from './book-view.mjs';
export function createBookDesigner({ api, job, toast, E, thumb, getContext = () => ({}) }) {
  const host = document.createElement('dialog');
  host.className = 'book-designer';
  document.body.append(host);
  const builder = createBookBuilder({ api, job, toast, E, thumb });
  let book,
    page = 0,
    view = 'spread',
    previousView = 'spread',
    zoom = 100,
    selected = new Set(),
    cropMode = false,
    guides = false,
    snapping = true,
    gridVisible = false,
    gridSize = 10,
    customGuides = [],
    customGuidesVisible = true,
    alignReference = 'page',
    toolDisplay = localStorage.getItem('book-tool-display') || 'both',
    dirty = false,
    undo = [],
    redo = [],
    timer,
    savePromise,
    generation = 0,
    savedAt = '',
    drag,
    swapFrom = null,
    overviewLimit = 50,
    observer,
    advanced = false,
    draggedPhoto = null,
    warning = '',
    panel = 'photos',
    shelfRows = [],
    shelfQuery = '',
    shelfLimit = 50,
    leftClosed = false,
    rightClosed = false,
    canvasObserver;
  const $ = (s) => host.querySelector(s),
    id = () => crypto.randomUUID(),
    clone = (x) => structuredClone(x),
    current = () => book.pages[page],
    chosen = () => current()?.elements.find((e) => selected.has(e.id));
  const library = createBookLibrary({
    api,
    E,
    thumb,
    toast,
    t: (a) => a,
    onAdd: (photoId) => addPhoto(photoId),
    onReplace: (photoId) => addPhoto(photoId, true),
    getUsage: () => (book ? photoUsage(book) : {}),
    onUse: (i) => go(i),
  });
  function checkpoint() {
    undo.push(JSON.stringify(book));
    if (undo.length > 60) undo.shift();
    redo = [];
    generation++;
    dirty = true;
    scheduleSave();
  }
  function scheduleSave() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!drag && host.open && view !== 'shelf')
        save().catch((e) => {
          warning = e.message;
          updateStatus();
        });
    }, 1400);
    updateStatus();
  }
  function updateStatus() {
    const out = $('#book-save-status');
    if (out)
      out.textContent =
        warning ||
        (savePromise
          ? '保存中…'
          : dirty
            ? '有未保存修改'
            : savedAt
              ? '已保存 ' + savedAt
              : '已保存');
  }
  function remember() {
    if (book?.id) {
      try {
        localStorage.setItem(
          'film-book-position:' + book.id,
          JSON.stringify({
            pageId: current()?.id,
            view: view === 'preview' ? previousView : view,
            zoom,
            leftClosed,
            rightClosed,
            gridVisible,
            gridSize,
            customGuides,
            customGuidesVisible,
            guides,
          }),
        );
      } catch {}
    }
  }
  async function save() {
    if (savePromise) {
      await savePromise;
      if (dirty) return save();
      return;
    }
    if (!dirty) return;
    clearTimeout(timer);
    const revision = generation,
      payload = clone(book);
    savePromise = api('/books' + (book.id ? '/' + book.id : ''), {
      method: book.id ? 'PUT' : 'POST',
      body: payload,
    });
    updateStatus();
    try {
      const saved = await savePromise;
      book.id = saved.id;
      book.version = saved.version;
      dirty = generation !== revision;
      savedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      warning = '';
    } finally {
      savePromise = null;
      updateStatus();
    }
    remember();
    if (dirty) scheduleSave();
  }
  function markManual() {
    current().manual = true;
  }
  function spreadLocked(el) {
    return (
      el?.spreadId &&
      book.pages.some((p) =>
        p.elements.some((e) => e.spreadId === el.spreadId && (p.locked || e.locked)),
      )
    );
  }
  function go(index) {
    page = Math.max(0, Math.min(book.pages.length - 1, index));
    selected.clear();
    cropMode = false;
    swapFrom = null;
    if (view === 'overview') view = 'spread';
    render();
    host.focus({ preventScroll: true });
    remember();
  }
  function selectOverview(index) {
    page = Math.max(0, Math.min(book.pages.length - 1, index));
    selected.clear();
    // Keep thumbnail nodes alive so native double-click and drag gestures survive.
    host.querySelectorAll('[data-page-card]').forEach((card) => {
      const active = Number(card.dataset.pageCard) === page;
      card.classList.toggle('current', active);
      card.querySelector('button').setAttribute('aria-pressed', String(active));
    });
    $('.book-properties').innerHTML = properties();
    host
      .querySelectorAll('[data-page]')
      .forEach((n) => (n.disabled = Boolean(current().locked && n.dataset.page !== 'todo')));
    $('.book-main > footer > span').textContent = `${page + 1} / ${book.pages.length}`;
    $('[data-b=lock-page]').textContent = current().locked ? '解锁页面' : '锁定页面';
    $('[data-b=page-prev]').disabled = page === 0;
    $('[data-b=page-next]').disabled = page === book.pages.length - 1;
    remember();
  }
  function navigation(direction) {
    if (view === 'overview') return selectOverview(page + direction);
    if (view === 'single') return go(page + direction);
    const shown = spreadIndices(book, page);
    go(direction > 0 ? Math.max(...shown) + 1 : Math.min(...shown) - 2);
  }
  function paper(p, i, edit = true) {
    return `<section class="book-sheet ${i === page ? 'current' : ''}" data-sheet="${i}"><div class="book-paper" tabindex="${edit ? '0' : '-1'}" data-paper="${i}" style="aspect-ratio:${book.width}/${book.height};background:${p.background || '#ffffff'}">${pageContent(book, p, i, { thumb, edit: edit && i === page, selected: i === page ? selected : new Set(), cropMode, guides: edit && guides })}${edit ? editingGuides() : ''}</div><div class="book-sheet-label">${E(pageLabel(p, i))}${p.locked ? ' · 已锁定' : ''}${p.todo ? ' · ● 待修改' : ''}</div></section>`;
  }
  function overview() {
    return `<div class="book-overview">${book.pages
      .slice(0, overviewLimit)
      .map(
        (p, i) =>
          `<article data-page-card="${i}" draggable="true" class="${page === i ? 'current' : ''}"><button data-open-page="${i}" aria-pressed="${page === i}" aria-label="选择第 ${i + 1} 页，双击编辑">${pageThumbnail(book, p, i, thumb)}</button><span>${E(pageLabel(p, i))}</span>${p.todo ? `<small class="book-todo">● ${E(p.todo)}</small>` : ''}${p.locked ? '<small>▣ 已锁定</small>' : ''}</article>`,
      )
      .join(
        '',
      )}</div>${overviewLimit < book.pages.length ? '<button data-b="more-pages" id="book-more-pages">继续加载 50 页</button>' : ''}`;
  }

  function sizeCanvas() {
    const viewport = $('.book-viewport'),
      spread = $('.book-spread');
    if (!viewport) return;
    if (view === 'overview') {
      $('.book-overview')?.style.setProperty(
        '--overview-size',
        Math.max(75, (180 * zoom) / 100) + 'px',
      );
      return;
    }
    if (!spread) return;
    const count = spread.children.length;
    const width = Math.max(
      40,
      Math.min(
        (viewport.clientWidth - 40 - (count - 1) * 4) / count,
        ((viewport.clientHeight - 60) * book.width) / book.height,
      ),
    );
    spread.style.width = (width * count * zoom) / 100 + (count - 1) * 4 + 'px';
  }
  function setZoom(value) {
    zoom = Math.round(Math.max(25, Math.min(400, value)));
    sizeCanvas();
    const input = $('#canvas-zoom');
    if (input) input.value = zoom;
    const out = $('.book-canvas-controls output');
    if (out) out.textContent = zoom + '%';
    const viewport = $('.book-viewport');
    if (viewport && view !== 'overview') {
      viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
      viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) / 2;
    }
    remember();
  }
  // Space temporarily borrows the pointer for viewport panning; never edit book geometry.
  let spaceHeld = false,
    pan = null,
    suppressPanClick = false,
    lastPanEnd = 0;
  const typingTarget = (target) =>
    target.closest(
      'input,textarea,select,[contenteditable]:not([contenteditable="false"]),.book-panel-dialog,.book-context-menu',
    );
  function endPan() {
    const active = pan;
    pan = null;
    host.classList.remove('book-panning');
    if (active) {
      lastPanEnd = performance.now();
      if (active.viewport.hasPointerCapture(active.pointerId))
        active.viewport.releasePointerCapture(active.pointerId);
    }
  }
  function resetHand() {
    spaceHeld = false;
    host.classList.remove('book-hand-ready');
    endPan();
  }
  host.addEventListener(
    'keydown',
    (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (view === 'shelf' || typingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey || drag)
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      spaceHeld = true;
      host.classList.add('book-hand-ready');
    },
    true,
  );
  window.addEventListener(
    'keyup',
    (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        if (spaceHeld) e.preventDefault();
        resetHand();
      }
    },
    true,
  );
  window.addEventListener('blur', resetHand);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) resetHand();
  });
  host.addEventListener('close', resetHand);
  host.addEventListener('focusin', (e) => {
    if (typingTarget(e.target)) resetHand();
  });
  host.addEventListener(
    'pointerdown',
    (e) => {
      suppressPanClick = false;
      const viewport = e.target.closest('.book-viewport');
      if (!spaceHeld || !viewport || e.button !== 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      $('.book-context-menu')?.remove();
      pan = {
        viewport,
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      };
      suppressPanClick = true;
      host.classList.add('book-panning');
      viewport.setPointerCapture(e.pointerId);
    },
    true,
  );
  host.addEventListener(
    'pointermove',
    (e) => {
      if (!pan || pan.pointerId !== e.pointerId) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      pan.viewport.scrollLeft = pan.left - (e.clientX - pan.x);
      pan.viewport.scrollTop = pan.top - (e.clientY - pan.y);
    },
    true,
  );
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    host.addEventListener(
      type,
      (e) => {
        if (pan?.pointerId !== e.pointerId) return;
        e.stopImmediatePropagation();
        endPan();
      },
      true,
    );
  host.addEventListener(
    'click',
    (e) => {
      if (e.target.closest('.book-viewport') && (spaceHeld || suppressPanClick)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        suppressPanClick = false;
      }
    },
    true,
  );
  host.addEventListener(
    'dblclick',
    (e) => {
      if (
        e.target.closest('.book-viewport') &&
        (spaceHeld || performance.now() - lastPanEnd < 300)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  host.addEventListener(
    'dragstart',
    (e) => {
      if ((spaceHeld || pan) && e.target.closest('.book-viewport')) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  host.addEventListener(
    'wheel',
    (e) => {
      if (!e.target.closest('.book-viewport')) return;
      if (pan) {
        e.preventDefault();
        return;
      }
      if (view === 'overview' && !e.ctrlKey && !e.metaKey) return;
      if (e.altKey) return;
      e.preventDefault();
      setZoom(zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.002)));
    },
    { passive: false },
  );
  document.addEventListener('fullscreenchange', () => {
    if (host.open) {
      sizeCanvas();
      const b = $('[data-b=fullscreen]');
      if (b) b.textContent = document.fullscreenElement ? '退出全屏' : '⛶ 全屏';
    }
  });
  async function insertMap(edit = false) {
    if (view === 'overview' || current().locked) return;
    const original = edit ? chosen() : null;
    if (original?.locked || (edit && original?.type !== 'map')) return;
    const result = await openBookMap({ dialog, api, E, assets: book.assets, initial: original });
    if (!result) return;
    checkpoint();
    if (original) Object.assign(original, result);
    else {
      const w = Math.min(150, book.width - book.safe * 2);
      const el = { id: id(), x: book.safe, y: book.safe, w, h: w / result.ratio, ...result };
      current().elements.push(el);
      selected = new Set([el.id]);
    }
    markManual();
    render();
  }
  function editingGuides() {
    return `<div class="book-edit-guides" aria-hidden="true">${gridVisible ? `<div class="book-grid-overlay" style="background-size:${(gridSize / book.width) * 100}% ${(gridSize / book.height) * 100}%"></div>` : ''}${customGuidesVisible ? customGuides.map((g) => `<i class="book-custom-guide ${g.axis}" style="${g.axis === 'x' ? 'left' : 'top'}:${(g.at / (g.axis === 'x' ? book.width : book.height)) * 100}%"></i>`).join('') : ''}</div>`;
  }
  const alignChoices = [
    ['left', '靠左'],
    ['center-x', '水平居中'],
    ['right', '靠右'],
    ['top', '靠上'],
    ['center-y', '垂直居中'],
    ['bottom', '靠下'],
    ['distribute-x', '横向等距'],
    ['distribute-y', '纵向等距'],
  ];
  function alignmentMarkup() {
    return `<label>对齐参照<select id="book-align-reference"><option value="page" ${alignReference === 'page' ? 'selected' : ''}>页面</option><option value="safe" ${alignReference === 'safe' ? 'selected' : ''}>安全边距</option><option value="selection" ${alignReference === 'selection' ? 'selected' : ''}>所选元素</option></select></label><div class="book-align-buttons">${alignChoices.map(([k, n]) => `<button data-align="${k}" ${current().locked || !selected.size || (k.startsWith('distribute') && selected.size < 3) ? 'disabled' : ''}>${n}</button>`).join('')}</div>`;
  }
  function guideSettings() {
    const d = dialog(
      '网格与辅助线',
      `<label class="book-check"><input data-grid-show type="checkbox" ${gridVisible ? 'checked' : ''}>显示网格</label><label>网格间距（mm）<input data-grid-size type="number" min="2" max="100" value="${gridSize}"></label><label class="book-check"><input data-guide-show type="checkbox" ${customGuidesVisible ? 'checked' : ''}>显示自定义辅助线</label><div class="book-field-pair"><label>方向<select data-guide-axis><option value="x">垂直线</option><option value="y">水平线</option></select></label><label>距页面左 / 上边缘（mm）<input data-guide-at type="number" min="0" value="${book.width / 2}" step=".1"></label></div><button data-guide-add>添加辅助线</button><div data-guide-list></div><p>辅助线应用于所有编辑页面。打开吸附后，拖动会吸附到可见网格与辅助线；Alt 临时关闭吸附。这些线不会导出。</p>`,
      '<button data-guide-done class="primary">完成</button>',
    );
    const list = () => {
      d.querySelector('[data-guide-list]').innerHTML = customGuides
        .map(
          (g, i) =>
            `<p>${g.axis === 'x' ? '垂直' : '水平'} · ${g.at} mm <button data-guide-remove="${i}">删除</button></p>`,
        )
        .join('');
    };
    list();
    d.querySelector('[data-guide-add]').onclick = () => {
      const axis = d.querySelector('[data-guide-axis]').value,
        input = d.querySelector('[data-guide-at]');
      input.max = axis === 'x' ? book.width : book.height;
      if (!input.value || !input.reportValidity()) return;
      customGuides.push({ axis, at: Number(input.value) });
      list();
    };
    d.addEventListener('click', (e) => {
      const b = e.target.closest('[data-guide-remove]');
      if (b) {
        customGuides.splice(Number(b.dataset.guideRemove), 1);
        list();
      }
    });
    d.querySelector('[data-guide-done]').onclick = () => {
      const size = d.querySelector('[data-grid-size]');
      if (!size.value || !size.reportValidity()) return;
      gridVisible = d.querySelector('[data-grid-show]').checked;
      gridSize = Number(size.value);
      customGuidesVisible = d.querySelector('[data-guide-show]').checked;
      remember();
      d.close();
      render();
    };
  }
  function decorateTools() {
    host.dataset.toolDisplay = toolDisplay;
    const icons = {
      shelf: '▤',
      undo: '↶',
      redo: '↷',
      settings: '⚙',
      proof: '⇩',
      close: '×',
      style: '◐',
      captions: '≡',
      layout: '▦',
      reflow: '⟳',
      crop: '⌗',
      fit: '▣',
      swap: '⇄',
      text: 'T',
      sticker: '◇',
      map: '⌖',
      snap: '⊙',
      grid: '▦',
      'guide-settings': '⊞',
      'left-panel': '▥',
      inspector: '☷',
      'zoom-fit': '⛶',
      'zoom-in': '+',
      'zoom-out': '−',
      'add-page': '+',
      'duplicate-page': '⧉',
      'page-left': '←',
      'page-right': '→',
      'lock-page': '▣',
      'delete-page': '×',
      'page-prev': '‹',
      'page-next': '›',
      fullscreen: '⛶',
      note: '✎',
      alignment: '☷',
    };
    const names = {
      undo: '撤销',
      redo: '重做',
      close: '关闭',
      'zoom-in': '放大',
      'zoom-out': '缩小',
      'page-prev': '上一页',
      'page-next': '下一页',
    };
    host
      .querySelectorAll(':scope > header button, .book-modebar button, .book-main > footer button')
      .forEach((b) => {
        const key = b.dataset.b || b.dataset.view,
          label = names[key] || b.textContent.trim(),
          icon =
            icons[key] || { overview: '▦', spread: '◫', single: '□', preview: '▷' }[key] || '⇄';
        b.title = b.title || label;
        b.setAttribute('aria-label', label);
        b.innerHTML = `<span class="book-tool-icon" aria-hidden="true">${icon}</span><span class="book-tool-label">${E(label)}</span>`;
      });
  }
  function showSnapGuides(lines = []) {
    const paper = $(`[data-paper="${page}"]`);
    paper?.querySelector('.book-snap-guides')?.remove();
    if (!paper || !lines.length) return;
    const overlay = document.createElement('div');
    overlay.className = 'book-snap-guides';
    overlay.innerHTML = lines
      .map(
        (g) =>
          `<div class="book-snap-line ${g.axis}" style="${g.axis === 'x' ? 'left' : 'top'}:${(g.at / (g.axis === 'x' ? book.width : book.height)) * 100}%"><span>${E(g.label)}</span></div>`,
      )
      .join('');
    paper.append(overlay);
  }
  function stickerPicker() {
    const d = dialog(
      '添加贴图',
      `<div class="book-sticker-filters"><label>分类<select data-sticker-group><option value="">全部 · ${Object.keys(STICKERS).length} 款</option>${Object.keys(
        STICKER_GROUPS,
      )
        .map((g) => `<option>${g}</option>`)
        .join(
          '',
        )}</select></label><label>查找贴图<input type="search" data-sticker-search placeholder="胶卷、相机、镜头…"></label></div><div class="book-sticker-catalog">${Object.entries(
        STICKER_GROUPS,
      )
        .map(
          ([group, items]) =>
            `<section data-sticker-section="${group}"><h3>${group}</h3><div class="book-sticker-grid">${Object.entries(
              items,
            )
              .map(
                ([v, n]) =>
                  `<button data-sticker="${v}" data-sticker-name="${n}"><img src="data:image/svg+xml,${encodeURIComponent(stickerSvg(v))}" alt=""><span>${n}</span></button>`,
              )
              .join('')}</div></section>`,
        )
        .join(
          '',
        )}</div><p data-sticker-empty hidden>没有匹配的贴图，请换个关键词。</p><label>导入贴图（PNG / JPEG / WebP，最大 4 MB）<input type="file" accept="image/png,image/jpeg,image/webp" id="book-sticker-file"></label>`,
    );
    const add = (extra) => {
      checkpoint();
      const el = {
        id: id(),
        type: 'sticker',
        name: STICKERS[extra.sticker] || '自定义贴图',
        x: book.safe,
        y: book.safe,
        w: 50,
        h: extra.sticker === 'tape' ? 15 : 50,
        color: '#b39a61',
        opacity: 1,
        ...extra,
      };
      current().elements.push(el);
      selected = new Set([el.id]);
      markManual();
      d.close();
      render();
    };
    d.querySelectorAll('[data-sticker]').forEach(
      (b) => (b.onclick = () => add({ sticker: b.dataset.sticker })),
    );
    const filter = () => {
      const group = d.querySelector('[data-sticker-group]').value,
        term = d.querySelector('[data-sticker-search]').value.trim();
      let total = 0;
      d.querySelectorAll('[data-sticker-section]').forEach((section) => {
        let count = 0;
        section.querySelectorAll('[data-sticker]').forEach((b) => {
          b.hidden = !!term && !b.dataset.stickerName.includes(term);
          if (!b.hidden) count++;
        });
        section.hidden = (!!group && group !== section.dataset.stickerSection) || !count;
        if (!section.hidden) total += count;
      });
      d.querySelector('[data-sticker-empty]').hidden = total > 0;
    };
    d.querySelector('[data-sticker-group]').onchange = filter;
    d.querySelector('[data-sticker-search]').oninput = filter;
    d.querySelector('#book-sticker-file').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (
        file.size > 4 * 1024 * 1024 ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
      )
        return toast('请选择不超过 4 MB 的 PNG、JPEG 或 WebP', 'warning');
      try {
        const bitmap = await createImageBitmap(file);
        if (bitmap.width * bitmap.height > 40000000) {
          bitmap.close();
          throw Error('贴图尺寸过大');
        }
        const h = (50 * bitmap.height) / bitmap.width;
        bitmap.close();
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        add({ dataUrl, h: Math.max(1, Math.min(400, h)) });
      } catch (err) {
        toast(err.message || '无法读取贴图', 'warning');
      }
    };
  }

  function render() {
    if (view === 'shelf') return renderShelf();
    observer?.disconnect();
    canvasObserver?.disconnect();
    page = Math.min(page, book.pages.length - 1);
    const preview = view === 'preview',
      images = current().elements.filter((e) => e.type === 'image'),
      el = chosen();
    const oldViewport = $('.book-viewport');
    const viewportKey = `${view}:${current().id}`;
    const viewportPosition =
      oldViewport?.dataset.position === viewportKey
        ? { left: oldViewport.scrollLeft, top: oldViewport.scrollTop }
        : null;
    host.classList.toggle('reading', preview);
    host.innerHTML = `<header><div class="book-breadcrumb"><button data-b="shelf">‹ 画册库</button><div><small>FILM ALBUM / BOOK STUDIO</small><h2>${E(book.name)}</h2></div></div><nav><span id="book-save-status" aria-live="polite"></span><button data-b="undo" title="撤销 ⌘Z" ${undo.length ? '' : 'disabled'}>↶</button><button data-b="redo" title="重做 ⇧⌘Z" ${redo.length ? '' : 'disabled'}>↷</button><button data-b="settings">规格</button><button data-b="proof">导出</button><button data-b="close" aria-label="关闭画册">×</button></nav></header><div class="book-modebar"><div class="book-view-tabs">${[
      ['overview', '整册'],
      ['spread', '跨页'],
      ['single', '单页'],
      ['preview', '阅读预览'],
    ]
      .map(([k, n]) => `<button data-view="${k}" aria-pressed="${view === k}">${n}</button>`)
      .join(
        '',
      )}</div><span class="book-current-location">${E(current().chapter || PAGE_ROLES[current().role] || '正文')} · 第 ${page + 1} / ${book.pages.length} 页</span><div>${preview ? `<button data-b="fullscreen">${document.fullscreenElement ? '退出全屏' : '⛶ 全屏'}</button>` : `<button data-b="style">风格</button><button data-b="captions">注释与附录</button><button data-b="layout">版式</button><button data-b="reflow">重排本章</button>`}</div></div><div class="book-body ${view === 'overview' ? 'overview-mode' : ''}">${!preview ? `<aside class="book-photos" id="book-material-panel"><div class="book-panel-tabs"><button data-panel="photos" aria-pressed="${panel === 'photos'}">照片素材</button><button data-panel="pending" aria-pressed="${panel === 'pending'}">待排区 ${book.pending.length}</button></div><div id="book-library" ${panel === 'photos' ? '' : 'hidden'}></div><div id="book-pending" ${panel === 'pending' ? '' : 'hidden'}>${pendingMarkup()}</div></aside>` : ''}<main class="book-main">${!preview ? `<div class="book-toolbar"><button data-b="text" ${current().locked || view === 'overview' ? 'disabled' : ''}>＋ 文字</button><label><input id="book-guides" type="checkbox" ${guides ? 'checked' : ''}>安全线</label></div>` : ''}<div class="book-viewport" data-position="${E(viewportKey)}" title="按住空格＋鼠标拖动，平移工作区">${view === 'overview' ? overview() : `<div class="book-spread ${view === 'single' ? 'single' : ''}" style="--book-zoom:${zoom / 100}">${(view === 'single' ? [page] : spreadIndices(book, page)).map((i) => paper(book.pages[i], i, !preview)).join('')}</div>`}</div><footer><button data-b="page-prev" ${page === 0 ? 'disabled' : ''} aria-label="上一页">‹</button><span>${page + 1} / ${book.pages.length}</span><button data-b="page-next" ${page === book.pages.length - 1 ? 'disabled' : ''} aria-label="下一页">›</button>${preview ? '<button data-b="note">＋ 页面待办</button>' : `<button data-b="add-page">＋ 页面</button><button data-b="duplicate-page">复制页</button><button data-b="page-left">← 移页</button><button data-b="page-right">移页 →</button><button data-b="lock-page" aria-pressed="${current().locked ? 'true' : 'false'}">${current().locked ? '解锁页面' : '锁定页面'}</button><button data-b="delete-page">移除页</button>`}</footer>${
      view !== 'overview'
        ? `<div class="book-page-ribbon">${book.pages
            .slice(Math.max(0, page - 12), page + 13)
            .map((p, n) => {
              const i = Math.max(0, page - 12) + n;
              return `<button data-open-page="${i}" class="${i === page ? 'active' : ''}" title="${E(pageLabel(p, i))}">${pageThumbnail(book, p, i, thumb)}<span>${i + 1}</span></button>`;
            })
            .join('')}</div>`
        : ''
    }</main>${!preview ? `<aside class="book-properties" id="book-property-panel">${properties()}</aside>` : ''}</div>`;
    host.classList.toggle('overview', view === 'overview');
    host.classList.toggle('left-closed', leftClosed);
    host.classList.toggle('right-closed', rightClosed);
    if (!preview) {
      $('.book-body').insertAdjacentHTML(
        'beforeend',
        `<button class="book-panel-handle left" data-b="left-panel" aria-controls="book-material-panel" aria-expanded="${!leftClosed}" title="${leftClosed ? '展开' : '收起'}素材栏" aria-label="${leftClosed ? '展开' : '收起'}素材栏"><span aria-hidden="true">${leftClosed ? '›' : '‹'}</span><span>素材</span></button><button class="book-panel-handle right" data-b="inspector" aria-controls="book-property-panel" aria-expanded="${!rightClosed}" title="${rightClosed ? '展开' : '收起'}属性栏" aria-label="${rightClosed ? '展开' : '收起'}属性栏"><span aria-hidden="true">${rightClosed ? '‹' : '›'}</span><span>属性</span></button>`,
      );
    }
    const toolbar = $('.book-main > .book-toolbar');
    if (toolbar) {
      toolbar.classList.add('book-context-tools');
      $('.book-modebar').append(toolbar);
    }
    const controls = document.createElement('div');
    controls.className = 'book-canvas-controls';
    controls.innerHTML = `${!preview ? `<button data-b="sticker" ${view === 'overview' || current().locked ? 'disabled' : ''}>＋ 贴图</button><button data-b="map" ${view === 'overview' || current().locked ? 'disabled' : ''}>＋ 地图</button><button data-b="grid" aria-pressed="${gridVisible}">网格</button><button data-b="guide-settings" aria-pressed="${customGuidesVisible && customGuides.length > 0}">辅助线</button><button data-b="alignment" ${selected.size ? '' : 'disabled'}>对齐</button><button data-b="snap" aria-pressed="${snapping}" title="吸附页面、边距、元素及等距间隔；Alt 临时关闭">吸附</button>` : ''}<button data-b="zoom-out" aria-label="缩小">−</button><input id="canvas-zoom" aria-label="画布缩放" type="range" min="25" max="400" value="${zoom}"><output>${zoom}%</output><button data-b="zoom-in" aria-label="放大">＋</button><button data-b="zoom-fit">适应</button>`;
    $('.book-modebar').append(controls);
    const display = document.createElement('select');
    display.id = 'book-tool-display';
    display.setAttribute('aria-label', '工具栏显示方式');
    display.innerHTML = [
      ['both', '图标和文字'],
      ['icons', '仅图标'],
      ['text', '仅文字'],
    ]
      .map(([v, n]) => `<option value="${v}" ${toolDisplay === v ? 'selected' : ''}>${n}</option>`)
      .join('');
    $('header nav').append(display);
    decorateTools();
    $('#book-zoom')?.closest('label')?.remove();
    {
      canvasObserver = new ResizeObserver(() => sizeCanvas());
      canvasObserver.observe($('.book-viewport'));
      requestAnimationFrame(() => sizeCanvas());
    }
    if (!preview) {
      library.mount($('#book-library'));
    }
    if ($('#book-more-pages')) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            overviewLimit += 50;
            render();
          }
        },
        { root: $('.book-viewport'), rootMargin: '400px' },
      );
      observer.observe($('#book-more-pages'));
    }
    if (!preview) {
      host
        .querySelectorAll('[data-prop]')
        .forEach(
          (n) =>
            (n.disabled = Boolean(
              current().locked ||
              chosen()?.locked ||
              spreadLocked(chosen()) ||
              chosen()?.generated === 'folio',
            )),
        );
      host
        .querySelectorAll('[data-page]')
        .forEach((n) => (n.disabled = Boolean(current().locked && n.dataset.page !== 'todo')));
    }
    sizeCanvas();
    if (viewportPosition) {
      $('.book-viewport').scrollLeft = viewportPosition.left;
      $('.book-viewport').scrollTop = viewportPosition.top;
    }
    updateStatus();
  }
  function pendingMarkup() {
    return `<h3>内容都在这里</h3><p>换版式或移除页面后暂未使用的内容。点击放入当前页。</p>${book.pending.map((el, i) => `<button data-pending="${i}" class="book-pending-item">${el.mediaId ? `<img loading="lazy" src="${thumb(el.mediaId, 320)}" alt="${E(el.name)}">` : `<span>${E(el.text || '文字')}</span>`}<small>${E(el.name || '文字内容')} ＋</small></button>`).join('') || '<p class="book-hint">暂时没有待排内容。</p>'}`;
  }
  function properties() {
    const el = view === 'overview' ? null : chosen(),
      p = current();
    return `<section><small>PAGE ${String(page + 1).padStart(2, '0')}</small><h3>${E(PAGE_ROLES[p.role] || '正文')}</h3><label>页面身份<select data-page="role">${Object.entries(
      PAGE_ROLES,
    )
      .map(([v, n]) => `<option value="${v}" ${v === p.role ? 'selected' : ''}>${n}</option>`)
      .join(
        '',
      )}</select></label><label>章节 / 合并到章节<input data-page="chapter" value="${E(p.chapter || '')}" list="book-chapters"></label><datalist id="book-chapters">${[...new Set(book.pages.map((p) => p.chapter).filter(Boolean))].map((c) => `<option value="${E(c)}">`).join('')}</datalist>${p.chapter ? '<div class="book-button-row"><button data-b="chapter-up">整章前移</button><button data-b="chapter-down">整章后移</button></div>' : ''}<label>页面待办<textarea data-page="todo" rows="2" placeholder="例如：替换照片，调整裁切">${E(p.todo || '')}</textarea></label><label>纸面颜色<input type="color" data-page="background" value="${p.background || '#ffffff'}"></label></section>${
      el
        ? `<section><h3>${el.type === 'text' ? '文字' : el.type === 'map' ? '地图' : el.type === 'sticker' ? '贴图' : '照片'}</h3>${
            el.type === 'text'
              ? `<label>文字内容<textarea data-prop="text" rows="5">${E(el.text)}</textarea></label><div class="book-field-pair"><label>字体<select data-prop="fontFamily"><option value="sans" ${el.fontFamily !== 'serif' ? 'selected' : ''}>思源黑体</option><option value="serif" ${el.fontFamily === 'serif' ? 'selected' : ''}>思源宋体</option></select></label><label>字号 pt<input type="number" data-prop="fontSize" min="6" max="120" value="${el.fontSize || 12}"></label></div><div class="book-field-pair"><label>行距<input type="number" data-prop="lineHeight" min="1" max="2.5" step=".05" value="${el.lineHeight || 1.35}"></label><label>对齐<select data-prop="align">${[
                  ['left', '左对齐'],
                  ['center', '居中'],
                  ['right', '右对齐'],
                ]
                  .map(
                    ([v, n]) =>
                      `<option value="${v}" ${el.align === v ? 'selected' : ''}>${n}</option>`,
                  )
                  .join(
                    '',
                  )}</select></label></div><label>文字颜色<input type="color" data-prop="color" value="${el.color || '#282a25'}"></label>`
              : el.type === 'image'
                ? `<p>${E(el.name || '空照片框')}</p><div class="book-photo-actions"><button data-b="crop" aria-pressed="${cropMode}" ${el.locked || current().locked ? 'disabled' : ''}>裁切</button><button data-b="fit" aria-pressed="${el.fit === 'contain'}" ${el.locked || current().locked ? 'disabled' : ''}>完整显示</button><button data-b="swap" aria-pressed="${!!swapFrom}" ${el.locked || current().locked ? 'disabled' : ''}>交换照片</button><button draggable="${!el.locked && !current().locked}" data-frame-drag="${E(el.id)}" ${el.locked || current().locked ? 'disabled' : ''} title="拖到另一照片框交换">⠿ 拖动交换</button></div>${swapFrom ? '<p class="book-hint">点击另一照片交换，Esc 取消。</p>' : ''}<label>形状蒙版<select data-prop="mask">${Object.entries(
                    MASKS,
                  )
                    .map(
                      ([v, n]) =>
                        `<option value="${v}" ${(el.mask || 'rect') === v ? 'selected' : ''}>${n}</option>`,
                    )
                    .join(
                      '',
                    )}</select></label><label>图片显示<select data-prop="fit"><option value="contain" ${el.fit === 'contain' ? 'selected' : ''}>完整构图</option><option value="cover" ${el.fit === 'cover' ? 'selected' : ''}>裁切铺满</option></select></label><button data-b="crop-reset">裁切居中复位</button><p class="book-hint">素材中的“替换选中框”保留框的位置与尺寸。</p>`
                : el.type === 'sticker'
                  ? `<label>贴图颜色<input type="color" data-prop="color" value="${el.color || '#b39a61'}" ${el.dataUrl ? 'disabled' : ''}></label><label>不透明度<input type="number" data-prop="opacity" min="0" max="1" step=".1" value="${el.opacity ?? 1}"></label>`
                  : `${el.points?.length === 1 ? '<button data-b="edit-map">编辑地图地点与视野</button>' : ''}${el.snapshot ? '<p>地图已保存在画册中，可离线查看与导出。</p>' : ''}<label class="book-check"><input type="checkbox" data-prop="connect" ${el.snapshot ? 'disabled' : ''} ${el.connect ? 'checked' : ''}>按列表顺序连接地点</label><p class="book-hint">仅在地点顺序代表实际行程时启用。</p>`
          }<section class="book-element-alignment">${alignmentMarkup()}</section><details class="book-precision" ${advanced ? 'open' : ''}><summary>精确设置与图层</summary><div class="book-geometry-fields">${['x', 'y', 'w', 'h', 'rotation'].map((k) => `<label>${{ x: 'X mm', y: 'Y mm', w: '宽 mm', h: '高 mm', rotation: '旋转 °' }[k]}<input type="number" data-prop="${k}" step=".1" min="${['w', 'h'].includes(k) ? 1 : -1000}" max="1000" value="${Number(el[k] || 0).toFixed(1)}"></label>`).join('')}</div><div class="book-button-row"><button data-b="back">置底</button><button data-b="front">置顶</button><button data-b="rotate90">旋转 90°</button></div></details><div class="book-button-row"><button data-b="lock" aria-pressed="${el.locked ? 'true' : 'false'}">${el.locked ? '解锁元素' : '锁定元素'}</button><button data-b="duplicate-element">复制</button><button data-b="delete-element">移入待排区</button></div></section>`
        : `<p class="book-hint">${view === 'overview' ? '单击选中页面，双击进入编辑；拖动整页排序，Shift 拖动整章。' : '选择画布上的元素，显示对应工具。Shift 点击可多选，方向键微调。'}</p>`
    }<section class="book-layer-list"><h3>本页内容</h3>${[...p.elements]
      .reverse()
      .map(
        (e) =>
          `<button data-select="${E(e.id)}" class="${selected.has(e.id) ? 'active' : ''}">${e.locked ? '▣ ' : ''}${E(e.type === 'text' ? e.text.slice(0, 32) : e.type === 'map' ? '旅行地点' : e.name || '照片框')}</button>`,
      )
      .join('')}</section>`;
  }
  function addPhoto(photoId, replace = false, targetPage = page, targetId = null) {
    const p = library.getPhoto(photoId);
    if (!p) return;
    const dest = book.pages[targetPage],
      el = targetId ? dest.elements.find((e) => e.id === targetId) : replace ? chosen() : null;
    if (dest.locked || el?.locked || spreadLocked(el)) {
      toast('请先解锁页面或照片框', 'warning');
      return;
    }
    if (replace && el?.type !== 'image') {
      toast('先选中一个照片框', 'warning');
      return;
    }
    checkpoint();
    page = targetPage;
    const asset = assetSnapshot(p);
    book.assets[p.id] = asset;
    const empty =
      el?.type === 'image'
        ? el
        : dest.elements.find((e) => e.type === 'image' && !e.photoId && !e.locked);
    if (empty) {
      if (empty.photoId) book.pending.push({ ...clone(empty), fromPage: dest.id });
      Object.assign(empty, {
        photoId: p.id,
        mediaId: p.mediaId,
        name: p.name,
        cropX: 0.5,
        cropY: 0.5,
      });
      selected = new Set([empty.id]);
    } else {
      const e = imageElement(
        asset,
        book.safe,
        book.safe,
        book.width - book.safe * 2,
        book.height - book.safe * 2 - 15,
      );
      dest.elements.push(e);
      selected = new Set([e.id]);
    }
    markManual();
    if (empty) syncPanorama(book, page, empty);
    refreshDecorations(book);
    render();
  }
  function exchange(a, b) {
    const first = book.pages[a.page],
      second = book.pages[b.page],
      x = first.elements.find((e) => e.id === a.id),
      y = second.elements.find((e) => e.id === b.id);
    if (
      !x ||
      !y ||
      x === y ||
      x.type !== 'image' ||
      y.type !== 'image' ||
      x.locked ||
      y.locked ||
      spreadLocked(x) ||
      spreadLocked(y) ||
      first.locked ||
      second.locked
    )
      return;
    checkpoint();
    const keys = ['photoId', 'mediaId', 'name'];
    const original = Object.fromEntries(keys.map((k) => [k, x[k]]));
    keys.forEach((k) => {
      x[k] = y[k];
      y[k] = original[k];
    });
    x.cropX = x.cropY = y.cropX = y.cropY = 0.5;
    syncPanorama(book, a.page, x);
    syncPanorama(book, b.page, y);
    first.manual = second.manual = true;
    swapFrom = null;
    refreshDecorations(book);
    render();
  }
  function dialog(title, body, buttons = '') {
    const d = document.createElement('dialog');
    d.className = 'book-panel-dialog';
    d.innerHTML = `<header><h2>${title}</h2><button data-dialog-close aria-label="关闭">×</button></header><div class="book-dialog-body">${body}</div>${buttons ? `<footer>${buttons}</footer>` : ''}`;
    d.querySelector('[data-dialog-close]').onclick = () => d.close();
    d.onclose = () => d.remove();
    host.append(d);
    d.showModal();
    return d;
  }
  function layoutPicker() {
    if (current().locked) {
      toast('先解锁页面再更换版式', 'warning');
      return;
    }
    const choices = [
      ['panorama', '跨页满版'],
      ['single', '留白单图'],
      ['hero', '满版'],
      ['duo', '并列双图'],
      ['stack', '上下双图'],
      ['grid', '四图'],
      ['editorial', '图文'],
      ['blank', '空白'],
    ];
    const d = dialog(
      '试一试新的版式',
      `<p>照片会带入预览。放不下的照片进入待排区，手写文字会保留。</p><div class="book-layout-gallery">${choices
        .map(([key, title]) => {
          const b = clone(book);
          try {
            key === 'panorama' ? makePanorama(b, page, chosen()?.id) : applyLayout(b, page, key);
          } catch {
            return '';
          }
          return `<button data-layout="${key}">${pageThumbnail(b, b.pages[page], page, thumb)}<b>${title}</b></button>`;
        })
        .join('')}</div>`,
    );
    d.onclick = (e) => {
      const b = e.target.closest('[data-layout]');
      if (b) {
        checkpoint();
        b.dataset.layout === 'panorama'
          ? makePanorama(book, page, chosen()?.id)
          : applyLayout(book, page, b.dataset.layout);
        selected.clear();
        d.close();
        render();
      }
    };
    d.querySelector('[data-dialog-close]').onclick = () => d.close();
  }
  function stylePicker() {
    let theme = book.theme,
      candidate;
    const d = dialog(
      '整册风格',
      `${themeGallery(theme)}<div class="book-theme-settings"><label class="book-check"><input id="preserve-manual" type="checkbox" checked>保留手动调整的页面</label><label>应用范围<select id="theme-scope"><option value="all">整本画册</option><option value="chapter">当前章节</option></select></label></div><p>锁定页面始终保留。下方显示应用后的页面。</p><div class="book-theme-proof"></div>`,
      '<button data-apply-theme class="primary">应用风格</button>',
    );
    const preview = () => {
      candidate = clone(book);
      applyTheme(candidate, theme, {
        preserveManual: d.querySelector('#preserve-manual').checked,
        scope: d.querySelector('#theme-scope').value,
        chapter: current().chapter || '',
      });
      d.querySelectorAll('[data-theme]').forEach(
        (b) => (
          b.classList.toggle('active', b.dataset.theme === theme),
          b.setAttribute('aria-pressed', String(b.dataset.theme === theme))
        ),
      );
      d.querySelector('.book-theme-proof').innerHTML = candidate.pages
        .map(
          (p, i) =>
            `<article>${pageThumbnail(candidate, p, i, thumb)}<small>${i + 1}</small></article>`,
        )
        .join('');
    };
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-theme]');
      if (b) {
        theme = b.dataset.theme;
        preview();
      }
      if (e.target.closest('[data-apply-theme]')) {
        checkpoint();
        book = candidate;
        d.close();
        render();
      }
    });
    d.onchange = (event) => {
      if (!filterThemeGallery(event)) preview();
    };
    preview();
  }
  function settings() {
    const d = dialog(
      '画册与装订规格',
      `<form id="book-settings"><label>画册名称<input name="name" maxlength="120" value="${E(book.name)}" required></label><label>画册规格<button type="button" data-settings-size class="book-size-trigger"><span style="aspect-ratio:${book.width}/${book.height}"></span><b>${book.width} × ${book.height} mm</b>选择规格 ›</button></label><div class="book-field-pair">${[
        ['width', '宽 mm', 80, 450],
        ['height', '高 mm', 80, 450],
        ['safe', '外侧安全边距 mm', 0, 30],
        ['innerMargin', '装订内侧边距 mm', 0, 40],
        ['bleed', '出血 mm', 0, 10],
        ['spine', '书脊宽 mm', 0, 80],
      ]
        .map(
          ([k, n, min, max]) =>
            `<label>${n}<input name="${k}" type="number" min="${min}" max="${max}" step=".1" required value="${book[k] || 0}"></label>`,
        )
        .join('')}</div><label>装订方式<select name="binding">${[
        ['layflat', '平摊装订'],
        ['glue', '胶装'],
        ['saddle', '骑马订'],
      ]
        .map(
          ([v, n]) => `<option value="${v}" ${book.binding === v ? 'selected' : ''}>${n}</option>`,
        )
        .join(
          '',
        )}</select></label><p class="book-hint">书脊宽度按印厂规格填写。改变尺寸会缩放页面内容；内侧边距用于版式和打印检查。</p></form>`,
      '<button class="primary" type="submit" form="book-settings">保存规格</button>',
    );
    const form = d.querySelector('form');
    form.querySelector('[data-settings-size]').onclick = () =>
      openBookSizePicker({
        width: Number(form.elements.width.value),
        height: Number(form.elements.height.value),
        onSelect: (p) => {
          if (p) {
            form.elements.width.value = p.width;
            form.elements.height.value = p.height;
            form.querySelector('[data-settings-size] b').textContent =
              `${p.width} × ${p.height} mm`;
            form.querySelector('[data-settings-size] span').style.aspectRatio =
              `${p.width}/${p.height}`;
          } else form.elements.width.focus();
        },
      });
    form.onsubmit = (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const data = Object.fromEntries(new FormData(form));
      checkpoint();
      const oldName = book.name,
        sx = Number(data.width) / book.width,
        sy = Number(data.height) / book.height;
      book.pages.forEach((p) =>
        p.elements.forEach((el) => {
          el.x *= sx;
          el.w *= sx;
          el.y *= sy;
          el.h *= sy;
          if (
            ['cover', 'title', 'back'].includes(p.role) &&
            el.generated === 'heading' &&
            el.text === oldName
          )
            el.text = data.name;
        }),
      );
      for (const k of ['width', 'height', 'safe', 'innerMargin', 'bleed', 'spine'])
        book[k] = Number(data[k]);
      book.name = data.name;
      book.binding = data.binding;
      refreshDecorations(book);
      d.close();
      render();
    };
  }
  function captions() {
    const d = dialog(
      '照片注释与胶片附录',
      `<form id="book-caption-form"><h3>照片下方显示</h3><div class="book-caption-fields">${Object.entries(
        CAPTION_FIELDS,
      )
        .map(
          ([k, n]) =>
            `<label class="book-check"><input name="caption" value="${k}" type="checkbox" ${book.captionFields.includes(k) ? 'checked' : ''}>${n}</label>`,
        )
        .join(
          '',
        )}</div><label class="book-check"><input type="checkbox" name="pageNumbers" ${book.pageNumbers !== false ? 'checked' : ''}>自动页码</label><h3>添加或更新附录</h3><p>使用本册已使用照片的资料，锁定和手动编辑的附录保留。</p>${[
        ['notes', '胶卷资料页'],
        ['map', '旅行地点地图'],
        ['contact', '接触印样与正文索引'],
      ]
        .map(
          ([k, n]) =>
            `<label class="book-check"><input type="checkbox" name="appendix" value="${k}">${n}</label>`,
        )
        .join(
          '',
        )}<p class="book-hint">地点地图默认只标点；照片日期沿用建册时确认的资料。</p></form>`,
      '<button type="submit" form="book-caption-form" class="primary">应用</button>',
    );
    d.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const data = new FormData(e.target),
        candidate = clone(book);
      candidate.captionFields = data.getAll('caption');
      candidate.pageNumbers = data.has('pageNumbers');
      const ids = Object.keys(photoUsage(candidate)),
        assets = ids.map((id) => candidate.assets[id]).filter(Boolean);
      let emptyMap = false;
      for (const role of data.getAll('appendix')) {
        const pages =
          role === 'map'
            ? mapPages(candidate, assets)
            : role === 'notes'
              ? rollNotePages(candidate, assets)
              : contactPages(candidate, assets);
        if (role === 'map' && !pages.length) {
          emptyMap = true;
          continue;
        }
        candidate.pages = candidate.pages.filter((p) => p.role !== role || p.locked || p.manual);
        let index = candidate.pages.findIndex((p) => ['ending', 'back'].includes(p.role));
        if (index < 0) index = candidate.pages.length;
        candidate.pages.splice(index, 0, ...pages);
      }
      if (candidate.pages.length > 200) {
        toast('附录会使画册超过 200 页，请分册处理', 'warning');
        return;
      }
      checkpoint();
      book = candidate;
      refreshDecorations(book);
      d.close();
      render();
      if (emptyMap) toast('本册照片尚未记录坐标，未生成地图页', 'warning');
    };
  }
  function reflow() {
    const d = dialog(
      '重排当前章节',
      `<p>章节：${E(current().chapter || '未分章')}。重新组织未锁定正文页，多余文字进入待排区。</p><label>排版密度<select id="reflow-density"><option value="airy">留白较多 · 单图</option><option value="balanced" selected>均衡叙事 · 双图</option><option value="compact">紧凑记录 · 四图</option></select></label><label class="book-check"><input id="reflow-preserve" type="checkbox" checked>保留手动调整的页面</label>`,
      '<button class="primary" data-reflow>重排章节</button>',
    );
    d.querySelector('[data-reflow]').onclick = async () => {
      const { reflowChapter } = await import('../shared/book-model.mjs');
      const candidate = clone(book);
      try {
        const changed = reflowChapter(
          candidate,
          current().chapter || '',
          d.querySelector('#reflow-density').value,
          d.querySelector('#reflow-preserve').checked,
        );
        if (!changed) {
          toast('这一章没有可重排的正文页', 'warning');
          return;
        }
        checkpoint();
        book = candidate;
        d.close();
        render();
      } catch (e) {
        toast(e.message, 'warning');
      }
    };
  }
  function note() {
    const d = dialog(
      '本页待办',
      `<label>第 ${page + 1} 页<textarea id="book-page-note" rows="4">${E(current().todo || '')}</textarea></label>`,
      '<button class="primary" data-note-save>保存待办</button>',
    );
    d.querySelector('[data-note-save]').onclick = () => {
      checkpoint();
      current().todo = d.querySelector('textarea').value;
      d.close();
      render();
    };
  }
  async function proof() {
    await save();
    const result = await api('/books/' + book.id + '/preflight');
    // Browser font metrics catch text overflow before either export target.
    await Promise.all([
      document.fonts.load('12px BookSans'),
      document.fonts.load('12px BookSerif'),
    ]);
    await document.fonts.ready;
    const issues = [...result.warnings];
    const measuring = document.createElement('canvas').getContext('2d');
    book.pages.forEach((p, i) =>
      p.elements
        .filter((e) => e.type === 'text')
        .forEach((el) => {
          const size = ((el.fontSize || 12) * 96) / 72;
          measuring.font = `${size}px ${el.fontFamily === 'serif' ? 'BookSerif' : 'BookSans'}`;
          let lines = 0;
          for (const paragraph of String(el.text).split('\n')) {
            let line = '';
            lines++;
            for (const c of paragraph) {
              if (line && measuring.measureText(line + c).width > (el.w * 96) / 25.4) {
                lines++;
                line = c;
              } else line += c;
            }
          }
          if (
            lines * size * (el.lineHeight || 1.35) > (el.h * 96) / 25.4 + 0.5 &&
            !issues.some(
              (w) => w.page === i + 1 && w.elementId === el.id && w.issue === 'text-overflow',
            )
          )
            issues.push({
              page: i + 1,
              elementId: el.id,
              issue: 'text-overflow',
              message: '文字可能溢出，请调整字号、行距或文字框',
            });
        }),
    );
    const d = dialog(
      '检查与导出',
      `<p>${book.pages.length} 页 · ${book.width} × ${book.height} mm · ${book.bleed} mm 出血</p><div class="book-preflight-list">${issues.map((w) => `<button data-issue-page="${w.page - 1}" data-issue-element="${E(w.elementId || '')}"><b>第 ${w.page} 页</b> ${E(w.message)} →</button>`).join('') || '<p class="book-check-passed">✓ 照片与排版检查通过</p>'}</div><div class="book-export-options"><button data-export="reading"><b>阅读 PDF</b><span>无裁切标记 · 适度压缩 · 屏幕阅读</span></button><button data-export="print"><b>打印 PDF</b><span>原始分辨率 · 出血 · 裁切标记</span></button><button data-export="cover"><b>封面展开 PDF</b><span>封底 + ${book.spine || 0} mm 书脊 + 封面</span></button></div><p class="book-hint">打印文件使用 RGB，按阅读顺序输出单页。书脊、色彩配置及拼版按印厂要求交付。</p>`,
    );
    d.addEventListener('click', async (e) => {
      const issue = e.target.closest('[data-issue-page]');
      if (issue) {
        d.close();
        view = 'single';
        go(Number(issue.dataset.issuePage));
        selected = new Set([issue.dataset.issueElement]);
        render();
        return;
      }
      const b = e.target.closest('[data-export]');
      if (b) {
        if (d.dataset.exporting) return;
        d.dataset.exporting = 'true';
        d.querySelectorAll('[data-export],[data-issue-page]').forEach(
          (button) => (button.disabled = true),
        );
        const status = document.createElement('div');
        status.className = 'book-export-progress';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.innerHTML =
          '<i class="book-export-spinner"></i><div><b>正在准备 PDF…</b><p>完成后会提示保存位置，请稍候。</p><progress aria-label="PDF 导出进度"></progress></div>';
        d.querySelector('.book-export-options').after(status);
        try {
          await job(
            'book-pdf',
            { bookId: book.id, mode: b.dataset.export },
            '导出画册 · ' + b.querySelector('b').textContent,
            {
              onProgress: (task) => {
                status.querySelector('b').textContent = task.phase || '等待导出任务开始…';
                const bar = status.querySelector('progress');
                if (task.total) {
                  bar.max = task.total;
                  bar.value = task.done;
                } else bar.removeAttribute('value');
                if (task.state === 'completed') {
                  status.querySelector('b').textContent = 'PDF 已生成，正在打开保存窗口…';
                  bar.max = 1;
                  bar.value = 1;
                }
              },
            },
          );
          d.close();
        } catch (err) {
          toast(err.message, 'warning');
          delete d.dataset.exporting;
          status.remove();
          d.querySelectorAll('[data-export],[data-issue-page]').forEach(
            (button) => (button.disabled = false),
          );
        }
      }
    });
  }
  async function shelf() {
    if (book && dirty) await save();
    remember();
    library.close();
    observer?.disconnect();
    view = 'shelf';
    host.classList.remove('reading');
    shelfRows = await api('/books');
    ((shelfLimit = 50), (leftClosed = false), (rightClosed = false), canvasObserver);
    renderShelf();
    if (!host.open) host.showModal();
  }
  function renderShelf() {
    const rows = shelfRows.filter((b) =>
      b.name.toLocaleLowerCase().includes(shelfQuery.toLocaleLowerCase()),
    );
    host.innerHTML = `<header><div><small>FILM ALBUM / BOOKSHELF</small><h2>我的摄影画册</h2></div><nav><button class="primary" data-b="new-book">＋ 创作一本画册</button><button data-b="close" aria-label="关闭画册库">×</button></nav></header><div class="book-shelf-intro"><div><h1>让照片，成为一本书。</h1><p>整理片刻，编排故事，把胶片记忆留在纸上。</p></div><label>查找画册<input id="book-shelf-search" type="search" value="${E(shelfQuery)}" placeholder="搜索画册名称"></label></div><div class="book-shelf-grid">${
      rows
        .slice(0, shelfLimit)
        .map(
          (b) =>
            `<article><button class="book-shelf-cover" data-open-book="${E(b.id)}">${b.cover ? pageThumbnail(b, b.cover, 0, thumb) : '<span>FILM ALBUM</span>'}</button><div><small>${E(BOOK_THEMES[b.theme]?.name || '自由编排')} · ${b.pageCount} 页</small><h3>${E(b.name)}</h3><p>${b.updatedAt ? new Date(b.updatedAt).toLocaleDateString() : ''} ${b.todoCount ? ' · ' + b.todoCount + ' 页待修改' : ''}</p><button data-open-book="${E(b.id)}">继续创作 →</button><button data-copy-book="${E(b.id)}" title="复制画册">复制</button><button data-delete-book="${E(b.id)}" title="移入回收站">移除</button></div></article>`,
        )
        .join('') ||
      '<div class="book-shelf-empty"><h2>你的第一本摄影集</h2><p>从一卷胶片、一场旅行，或策展项目开始。</p><button class="primary" data-b="new-book">创建画册</button></div>'
    }</div>${shelfLimit < rows.length ? '<button class="book-shelf-more" data-b="more-books">加载更多 50 本</button>' : ''}`;
  }
  async function start(input) {
    if (book && dirty) await save();
    const next = typeof input === 'string' ? await api('/books/' + input) : input;
    if (!next) {
      const created = await builder(getContext());
      if (created) return start(created);
      return;
    }
    book = normalizeBook(next);
    page = 0;
    view = 'spread';
    zoom = 100;
    selected.clear();
    undo = [];
    redo = [];
    generation = 0;
    dirty = !book.id;
    cropMode = false;
    panel = 'photos';
    savedAt = '';
    warning = '';
    overviewLimit = 50;
    try {
      leftClosed = false;
      rightClosed = false;
      customGuides = [];
      gridVisible = false;
      gridSize = 10;
      guides = false;
      customGuidesVisible = true;
      const state = JSON.parse(localStorage.getItem('film-book-position:' + book.id) || 'null');
      if (state) {
        page = Math.max(
          0,
          book.pages.findIndex((p) => p.id === state.pageId),
        );
        view = ['overview', 'spread', 'single'].includes(state.view) ? state.view : 'spread';
        zoom = state.zoom || 100;
        leftClosed = !!state.leftClosed;
        rightClosed = !!state.rightClosed;
        gridVisible = !!state.gridVisible;
        gridSize = Math.max(2, Math.min(100, Number(state.gridSize) || 10));
        customGuides = (state.customGuides || []).filter(
          (g) => ['x', 'y'].includes(g.axis) && Number.isFinite(g.at),
        );
        customGuidesVisible = state.customGuidesVisible !== false;
        guides = !!state.guides;
        overviewLimit = Math.max(50, Math.ceil((page + 1) / 50) * 50);
      }
    } catch {}
    await Promise.all([library.open(), loadBookLand()]);
    render();
    if (!host.open) host.showModal();
    if (dirty) await save();
  }
  async function action(a) {
    if (a === 'close') {
      if (view !== 'shelf') {
        await save();
        remember();
      }
      clearTimeout(timer);
      library.close();
      observer?.disconnect();
      canvasObserver?.disconnect();
      if (document.fullscreenElement) await document.exitFullscreen();
      host.close();
      return;
    }
    if (a === 'shelf') return shelf();
    if (a === 'new-book') {
      const created = await builder(getContext());
      if (created) await start(created);
      return;
    }
    if (a === 'more-books') {
      shelfLimit += 50;
      renderShelf();
      return;
    }
    if (a === 'more-pages') {
      overviewLimit += 50;
      render();
      return;
    }
    if (a === 'save') return save();
    if (a === 'inspector' || a === 'left-panel') {
      if (a === 'inspector') rightClosed = !rightClosed;
      else leftClosed = !leftClosed;
      remember();
      render();
      return;
    }
    if (a === 'zoom-fit') {
      setZoom(100);
      return;
    }
    if (a === 'zoom-in' || a === 'zoom-out') {
      setZoom(zoom + (a === 'zoom-in' ? 10 : -10));
      return;
    }
    if (a === 'grid') {
      gridVisible = !gridVisible;
      remember();
      render();
      return;
    }
    if (a === 'guide-settings') return guideSettings();
    if (a === 'alignment') {
      rightClosed = false;
      render();
      $('.book-element-alignment')?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (a === 'snap') {
      snapping = !snapping;
      render();
      return;
    }
    if (a === 'map' || a === 'edit-map') return insertMap(a === 'edit-map');
    if (a === 'sticker') {
      if (view === 'overview') return;
      if (current().locked) return toast('请先解锁页面', 'warning');
      stickerPicker();
      return;
    }
    if (a === 'settings') return settings();
    if (a === 'layout') return layoutPicker();
    if (a === 'style') return stylePicker();
    if (a === 'captions') return captions();
    if (a === 'proof') return proof();
    if (a === 'note') return note();
    if (a === 'reflow') return reflow();
    if (a === 'fullscreen') {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      sizeCanvas();
      return;
    }
    if (a === 'page-prev' || a === 'page-next') return navigation(a === 'page-next' ? 1 : -1);
    if (a === 'undo' || a === 'redo') {
      const source = a === 'undo' ? undo : redo,
        target = a === 'undo' ? redo : undo;
      if (!source.length) return;
      target.push(JSON.stringify(book));
      const identity = { id: book.id, version: book.version };
      book = JSON.parse(source.pop());
      Object.assign(book, identity);
      generation++;
      dirty = true;
      page = Math.min(page, book.pages.length - 1);
      selected.clear();
      cropMode = false;
      scheduleSave();
      render();
      return;
    }
    if (a === 'swap') {
      const el = chosen();
      if (el?.type === 'image') {
        swapFrom = { page, id: el.id };
        render();
        toast('点击另一张照片交换，或拖动“拖动交换”到目标框');
      }
      return;
    }
    if (a === 'lock-page') {
      checkpoint();
      current().locked = !current().locked;
      render();
      return;
    }
    if (
      current().locked &&
      !['page-left', 'page-right', 'chapter-up', 'chapter-down', 'duplicate-page'].includes(a)
    ) {
      toast('此页已锁定，请先解锁', 'warning');
      return;
    }
    const el = chosen();
    if (
      [
        'crop',
        'crop-reset',
        'fit',
        'rotate90',
        'back',
        'front',
        'delete-element',
        'duplicate-element',
      ].includes(a) &&
      (!el || el.locked || spreadLocked(el))
    ) {
      toast('先选择并解锁一个元素', 'warning');
      return;
    }
    if (a === 'crop') {
      if (el.type !== 'image') return;
      cropMode = !cropMode;
      if (cropMode && el.fit !== 'cover') {
        checkpoint();
        el.fit = 'cover';
        syncPanorama(book, page, el);
        markManual();
      }
      render();
      return;
    }
    if (['add-page', 'duplicate-page'].includes(a) && book.pages.length >= 200) {
      toast('每册最多 200 页', 'warning');
      return;
    }
    if (a === 'delete-page' && book.pages.length === 1) return;
    checkpoint();
    if (a === 'add-page' || a === 'duplicate-page') {
      const p =
        a === 'duplicate-page'
          ? clone(current())
          : {
              role: 'content',
              chapter: current().chapter || '',
              background: BOOK_THEMES[book.theme]?.background || '#ffffff',
              elements: [],
            };
      p.id = id();
      p.elements.forEach((e) => {
        e.id = id();
        delete e.spreadId;
      });
      book.pages.splice(page + 1, 0, p);
      page++;
      selected.clear();
    }
    if (a === 'delete-page') {
      current()
        .elements.filter((e) => e.photoId || (['text', 'sticker'].includes(e.type) && !e.generated))
        .forEach((e) => book.pending.push({ ...clone(e), fromPage: current().id }));
      book.pages.splice(page, 1);
      page = Math.min(page, book.pages.length - 1);
      selected.clear();
    }
    if (a === 'page-left' || a === 'page-right') {
      const p = current();
      movePage(
        book,
        page,
        Math.max(0, Math.min(book.pages.length - 1, page + (a === 'page-left' ? -1 : 1))),
      );
      page = book.pages.indexOf(p);
    }
    if (a === 'chapter-up' || a === 'chapter-down') {
      const p = current(),
        group = p.chapter;
      const direction = a === 'chapter-up' ? -1 : 1;
      let to = page;
      while (book.pages[to]?.chapter === group) to += direction;
      if (book.pages[to]) {
        const target = book.pages[to].chapter;
        if (target) while (book.pages[to + direction]?.chapter === target) to += direction;
        movePage(book, page, to, true);
        page = book.pages.indexOf(p);
      }
    }
    if (a === 'text') {
      const e = textElement(
        '写下这一页的故事',
        book.safe,
        book.height * 0.75,
        book.width - book.safe * 2,
        book.height * 0.15,
        { fontFamily: BOOK_THEMES[book.theme]?.font || 'sans' },
      );
      current().elements.push(e);
      selected = new Set([e.id]);
      markManual();
    }
    if (a === 'fit') {
      el.fit = 'contain';
      cropMode = false;
      markManual();
    }
    if (a === 'crop-reset') {
      el.cropX = el.cropY = 0.5;
      markManual();
    }
    if (a === 'lock')
      current()
        .elements.filter((e) => selected.has(e.id))
        .forEach((e) => (e.locked = !e.locked));
    if (a === 'rotate90') {
      el.rotation = ((Number(el.rotation || 0) + 270) % 360) - 180;
      markManual();
    }
    if (a === 'duplicate-element') {
      const copies = current()
        .elements.filter((e) => selected.has(e.id) && !e.locked && !spreadLocked(e))
        .map((e) => {
          const c = { ...clone(e), id: id(), x: e.x + 4, y: e.y + 4 };
          delete c.spreadId;
          return c;
        });
      current().elements.push(...copies);
      selected = new Set(copies.map((e) => e.id));
      markManual();
    }
    if (a === 'delete-element') {
      const removed = current().elements.filter(
        (e) => selected.has(e.id) && !e.locked && !spreadLocked(e),
      );
      removed.forEach((e) => {
        if (e.photoId || e.type === 'text' || e.type === 'sticker')
          book.pending.push({ ...clone(e), fromPage: current().id });
      });
      current().elements = current().elements.filter((e) => !removed.includes(e));
      selected.clear();
      cropMode = false;
      markManual();
    }
    if (a === 'back' || a === 'front') {
      const moving = current().elements.filter(
        (e) => selected.has(e.id) && !e.locked && !spreadLocked(e),
      );
      current().elements = current().elements.filter((e) => !moving.includes(e));
      a === 'back' ? current().elements.unshift(...moving) : current().elements.push(...moving);
      markManual();
    }
    syncPanorama(book, page, el);
    refreshDecorations(book);
    render();
    remember();
  }
  host.addEventListener('click', async (e) => {
    if (e.target.closest('.book-panel-dialog')) return;
    try {
      const b = e.target.closest('[data-b]');
      if (b) {
        await action(b.dataset.b);
        return;
      }
      const open = e.target.closest('[data-open-book]');
      if (open) {
        await start(open.dataset.openBook);
        return;
      }
      const duplicate = e.target.closest('[data-copy-book]');
      if (duplicate) {
        const original = await api('/books/' + duplicate.dataset.copyBook);
        delete original.id;
        delete original.version;
        original.name += ' · 副本';
        await api('/books', { method: 'POST', body: original });
        await shelf();
        return;
      }
      const remove = e.target.closest('[data-delete-book]');
      if (remove) {
        await api('/books/' + remove.dataset.deleteBook, { method: 'DELETE' });
        await shelf();
        toast('画册已移入回收站，可在资料库恢复');
        return;
      }
      const mode = e.target.closest('[data-view]');
      if (mode) {
        remember();
        if (view !== 'preview') previousView = view;
        view = mode.dataset.view;
        zoom = 100;
        selected.clear();
        cropMode = false;
        render();
        host.focus();
        remember();
        return;
      }
      const tab = e.target.closest('[data-panel]');
      if (tab) {
        panel = tab.dataset.panel;
        render();
        return;
      }
      if (view === 'preview' && e.target.closest('[data-paper]')) {
        page = Number(e.target.closest('[data-paper]').dataset.paper);
        render();
        return;
      }
      const pg = e.target.closest('[data-open-page]');
      if (pg) {
        if (view === 'overview') selectOverview(Number(pg.dataset.openPage));
        else go(Number(pg.dataset.openPage));
        return;
      }
      const pick = e.target.closest('[data-select]');
      if (pick) {
        if (view === 'overview') return;
        selected = new Set([pick.dataset.select]);
        cropMode = false;
        render();
        return;
      }
      const pending = e.target.closest('[data-pending]');
      if (pending) {
        if (current().locked) {
          toast('请先解锁页面', 'warning');
          return;
        }
        checkpoint();
        const [el] = book.pending.splice(Number(pending.dataset.pending), 1);
        el.id = id();
        delete el.spreadId;
        el.w = Math.min(el.w, book.width - book.safe * 2);
        el.h = Math.min(el.h, book.height - book.safe * 2);
        el.x = Math.max(book.safe, Math.min(el.x, book.width - book.safe - el.w));
        el.y = Math.max(book.safe, Math.min(el.y, book.height - book.safe - el.h));
        delete el.generated;
        delete el.fromPage;
        current().elements.push(el);
        selected = new Set([el.id]);
        markManual();
        refreshDecorations(book);
        render();
        return;
      }
      const align = e.target.closest('[data-align]');
      if (align && !current().locked) {
        checkpoint();
        const movable = current().elements.filter(
          (el) => selected.has(el.id) && !el.locked && !spreadLocked(el),
        );
        alignElements(
          current().elements,
          movable.map((el) => el.id),
          align.dataset.align,
          {
            width: book.width,
            height: book.height,
            safe: alignReference === 'safe' ? book.safe : 0,
            reference: alignReference === 'selection' ? 'selection' : 'page',
          },
        );
        movable.forEach((el) => syncPanorama(book, page, el));
        markManual();
        refreshDecorations(book);
        render();
      }
    } catch (err) {
      toast(err.message, 'warning');
    }
  });
  host.addEventListener('input', (e) => {
    if (e.target.id === 'book-shelf-search') {
      shelfQuery = e.target.value;
      const position = e.target.selectionStart;
      renderShelf();
      $('#book-shelf-search').focus();
      $('#book-shelf-search').setSelectionRange(position, position);
    }
    if (e.target.id === 'canvas-zoom' || e.target.id === 'book-zoom') {
      setZoom(Number(e.target.value));
      remember();
    }
  });
  host.addEventListener('change', (e) => {
    if (e.target.closest('.book-panel-dialog')) return;
    if (e.target.id === 'book-tool-display') {
      toolDisplay = e.target.value;
      localStorage.setItem('book-tool-display', toolDisplay);
      render();
      return;
    }
    if (e.target.id === 'book-align-reference') {
      alignReference = e.target.value;
      return;
    }
    if (e.target.id === 'book-guides') {
      guides = e.target.checked;
      remember();
      render();
      return;
    }
    const key = e.target.dataset.prop,
      pk = e.target.dataset.page;
    if (!key && !pk) return;
    if (e.target.type === 'number' && !e.target.validity.valid) {
      toast('请输入范围内的有效数值', 'warning');
      return;
    }
    const el = chosen();
    if ((current().locked && pk !== 'todo') || (key && (!el || el.locked || spreadLocked(el)))) {
      toast('请先解锁', 'warning');
      render();
      return;
    }
    checkpoint();
    const value =
      e.target.type === 'checkbox'
        ? e.target.checked
        : e.target.type === 'number'
          ? Number(e.target.value)
          : e.target.value;
    if (pk) current()[pk] = value;
    else {
      el[key] = value;
      if (key === 'mask' && value !== 'rect') el.fit = 'cover';
      if (['caption', 'index-caption'].includes(el.generated)) {
        const image = current().elements.find((e) => e.id === el.imageId);
        if (image) {
          if (key === 'text') image.captionOverride = value;
          else image.captionStyle = { ...(image.captionStyle || {}), [key]: value };
        }
      } else if (el.generated) delete el.generated;
      syncPanorama(book, page, el);
      markManual();
    }
    refreshDecorations(book);
    render();
  });
  host.addEventListener(
    'toggle',
    (e) => {
      if (e.target.classList.contains('book-precision')) advanced = e.target.open;
    },
    true,
  );
  host.addEventListener('dblclick', (e) => {
    if (view === 'overview') {
      const card = e.target.closest('[data-open-page]');
      if (card) go(Number(card.dataset.openPage));
      return;
    }
    if (view === 'preview') return;
    const el = e.target.closest('[data-element]');
    if (el && chosen()?.id === el.dataset.element && chosen()?.type === 'image')
      action('crop').catch((e) => toast(e.message));
  });
  host.addEventListener('contextmenu', (e) => {
    if (!['spread', 'single'].includes(view)) return;
    const node = e.target.closest('[data-element], [data-select]');
    if (!node) return;
    e.preventDefault();
    const pi = node.closest('[data-paper]')?.dataset.paper;
    if (pi != null && Number(pi) !== page) {
      page = Number(pi);
      selected.clear();
    }
    const key = node.dataset.element || node.dataset.select;
    if (!selected.has(key)) selected = new Set([key]);
    cropMode = false;
    render();
    const menu = document.createElement('div');
    menu.className = 'book-context-menu';
    menu.setAttribute('role', 'menu');
    const el = chosen(),
      locked = current().locked || el.locked || spreadLocked(el);
    menu.innerHTML = `<strong>${selected.size > 1 ? `已选择 ${selected.size} 个元素` : { image: '照片', text: '文字', sticker: '贴图', map: '地图' }[el.type] || '元素'}</strong><div class="book-context-actions">${[
      ['duplicate-element', '⧉ 复制'],
      ['delete-element', '× 删除'],
      ['front', '↑ 置顶'],
      ['back', '↓ 置底'],
      ['rotate90', '↻ 旋转 90°'],
    ]
      .map(
        ([a, n]) =>
          `<button role="menuitem" data-b="${a}" ${locked ? 'disabled' : ''}>${n}</button>`,
      )
      .join(
        '',
      )}<button role="menuitem" data-b="lock" ${current().locked ? 'disabled' : ''}>${el.locked ? '解锁' : '锁定'}元素</button></div>${alignmentMarkup()}`;
    host.append(menu);
    menu
      .querySelectorAll('[data-align]')
      .forEach(
        (b) =>
          (b.disabled = locked || (b.dataset.align.startsWith('distribute') && selected.size < 3)),
      );
    menu.querySelector('[data-b=delete-element]').title = '删除所选元素并移入待排区，可撤销';
    menu.style.left = Math.max(8, Math.min(e.clientX, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(e.clientY, innerHeight - menu.offsetHeight - 8)) + 'px';
    menu.querySelector('button:not(:disabled)')?.focus();
  });
  host.addEventListener(
    'pointerdown',
    (e) => {
      if (!e.target.closest('.book-context-menu')) $('.book-context-menu')?.remove();
    },
    true,
  );
  host.addEventListener('click', (e) => {
    if (e.target.closest('.book-context-menu button')) $('.book-context-menu')?.remove();
  });
  host.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !['spread', 'single'].includes(view)) return;
    const paperNode = e.target.closest('[data-paper]');
    if (!paperNode) return;
    const index = Number(paperNode.dataset.paper),
      node = e.target.closest('[data-element]'),
      key = node?.dataset.element,
      handle = e.target.closest('[data-resize]')?.dataset.resize;
    if (swapFrom && key) {
      exchange(swapFrom, { page: index, id: key });
      return;
    }
    if (index !== page) {
      page = index;
      selected.clear();
      cropMode = false;
    }
    if (!node) {
      selected.clear();
      cropMode = false;
      render();
      return;
    }
    if (e.shiftKey && !handle) {
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
    } else if (!selected.has(key)) {
      selected = new Set([key]);
      cropMode = false;
    }
    render();
    sizeCanvas();
    const el = current().elements.find((el) => el.id === key);
    if (!selected.has(key) || el.locked || current().locked || spreadLocked(el)) return;
    const paperNow = $(`[data-paper="${page}"]`),
      nodeNow = paperNow.querySelector(`[data-element="${key}"]`),
      image = nodeNow.querySelector('img');
    drag = {
      x: e.clientX,
      y: e.clientY,
      rect: paperNow.getBoundingClientRect(),
      key,
      handle,
      crop: cropMode && !handle,
      original: clone(el),
      originals: clone(
        current().elements.filter((e) => selected.has(e.id) && !e.locked && !spreadLocked(e)),
      ),
      width: image?.naturalWidth || book.assets[el.photoId]?.width,
      height: image?.naturalHeight || book.assets[el.photoId]?.height,
      moved: false,
      node: nodeNow,
    };
    host.setPointerCapture(e.pointerId);
    paperNow.focus({ preventScroll: true });
    e.preventDefault();
  });
  host.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = ((e.clientX - drag.x) / drag.rect.width) * book.width,
      dy = ((e.clientY - drag.y) / drag.rect.height) * book.height;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 3) return;
      checkpoint();
      drag.moved = true;
      markManual();
    }
    const el = current().elements.find((e) => e.id === drag.key);
    if (drag.crop) {
      Object.assign(el, cropBookImage(drag.original, dx, dy, drag.width, drag.height));
      drag.node.querySelector('img').style.objectPosition = `${el.cropX * 100}% ${el.cropY * 100}%`;
    } else {
      let moveX = dx,
        moveY = dy;
      const axis = e.shiftKey && !drag.handle ? (Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y') : null;
      if (axis === 'x') moveY = 0;
      if (axis === 'y') moveX = 0;
      const others = current().elements.filter((item) => !selected.has(item.id) && !item.generated);
      const options = {
        width: book.width,
        height: book.height,
        margins: pageMargins(book, page),
        grid: gridVisible ? gridSize : 0,
        customGuides: customGuidesVisible ? customGuides : [],
        threshold: (6 * book.width) / drag.rect.width,
        axis,
      };
      const enabled = snapping && !e.altKey;
      let lines = [];
      if (drag.handle) {
        const proposed = resizeBookElement(drag.original, drag.handle, dx, dy, {
          keepAspect: e.shiftKey,
          snap: false,
        });
        const result = enabled
          ? snapBookResize(drag.original, proposed, drag.handle, others, {
              ...options,
              keepAspect: e.shiftKey,
            })
          : { rect: proposed, guides: [] };
        Object.assign(el, result.rect);
        lines = result.guides;
      } else {
        const result = enabled
          ? snapBookMove(drag.originals, others, moveX, moveY, options)
          : { dx: moveX, dy: moveY, guides: [] };
        lines = result.guides;
        for (const original of drag.originals) {
          const target = current().elements.find((e) => e.id === original.id);
          target.x = original.x + result.dx;
          target.y = original.y + result.dy;
          const node = $(`[data-paper="${page}"] [data-element="${target.id}"]`);
          node.style.left = (target.x / book.width) * 100 + '%';
          node.style.top = (target.y / book.height) * 100 + '%';
        }
      }
      showSnapGuides(lines);
    }
    Object.assign(drag.node.style, {
      left: (el.x / book.width) * 100 + '%',
      top: (el.y / book.height) * 100 + '%',
      width: (el.w / book.width) * 100 + '%',
      height: (el.h / book.height) * 100 + '%',
    });
  });
  function endDrag() {
    showSnapGuides();
    const moved = drag?.moved;
    drag = null;
    if (moved) {
      for (const el of current().elements.filter((e) => selected.has(e.id)))
        syncPanorama(book, page, el);
      refreshDecorations(book);
      render();
      scheduleSave();
    }
  }
  host.addEventListener('pointerup', endDrag);
  host.addEventListener('pointercancel', endDrag);
  host.addEventListener('lostpointercapture', endDrag);
  host.addEventListener('dragstart', (e) => {
    const source = e.target.closest('[data-photo]');
    draggedPhoto = source ? library.getPhoto(source.dataset.photo) : null;
    const card = e.target.closest('[data-page-card]');
    if (card) {
      e.dataTransfer.setData('application/book-page', card.dataset.pageCard);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setDragImage?.(card, Math.min(80, card.clientWidth / 2), 40);
      return;
    }
    const frame = e.target.closest('[data-frame-drag]');
    if (frame)
      e.dataTransfer.setData(
        'application/book-frame',
        JSON.stringify({ page, id: frame.dataset.frameDrag }),
      );
  });
  function clearDropPreview() {
    host.querySelectorAll('img[data-drop-original]').forEach((img) => {
      img.src = img.dataset.dropOriginal;
      delete img.dataset.dropOriginal;
    });
  }
  host.addEventListener('dragend', () => {
    draggedPhoto = null;
    clearDropPreview();
    host
      .querySelectorAll('.book-drop-target')
      .forEach((n) => n.classList.remove('book-drop-target'));
  });
  host.addEventListener('dragover', (e) => {
    const target = e.target.closest('[data-paper],[data-page-card]');
    if (!target) return;
    e.preventDefault();
    host
      .querySelectorAll('.book-drop-target')
      .forEach((n) => n.classList.remove('book-drop-target'));
    if (view === 'overview' && !Array.from(e.dataTransfer.types).includes('application/book-page'))
      return;
    const node =
      view === 'overview'
        ? e.target.closest('[data-page-card]')
        : e.target.closest('[data-element]') || target;
    if (!node) return;
    node.classList.add('book-drop-target');
    if (draggedPhoto) {
      const img = node.matches('[data-element]') ? node.querySelector('img') : null;
      if (img && !img.dataset.dropOriginal) {
        clearDropPreview();
        img.dataset.dropOriginal = img.src;
        img.src = thumb(draggedPhoto.mediaId, 640);
      }
    }
  });
  host.addEventListener('dragleave', (e) => e.target.classList?.remove('book-drop-target'));
  host.addEventListener('drop', (e) => {
    clearDropPreview();
    draggedPhoto = null;
    host
      .querySelectorAll('.book-drop-target')
      .forEach((n) => n.classList.remove('book-drop-target'));
    const target = e.target.closest('[data-paper]'),
      card = e.target.closest('[data-page-card]');
    if (!target && !card) return;
    e.preventDefault();
    const photo = e.dataTransfer.getData('application/film-photo'),
      frame = e.dataTransfer.getData('application/book-frame'),
      from = e.dataTransfer.getData('application/book-page');
    if (view === 'overview' && (from === '' || !card)) return;
    if (photo && target && view !== 'overview')
      addPhoto(
        photo,
        false,
        Number(target.dataset.paper),
        e.target.closest('[data-element]')?.dataset.element,
      );
    if (frame && target && view !== 'overview') {
      try {
        exchange(JSON.parse(frame), {
          page: Number(target.dataset.paper),
          id: e.target.closest('[data-element]')?.dataset.element,
        });
      } catch {}
    }
    if (from !== '' && card) {
      if (
        !/^\d+$/.test(from) ||
        !book.pages[Number(from)] ||
        Number(from) === Number(card.dataset.pageCard)
      )
        return;
      checkpoint();
      const p = book.pages[Number(from)];
      movePage(book, Number(from), Number(card.dataset.pageCard), e.shiftKey);
      page = book.pages.indexOf(p);
      render();
    }
  });
  host.addEventListener('keydown', (e) => {
    if ($('.book-context-menu') && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      $('.book-context-menu').remove();
      host.focus();
      return;
    }

    if (
      e.target.closest('.book-panel-dialog') ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) ||
      view === 'shelf'
    )
      return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      action(e.shiftKey ? 'redo' : 'undo');
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save().catch((e) => toast(e.message, 'warning'));
      return;
    }
    if (e.key === 'Escape' && (cropMode || swapFrom)) {
      e.preventDefault();
      cropMode = false;
      swapFrom = null;
      render();
      return;
    }
    if (e.key === 'Escape' && view === 'preview') {
      e.preventDefault();
      view = previousView;
      render();
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.stopPropagation();
      e.preventDefault();
      if (selected.size && view !== 'preview' && !current().locked) {
        checkpoint();
        const amount = e.altKey ? 0.1 : e.shiftKey ? 10 : 1;
        nudgeElements(
          current().elements,
          current()
            .elements.filter((el) => selected.has(el.id) && !spreadLocked(el))
            .map((el) => el.id),
          e.key === 'ArrowLeft' ? -amount : e.key === 'ArrowRight' ? amount : 0,
          e.key === 'ArrowUp' ? -amount : e.key === 'ArrowDown' ? amount : 0,
        );
        current()
          .elements.filter((el) => selected.has(el.id) && !el.locked && !spreadLocked(el))
          .forEach((el) => syncPanorama(book, page, el));
        markManual();
        refreshDecorations(book);
        render();
        $(`[data-paper="${page}"]`)?.focus();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
        navigation(e.key === 'ArrowRight' ? 1 : -1);
    }
    if (view === 'overview' && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      action('delete-page').catch((err) => toast(err.message, 'warning'));
      return;
    }
    if (view === 'overview' && e.key === 'Enter') {
      e.preventDefault();
      go(page);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) {
      e.preventDefault();
      action('delete-element');
    }
  });
  host.addEventListener('cancel', (e) => {
    if (e.target !== host) return;
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
    open: start,
    shelf,
    async create(options) {
      const b = await builder(options);
      if (b) await start(b);
    },
    list: () => api('/books'),
  };
}
