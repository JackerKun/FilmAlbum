import { installLibraryHealth } from './library-health.mjs';
import { entryKey, resolveRefs, mergeRefs, matchesFrame, viewGeometry, histogramBins } from '../../shared/photo-core.mjs';
(() => {
  'use strict';

  const STOCKS = {
    portra160: { name: 'PORTRA 160', brand: 'KODAK', iso: '160', color: '#385a49', color2: '#e5c47d', kind: 'COLOR NEGATIVE', group: 'color', filter: 'saturate(.84) contrast(.94) brightness(1.04) sepia(.05)' },
    portra400: { name: 'PORTRA 400', brand: 'KODAK', iso: '400', color: '#315747', color2: '#e6c16f', kind: 'COLOR NEGATIVE', group: 'color', filter: 'saturate(.9) contrast(.97) brightness(1.03) sepia(.06)' },
    portra800: { name: 'PORTRA 800', brand: 'KODAK', iso: '800', color: '#35594a', color2: '#e5b962', kind: 'COLOR NEGATIVE', group: 'color', filter: 'saturate(.93) contrast(1.02) brightness(1.01) sepia(.08)' },
    gold200: { name: 'GOLD 200', brand: 'KODAK', iso: '200', color: '#d4a51e', color2: '#ba2727', kind: 'COLOR NEGATIVE', group: 'color', filter: 'saturate(1.08) contrast(1.03) sepia(.13)' },
    colorplus200: { name: 'COLORPLUS 200', brand: 'KODAK', iso: '200', color: '#e8ad22', color2: '#cb3433', kind: 'COLOR NEGATIVE', group: 'color', filter: 'saturate(1.04) contrast(1.01) sepia(.1) brightness(1.02)' },
    ultramax400: { name: 'ULTRAMAX 400', brand: 'KODAK', iso: '400', color: '#e7a917', color2: '#24488a', kind: 'COLOR NEGATIVE', group: 'color', filter: 'saturate(1.15) contrast(1.06) hue-rotate(-2deg)' },
    ektar100: { name: 'EKTAR 100', brand: 'KODAK', iso: '100', color: '#861f2f', color2: '#ddb25f', kind: 'COLOR NEGATIVE', group: 'color', filter: 'saturate(1.2) contrast(1.08)' },
    superia400: { name: 'SUPERIA X-TRA 400', brand: 'FUJIFILM', iso: '400', color: '#149d67', color2: '#d92839', kind: 'COLOR NEGATIVE', group: 'color', filter: 'saturate(1.08) contrast(1.05) hue-rotate(-4deg)' },
    c200: { name: 'C200', brand: 'FUJIFILM', iso: '200', color: '#139b72', color2: '#efe9ce', kind: 'COLOR NEGATIVE', group: 'color', filter: 'saturate(1.02) contrast(.98) brightness(1.03) hue-rotate(-4deg)' },
    pro400h: { name: 'PRO 400H', brand: 'FUJIFILM', iso: '400', color: '#2b9a83', color2: '#f2e8ca', kind: 'COLOR NEGATIVE', group: 'color', filter: 'saturate(.84) contrast(.94) brightness(1.05) hue-rotate(-3deg)' },
    velvia50: { name: 'VELVIA 50', brand: 'FUJIFILM', iso: '50', color: '#158364', color2: '#ec3045', kind: 'COLOR REVERSAL', group: 'slide', filter: 'saturate(1.25) contrast(1.09) brightness(.98) hue-rotate(-2deg)' },
    velvia100: { name: 'VELVIA 100', brand: 'FUJIFILM', iso: '100', color: '#11825f', color2: '#e92840', kind: 'COLOR REVERSAL', group: 'slide', filter: 'saturate(1.3) contrast(1.12) brightness(.97) hue-rotate(-3deg)' },
    provia100f: { name: 'PROVIA 100F', brand: 'FUJIFILM', iso: '100', color: '#166f5b', color2: '#3269a0', kind: 'COLOR REVERSAL', group: 'slide', filter: 'saturate(1.08) contrast(1.08) brightness(.99)' },
    e100: { name: 'EKTACHROME E100', brand: 'KODAK', iso: '100', color: '#285b9d', color2: '#efc442', kind: 'COLOR REVERSAL', group: 'slide', filter: 'saturate(1.12) contrast(1.1) hue-rotate(2deg)' },
    cinestill50d: { name: '50D', brand: 'CINESTILL', iso: '50', color: '#db7e2b', color2: '#2b5f7d', kind: 'CINEMA FILM', group: 'cinema', filter: 'saturate(.96) contrast(1.05) brightness(1.02) sepia(.03)' },
    cinestill400d: { name: '400D', brand: 'CINESTILL', iso: '400', color: '#d85c31', color2: '#325f79', kind: 'CINEMA FILM', group: 'cinema', filter: 'saturate(.98) contrast(1.06) sepia(.04)' },
    cinestill800t: { name: '800T', brand: 'CINESTILL', iso: '800', color: '#243552', color2: '#c92d3b', kind: 'CINEMA FILM', group: 'cinema', filter: 'saturate(.94) contrast(1.1) hue-rotate(5deg)' },
    vision250d: { name: 'VISION3 250D', brand: 'KODAK', iso: '250', color: '#b88a32', color2: '#253a54', kind: 'CINEMA FILM', group: 'cinema', filter: 'saturate(.88) contrast(.94) brightness(1.03) sepia(.04)' },
    vision500t: { name: 'VISION3 500T', brand: 'KODAK', iso: '500', color: '#293c5b', color2: '#c7a354', kind: 'CINEMA FILM', group: 'cinema', filter: 'saturate(.86) contrast(1.02) hue-rotate(5deg)' },
    lomoPurple: { name: 'PURPLE', brand: 'LOMOGRAPHY', iso: '400', color: '#6b3d78', color2: '#e0be40', kind: 'CREATIVE COLOR', group: 'color', filter: 'saturate(1.22) contrast(1.08) hue-rotate(28deg)' },
    lomoMetropolis: { name: 'METROPOLIS', brand: 'LOMOGRAPHY', iso: '400', color: '#566255', color2: '#d6b55d', kind: 'CREATIVE COLOR', group: 'color', filter: 'saturate(.58) contrast(1.14) sepia(.08)' },
    trix400: { name: 'TRI-X 400', brand: 'KODAK', iso: '400', color: '#1a1916', color2: '#d5a828', kind: 'BLACK & WHITE', group: 'bw', filter: 'grayscale(1) contrast(1.18) brightness(.98)' },
    tmax100: { name: 'T-MAX 100', brand: 'KODAK', iso: '100', color: '#222', color2: '#d84b36', kind: 'BLACK & WHITE', group: 'bw', filter: 'grayscale(1) contrast(1.1) brightness(1.02)' },
    tmax400: { name: 'T-MAX 400', brand: 'KODAK', iso: '400', color: '#202020', color2: '#ce4534', kind: 'BLACK & WHITE', group: 'bw', filter: 'grayscale(1) contrast(1.15)' },
    hp5: { name: 'HP5 PLUS', brand: 'ILFORD', iso: '400', color: '#202020', color2: '#e8e7df', kind: 'BLACK & WHITE', group: 'bw', filter: 'grayscale(1) contrast(1.1) brightness(1.01)' },
    fp4: { name: 'FP4 PLUS', brand: 'ILFORD', iso: '125', color: '#242424', color2: '#dfdfda', kind: 'BLACK & WHITE', group: 'bw', filter: 'grayscale(1) contrast(1.06) brightness(1.02)' },
    delta100: { name: 'DELTA 100', brand: 'ILFORD', iso: '100', color: '#232323', color2: '#b9a26a', kind: 'BLACK & WHITE', group: 'bw', filter: 'grayscale(1) contrast(1.12) brightness(1.01)' },
    delta400: { name: 'DELTA 400', brand: 'ILFORD', iso: '400', color: '#202020', color2: '#ad9662', kind: 'BLACK & WHITE', group: 'bw', filter: 'grayscale(1) contrast(1.17)' },
    acros100: { name: 'ACROS II', brand: 'FUJIFILM', iso: '100', color: '#1d1d1d', color2: '#e9e8df', kind: 'BLACK & WHITE', group: 'bw', filter: 'grayscale(1) contrast(1.13) brightness(1.02)' },
  };
  const STATUS = { shooting: '拍摄中', exposed: '已拍完', developing: '显影中', developed: '已显影', scanned: '已扫描', archived: '已归档' };
  const DEFAULT_EDIT = { exposure: 0, contrast: 0, saturation: 0, temperature: 0, fade: 0, grain: 24, halation: 12, vignette: 10 };
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

  let rolls = [];
  let settings = {};
  let libraryRevision = 0;
  let saveConflict = false;
  let activeRollId = null;
  let activeFrame = 0;
  let currentView = 'film';
  let inspectorView = 'look';
  let rollFilter = 'all';
  let frameFilter = 'all';
  let activeCollectionId = null;
  let multiSelect = false;
  const photoCriteria = { query: '', rating: 'all', color: 'all', type: 'all', review: 'all', orientation: 'all', tag: '', from: '', to: '' };
  let galleryEntries = [];
  let galleryVersion = 0;
  let newRollStyleKind = 'all';
  let selection = new Set();
  let selectionAnchor = null;
  let saveTimer;
  let saveQueue = Promise.resolve();
  let deletingRoll = false;
  let importing = false;
  const facetKeys = ['brand', 'stock', 'format', 'status', 'year', 'camera', 'lens', 'location', 'project', 'rating', 'color'];
  const facets = Object.fromEntries(facetKeys.map(key => [key, 'all']));
  const facetLabels = { brand: '厂牌', stock: '胶片', format: '画幅', status: '状态', year: '年份', camera: '相机', lens: '镜头', location: '地点', project: '项目', rating: '照片', color: '色标' };
  let renderVersion = 0;
  let galleryIndex = 0;
  let pendingImport = false;
  let pendingFiles = null;
  const zoomState = { develop: { scale: 1, x: 0, y: 0, mode: 'fit' }, gallery: { scale: 1, x: 0, y: 0, mode: 'fit' } };

  function migrateRolls(items) {
    return items.map(roll => ({
      format: '135', status: 'shooting', camera: '', lens: '', location: '', date: '', process: '', notes: '', project: '',
      ...roll,
      frames: (roll.frames || []).map(frame => ({ rating: 0, flagged: false, color: '', tags: [], exif: {}, edit: { ...DEFAULT_EDIT }, ...frame, edit: { ...DEFAULT_EDIT, ...(frame.edit || {}) } })),
    }));
  }
  async function loadState() {
    const response = await fetch('/api/state');
    if (!response.ok) throw new Error('无法读取本地资料库');
    const state = await response.json();
    libraryRevision = state.revision || 0;
    rolls = migrateRolls(state.rolls || []); settings = state.settings || {}; activeRollId = rolls[0]?.id || null;
  }
  function persistState() {
    clearTimeout(saveTimer);
    const payload = JSON.parse(JSON.stringify({ rolls, settings }));
    const operation = saveQueue.catch(() => {}).then(async () => {
      if (saveConflict) throw new Error('资料库已被其他窗口修改，请刷新后重试');
      const response = await fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, revision: libraryRevision }) });
      if (response.status === 409) { saveConflict = true; toast('资料库已被其他窗口修改，请刷新页面后重试', 'warning'); throw new Error('保存冲突'); }
      if (!response.ok) throw new Error('资料库写入失败');
      const result = await response.json();
      libraryRevision = result.revision || 0;
      if (result.cleanupPending) toast(`${result.cleanupPending} 个媒体文件未能清理，请检查 data/media 的文件权限`, 'warning');
      return result;
    });
    saveQueue = operation;
    return operation;
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persistState().catch(() => toast('资料库写入失败，请确认本地服务正在运行', 'warning')), 80);
  }
  function activeRoll() { return rolls.find(roll => roll.id === activeRollId) || rolls[0] || null; }
  function activeItem() { return activeRoll()?.frames[activeFrame] || null; }

  async function dbPut(id, blob) { const response = await fetch(`/api/media/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob }); if (!response.ok) throw new Error('媒体写入失败'); }
  async function dbGet(id) { const response = await fetch(`/api/media/${encodeURIComponent(id)}`); return response.ok ? response.blob() : null; }
  async function dbDelete(id) { await fetch(`/api/media/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  function thumbnailUrl(frame) { return `/api/${frame.type === 'video' ? 'media' : 'thumbnail'}/${encodeURIComponent(frame.id)}`; }
  function fallbackThumbnails(container) { container.querySelectorAll('img[data-original-id]').forEach(image => { image.onerror = () => { image.onerror = null; image.src = `/api/media/${encodeURIComponent(image.dataset.originalId)}`; }; }); }
  async function mediaUrl(frame) { return `/api/media/${encodeURIComponent(frame.id)}`; }
  function revokeUrl() {}
  function decodeImageBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob); const image = new Image();
      image.onload = () => resolve({ image, width: image.naturalWidth, height: image.naturalHeight, dispose: () => URL.revokeObjectURL(url) });
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解码失败')); };
      image.src = url;
    });
  }

  async function extractExif(file) {
    const result = { fileType: file.type || '未知', fileSize: file.size };
    if (!file.type.startsWith('image/')) return result;
    try {
      const decoded = await decodeImageBlob(file); result.width = decoded.width; result.height = decoded.height; decoded.dispose();
    } catch {}
    if (file.type !== 'image/jpeg') return result;
    try {
      const buffer = await file.arrayBuffer(); const view = new DataView(buffer); let tiff = -1;
      for (let offset = 2; offset + 10 < view.byteLength;) {
        if (view.getUint8(offset) !== 0xff) break;
        const marker = view.getUint8(offset + 1); const length = view.getUint16(offset + 2);
        if (marker === 0xe1 && String.fromCharCode(...new Uint8Array(buffer, offset + 4, 4)) === 'Exif') { tiff = offset + 10; break; }
        offset += 2 + length;
      }
      if (tiff < 0) return result;
      const little = view.getUint16(tiff) === 0x4949; const u16 = position => view.getUint16(position, little); const u32 = position => view.getUint32(position, little);
      const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
      const readValue = (entry, type, count) => {
        const bytes = (sizes[type] || 1) * count; const position = bytes <= 4 ? entry + 8 : tiff + u32(entry + 8);
        if (position < 0 || position + bytes > view.byteLength) return undefined;
        if (type === 2) return new TextDecoder().decode(new Uint8Array(buffer, position, count)).replace(/\0+$/, '').trim();
        const one = index => type === 3 ? u16(position + index * 2) : type === 4 ? u32(position + index * 4) : type === 5 ? u32(position + index * 8) / Math.max(1, u32(position + index * 8 + 4)) : type === 9 ? view.getInt32(position + index * 4, little) : type === 10 ? view.getInt32(position + index * 8, little) / Math.max(1, view.getInt32(position + index * 8 + 4, little)) : view.getUint8(position + index);
        const values = Array.from({ length: count }, (_, index) => one(index)); return count === 1 ? values[0] : values;
      };
      const tags = {};
      const readIfd = (offset, nested = false) => {
        const base = tiff + offset; if (base < 0 || base + 2 > view.byteLength) return;
        const count = Math.min(u16(base), 512);
        for (let index = 0; index < count; index++) {
          const entry = base + 2 + index * 12; if (entry + 12 > view.byteLength) break;
          const tag = u16(entry); const type = u16(entry + 2); const itemCount = u32(entry + 4); tags[tag] = readValue(entry, type, itemCount);
        }
        if (!nested && tags[0x8769]) readIfd(tags[0x8769], true);
      };
      readIfd(u32(tiff + 4));
      Object.assign(result, { make: tags[0x010f], model: tags[0x0110], lens: tags[0xa434], date: tags[0x9003] || tags[0x0132], iso: tags[0x8827], aperture: tags[0x829d], exposure: tags[0x829a], focalLength: tags[0x920a] });
    } catch {}
    return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined && value !== ''));
  }

  function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function frameFilterCss() { return 'none'; }
  function frameStyle() { return '--frame-filter:none;--grain:0;--vignette:0;--halo:0'; }
  function toast(message, type = 'success') {
    const node = document.createElement('div'); node.className = `toast ${type}`; node.textContent = message; $('#toast-stack').append(node);
    setTimeout(() => node.remove(), 2600);
  }
  function downloadBlob(blob, name) { const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1500); }
  function currentStock() { return STOCKS[activeRoll()?.stock] || STOCKS.portra400; }
  function is120(format = '') { return String(format).startsWith('120'); }
  function stockIcon(stock, format = '135') {
    const vars = `--stock:${stock.color};--stock2:${stock.color2}`;
    if (is120(format)) return `<span class="stock-icon icon-120" style="${vars}" aria-hidden="true"><i></i><em></em></span>`;
    return `<span class="stock-icon icon-135" style="${vars}" aria-hidden="true"><i></i><em></em></span>`;
  }
  function leaderMarkup(format) {
    if (is120(format)) return `<span class="film-leader-120" aria-hidden="true"><i></i><b>120</b><small>ROLL FILM</small></span>`;
    const topHoles = Array.from({ length: 10 }, (_, index) => `<rect x="${12 + index * 23}" y="7" width="10" height="19" rx="1"/>`).join('');
    const bottomHoles = Array.from({ length: 4 }, (_, index) => `<rect x="${170 + index * 23}" y="222" width="10" height="19" rx="1"/>`).join('');
    return `<svg class="film-leader" viewBox="0 0 250 248" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="leader-warm" x1="0" x2="1"><stop stop-color="#4b3021"/><stop offset=".72" stop-color="#221d18"/></linearGradient></defs><path d="M0 0H250V248H167C130 232 93 207 66 178C43 154 22 141 0 136Z" fill="url(#leader-warm)"/><g fill="#dfd3b6">${topHoles}${bottomHoles}</g><text x="65" y="114">135</text><text x="65" y="134" class="leader-note">FILM START</text></svg>`;
  }

  function createRoll({ name = '未命名胶卷', stock = 'portra400', format = '135', camera = '' } = {}) {
    const roll = { id: uid(), name, stock, format, camera, lens: '', location: '', date: '', process: '', notes: '', project: '', status: 'shooting', createdAt: Date.now(), frames: [] };
    rolls.unshift(roll); activeRollId = roll.id; activeFrame = 0; selection.clear(); save(); renderAll(); return roll;
  }
  async function addFiles(fileList) {
    if (deletingRoll) return toast('胶卷正在删除，请稍后再装入影像', 'warning');
    const files = [...fileList].filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));
    if (!files.length) return toast('未检测到可用的照片或视频', 'warning');
    if (!activeRoll()) {
      pendingImport = true; pendingFiles = files; $('#new-roll-submit').textContent = '创建并装入影像'; renderNewRollPicker(); $('#new-roll-dialog').showModal();
      return toast('请先选择画幅与胶片类型');
    }
    if (importing) return toast('正在装入影像，请等待当前批次完成', 'warning');
    const roll = activeRoll();
    importing = true;
    let added = 0;
    try {
      for (const file of files) {
        const frame = { id: uid(), name: file.name, type: file.type.startsWith('video/') ? 'video' : 'image', developed: true, createdAt: Date.now(), rating: 0, flagged: false, color: '', tags: [], exif: await extractExif(file), edit: { ...DEFAULT_EDIT } };
        await dbPut(frame.id, file); roll.frames.push(frame); added++;
      }
      toast(`已装入 ${added} 格影像`);
    } catch { toast(`已装入 ${added} 格，剩余影像装入失败，请检查本地服务`, 'warning'); }
    finally {
      importing = false;
      activeFrame = Math.max(0, roll.frames.length - added);
      try { await persistState(); } catch { toast('影像目录保存失败，请保持页面打开并检查本地服务', 'warning'); }
      await renderAll();
    }
  }

  function requestImport() {
    if (activeRoll()) return $('#file-input').click();
    pendingImport = true; pendingFiles = null; $('#new-roll-submit').textContent = '创建并选择影像'; renderNewRollPicker(); $('#new-roll-dialog').showModal();
  }

  async function renderAll() {
    const version = ++renderVersion;
    renderRollList(); renderCollections(); renderContext(); renderInspector(); renderSelectionState();
    if (currentView === 'film') await renderFilm(version);
    if (currentView === 'contact') await renderContact(version);
    if (currentView === 'develop') await renderDevelop(version);
  }
  function libraryRollIcon(roll, stock) {
    const medium = is120(roll.format);
    const format = medium ? roll.format.replace(/^120\s*·\s*/, '') : '135';
    const label = escapeHtml(stock.name.replace(/\s+/g, ' '));
    return `<span class="library-film-icon ${medium ? 'library-film-120' : 'library-film-135'}" style="--stock:${stock.color};--stock2:${stock.color2}" aria-hidden="true"><i class="library-film-core"></i><span class="library-film-label"><small>${escapeHtml(stock.brand)}</small><b>${label}</b></span><em>${escapeHtml(format)}</em></span>`;
  }
  function rollValue(roll, key) {
    if (key === 'brand') return STOCKS[roll.stock]?.brand || '';
    if (key === 'year') return /^\d{4}/.exec(roll.date || '')?.[0] || '';
    return roll[key] || '';
  }
  function matchesRoll(roll, query, filter, criteria) {
    const stock = STOCKS[roll.stock] || {};
    const haystack = [roll.name, roll.camera, roll.lens, roll.location, roll.format, roll.date, roll.process, roll.notes, roll.project, stock.brand, stock.name, stock.iso, STATUS[roll.status], ...roll.frames.flatMap(frame => [frame.name, ...(frame.tags || [])])].join(' ').toLocaleLowerCase();
    if (!query.toLocaleLowerCase().split(/\s+/).filter(Boolean).every(term => haystack.includes(term))) return false;
    if (filter === 'with-media' && !roll.frames.length || filter === 'empty' && roll.frames.length) return false;
    return Object.entries(criteria).every(([key, value]) => {
      if (value === 'all') return true;
      if (key === 'rating') return value === 'favorites' ? roll.frames.some(frame => frame.rating >= 4) : value === 'rated' ? roll.frames.some(frame => frame.rating > 0) : roll.frames.length > 0 && roll.frames.every(frame => !frame.rating);
      if (key === 'color') return roll.frames.some(frame => frame.color === value);
      return rollValue(roll, key) === value;
    });
  }
  function renderFacets() {
    for (const key of facetKeys.filter(key => !['rating', 'color'].includes(key))) {
      const values = [...new Set(rolls.map(roll => rollValue(roll, key)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
      if (facets[key] !== 'all' && !values.includes(facets[key])) values.push(facets[key]);
      $('#facet-' + key).innerHTML = `<option value="all">全部${facetLabels[key]}</option>` + values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(key === 'stock' ? (STOCKS[value]?.name || value) : key === 'status' ? (STATUS[value] || value) : value)}</option>`).join('');
      $('#facet-' + key).value = facets[key];
    }
    const active = facetKeys.filter(key => facets[key] !== 'all');
    $('#roll-facet-count').textContent = active.length;
    $('#roll-facet-count').hidden = !active.length;
    $('#active-roll-facets').hidden = !active.length;
    $('#active-roll-facets').innerHTML = active.map(key => `<button data-remove-facet="${key}" title="移除${facetLabels[key]}筛选">${facetLabels[key]}：${escapeHtml($('#facet-' + key).selectedOptions[0]?.textContent || facets[key])} ×</button>`).join('');
    $('#smart-album-list').innerHTML = (settings.smartAlbums || []).map(album => `<span><button data-album="${escapeHtml(album.id)}">${escapeHtml(album.name)}</button><button data-delete-album="${escapeHtml(album.id)}" aria-label="删除智能相册 ${escapeHtml(album.name)}">×</button></span>`).join('');
  }
  function renderRollList() {
    renderFacets();
    const query = $('#roll-search').value.trim();
    const items = rolls.filter(roll => matchesRoll(roll, query, rollFilter, facets));
    $('#roll-result-count').textContent = `${items.length} / ${rolls.length} 卷`;
    $('#roll-list').innerHTML = items.map(roll => {
      const stock = STOCKS[roll.stock] || STOCKS.portra400;
      return `<button class="roll-card ${roll.id === activeRollId ? 'active' : ''}" data-roll="${roll.id}">${libraryRollIcon(roll, stock)}<span class="roll-card-copy"><strong>${escapeHtml(roll.name)}</strong><small>${escapeHtml(stock.brand)} · ${escapeHtml(stock.name)}</small><span class="roll-card-tags"><i>${escapeHtml(roll.format)}</i><i>${roll.frames.length} 格</i><i>${escapeHtml(STATUS[roll.status] || roll.status)}</i></span></span><em>${new Date(roll.createdAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</em></button>`;
    }).join('') || '<div class="empty-list">没有匹配的胶卷</div>';
    $('#storage-count').textContent = rolls.length;
    $('#storage-bar').style.width = `${Math.min(100, 8 + rolls.reduce((sum, roll) => sum + roll.frames.length, 0) * 1.5)}%`;
  }
  function renderContext() {
    const roll = activeRoll(); const stock = currentStock();
    $('#context-title').textContent = (currentView === 'contact' && currentCollection()?.name) || roll?.name || '未命名胶卷';
    $('#context-kicker').textContent = roll ? `${roll.format} · ${stock.kind}` : '135 · COLOR NEGATIVE';
    $('#context-status').style.background = roll?.status === 'archived' ? '#888' : roll?.status === 'developed' ? '#c88945' : '#6caa74';
  }
  async function renderFilm(version) {
    const roll = activeRoll(); const empty = !roll?.frames.length;
    $('#empty-state').hidden = !empty; $('#film-rail').hidden = empty;
    $('#total-count').textContent = String(roll?.frames.length || 0).padStart(2, '0');
    if (empty) { $('#current-index').textContent = '00'; return; }
    activeFrame = Math.max(0, Math.min(activeFrame, roll.frames.length - 1));
    $('#current-index').textContent = String(activeFrame + 1).padStart(2, '0');
    const cards = await Promise.all(roll.frames.map(async (frame, index) => {
      const src = thumbnailUrl(frame); const media = frame.type === 'video' ? `<video src="${src}" muted preload="metadata"></video>` : `<img src="${src}" loading="lazy" decoding="async" data-original-id="${escapeHtml(frame.id)}" alt="${escapeHtml(frame.name)}">`;
      const badges = `${frame.rating ? `<b title="${frame.rating} 星">★${frame.rating}</b>` : ''}`;
      return `<button class="film-frame ${index === activeFrame ? 'active' : ''} ${frame.developed ? '' : 'undeveloped'}" data-frame="${index}" style="${frameStyle(frame, roll.stock)}">${media}<span class="frame-badges">${badges}</span><span class="frame-no">${String(index + 1).padStart(2, '0')}A</span></button>`;
    }));
    if (version !== renderVersion) return;
    $('#film-rail').classList.toggle('format-120', is120(roll.format));
    $('#film-strip').innerHTML = `${leaderMarkup(roll.format)}${cards.join('')}`; updateCanister(); fallbackThumbnails($('#film-strip'));
    requestAnimationFrame(() => $('#film-strip .active')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }));
  }
  async function renderContact(version) {
    const source = sourceEntries(); const visible = visibleEntries(); refreshPhotoTags();
    const count = Object.entries(photoCriteria).filter(([, value]) => value && value !== 'all').length;
    $('#btn-photo-filters').textContent = count ? `照片筛选 ${count}` : '照片筛选';
    $('#btn-select-visible').disabled = !visible.length;
    $('#photo-result-count').textContent = `${visible.length} / ${source.length} 格`;
    $('#btn-exit-collection').hidden = !currentCollection();
    const cards = await Promise.all(visible.map(async ({ roll, frame, index }) => {
      const src = thumbnailUrl(frame); const media = frame.type === 'video' ? `<video src="${src}" muted preload="metadata"></video>` : `<img src="${src}" loading="lazy" decoding="async" data-original-id="${escapeHtml(frame.id)}" alt="${escapeHtml(frame.name)}">`;
      return `<button class="contact-card ${selection.has(entryKey({ roll, frame })) ? 'selected' : ''} ${frame.developed ? '' : 'undeveloped'}" data-contact-key="${escapeHtml(entryKey({ roll, frame }))}" style="${frameStyle(frame, roll.stock)}"><span class="contact-thumb">${media}</span>${frame.color ? `<span class="frame-color" data-color="${escapeHtml(frame.color)}"></span>` : ''}${frame.rejected ? '<span class="reject-badge">淘汰</span>' : ''}${frame.analysis ? `<span class="contact-score">${frame.analysis.score}</span>` : ''}<span class="contact-meta"><span title="${escapeHtml(roll.name)}">${currentCollection() ? escapeHtml(roll.name) + ' · ' : ''}${String(index + 1).padStart(2, '0')}A</span><b>${frame.rating ? '★'.repeat(frame.rating) : 'UNRATED'}</b></span></button>`;
    }));
    if (version !== renderVersion) return; $('#contact-grid').innerHTML = cards.join('') || '<div class="empty-grid">没有符合当前条件的照片</div>'; fallbackThumbnails($('#contact-grid')); layoutContactGrid();
  }
  let contactLayoutFrame = 0;
  function layoutContactGrid() {
    cancelAnimationFrame(contactLayoutFrame);
    contactLayoutFrame = requestAnimationFrame(() => {
      const grid = $('#contact-grid');
      const styles = getComputedStyle(grid); const rowHeight = parseFloat(styles.gridAutoRows) || 8; const gap = parseFloat(styles.rowGap) || 12;
      const cards = [...grid.querySelectorAll('.contact-card')];
      cards.forEach(card => { card.style.gridRowEnd = 'auto'; });
      cards.forEach(card => { const span = Math.ceil((card.getBoundingClientRect().height + gap) / (rowHeight + gap)); card.style.gridRowEnd = `span ${Math.max(1, span)}`; });
    });
  }
  async function renderDevelop(version) {
    const roll = activeRoll(); const frame = activeItem(); const placeholder = $('#develop-placeholder'); const media = $('#develop-media');
    if (!roll || !frame) { placeholder.hidden = false; media.hidden = true; $('#develop-name').textContent = '—'; renderRating(); return; }
    const src = await mediaUrl(frame); if (version !== renderVersion) return;
    placeholder.hidden = true; media.hidden = false; media.className = `develop-media ${frame.developed ? '' : 'undeveloped'}`; media.style.cssText = frameStyle(frame, roll.stock);
    media.innerHTML = frame.type === 'video' ? `<video src="${src}" controls playsinline></video>` : `<img src="${src}" alt="${escapeHtml(frame.name)}">`;
    $('#develop-name').textContent = `${String(activeFrame + 1).padStart(2, '0')}A · ${frame.name}`; renderRating(); applyZoom('develop');
  }
  async function openGallery(index) {
    const roll = activeRoll(); if (!roll?.frames[index]) return;
    await openGalleryEntry(roll.frames.map((frame, position) => ({ roll, frame, index: position })), index);
  }
  async function openGalleryEntry(entries, position) {
    galleryEntries = entries; galleryIndex = position; focusEntry(entries[position]);
    resetZoom('gallery'); $('#gallery').hidden = false; document.body.style.overflow = 'hidden'; await renderGallery();
  }
  async function renderGallery() {
    const version = ++galleryVersion; const entry = galleryEntries[galleryIndex]; if (!entry) return;
    const { roll, frame } = entry; focusEntry(entry);
    const src = await mediaUrl(frame); if (version !== galleryVersion) return;
    const media = $('#gallery-media'); media.className = 'gallery-media'; media.style.cssText = frameStyle(frame, roll.stock);
    media.innerHTML = frame.type === 'video' ? `<video src="${src}" controls playsinline></video>` : `<img src="${src}" alt="${escapeHtml(frame.name)}">`;
    const target = media.querySelector('img,video'); target.addEventListener(frame.type === 'video' ? 'loadedmetadata' : 'load', () => applyZoom('gallery'));
    $('#gallery-roll').textContent = `${roll.name} · ${frame.name}`; $('#gallery-counter').textContent = `${String(galleryIndex + 1).padStart(2, '0')} / ${String(galleryEntries.length).padStart(2, '0')}`;
    $('#gallery-thumbs').innerHTML = galleryEntries.map(({ frame: item, roll: itemRoll }, index) => `<button class="gallery-thumb ${index === galleryIndex ? 'active' : ''}" data-gallery-frame="${index}" title="${escapeHtml(itemRoll.name)} · ${escapeHtml(item.name)}">${item.type === 'video' ? `<video src="/api/media/${encodeURIComponent(item.id)}" muted></video>` : `<img src="${thumbnailUrl(item)}" loading="lazy" decoding="async" data-original-id="${escapeHtml(item.id)}" alt="${escapeHtml(item.name)}">`}<span>${String(index + 1).padStart(2, '0')}</span></button>`).join('');
    fallbackThumbnails($('#gallery-thumbs')); renderRating(); applyZoom('gallery'); renderReviewDetails('gallery', entry);
    requestAnimationFrame(() => $('#gallery-thumbs .active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }));
  }
  function closeGallery() { galleryVersion++; detailVersions.gallery++; $('#gallery').hidden = true; $('#gallery-media').innerHTML = ''; document.body.style.overflow = ''; renderAll(); }
  function stepGallery(delta) { if (!galleryEntries.length) return; galleryIndex = (galleryIndex + delta + galleryEntries.length) % galleryEntries.length; focusEntry(galleryEntries[galleryIndex]); resetZoom('gallery'); renderGallery(); }
  function renderRating() {
    const rating = activeItem()?.rating || 0;
    const markup = [1, 2, 3, 4, 5].map(value => `<button data-rating="${value}" class="${value <= rating ? 'active' : ''}" aria-label="${value} 星">★</button>`).join('');
    ['#develop-rating', '#frame-rating', '#gallery-rating', '#compare-rating'].forEach(selector => { const node = $(selector); if (node) node.innerHTML = markup; });
  }
  function updateCanister() {
    const stock = currentStock(); const canister = $('#canister'); const medium = is120(activeRoll()?.format);
    canister.hidden = medium; $('#roll120').hidden = !medium; $('#film-hardware').classList.toggle('medium-format', medium);
    canister.style.setProperty('--stock', stock.color); canister.style.setProperty('--stock2', stock.color2);
    $('#cassette-brand').textContent = stock.brand; $('#cassette-name').textContent = stock.name.replace(/\s?\d+T?$/, ''); $('#cassette-iso').textContent = stock.iso;
    const roll120 = $('#roll120'); roll120.style.setProperty('--stock', stock.color); roll120.style.setProperty('--stock2', stock.color2);
    $('#roll120-brand').textContent = stock.brand; $('#roll120-name').textContent = stock.name.replace(/\s?\d+T?$/, ''); $('#roll120-iso').textContent = stock.iso;
  }
  function renderInspector() {
    const roll = activeRoll(); const frame = activeItem();
    renderRating();
    const exif = frame?.exif || {};
    const rows = [
      ['相机', [exif.make, exif.model].filter(Boolean).join(' ')], ['镜头', exif.lens], ['拍摄时间', exif.date?.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')],
      ['尺寸', exif.width && exif.height ? `${exif.width} × ${exif.height}` : ''], ['焦距', exif.focalLength ? `${Number(exif.focalLength).toFixed(1).replace('.0', '')} mm` : ''],
      ['光圈', exif.aperture ? `f/${Number(exif.aperture).toFixed(1).replace('.0', '')}` : ''], ['快门', exif.exposure ? (exif.exposure < 1 ? `1/${Math.round(1 / exif.exposure)} s` : `${exif.exposure} s`) : ''], ['ISO', exif.iso],
    ].filter(([, value]) => value);
    $('#frame-file-info').textContent = frame ? `${frame.name} · ${exif.fileSize ? formatBytes(exif.fileSize) : frame.type}` : '尚未选择照片';
    $('#exif-grid').innerHTML = rows.length ? rows.map(([label, value]) => `<div><span>${label}</span><b>${escapeHtml(value)}</b></div>`).join('') : '<p class="empty-exif">这张照片没有可读取的 EXIF 信息</p>';
    $('#frame-tags').value = (frame?.tags || []).join(', '); $('#frame-tags').disabled = !frame;
    $('#frame-color').value = frame?.color || '';
    $('#frame-color').disabled = !frame;
    $('#btn-reject-frame').disabled = !frame;
    $('#btn-reject-frame').textContent = frame?.rejected ? '取消淘汰 · X' : '标记淘汰 · X';
    $('#btn-reject-frame').setAttribute('aria-pressed', String(Boolean(frame?.rejected)));
    for (const [id, key] of [['meta-name', 'name'], ['meta-format', 'format'], ['meta-status', 'status'], ['meta-camera', 'camera'], ['meta-lens', 'lens'], ['meta-location', 'location'], ['meta-date', 'date'], ['meta-process', 'process'], ['meta-notes', 'notes'], ['meta-project', 'project']]) $('#'+id).value = roll?.[key] || '';
  }
  function formatBytes(value) { if (!Number.isFinite(value)) return ''; const units = ['B', 'KB', 'MB', 'GB']; let size = value; let unit = 0; while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit++; } return `${size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`; }
  function renderNewRollPicker() {
    const format = $('#new-roll-format').value;
    const selected = $('#new-roll-stock').value || 'portra400';
    const terms = $('#new-roll-stock-search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = Object.entries(STOCKS).filter(([, stock]) => (newRollStyleKind === 'all' || stock.group === newRollStyleKind) && terms.every(term => `${stock.name} ${stock.brand} ${stock.iso}`.toLowerCase().includes(term)));
    $('#new-stock-count').textContent = `${matches.length} 款 · 已选 ${STOCKS[selected]?.name || ''}`;
    $('#new-roll-stock-grid').innerHTML = matches.map(([id, stock]) => `<button type="button" class="new-stock-card ${selected === id ? 'active' : ''}" data-new-stock="${id}">${stockIcon(stock, format)}<span><b>${stock.name}</b><small>${stock.brand} · ISO ${stock.iso}</small></span></button>`).join('') || '<p class="empty-list">没有匹配的胶片，试试其他型号、厂牌或 ISO。</p>';
  }
  function renderSelectionState() {
    const selected = selectedEntries();
    $('#selection-summary').hidden = !selected.length; $('#selection-count').textContent = selected.length;
    $('#btn-compare').disabled = ![2, 4].includes(selected.length) || selected.some(({ frame }) => frame.type !== 'image');
    $('#btn-remove-members').hidden = !currentCollection();
  }
  function switchView(view) {
    currentView = view; $$('.view').forEach(node => node.classList.toggle('active', node.id === `${view}-view`)); $$('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view)); $$('[data-mobile-view]').forEach(button => button.classList.toggle('active', button.dataset.mobileView === view)); renderAll();
  }
  function switchInspector(view) { inspectorView = view; $$('.inspector-section').forEach(node => node.classList.toggle('active', node.id === `inspector-${view}`)); $$('[data-inspector]').forEach(button => button.classList.toggle('active', button.dataset.inspector === view)); }
  function currentCollection() { return (settings.collections || []).find(item => item.id === activeCollectionId) || null; }
  function sourceEntries() {
    const collection = currentCollection();
    return collection ? resolveRefs(rolls, collection.refs) : (activeRoll()?.frames || []).map((frame, index) => ({ roll: activeRoll(), frame, index }));
  }
  function visibleEntries() { return sourceEntries().filter(entry => matchesFrame(entry, photoCriteria, frameFilter)); }
  function selectedEntries() { return resolveRefs(rolls, [...selection]); }
  function focusEntry(entry) { activeRollId = entry.roll.id; activeFrame = entry.index; }
  function renderCollections() {
    $('#collection-list').innerHTML = (settings.collections || []).map(collection => `<div class="collection-row ${collection.id === activeCollectionId ? 'active' : ''}"><button data-collection="${escapeHtml(collection.id)}"><span>${escapeHtml(collection.name)}</span><small>${resolveRefs(rolls, collection.refs).length}</small></button><button data-edit-collection="${escapeHtml(collection.id)}" aria-label="编辑收藏夹 ${escapeHtml(collection.name)}">···</button></div>`).join('') || '<small class="collection-empty">选择照片，收进你的收藏夹</small>';
    $('#selection-collection').innerHTML = '<option value="">加入收藏夹…</option>' + (settings.collections || []).map(collection => `<option value="${escapeHtml(collection.id)}">${escapeHtml(collection.name)}</option>`).join('') + '<option value="__new">＋ 新建收藏夹并加入</option>';
  }
  function refreshPhotoTags() {
    const tags = [...new Set(sourceEntries().flatMap(({ frame }) => frame.tags || []))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    if (photoCriteria.tag && !tags.includes(photoCriteria.tag)) tags.push(photoCriteria.tag);
    $('#photo-tag').innerHTML = '<option value="">全部标签</option>' + tags.map(tag => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join('');
    $('#photo-tag').value = photoCriteria.tag;
  }
  function resetPhotoCriteria() {
    Object.keys(photoCriteria).forEach(key => { photoCriteria[key] = ['query', 'tag', 'from', 'to'].includes(key) ? '' : 'all'; $('#photo-' + key).value = photoCriteria[key]; });
    multiSelect = false; $('#btn-multi-select').setAttribute('aria-pressed', 'false');
    frameFilter = 'all'; $$('[data-frame-filter]').forEach(button => button.classList.toggle('active', button.dataset.frameFilter === 'all'));
    selection.clear(); selectionAnchor = null;
  }
  function selectContact(key, event = {}) {
    const entries = visibleEntries(); const position = entries.findIndex(entry => entryKey(entry) === key); if (position < 0) return;
    const anchor = entries.findIndex(entry => entryKey(entry) === selectionAnchor);
    if (event.shiftKey && anchor >= 0) { for (let i = Math.min(anchor, position); i <= Math.max(anchor, position); i++) selection.add(entryKey(entries[i])); }
    else if (multiSelect || event.metaKey || event.ctrlKey) { selection.has(key) ? selection.delete(key) : selection.add(key); selectionAnchor = key; }
    else { selection.clear(); selection.add(key); selectionAnchor = key; }
    focusEntry(entries[position]); renderAll();
  }
  let collectionEditId = null;
  let collectionPendingRefs = [];
  function openCollectionEditor(id = null, refs = []) {
    const collection = (settings.collections || []).find(item => item.id === id);
    collectionEditId = collection?.id || null; collectionPendingRefs = refs;
    $('#collection-dialog-title').textContent = collection ? '编辑收藏夹' : '新建收藏夹';
    $('#collection-name').value = collection?.name || '';
    $('#btn-delete-collection').hidden = !collection;
    $('#collection-dialog').showModal();
  }
  function bindCollections() {
    $('#btn-multi-select').onclick = () => { multiSelect = !multiSelect; $('#btn-multi-select').setAttribute('aria-pressed', String(multiSelect)); };
    $('#btn-select-visible').onclick = () => { selection = new Set(visibleEntries().map(entryKey)); selectionAnchor = null; renderAll(); };
    $('#btn-new-collection').onclick = () => openCollectionEditor();
    $('#collection-form').onsubmit = event => {
      if (event.submitter?.value === 'cancel') return;
      const name = $('#collection-name').value.trim(); if (!name) { event.preventDefault(); return; }
      const collection = (settings.collections || []).find(item => item.id === collectionEditId);
      if (collection) collection.name = name;
      else (settings.collections ||= []).push({ id: uid(), name, refs: mergeRefs([], collectionPendingRefs), createdAt: Date.now() });
      save(); renderAll(); toast(collection ? '收藏夹名称已更新' : '收藏夹已创建');
    };
    $('#btn-delete-collection').onclick = () => {
      settings.collections = (settings.collections || []).filter(item => item.id !== collectionEditId);
      if (activeCollectionId === collectionEditId) activeCollectionId = null;
      selection.clear(); selectionAnchor = null; $('#collection-dialog').close(); save(); renderAll(); toast('收藏夹已移除，原始影像保留');
    };
    $('#collection-list').onclick = event => {
      const edit = event.target.closest('[data-edit-collection]'); if (edit) return openCollectionEditor(edit.dataset.editCollection);
      const button = event.target.closest('[data-collection]'); if (!button) return;
      activeCollectionId = button.dataset.collection; resetPhotoCriteria(); const first = sourceEntries()[0]; if (first) focusEntry(first);
      $('.library-panel').classList.remove('mobile-show'); switchView('contact');
    };
    $('#selection-collection').onchange = event => {
      const id = event.target.value; event.target.value = ''; const refs = selectedEntries().map(entryKey); if (!refs.length) return;
      if (id === '__new') return openCollectionEditor(null, refs);
      const collection = (settings.collections || []).find(item => item.id === id); if (!collection) return;
      collection.refs = mergeRefs(collection.refs || [], refs); save(); renderAll(); toast(`已加入“${collection.name}”`);
    };
    $('#btn-remove-members').onclick = () => { const collection = currentCollection(); if (!collection) return; collection.refs = (collection.refs || []).filter(key => !selection.has(key)); selection.clear(); selectionAnchor = null; save(); renderAll(); };
    $('#btn-exit-collection').onclick = () => { activeCollectionId = null; resetPhotoCriteria(); renderAll(); };
    $('#btn-photo-filters').onclick = () => { const filters = $('#photo-filters'); filters.hidden = !filters.hidden; $('#btn-photo-filters').setAttribute('aria-expanded', String(!filters.hidden)); layoutContactGrid(); };
    Object.keys(photoCriteria).forEach(key => { const control = $('#photo-' + key); control[key === 'query' ? 'oninput' : 'onchange'] = event => { photoCriteria[key] = event.target.value; selection.clear(); selectionAnchor = null; renderAll(); }; });
    $('#btn-clear-photo-filters').onclick = () => { resetPhotoCriteria(); renderAll(); };
    $('#frame-tags').onchange = event => { const frame = activeItem(); if (!frame) return; frame.tags = [...new Set(event.target.value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean))].slice(0, 40); save(); renderAll(); };
  }
  function stepFrame(delta) { const frames = activeRoll()?.frames || []; if (!frames.length) return; activeFrame = (activeFrame + delta + frames.length) % frames.length; resetZoom('develop'); renderAll(); }
  function applyZoom(scope) {
    const state = zoomState[scope]; const media = $(`#${scope === 'develop' ? 'develop' : 'gallery'}-media`); const target = media?.querySelector('img,video'); if (!target) return;
    const naturalWidth = target.naturalWidth || target.videoWidth; const baseWidth = parseFloat(getComputedStyle(target).width) || target.clientWidth;
    if (naturalWidth && baseWidth && state.mode !== 'fit') state.scale = (state.mode === 'actual' ? 1 : state.pixelRatio) * naturalWidth / baseWidth;
    target.style.transform = `translate3d(${state.x}px,${state.y}px,0) scale(${state.scale})`; target.style.transformOrigin = '50% 50%'; media.classList.toggle('zoomed', state.scale > 1.01); media.closest('.develop-canvas,.gallery-stage')?.classList.toggle('can-pan', state.scale > 1.01); const output = $(`#${scope}-zoom output`); if (output) { const width = target.naturalWidth || target.videoWidth; output.textContent = width ? `${Math.round(state.scale * baseWidth / width * 100)}%` : '—'; }
  }
  function resetZoom(scope) { zoomState[scope] = { scale: 1, x: 0, y: 0, mode: 'fit' }; applyZoom(scope); }
  function changeZoom(scope, direction, clientX, clientY) {
    const state = zoomState[scope]; const old = state.scale; const target = $(`#${scope}-media img, #${scope}-media video`); const natural = target?.naturalWidth || target?.videoWidth || 0; const baseWidth = target ? parseFloat(getComputedStyle(target).width) || target.clientWidth : 0; const actual = natural && baseWidth ? natural / baseWidth : 1; state.scale = direction === 'fit' ? 1 : direction === 'actual' ? actual : Math.max(.1, Math.min(Math.max(32, actual * 4), state.scale * (direction === 'in' ? 1.18 : 1 / 1.18)));
    state.mode = direction === 'fit' ? 'fit' : direction === 'actual' ? 'actual' : 'manual'; state.pixelRatio = natural && baseWidth ? state.scale * baseWidth / natural : 1;
    if (state.scale <= 1) { state.x = 0; state.y = 0; }
    else {
      const ratio = state.scale / old; const stage = $(`#${scope === 'develop' ? 'develop-canvas' : 'gallery-stage'}`); const media = stage?.querySelector('.develop-media,.gallery-media');
      if (stage) {
        const rect = media?.getBoundingClientRect() || stage.getBoundingClientRect(); const pointerInside = Number.isFinite(clientX) && Number.isFinite(clientY) && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
        const anchorX = pointerInside ? clientX - rect.left - rect.width / 2 : 0; const anchorY = pointerInside ? clientY - rect.top - rect.height / 2 : 0;
        state.x = anchorX - (anchorX - state.x) * ratio; state.y = anchorY - (anchorY - state.y) * ratio;
      } else { state.x *= ratio; state.y *= ratio; }
    }
    applyZoom(scope);
  }
  function setupPanZoom(scope, stageSelector, toolbarSelector) {
    const stage = $(stageSelector); let pan = null;
    stage.addEventListener('wheel', event => { if (!event.target.closest('.develop-media,.gallery-media')) return; event.preventDefault(); changeZoom(scope, event.deltaY < 0 ? 'in' : 'out', event.clientX, event.clientY); }, { passive: false });
    stage.addEventListener('pointerdown', event => { if (event.button !== 0 || event.target.closest('button') || !event.target.closest('.develop-media,.gallery-media') || zoomState[scope].scale <= 1) return; pan = { x: event.clientX, y: event.clientY, ox: zoomState[scope].x, oy: zoomState[scope].y }; stage.setPointerCapture(event.pointerId); stage.classList.add('panning'); event.preventDefault(); });
    stage.addEventListener('pointermove', event => { if (!pan) return; zoomState[scope].x = pan.ox + event.clientX - pan.x; zoomState[scope].y = pan.oy + event.clientY - pan.y; applyZoom(scope); });
    stage.addEventListener('pointerup', () => { pan = null; stage.classList.remove('panning'); }); stage.addEventListener('pointercancel', () => { pan = null; stage.classList.remove('panning'); });
    stage.addEventListener('dblclick', event => { if (event.target.closest('img,video')) resetZoom(scope); });
    $(toolbarSelector).onclick = event => { const button = event.target.closest('[data-zoom]'); if (button) changeZoom(scope, button.dataset.zoom); };
  }
  function setRating(value) { const frame = activeItem(); if (!frame) return; frame.rating = frame.rating === value ? 0 : value; save(); renderAll(); refreshReviewMarks(); }

  let compareEntries = [];
  let compareStates = [];
  let compareFocus = 0;
  let compareSync = true;
  const reviewInfo = { exif: false, histogram: false };
  const detailVersions = { gallery: 0, compare: 0 };
  const histogramCache = new Map();
  const newCompareState = () => ({ ratio: null, cx: .5, cy: .5 });
  function comparisonOpen() { return $('#compare-dialog').open; }
  function reviewEntry() { return comparisonOpen() ? compareEntries[compareFocus] : !$('#gallery').hidden ? galleryEntries[galleryIndex] : null; }
  function refreshReviewMarks() {
    if (!comparisonOpen()) return;
    const entry = compareEntries[compareFocus]; if (!entry) return;
    $('#compare-focused-name').textContent = entry.frame.name;
    $('#compare-color').value = entry.frame.color || '';
    $('#compare-reject').setAttribute('aria-pressed', String(Boolean(entry.frame.rejected)));
    $('#compare-reject').textContent = entry.frame.rejected ? '取消淘汰 · X' : '标记淘汰 · X';
    compareEntries.forEach((item, index) => {
      const pane = $(`[data-compare-pane="${index}"]`); if (!pane) return;
      pane.classList.toggle('focused', index === compareFocus);
      pane.querySelector('.compare-label small').textContent = `${item.frame.rating ? '★'.repeat(item.frame.rating) : '未评分'}${item.frame.rejected ? ' · 淘汰' : ''}${item.frame.color ? ' · ' + ({red:'红',yellow:'黄',green:'绿',blue:'蓝',purple:'紫'}[item.frame.color] || '') + '色标' : ''}`;
    });
    renderRating();
  }
  function focusCompare(index) {
    const changed = index !== compareFocus;
    compareFocus = index; focusEntry(compareEntries[index]); refreshReviewMarks();
    if (changed) renderReviewDetails('compare', compareEntries[index]);
  }
  function applyCompareViews() {
    compareEntries.forEach((entry, index) => {
      const viewport = $(`[data-compare-pane="${index}"] .compare-viewport`); const image = viewport?.querySelector('img');
      if (!image?.naturalWidth) return;
      const state = compareStates[index];
      const geometry = viewGeometry(image.naturalWidth, image.naturalHeight, viewport.clientWidth, viewport.clientHeight, state);
      image.style.width = `${geometry.width}px`; image.style.height = `${geometry.height}px`;
      image.style.transform = `translate(calc(-50% + ${geometry.x}px),calc(-50% + ${geometry.y}px))`;
      viewport.classList.toggle('can-pan', geometry.width > viewport.clientWidth || geometry.height > viewport.clientHeight);
      viewport.parentElement.querySelector('output').textContent = `${Math.round(geometry.ratio * 100)}%`;
    });
  }
  function setCompareState(state) {
    if (compareSync) compareStates = compareEntries.map(() => ({ ...state }));
    else compareStates[compareFocus] = { ...state };
    applyCompareViews();
  }
  function zoomCompare(direction, clientX, clientY) {
    const viewport = $(`[data-compare-pane="${compareFocus}"] .compare-viewport`); const image = viewport?.querySelector('img'); if (!image?.naturalWidth) return;
    const current = compareStates[compareFocus];
    const geometry = viewGeometry(image.naturalWidth, image.naturalHeight, viewport.clientWidth, viewport.clientHeight, current);
    if (direction === 'fit') return setCompareState(newCompareState());
    const ratio = direction === 'actual' ? 1 : Math.max(.01, Math.min(16, geometry.ratio * (direction === 'in' ? 1.2 : 1 / 1.2)));
    const rect = viewport.getBoundingClientRect();
    const x = Number.isFinite(clientX) ? clientX - rect.left - rect.width / 2 : 0;
    const y = Number.isFinite(clientY) ? clientY - rect.top - rect.height / 2 : 0;
    setCompareState({ ratio, cx: geometry.cx + x / image.naturalWidth * (1 / geometry.ratio - 1 / ratio), cy: geometry.cy + y / image.naturalHeight * (1 / geometry.ratio - 1 / ratio) });
  }
  function openCompare() {
    const entries = selectedEntries();
    if (![2, 4].includes(entries.length) || entries.some(entry => entry.frame.type !== 'image')) return toast('请选择 2 或 4 张照片进行对比', 'warning');
    compareEntries = entries; compareStates = entries.map(newCompareState); compareFocus = 0;
    focusEntry(entries[0]);
    $('#compare-title').textContent = `${entries.length === 2 ? '双图' : '四图'}对比`;
    $('#compare-grid').classList.toggle('four-up', entries.length === 4);
    $('#compare-grid').innerHTML = entries.map((entry, index) => `<section class="compare-pane ${index === 0 ? 'focused' : ''}" data-compare-pane="${index}"><div class="compare-viewport" tabindex="0" aria-label="对比照片 ${index + 1}：${escapeHtml(entry.frame.name)}"><img src="/api/media/${encodeURIComponent(entry.frame.id)}" alt="${escapeHtml(entry.frame.name)}" draggable="false"></div><footer class="compare-label"><span><b>${escapeHtml(entry.frame.name)}</b><small></small><em>${escapeHtml(entry.roll.name)} · ${String(entry.index + 1).padStart(2, '0')}A</em></span><output>载入中</output></footer></section>`).join('');
    $('#compare-dialog').showModal();
    $$('#compare-grid img').forEach(image => { image.onload = applyCompareViews; image.onerror = () => { image.closest('.compare-pane').querySelector('output').textContent = '媒体不可用'; }; });
    refreshReviewMarks(); renderReviewDetails('compare', entries[0]); applyCompareViews();
    $('#compare-grid .compare-viewport').focus();
  }
  function exifMarkup(entry) {
    const exif = entry.frame.exif || {};
    const rows = [['胶卷', entry.roll.name], [exif.make || exif.model ? '相机' : '相机（档案）', [exif.make, exif.model].filter(Boolean).join(' ') || entry.roll.camera], [exif.lens ? '镜头' : '镜头（档案）', exif.lens || entry.roll.lens], [exif.date ? '时间' : '时间（档案）', exif.date || entry.roll.date], ['尺寸', exif.width && exif.height ? `${exif.width} × ${exif.height}` : ''], ['焦距', exif.focalLength ? `${exif.focalLength} mm` : ''], ['光圈', exif.aperture ? `f/${Number(exif.aperture).toFixed(1)}` : ''], ['快门', exif.exposure ? exif.exposure < 1 ? `1/${Math.round(1 / exif.exposure)} s` : `${exif.exposure} s` : ''], ['ISO', exif.iso], ['标签', (entry.frame.tags || []).join(' · ')]];
    return rows.filter(([, value]) => value).map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('') || '<p>没有可读取的 EXIF</p>';
  }
  async function getHistogram(frame) {
    if (histogramCache.has(frame.id)) return histogramCache.get(frame.id);
    const image = new Image(); image.src = `/api/media/${encodeURIComponent(frame.id)}`; await image.decode();
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const bins = histogramBins(context.getImageData(0, 0, canvas.width, canvas.height).data);
    if (histogramCache.size >= 64) histogramCache.delete(histogramCache.keys().next().value);
    histogramCache.set(frame.id, bins); return bins;
  }
  function drawHistogram(canvas, bins) {
    const context = canvas.getContext('2d'); const max = Math.max(1, ...bins.flat());
    context.clearRect(0, 0, 256, 100); context.globalCompositeOperation = 'screen';
    bins.forEach((channel, index) => { context.beginPath(); context.moveTo(0, 100); channel.forEach((count, value) => context.lineTo(value, 100 - count / max * 94)); context.lineTo(255, 100); context.closePath(); context.fillStyle = ['#e5565688', '#62c98488', '#5b98ed88'][index]; context.fill(); });
    context.globalCompositeOperation = 'source-over';
  }
  async function renderReviewDetails(scope, entry) {
    const version = ++detailVersions[scope]; const panel = $(`#${scope}-details`);
    panel.hidden = !entry || !(reviewInfo.exif || reviewInfo.histogram);
    $(`#${scope === 'compare' ? 'compare-body' : 'gallery-stage'}`)?.classList.toggle('with-details', !panel.hidden);
    ['exif', 'histogram'].forEach(key => $(`#${scope}-toggle-${key}`).setAttribute('aria-pressed', String(reviewInfo[key])));
    if (panel.hidden) { panel.innerHTML = ''; applyCompareViews(); if (scope === 'gallery') applyZoom('gallery'); return; }
    panel.innerHTML = `<h3>${escapeHtml(entry.frame.name)}</h3>${reviewInfo.exif ? `<section><b>EXIF</b><dl>${exifMarkup(entry)}</dl></section>` : ''}${reviewInfo.histogram ? '<section><b>RGB 直方图</b><canvas width="256" height="100" aria-label="原始影像 RGB 直方图" role="img"></canvas><small>原始影像取样 · 未应用调色</small><p class="histogram-status">正在读取…</p></section>' : ''}`;
    applyCompareViews(); if (scope === 'gallery') applyZoom('gallery');
    if (!reviewInfo.histogram) return;
    const status = panel.querySelector('.histogram-status');
    if (entry.frame.type !== 'image') { status.textContent = '视频暂不提供直方图'; return; }
    try { const bins = await getHistogram(entry.frame); if (version !== detailVersions[scope]) return; drawHistogram(panel.querySelector('canvas'), bins); status.remove(); }
    catch { if (version === detailVersions[scope]) status.textContent = '无法读取此影像的直方图'; }
  }
  function toggleReviewInfo(key) {
    reviewInfo[key] = !reviewInfo[key];
    const scope = comparisonOpen() ? 'compare' : 'gallery'; renderReviewDetails(scope, reviewEntry());
  }
  function bindReview() {
    $('#btn-compare').onclick = openCompare;
    $('#compare-close').onclick = () => $('#compare-dialog').close();
    $('#compare-dialog').addEventListener('close', () => { detailVersions.compare++; compareEntries = []; compareStates = []; renderAll(); });
    $('#compare-sync').onclick = () => { compareSync = !compareSync; $('#compare-sync').setAttribute('aria-pressed', String(compareSync)); if (compareSync) setCompareState(compareStates[compareFocus]); };
    $$('[data-compare-zoom]').forEach(button => button.onclick = () => zoomCompare(button.dataset.compareZoom));
    ['gallery', 'compare'].forEach(scope => ['exif', 'histogram'].forEach(key => $(`#${scope}-toggle-${key}`).onclick = () => toggleReviewInfo(key)));
    $('#compare-rating').onclick = event => { const button = event.target.closest('[data-rating]'); if (button) setRating(Number(button.dataset.rating)); };
    $('#compare-color').onchange = event => { const frame = compareEntries[compareFocus]?.frame; if (frame) { frame.color = event.target.value; save(); refreshReviewMarks(); } };
    $('#compare-reject').onclick = () => { const frame = compareEntries[compareFocus]?.frame; if (frame) { frame.rejected = !frame.rejected; save(); refreshReviewMarks(); } };
    const grid = $('#compare-grid'); let pan = null;
    grid.addEventListener('pointerdown', event => {
      const pane = event.target.closest('[data-compare-pane]'); if (!pane || event.button !== 0) return;
      focusCompare(Number(pane.dataset.comparePane)); const viewport = pane.querySelector('.compare-viewport'); viewport.focus();
      if (!event.target.closest('.compare-viewport')) return;
      const image = viewport.querySelector('img'); if (!image.naturalWidth) return;
      const geometry = viewGeometry(image.naturalWidth, image.naturalHeight, viewport.clientWidth, viewport.clientHeight, compareStates[compareFocus]);
      if (!viewport.classList.contains('can-pan')) return;
      pan = { x: event.clientX, y: event.clientY, geometry, width: image.naturalWidth, height: image.naturalHeight };
      grid.setPointerCapture(event.pointerId); event.preventDefault();
    });
    grid.addEventListener('pointermove', event => { if (!pan) return; setCompareState({ ratio: pan.geometry.ratio, cx: pan.geometry.cx - (event.clientX - pan.x) / (pan.width * pan.geometry.ratio), cy: pan.geometry.cy - (event.clientY - pan.y) / (pan.height * pan.geometry.ratio) }); });
    grid.addEventListener('pointerup', () => { pan = null; }); grid.addEventListener('pointercancel', () => { pan = null; });
    grid.addEventListener('wheel', event => { const pane = event.target.closest('[data-compare-pane]'); if (!pane) return; event.preventDefault(); focusCompare(Number(pane.dataset.comparePane)); zoomCompare(event.deltaY < 0 ? 'in' : 'out', event.clientX, event.clientY); }, { passive: false });
    grid.addEventListener('dblclick', event => { if (event.target.closest('img')) zoomCompare('actual'); });
    window.addEventListener('resize', () => { applyCompareViews(); if (!$('#gallery').hidden) applyZoom('gallery'); });
  }
  async function exportCurrentFrame() {
    const roll = activeRoll(); const frame = activeItem(); if (!roll || !frame || frame.type !== 'image') return toast('当前帧无法导出为照片', 'warning');
    const blob = await dbGet(frame.id); const decoded = await decodeImageBlob(blob); const canvas = document.createElement('canvas'); canvas.width = decoded.width; canvas.height = decoded.height; const context = canvas.getContext('2d'); context.filter = frameFilterCss(frame, roll.stock); context.drawImage(decoded.image, 0, 0); decoded.dispose();
    canvas.toBlob(output => downloadBlob(output, `FilmAlbum-${frame.name.replace(/\.[^.]+$/, '')}.jpg`), 'image/jpeg', .94);
  }
  async function loadDemo() {
    if (importing || deletingRoll) return toast('正在处理影像，请稍后再载入演示', 'warning');
    importing = true;
    try {
    const roll = createRoll({ name: '东京雨夜 · 36', stock: 'cinestill800t', format: '135', camera: 'Leica M6' }); roll.location = 'Tokyo · Shinjuku'; roll.date = new Date().toISOString().slice(0, 10); roll.status = 'developing';
    const palettes = [['#071b2a','#ec4c3d'],['#192947','#dd9c50'],['#19201c','#50ad9f'],['#291d35','#bd3f59'],['#0a2630','#e2c07d'],['#231d28','#6894ad'],['#102c34','#d74f42'],['#271e1c','#c6a45c']];
    for (let index = 0; index < palettes.length; index++) { const [a, b] = palettes[index]; const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="930"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><filter id="n"><feTurbulence baseFrequency=".8" numOctaves="3" stitchTiles="stitch"/><feBlend mode="soft-light" in="SourceGraphic"/></filter></defs><rect width="1400" height="930" fill="url(#g)"/><g opacity=".75"><circle cx="${220 + index * 126}" cy="${170 + index % 3 * 210}" r="${80 + index * 10}" fill="#ffd58a"/><rect x="${700 - index * 47}" y="120" width="240" height="650" rx="15" fill="#12202a"/><path d="M0 ${650 - index * 12} Q350 ${430 + index * 17} 720 ${690 - index * 22} T1400 590V930H0Z" fill="#070808"/></g><rect width="1400" height="930" filter="url(#n)" opacity=".16"/><text x="60" y="870" font-family="monospace" font-size="30" fill="white" opacity=".7">TOKYO / FRAME ${String(index + 1).padStart(2, '0')}</text></svg>`; const id = uid(); await dbPut(id, new Blob([svg], { type: 'image/svg+xml' })); roll.frames.push({ id, name: `Tokyo-${String(index + 1).padStart(2, '0')}.svg`, type: 'image', developed: index < 3, createdAt: Date.now(), rating: index === 1 ? 5 : index === 4 ? 4 : 0, flagged: index === 6, color: '', tags: [], edit: { ...DEFAULT_EDIT, exposure: index % 2 ? 5 : -3, grain: 30 } }); }
    await persistState(); await renderAll(); toast('演示胶卷已装入');
    } catch { toast('演示胶卷装入失败，请检查本地服务', 'warning'); } finally { importing = false; }
  }

  function bind() {
    installLibraryHealth({ toast, onRepaired: () => renderAll(), onView: key => { const entry = resolveRefs(rolls, [key])[0]; if (!entry) return; activeCollectionId = null; focusEntry(entry); openGallery(entry.index); } });
    bindCollections(); bindReview();
    $$('[data-view]').forEach(button => button.onclick = () => switchView(button.dataset.view));
    $$('[data-inspector]').forEach(button => button.onclick = () => switchInspector(button.dataset.inspector));
    $('#btn-import').onclick = $('#btn-empty-import').onclick = requestImport;
    $('#file-input').onchange = event => { addFiles(event.target.files); event.target.value = ''; };
    $('#btn-new-roll').onclick = () => { pendingImport = false; pendingFiles = null; $('#new-roll-submit').textContent = '创建胶卷'; renderNewRollPicker(); $('#new-roll-dialog').showModal(); };
    $('#new-roll-form').onsubmit = event => { if (event.submitter?.value === 'cancel' || !event.submitter) { if (!event.submitter) event.preventDefault(); return; } const shouldImport = pendingImport; const queuedFiles = pendingFiles; pendingImport = false; pendingFiles = null; createRoll({ name: $('#new-roll-name').value.trim() || '未命名胶卷', stock: $('#new-roll-stock').value, format: $('#new-roll-format').value, camera: $('#new-roll-camera').value.trim() }); toast('新胶卷已创建'); if (queuedFiles?.length) addFiles(queuedFiles); else if (shouldImport) $('#file-input').click(); };
    $('#new-roll-dialog').addEventListener('close', () => { if ($('#new-roll-dialog').returnValue === 'cancel') { pendingImport = false; pendingFiles = null; } $('#new-roll-submit').textContent = '创建胶卷'; });
    $('#new-roll-stock-search').oninput = renderNewRollPicker;
    $('#new-roll-stock-search').onkeydown = event => { if (event.key === 'Enter') event.preventDefault(); };
    $('#new-roll-format').onchange = renderNewRollPicker;
    $('#new-roll-style-filter').onclick = event => { const button = event.target.closest('[data-new-style-kind]'); if (!button) return; newRollStyleKind = button.dataset.newStyleKind; $$('[data-new-style-kind]').forEach(node => node.classList.toggle('active', node === button)); renderNewRollPicker(); };
    $('#new-roll-stock-grid').onclick = event => { const card = event.target.closest('[data-new-stock]'); if (!card) return; $('#new-roll-stock').value = card.dataset.newStock; renderNewRollPicker(); };
    $('#btn-demo').onclick = $('#btn-empty-demo').onclick = loadDemo;
    $('#roll-search').oninput = renderRollList;
    $('#btn-roll-facets').onclick = () => { const panel = $('#library-facets'); panel.hidden = !panel.hidden; $('#btn-roll-facets').setAttribute('aria-expanded', String(!panel.hidden)); };
    facetKeys.forEach(key => $('#facet-' + key).onchange = event => { facets[key] = event.target.value; renderRollList(); });
    $('#btn-clear-roll-facets').onclick = () => { facetKeys.forEach(key => { facets[key] = 'all'; $('#facet-' + key).value = 'all'; }); $('#roll-search').value = ''; rollFilter = 'all'; $$('[data-roll-filter]').forEach(node => node.classList.toggle('active', node.dataset.rollFilter === 'all')); renderRollList(); };
    $('#active-roll-facets').onclick = event => { const button = event.target.closest('[data-remove-facet]'); if (!button) return; const key = button.dataset.removeFacet; facets[key] = 'all'; $('#facet-' + key).value = 'all'; renderRollList(); };
    $('#btn-save-smart-album').onclick = () => $('#smart-album-dialog').showModal();
    $('#smart-album-form').onsubmit = event => { if (event.submitter?.value === 'cancel') return; const name = $('#smart-album-name').value.trim(); if (!name) { event.preventDefault(); return; } (settings.smartAlbums ||= []).push({ id: uid(), name: name.slice(0, 60), query: $('#roll-search').value, filter: rollFilter, facets: { ...facets } }); save(); renderRollList(); };
    $('#smart-album-list').onclick = event => { const remove = event.target.closest('[data-delete-album]'); if (remove) { settings.smartAlbums = settings.smartAlbums.filter(album => album.id !== remove.dataset.deleteAlbum); save(); renderRollList(); return; } const button = event.target.closest('[data-album]'); const album = settings.smartAlbums?.find(item => item.id === button?.dataset.album); if (!album) return; $('#roll-search').value = album.query || ''; rollFilter = album.filter || 'all'; facetKeys.forEach(key => { facets[key] = album.facets?.[key] || 'all'; $('#facet-' + key).value = facets[key]; }); $$('[data-roll-filter]').forEach(node => node.classList.toggle('active', node.dataset.rollFilter === rollFilter)); renderRollList(); };
    $('#frame-color').onchange = event => { const frame = activeItem(); if (frame) { frame.color = event.target.value; save(); renderAll(); } };
    $('#btn-reject-frame').onclick = () => { const frame = activeItem(); if (frame) { frame.rejected = !frame.rejected; save(); renderAll(); } };
    $('#roll-list').onclick = event => { const card = event.target.closest('[data-roll]'); if (!card) return; activeCollectionId = null; selectionAnchor = null; activeRollId = card.dataset.roll; activeFrame = 0; selection.clear(); renderAll(); };
    $$('[data-roll-filter]').forEach(button => button.onclick = () => { rollFilter = button.dataset.rollFilter; $$('[data-roll-filter]').forEach(node => node.classList.toggle('active', node === button)); renderRollList(); });
    $$('[data-frame-filter]').forEach(button => button.onclick = () => { frameFilter = button.dataset.frameFilter; selection.clear(); selectionAnchor = null; renderSelectionState(); $$('[data-frame-filter]').forEach(node => node.classList.toggle('active', node === button)); renderAll(); });
    $('#grid-size').oninput = event => { $('#contact-grid').style.setProperty('--thumb', `${event.target.value}px`); layoutContactGrid(); };
    $('#contact-grid').addEventListener('load', layoutContactGrid, true);
    window.addEventListener('resize', layoutContactGrid);
    $('#btn-prev').onclick = $('#develop-prev').onclick = () => stepFrame(-1); $('#btn-next').onclick = $('#develop-next').onclick = () => stepFrame(1);
    $('#pull-range').oninput = event => { const amount = Number(event.target.value); $('#film-strip').style.transform = `translateX(${(100 - amount) * .42}%)`; $('#film-strip').style.opacity = String(.55 + amount * .0045); };
    let suppressFilmClick = false; let filmClickTimer; let contactClickTimer;
    $('#film-strip').onclick = event => { if (suppressFilmClick) return; const card = event.target.closest('[data-frame]'); if (!card) return; const index = Number(card.dataset.frame); clearTimeout(filmClickTimer); filmClickTimer = setTimeout(() => { activeFrame = index; renderAll(); }, 220); };
    $('#film-strip').ondblclick = event => { const card = event.target.closest('[data-frame]'); if (!card) return; clearTimeout(filmClickTimer); openGallery(Number(card.dataset.frame)); };
    $('#contact-grid').onclick = event => { const card = event.target.closest('[data-contact-key]'); if (!card) return; const key = card.dataset.contactKey; const modifiers = { shiftKey: event.shiftKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey }; clearTimeout(contactClickTimer); contactClickTimer = setTimeout(() => selectContact(key, modifiers), 220); };
    $('#contact-grid').ondblclick = event => { const card = event.target.closest('[data-contact-key]'); if (!card) return; clearTimeout(contactClickTimer); const entries = visibleEntries(); const position = entries.findIndex(entry => entryKey(entry) === card.dataset.contactKey); if (position >= 0) openGalleryEntry(entries, position); };
    let stripDrag = null; const scroll = $('#film-scroll'); scroll.onpointerdown = event => { if (event.button !== 0) return; stripDrag = { x: event.clientX, scroll: scroll.scrollLeft, moved: false, pointerId: event.pointerId }; }; scroll.onpointermove = event => { if (!stripDrag) return; const delta = event.clientX - stripDrag.x; if (Math.abs(delta) > 4 && !stripDrag.moved) { stripDrag.moved = true; scroll.setPointerCapture?.(event.pointerId); scroll.classList.add('dragging'); } if (stripDrag.moved) scroll.scrollLeft = stripDrag.scroll - delta; }; scroll.onpointerup = scroll.onpointercancel = () => { suppressFilmClick = Boolean(stripDrag?.moved); if (suppressFilmClick) setTimeout(() => suppressFilmClick = false, 0); stripDrag = null; scroll.classList.remove('dragging'); };
    ['#develop-rating', '#frame-rating', '#gallery-rating'].forEach(selector => $(selector).onclick = event => { const button = event.target.closest('[data-rating]'); if (button) setRating(Number(button.dataset.rating)); });
    const beforeAfter = $('#btn-before-after'); beforeAfter.onpointerdown = () => $('#develop-media').classList.add('original'); beforeAfter.onpointerup = beforeAfter.onpointercancel = beforeAfter.onpointerleave = () => $('#develop-media').classList.remove('original');
    $('#btn-export-frame').onclick = exportCurrentFrame;
    for (const [id, key] of [['meta-name', 'name'], ['meta-format', 'format'], ['meta-status', 'status'], ['meta-camera', 'camera'], ['meta-lens', 'lens'], ['meta-location', 'location'], ['meta-date', 'date'], ['meta-process', 'process'], ['meta-notes', 'notes'], ['meta-project', 'project']]) $('#'+id).onchange = event => { const roll = activeRoll(); if (!roll) return; roll[key] = event.target.value; save(); renderAll(); };
    let deleteRollId = null;
    $('#btn-delete-roll').onclick = () => {
      const roll = activeRoll();
      if (importing) return toast('正在装入影像，请完成后再删除胶卷', 'warning');
      if (deletingRoll || !roll) return;
      deleteRollId = roll.id;
      $('#delete-roll-message').textContent = `删除胶卷“${roll.name}”及其 ${roll.frames.length} 格原始影像？独占媒体文件会从 data/media 中永久删除，此操作不可撤销。`;
      $('#delete-roll-dialog').showModal();
    };
    $('#delete-roll-dialog').addEventListener('cancel', event => { if (deletingRoll) event.preventDefault(); });
    $('#delete-roll-form').onsubmit = async event => {
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault();
      const roll = rolls.find(item => item.id === deleteRollId);
      if (!roll || deletingRoll || importing) return;
      $('#delete-roll-confirm').disabled = true;
      $('#delete-roll-cancel').disabled = true;
      deletingRoll = true; $('#btn-delete-roll').disabled = true; $('.workspace').inert = true; $('.topbar').inert = true;
      const previousRolls = [...rolls];
      rolls = rolls.filter(item => item.id !== roll.id);
      const previousCollections = JSON.parse(JSON.stringify(settings.collections || []));
      (settings.collections || []).forEach(collection => { collection.refs = resolveRefs(rolls, collection.refs).map(entryKey); });
      try {
        const result = await persistState();
        activeRollId = rolls[0]?.id || null; activeFrame = 0; selection.clear(); closeGallery();
        if (!result.cleanupPending) toast('胶卷已删除，独占媒体文件已清理');
      } catch { rolls = previousRolls; settings.collections = previousCollections; saveConflict = true; toast('未能确认删除结果，已暂停保存。请检查本地服务并刷新页面', 'warning'); }
      finally { deletingRoll = false; $('#delete-roll-dialog').close(); $('#delete-roll-confirm').disabled = false; $('#delete-roll-cancel').disabled = false; $('#btn-delete-roll').disabled = false; $('.workspace').inert = false; $('.topbar').inert = false; renderAll(); }
    };
    $('#btn-clear-selection').onclick = () => { selection.clear(); renderAll(); };
    $('#brand-home').onclick = () => switchView('film');
    $('#btn-fullscreen').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    setupPanZoom('develop', '#develop-canvas', '#develop-zoom'); setupPanZoom('gallery', '#gallery-stage', '#gallery-zoom');
    $('#gallery-close').onclick = closeGallery; $('#gallery-prev').onclick = () => stepGallery(-1); $('#gallery-next').onclick = () => stepGallery(1);
    $('#gallery-toggle-thumbs').onclick = () => { const collapsed = $('#gallery').classList.toggle('thumbs-collapsed'); $('#gallery-toggle-thumbs').textContent = collapsed ? '展开缩略图' : '收起缩略图'; };
    $('#gallery-thumbs').onclick = event => { const thumb = event.target.closest('[data-gallery-frame]'); if (!thumb) return; galleryIndex = Number(thumb.dataset.galleryFrame); focusEntry(galleryEntries[galleryIndex]); resetZoom('gallery'); renderGallery(); };
    let dragDepth = 0; document.addEventListener('dragenter', event => { if (![...event.dataTransfer.types].includes('Files')) return; event.preventDefault(); dragDepth++; $('#drop-overlay').classList.add('show'); }); document.addEventListener('dragover', event => event.preventDefault()); document.addEventListener('dragleave', () => { dragDepth--; if (dragDepth <= 0) { dragDepth = 0; $('#drop-overlay').classList.remove('show'); } }); document.addEventListener('drop', event => { event.preventDefault(); dragDepth = 0; $('#drop-overlay').classList.remove('show'); addFiles(event.dataTransfer.files); });
    document.addEventListener('keydown', event => {
      if (deletingRoll || event.metaKey || event.ctrlKey || event.altKey) return;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName); if (typing) return;
      const compare = comparisonOpen(), gallery = !$('#gallery').hidden;
      if (compare) {
        if (event.key === 'Escape') return;
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft' || event.key === 'Tab' && document.activeElement.classList.contains('compare-viewport')) {
          event.preventDefault(); const delta = event.key === 'ArrowLeft' || event.shiftKey ? -1 : 1;
          focusCompare((compareFocus + delta + compareEntries.length) % compareEntries.length); $(`[data-compare-pane="${compareFocus}"] .compare-viewport`).focus(); return;
        }
      } else if ($$('dialog[open]').length) return;
      if (event.key === 'Escape' && gallery) { closeGallery(); return; }
      const key = event.key.toLowerCase();
      if (compare || gallery) {
        if (key === 'i' || key === 'h') { event.preventDefault(); toggleReviewInfo(key === 'i' ? 'exif' : 'histogram'); return; }
        if (['f', 'z', '+', '=', '-'].includes(key)) { event.preventDefault(); const direction = key === 'f' ? 'fit' : key === 'z' ? 'actual' : key === '-' ? 'out' : 'in'; compare ? zoomCompare(direction) : changeZoom('gallery', direction); return; }
        if (/^[0-5]$/.test(key)) { event.preventDefault(); if (key === '0' && activeItem()) { activeItem().rating = 0; save(); renderAll(); refreshReviewMarks(); } else setRating(Number(key)); renderRating(); return; }
      }
      if (key === 'x') { event.preventDefault(); if (compare) $('#compare-reject').click(); else $('#btn-reject-frame').click(); return; }
      if (compare) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const delta = event.key === 'ArrowLeft' ? -1 : 1; gallery ? stepGallery(delta) : stepFrame(delta); }
      if (gallery) return;
      if (key === 'c' && currentView === 'contact') { event.preventDefault(); openCompare(); }
      if (key === '1') switchView('film'); if (key === '2') switchView('contact');
    });
    $$('[data-mobile-view]').forEach(button => button.onclick = () => { $('.library-panel').classList.remove('mobile-show'); $('.inspector-panel').classList.remove('mobile-show'); switchView(button.dataset.mobileView); });
    $$('[data-mobile]').forEach(button => button.onclick = () => { const panel = button.dataset.mobile === 'library' ? $('.library-panel') : $('.inspector-panel'); const show = !panel.classList.contains('mobile-show'); $$('.panel').forEach(item => item.classList.remove('mobile-show')); panel.classList.toggle('mobile-show', show); });
  }

  async function initialize() {
    try { await loadState(); } catch { toast('未连接本地资料库服务，请使用 npm run serve 启动', 'warning'); }
    renderNewRollPicker();
    bind();
    if (!rolls.length && new URLSearchParams(location.search).has('demo')) loadDemo(); else renderAll();
  }
  initialize().catch(error => { console.error(error); toast('FilmAlbum 初始化失败', 'warning'); });
})();
