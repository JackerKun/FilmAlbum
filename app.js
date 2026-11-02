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
  const ADJUSTMENTS = [
    ['exposure', '曝光', -100, 100, 0], ['contrast', '对比度', -100, 100, 0], ['saturation', '饱和度', -100, 100, 0],
    ['temperature', '色温', -100, 100, 0], ['fade', '褪色', 0, 100, 0], ['grain', '银盐颗粒', 0, 100, 24],
    ['halation', '高光晕染', 0, 100, 12], ['vignette', '暗角', 0, 100, 10],
  ];
  const META_KEY = 'filmalbum-rolls-v1';
  const SETTINGS_KEY = 'filmalbum-settings-v2';
  const DB_NAME = 'filmalbum-media-v1';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const clone = value => JSON.parse(JSON.stringify(value));

  let rolls = migrateRolls(loadJson(META_KEY, []));
  let settings = { developMode: true, ...loadJson(SETTINGS_KEY, {}) };
  let activeRollId = rolls[0]?.id || null;
  let activeFrame = 0;
  let currentView = 'film';
  let inspectorView = 'look';
  let rollFilter = 'all';
  let frameFilter = 'all';
  let styleKind = 'all';
  let newRollStyleKind = 'all';
  let selection = new Set();
  let selectionAnchor = null;
  let urls = new Map();
  let dbPromise;
  let clipboardEdit = null;
  let undoStack = [];
  let redoStack = [];
  let pendingSnapshot = null;
  let renderVersion = 0;
  let galleryIndex = 0;
  const zoomState = { develop: { scale: 1, x: 0, y: 0 }, gallery: { scale: 1, x: 0, y: 0 } };

  function loadJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
  function migrateRolls(items) {
    return items.map(roll => ({
      format: '135', status: 'shooting', camera: '', lens: '', location: '', date: '', process: '', notes: '',
      ...roll,
      frames: (roll.frames || []).map(frame => ({ rating: 0, flagged: false, color: '', tags: [], edit: { ...DEFAULT_EDIT }, ...frame, edit: { ...DEFAULT_EDIT, ...(frame.edit || {}) } })),
    }));
  }
  function save() { localStorage.setItem(META_KEY, JSON.stringify(rolls)); localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
  function activeRoll() { return rolls.find(roll => roll.id === activeRollId) || rolls[0] || null; }
  function activeItem() { return activeRoll()?.frames[activeFrame] || null; }
  function snapshot() { return { rolls: clone(rolls), activeRollId, activeFrame }; }
  function restore(state) { rolls = state.rolls; activeRollId = state.activeRollId; activeFrame = state.activeFrame; selection.clear(); save(); renderAll(); }
  function checkpoint() { undoStack.push(snapshot()); if (undoStack.length > 40) undoStack.shift(); redoStack = []; updateHistoryButtons(); }
  function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); updateHistoryButtons(); toast('已撤销'); }
  function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); updateHistoryButtons(); toast('已重做'); }
  function updateHistoryButtons() { $('#btn-undo').disabled = !undoStack.length; $('#btn-redo').disabled = !redoStack.length; }
  function beginContinuousEdit() { if (!pendingSnapshot) pendingSnapshot = snapshot(); }
  function finishContinuousEdit() { if (!pendingSnapshot) return; undoStack.push(pendingSnapshot); if (undoStack.length > 40) undoStack.shift(); pendingSnapshot = null; redoStack = []; save(); updateHistoryButtons(); }

  function db() {
    return dbPromise ||= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('media');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function dbPut(id, blob) { const database = await db(); return transactionPromise(database, 'readwrite', store => store.put(blob, id)); }
  async function dbGet(id) { const database = await db(); return new Promise((resolve, reject) => { const request = database.transaction('media').objectStore('media').get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
  async function dbDelete(id) { const database = await db(); return transactionPromise(database, 'readwrite', store => store.delete(id)); }
  function transactionPromise(database, mode, action) { return new Promise((resolve, reject) => { const transaction = database.transaction('media', mode); action(transaction.objectStore('media')); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); }); }
  async function mediaUrl(frame) { if (urls.has(frame.id)) return urls.get(frame.id); const blob = await dbGet(frame.id); if (!blob) return ''; const url = URL.createObjectURL(blob); urls.set(frame.id, url); return url; }
  function revokeUrl(id) { if (!urls.has(id)) return; URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  function decodeImageBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob); const image = new Image();
      image.onload = () => resolve({ image, width: image.naturalWidth, height: image.naturalHeight, dispose: () => URL.revokeObjectURL(url) });
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解码失败')); };
      image.src = url;
    });
  }

  function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function frameEdit(frame) { return { ...DEFAULT_EDIT, ...(frame?.edit || {}) }; }
  function frameFilterCss(frame, stockId, forceStyle = false) {
    if (!frame?.developed && !forceStyle) return 'none';
    const edit = frameEdit(frame);
    const stock = STOCKS[stockId] || STOCKS.portra400;
    const brightness = Math.max(.2, 1 + edit.exposure / 130);
    const contrast = Math.max(.2, 1 + edit.contrast / 100);
    const saturation = Math.max(0, 1 + edit.saturation / 100);
    const sepia = Math.max(0, edit.temperature) / 500;
    const hue = edit.temperature * -.035;
    const fade = edit.fade / 380;
    return `${stock.filter} brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) sepia(${sepia}) hue-rotate(${hue}deg) opacity(${1 - fade})`;
  }
  function frameStyle(frame, stockId) {
    const edit = frameEdit(frame);
    if (!frame?.developed) return '--frame-filter:none;--grain:0;--vignette:0;--halo:0';
    return `--frame-filter:${frameFilterCss(frame, stockId)};--grain:${edit.grain / 230};--vignette:${edit.vignette / 120};--halo:${edit.halation / 100}`;
  }
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
    const roll = { id: uid(), name, stock, format, camera, lens: '', location: '', date: '', process: '', notes: '', status: 'shooting', createdAt: Date.now(), frames: [] };
    rolls.unshift(roll); activeRollId = roll.id; activeFrame = 0; selection.clear(); save(); renderAll(); return roll;
  }
  async function addFiles(fileList) {
    const files = [...fileList].filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));
    if (!files.length) return toast('未检测到可用的照片或视频', 'warning');
    if (!activeRoll()) createRoll({ name: '第一卷' });
    checkpoint();
    const roll = activeRoll();
    for (const file of files) {
      const frame = { id: uid(), name: file.name, type: file.type.startsWith('video/') ? 'video' : 'image', developed: !settings.developMode, createdAt: Date.now(), rating: 0, flagged: false, color: '', tags: [], edit: { ...DEFAULT_EDIT } };
      await dbPut(frame.id, file); roll.frames.push(frame);
    }
    activeFrame = Math.max(0, roll.frames.length - files.length); save(); await renderAll(); toast(`已装入 ${files.length} 格影像`);
  }

  async function renderAll() {
    const version = ++renderVersion;
    renderRollList(); renderContext(); renderInspector(); renderSelectionState();
    if (currentView === 'film') await renderFilm(version);
    if (currentView === 'contact') await renderContact(version);
    if (currentView === 'develop') await renderDevelop(version);
    updateHistoryButtons();
  }
  function renderRollList() {
    const query = $('#roll-search').value.trim().toLowerCase();
    const items = rolls.filter(roll => {
      const matchesFilter = rollFilter === 'all' || (rollFilter === 'developed' ? ['developed', 'scanned', 'archived'].includes(roll.status) : roll.status === rollFilter);
      const haystack = `${roll.name} ${roll.camera} ${roll.location} ${STOCKS[roll.stock]?.name || ''}`.toLowerCase();
      return matchesFilter && (!query || haystack.includes(query));
    });
    $('#roll-list').innerHTML = items.map(roll => {
      const stock = STOCKS[roll.stock] || STOCKS.portra400;
      return `<button class="roll-card ${roll.id === activeRollId ? 'active' : ''}" data-roll="${roll.id}"><span class="mini-roll" style="--stock:${stock.color};--stock2:${stock.color2}"><i></i></span><span><strong>${escapeHtml(roll.name)}</strong><small>${stock.name} · ${roll.frames.length} 格 · ${STATUS[roll.status]}</small></span><em>${new Date(roll.createdAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</em></button>`;
    }).join('') || '<div class="empty-list">没有匹配的胶卷</div>';
    $('#storage-count').textContent = rolls.length;
    $('#storage-bar').style.width = `${Math.min(100, 8 + rolls.reduce((sum, roll) => sum + roll.frames.length, 0) * 1.5)}%`;
  }
  function renderContext() {
    const roll = activeRoll(); const stock = currentStock();
    $('#context-title').textContent = roll?.name || '未命名胶卷';
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
      const src = await mediaUrl(frame); const media = frame.type === 'video' ? `<video src="${src}" muted preload="metadata"></video>` : `<img src="${src}" alt="${escapeHtml(frame.name)}">`;
      const badges = `${!frame.developed ? '<b class="original-badge" title="尚未套用风格">原</b>' : ''}${frame.rating ? `<b title="${frame.rating} 星">★${frame.rating}</b>` : ''}${frame.flagged ? '<b title="待处理">!</b>' : ''}`;
      return `<button class="film-frame ${index === activeFrame ? 'active' : ''} ${frame.developed ? '' : 'undeveloped'}" data-frame="${index}" style="${frameStyle(frame, roll.stock)}">${media}<span class="frame-badges">${badges}</span><span class="frame-no">${String(index + 1).padStart(2, '0')}A</span></button>`;
    }));
    if (version !== renderVersion) return;
    $('#film-rail').classList.toggle('format-120', is120(roll.format));
    $('#film-strip').innerHTML = `${leaderMarkup(roll.format)}${cards.join('')}`; updateCanister();
    requestAnimationFrame(() => $('#film-strip .active')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }));
  }
  async function renderContact(version) {
    const roll = activeRoll(); if (!roll?.frames.length) { $('#contact-grid').innerHTML = '<div class="empty-grid">当前胶卷没有影像</div>'; return; }
    const visible = roll.frames.map((frame, index) => ({ frame, index })).filter(({ frame }) => frameFilter === 'all' || (frameFilter === 'favorites' && frame.rating >= 4) || (frameFilter === 'unrated' && !frame.rating) || (frameFilter === 'flagged' && frame.flagged));
    const cards = await Promise.all(visible.map(async ({ frame, index }) => {
      const src = await mediaUrl(frame); const media = frame.type === 'video' ? `<video src="${src}" muted preload="metadata"></video>` : `<img src="${src}" alt="${escapeHtml(frame.name)}">`;
      return `<button class="contact-card ${selection.has(frame.id) ? 'selected' : ''} ${frame.developed ? '' : 'undeveloped'}" data-contact-frame="${index}" style="${frameStyle(frame, roll.stock)}"><span class="contact-thumb">${media}</span>${frame.analysis ? `<span class="contact-score">${frame.analysis.score}</span>` : ''}<span class="contact-meta"><span>${String(index + 1).padStart(2, '0')}A</span><b>${frame.rating ? '★'.repeat(frame.rating) : 'UNRATED'}</b></span></button>`;
    }));
    if (version !== renderVersion) return; $('#contact-grid').innerHTML = cards.join('');
  }
  async function renderDevelop(version) {
    const roll = activeRoll(); const frame = activeItem(); const placeholder = $('#develop-placeholder'); const media = $('#develop-media');
    if (!roll || !frame) { placeholder.hidden = false; media.hidden = true; $('#develop-name').textContent = '—'; renderRating(); return; }
    const src = await mediaUrl(frame); if (version !== renderVersion) return;
    placeholder.hidden = true; media.hidden = false; media.className = `develop-media ${frame.developed ? '' : 'undeveloped'}`; media.style.cssText = frameStyle(frame, roll.stock);
    media.innerHTML = frame.type === 'video' ? `<video src="${src}" controls playsinline></video>` : `<img src="${src}" alt="${escapeHtml(frame.name)}">`;
    if (!frame.developed) media.insertAdjacentHTML('beforeend', `<button class="reveal-btn" id="btn-reveal-frame">✦ 套用 ${currentStock().name} 风格</button>`);
    $('#develop-name').textContent = `${String(activeFrame + 1).padStart(2, '0')}A · ${frame.name}`; renderRating(); applyZoom('develop');
  }
  async function openGallery(index) {
    const roll = activeRoll(); if (!roll?.frames[index]) return; activeFrame = index; galleryIndex = index; resetZoom('gallery'); $('#gallery').hidden = false; document.body.style.overflow = 'hidden'; await renderGallery();
  }
  async function renderGallery() {
    const roll = activeRoll(); const frame = roll?.frames[galleryIndex]; if (!frame) return;
    const src = await mediaUrl(frame); const media = $('#gallery-media'); media.className = `gallery-media ${frame.developed ? '' : 'original'}`; media.style.cssText = frameStyle(frame, roll.stock); media.innerHTML = frame.type === 'video' ? `<video src="${src}" controls playsinline></video>` : `<img src="${src}" alt="${escapeHtml(frame.name)}">`;
    $('#gallery-roll').textContent = `${roll.name} · ${currentStock().name}`; $('#gallery-counter').textContent = `${String(galleryIndex + 1).padStart(2, '0')} / ${String(roll.frames.length).padStart(2, '0')}`; $('#gallery-original').textContent = frame.developed ? '查看原片' : `套用 ${currentStock().name}`;
    const thumbs = await Promise.all(roll.frames.map(async (item, index) => { const thumb = await mediaUrl(item); const tag = item.type === 'video' ? `<video src="${thumb}" muted></video>` : `<img src="${thumb}" alt="">`; return `<button class="gallery-thumb ${index === galleryIndex ? 'active' : ''}" data-gallery-frame="${index}" style="${frameStyle(item, roll.stock)}">${tag}<span>${String(index + 1).padStart(2, '0')}</span></button>`; }));
    $('#gallery-thumbs').innerHTML = thumbs.join(''); applyZoom('gallery'); requestAnimationFrame(() => $('#gallery-thumbs .active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }));
  }
  function closeGallery() { $('#gallery').hidden = true; $('#gallery-media').innerHTML = ''; document.body.style.overflow = ''; }
  function stepGallery(delta) { const roll = activeRoll(); if (!roll?.frames.length) return; galleryIndex = (galleryIndex + delta + roll.frames.length) % roll.frames.length; activeFrame = galleryIndex; resetZoom('gallery'); renderGallery(); }
  function renderRating() {
    const rating = activeItem()?.rating || 0;
    $('#develop-rating').innerHTML = [1, 2, 3, 4, 5].map(value => `<button data-rating="${value}" class="${value <= rating ? 'active' : ''}" aria-label="${value} 星">★</button>`).join('');
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
    $('#stock-picker').innerHTML = Object.entries(STOCKS).filter(([, stock]) => styleKind === 'all' || stock.group === styleKind).map(([id, stock]) => `<button class="stock-card ${roll?.stock === id ? 'active' : ''}" data-stock="${id}">${stockIcon(stock, roll?.format)}<span><b>${stock.name}</b><small>${stock.brand} · ${stock.kind}</small></span></button>`).join('');
    const edit = frameEdit(frame);
    $('#adjustment-list').innerHTML = ADJUSTMENTS.map(([key, label, min, max]) => `<div class="adjustment"><div><label for="adj-${key}">${label}</label><output id="out-${key}">${formatAdjustment(key, edit[key])}</output></div><input id="adj-${key}" data-adjustment="${key}" type="range" min="${min}" max="${max}" value="${edit[key]}" ${frame ? '' : 'disabled'}></div>`).join('');
    $('#develop-mode').checked = settings.developMode;
    for (const [id, key] of [['meta-name', 'name'], ['meta-format', 'format'], ['meta-status', 'status'], ['meta-camera', 'camera'], ['meta-lens', 'lens'], ['meta-location', 'location'], ['meta-date', 'date'], ['meta-process', 'process'], ['meta-notes', 'notes']]) $('#'+id).value = roll?.[key] || '';
    renderAnalysisSummary();
  }
  function renderNewRollPicker() {
    const format = $('#new-roll-format').value;
    const selected = $('#new-roll-stock').value || 'portra400';
    $('#new-roll-stock-grid').innerHTML = Object.entries(STOCKS).filter(([, stock]) => newRollStyleKind === 'all' || stock.group === newRollStyleKind).map(([id, stock]) => `<button type="button" class="new-stock-card ${selected === id ? 'active' : ''}" data-new-stock="${id}">${stockIcon(stock, format)}<span><b>${stock.name}</b><small>${stock.brand} · ISO ${stock.iso}</small></span></button>`).join('');
  }
  function formatAdjustment(key, value) { if (['grain', 'halation', 'vignette', 'fade'].includes(key)) return `${value}%`; return value > 0 ? `+${value}` : String(value); }
  function renderSelectionState() { $('#selection-summary').hidden = !selection.size; $('#selection-count').textContent = selection.size; }
  function renderAnalysisSummary() {
    const frames = activeRoll()?.frames || []; const analyzed = frames.filter(frame => frame.analysis);
    if (!analyzed.length) { $('#analysis-summary').innerHTML = '<p class="empty-analysis">尚未分析当前胶卷</p>'; return; }
    const best = analyzed.filter(frame => frame.analysis.score >= 80).length; const issues = analyzed.filter(frame => frame.analysis.score < 48).length; const duplicates = analyzed.filter(frame => frame.analysis.duplicateOf).length;
    $('#analysis-summary').innerHTML = `<div class="analysis-stat"><span>推荐精选</span><b>${best}</b></div><div class="analysis-stat"><span>可能需要检查</span><b>${issues}</b></div><div class="analysis-stat"><span>相似画面</span><b>${duplicates}</b></div>`;
  }

  function switchView(view) {
    currentView = view; $$('.view').forEach(node => node.classList.toggle('active', node.id === `${view}-view`)); $$('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view)); $$('[data-mobile-view]').forEach(button => button.classList.toggle('active', button.dataset.mobileView === view)); renderAll();
  }
  function switchInspector(view) { inspectorView = view; $$('.inspector-section').forEach(node => node.classList.toggle('active', node.id === `inspector-${view}`)); $$('[data-inspector]').forEach(button => button.classList.toggle('active', button.dataset.inspector === view)); }
  function selectFrame(index, event = {}) {
    const roll = activeRoll(); if (!roll?.frames[index]) return; const frame = roll.frames[index];
    if (event.shiftKey && selectionAnchor !== null) { const start = Math.min(selectionAnchor, index); const end = Math.max(selectionAnchor, index); for (let i = start; i <= end; i++) selection.add(roll.frames[i].id); }
    else if (event.metaKey || event.ctrlKey) { selection.has(frame.id) ? selection.delete(frame.id) : selection.add(frame.id); selectionAnchor = index; }
    else { selection.clear(); selection.add(frame.id); selectionAnchor = index; }
    activeFrame = index; renderSelectionState(); renderAll();
  }
  function stepFrame(delta) { const frames = activeRoll()?.frames || []; if (!frames.length) return; activeFrame = (activeFrame + delta + frames.length) % frames.length; resetZoom('develop'); renderAll(); }
  function applyZoom(scope) {
    const state = zoomState[scope]; const media = $(`#${scope === 'develop' ? 'develop' : 'gallery'}-media`); const target = media?.querySelector('img,video'); if (!target) return;
    target.style.transform = `translate3d(${state.x}px,${state.y}px,0) scale(${state.scale})`; target.style.transformOrigin = 'center'; media.classList.toggle('zoomed', state.scale > 1.01); const output = $(`#${scope}-zoom output`); if (output) output.textContent = `${Math.round(state.scale * 100)}%`;
  }
  function resetZoom(scope) { zoomState[scope] = { scale: 1, x: 0, y: 0 }; applyZoom(scope); }
  function changeZoom(scope, direction, clientX, clientY) {
    const state = zoomState[scope]; const old = state.scale; state.scale = direction === 'fit' ? 1 : Math.max(.5, Math.min(6, state.scale * (direction === 'in' ? 1.18 : .85)));
    if (state.scale <= 1) { state.x = 0; state.y = 0; } else if (clientX != null && old > 0) { const ratio = state.scale / old; state.x *= ratio; state.y *= ratio; }
    applyZoom(scope);
  }
  function setupPanZoom(scope, stageSelector, toolbarSelector) {
    const stage = $(stageSelector); let pan = null;
    stage.addEventListener('wheel', event => { if (!event.target.closest('img,video')) return; event.preventDefault(); changeZoom(scope, event.deltaY < 0 ? 'in' : 'out', event.clientX, event.clientY); }, { passive: false });
    stage.addEventListener('pointerdown', event => { if (!event.target.closest('img,video') || zoomState[scope].scale <= 1) return; pan = { x: event.clientX, y: event.clientY, ox: zoomState[scope].x, oy: zoomState[scope].y }; stage.setPointerCapture(event.pointerId); stage.classList.add('panning'); });
    stage.addEventListener('pointermove', event => { if (!pan) return; zoomState[scope].x = pan.ox + event.clientX - pan.x; zoomState[scope].y = pan.oy + event.clientY - pan.y; applyZoom(scope); });
    stage.addEventListener('pointerup', () => { pan = null; stage.classList.remove('panning'); }); stage.addEventListener('pointercancel', () => { pan = null; stage.classList.remove('panning'); });
    stage.addEventListener('dblclick', event => { if (event.target.closest('img,video')) resetZoom(scope); });
    $(toolbarSelector).onclick = event => { const button = event.target.closest('[data-zoom]'); if (button) changeZoom(scope, button.dataset.zoom); };
  }
  function setRating(value) { const frame = activeItem(); if (!frame) return; checkpoint(); frame.rating = frame.rating === value ? 0 : value; save(); renderAll(); }
  function setStock(id) { const roll = activeRoll(); if (!roll || roll.stock === id) return; checkpoint(); roll.stock = id; save(); renderAll(); }
  function editSelectedFrames(mutator) { const roll = activeRoll(); if (!roll) return 0; const targets = selection.size ? roll.frames.filter(frame => selection.has(frame.id)) : [activeItem()].filter(Boolean); if (!targets.length) return 0; checkpoint(); targets.forEach(mutator); save(); renderAll(); return targets.length; }

  async function exportProject() {
    if (!rolls.length) return toast('没有可导出的胶卷', 'warning');
    toast('正在整理完整项目，请稍候'); const media = {};
    for (const roll of rolls) for (const frame of roll.frames) { const blob = await dbGet(frame.id); if (blob) media[frame.id] = await blobToDataUrl(blob); }
    const project = { format: 'filmalbum-project', version: 2, exportedAt: new Date().toISOString(), rolls, settings, media };
    downloadBlob(new Blob([JSON.stringify(project)], { type: 'application/json' }), `FilmAlbum-${new Date().toISOString().slice(0, 10)}.filmalbum`); toast('完整项目已导出');
  }
  function exportCatalog() { const data = { format: 'filmalbum-catalog', version: 2, exportedAt: new Date().toISOString(), rolls, settings }; downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `FilmAlbum-catalog-${new Date().toISOString().slice(0, 10)}.json`); }
  async function exportContactSheet() {
    const roll = activeRoll(); const frames = roll?.frames.filter(frame => frame.type === 'image') || [];
    if (!frames.length) return toast('当前胶卷没有可输出的照片', 'warning');
    toast('正在生成高清接触印样');
    const columns = frames.length <= 6 ? 3 : 4; const cellW = 430; const cellH = 330; const headerH = 150; const rows = Math.ceil(frames.length / columns);
    const canvas = document.createElement('canvas'); canvas.width = columns * cellW + 80; canvas.height = rows * cellH + headerH + 50; const context = canvas.getContext('2d');
    context.fillStyle = '#171714'; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#f4f0e5'; context.font = '600 38px Georgia'; context.fillText(roll.name, 40, 58); context.fillStyle = '#a9a398'; context.font = '18px monospace'; context.fillText(`${roll.format}  ·  ${currentStock().brand} ${currentStock().name}  ·  ${frames.length} FRAMES`, 40, 96);
    for (let index = 0; index < frames.length; index++) {
      const frame = frames[index]; const blob = await dbGet(frame.id); if (!blob) continue; const decoded = await decodeImageBlob(blob); const column = index % columns; const row = Math.floor(index / columns); const x = 40 + column * cellW; const y = headerH + row * cellH; const drawW = cellW - 24; const drawH = cellH - 58; const scale = Math.max(drawW / decoded.width, drawH / decoded.height); const sourceW = drawW / scale; const sourceH = drawH / scale; const sourceX = (decoded.width - sourceW) / 2; const sourceY = (decoded.height - sourceH) / 2;
      context.save(); context.filter = frameFilterCss(frame, roll.stock); context.drawImage(decoded.image, sourceX, sourceY, sourceW, sourceH, x, y, drawW, drawH); context.restore(); decoded.dispose(); context.fillStyle = '#d6cebc'; context.font = '15px monospace'; context.fillText(`${String(index + 1).padStart(2, '0')}A`, x, y + drawH + 25); if (frame.rating) { context.fillStyle = '#e3b849'; context.fillText('★'.repeat(frame.rating), x + 55, y + drawH + 25); }
    }
    canvas.toBlob(blob => { downloadBlob(blob, `${roll.name}-接触印样.jpg`); toast('接触印样已导出'); }, 'image/jpeg', .94);
  }
  async function importProject(file) {
    let project; try { project = JSON.parse(await file.text()); } catch { return toast('无法读取这个项目文件', 'warning'); }
    if (project.format !== 'filmalbum-project' || !Array.isArray(project.rolls)) return toast('不是有效的 FilmAlbum 完整项目', 'warning');
    if (rolls.length && !confirm('导入会替换当前工作区。建议先导出当前项目，是否继续？')) return;
    toast('正在恢复媒体与编辑记录');
    for (const [id, dataUrl] of Object.entries(project.media || {})) await dbPut(id, dataUrlToBlob(dataUrl));
    rolls = migrateRolls(project.rolls); settings = { developMode: true, ...(project.settings || {}) }; activeRollId = rolls[0]?.id || null; activeFrame = 0; selection.clear(); urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); save(); await renderAll(); toast(`已恢复 ${rolls.length} 卷胶片`);
  }
  function blobToDataUrl(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); }); }
  function dataUrlToBlob(dataUrl) { const [header, data] = dataUrl.split(','); const mime = header.match(/data:(.*?);/)?.[1] || 'application/octet-stream'; const binary = atob(data); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return new Blob([bytes], { type: mime }); }

  async function analyzeCurrentRoll() {
    const roll = activeRoll(); if (!roll?.frames.length) return toast('当前胶卷没有照片', 'warning');
    const photos = roll.frames.filter(frame => frame.type === 'image'); if (!photos.length) return toast('画质分析目前仅支持照片', 'warning');
    checkpoint(); const progress = $('#analysis-progress'); progress.hidden = false; const hashes = [];
    try {
      for (let index = 0; index < photos.length; index++) {
        const frame = photos[index]; const blob = await dbGet(frame.id); if (blob) { frame.analysis = await analyzeImage(blob); for (const prior of hashes) if (hashDistance(frame.analysis.hash, prior.hash) <= 7) { frame.analysis.duplicateOf = prior.id; break; } hashes.push({ id: frame.id, hash: frame.analysis.hash }); }
        progress.querySelector('em').style.width = `${((index + 1) / photos.length) * 100}%`; progress.querySelector('span').textContent = `正在分析 ${index + 1} / ${photos.length}`; await new Promise(resolve => requestAnimationFrame(resolve));
      }
      save(); renderAll(); switchInspector('selection'); toast('本地画质分析完成');
    } catch (error) { toast(error.message || '画质分析失败，请检查图片格式', 'warning'); }
    finally { progress.hidden = true; }
  }
  async function analyzeImage(blob) {
    const decoded = await decodeImageBlob(blob); const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 48; const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(decoded.image, 0, 0, 64, 48); decoded.dispose();
    const pixels = context.getImageData(0, 0, 64, 48).data; const luminance = new Float32Array(64 * 48); let sum = 0;
    for (let i = 0, p = 0; i < pixels.length; i += 4, p++) { const value = pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722; luminance[p] = value; sum += value; }
    const brightness = sum / luminance.length; let variance = 0; let sharpness = 0;
    for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) { const index = y * 64 + x; variance += (luminance[index] - brightness) ** 2; if (x < 63) sharpness += Math.abs(luminance[index] - luminance[index + 1]); if (y < 47) sharpness += Math.abs(luminance[index] - luminance[index + 64]); }
    const contrast = Math.sqrt(variance / luminance.length); sharpness /= luminance.length * 2;
    let score = 100 - Math.min(40, Math.abs(brightness - 128) * .32) + Math.min(12, contrast / 4) + Math.min(14, sharpness / 2.5) - 18; score = Math.round(Math.max(20, Math.min(99, score)));
    const hashValues = []; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) hashValues.push(luminance[(y * 6) * 64 + x * 8]); const mean = hashValues.reduce((a, b) => a + b, 0) / 64;
    return { score, brightness: Math.round(brightness), contrast: Math.round(contrast), sharpness: Math.round(sharpness), hash: hashValues.map(value => value > mean ? '1' : '0').join('') };
  }
  function hashDistance(a = '', b = '') { let count = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) count++; return count; }
  async function smartSelect() { const roll = activeRoll(); if (!roll) return; if (!roll.frames.some(frame => frame.analysis)) await analyzeCurrentRoll(); selection.clear(); roll.frames.filter(frame => frame.analysis?.score >= 78 && !frame.analysis?.duplicateOf).forEach(frame => selection.add(frame.id)); frameFilter = 'favorites'; renderAll(); toast(`已选出 ${selection.size} 格推荐画面`); }

  async function exportCurrentFrame() {
    const roll = activeRoll(); const frame = activeItem(); if (!roll || !frame || frame.type !== 'image') return toast('当前帧无法导出为照片', 'warning');
    const blob = await dbGet(frame.id); const decoded = await decodeImageBlob(blob); const canvas = document.createElement('canvas'); canvas.width = decoded.width; canvas.height = decoded.height; const context = canvas.getContext('2d'); context.filter = frameFilterCss(frame, roll.stock); context.drawImage(decoded.image, 0, 0); decoded.dispose();
    canvas.toBlob(output => downloadBlob(output, `FilmAlbum-${frame.name.replace(/\.[^.]+$/, '')}.jpg`), 'image/jpeg', .94);
  }
  async function loadDemo() {
    checkpoint(); const roll = createRoll({ name: '东京雨夜 · 36', stock: 'cinestill800t', format: '135', camera: 'Leica M6' }); roll.location = 'Tokyo · Shinjuku'; roll.date = new Date().toISOString().slice(0, 10); roll.status = 'developing';
    const palettes = [['#071b2a','#ec4c3d'],['#192947','#dd9c50'],['#19201c','#50ad9f'],['#291d35','#bd3f59'],['#0a2630','#e2c07d'],['#231d28','#6894ad'],['#102c34','#d74f42'],['#271e1c','#c6a45c']];
    for (let index = 0; index < palettes.length; index++) { const [a, b] = palettes[index]; const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="930"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><filter id="n"><feTurbulence baseFrequency=".8" numOctaves="3" stitchTiles="stitch"/><feBlend mode="soft-light" in="SourceGraphic"/></filter></defs><rect width="1400" height="930" fill="url(#g)"/><g opacity=".75"><circle cx="${220 + index * 126}" cy="${170 + index % 3 * 210}" r="${80 + index * 10}" fill="#ffd58a"/><rect x="${700 - index * 47}" y="120" width="240" height="650" rx="15" fill="#12202a"/><path d="M0 ${650 - index * 12} Q350 ${430 + index * 17} 720 ${690 - index * 22} T1400 590V930H0Z" fill="#070808"/></g><rect width="1400" height="930" filter="url(#n)" opacity=".16"/><text x="60" y="870" font-family="monospace" font-size="30" fill="white" opacity=".7">TOKYO / FRAME ${String(index + 1).padStart(2, '0')}</text></svg>`; const id = uid(); await dbPut(id, new Blob([svg], { type: 'image/svg+xml' })); roll.frames.push({ id, name: `Tokyo-${String(index + 1).padStart(2, '0')}.svg`, type: 'image', developed: index < 3, createdAt: Date.now(), rating: index === 1 ? 5 : index === 4 ? 4 : 0, flagged: index === 6, color: '', tags: [], edit: { ...DEFAULT_EDIT, exposure: index % 2 ? 5 : -3, grain: 30 } }); }
    save(); await renderAll(); toast('演示胶卷已装入');
  }

  function bind() {
    $$('[data-view]').forEach(button => button.onclick = () => switchView(button.dataset.view));
    $$('[data-inspector]').forEach(button => button.onclick = () => switchInspector(button.dataset.inspector));
    $('#btn-import').onclick = $('#btn-empty-import').onclick = () => $('#file-input').click();
    $('#file-input').onchange = event => { addFiles(event.target.files); event.target.value = ''; };
    $('#btn-new-roll').onclick = () => { renderNewRollPicker(); $('#new-roll-dialog').showModal(); };
    $('#new-roll-form').onsubmit = event => { if (event.submitter?.value === 'cancel') return; checkpoint(); createRoll({ name: $('#new-roll-name').value.trim() || '未命名胶卷', stock: $('#new-roll-stock').value, format: $('#new-roll-format').value, camera: $('#new-roll-camera').value.trim() }); toast('新胶卷已创建'); };
    $('#new-roll-format').onchange = renderNewRollPicker;
    $('#new-roll-style-filter').onclick = event => { const button = event.target.closest('[data-new-style-kind]'); if (!button) return; newRollStyleKind = button.dataset.newStyleKind; $$('[data-new-style-kind]').forEach(node => node.classList.toggle('active', node === button)); renderNewRollPicker(); };
    $('#new-roll-stock-grid').onclick = event => { const card = event.target.closest('[data-new-stock]'); if (!card) return; $('#new-roll-stock').value = card.dataset.newStock; renderNewRollPicker(); };
    $('#btn-demo').onclick = $('#btn-empty-demo').onclick = loadDemo;
    $('#roll-search').oninput = renderRollList;
    $('#roll-list').onclick = event => { const card = event.target.closest('[data-roll]'); if (!card) return; activeRollId = card.dataset.roll; activeFrame = 0; selection.clear(); renderAll(); };
    $$('[data-roll-filter]').forEach(button => button.onclick = () => { rollFilter = button.dataset.rollFilter; $$('[data-roll-filter]').forEach(node => node.classList.toggle('active', node === button)); renderRollList(); });
    $$('[data-frame-filter]').forEach(button => button.onclick = () => { frameFilter = button.dataset.frameFilter; $$('[data-frame-filter]').forEach(node => node.classList.toggle('active', node === button)); renderContact(renderVersion); });
    $('#grid-size').oninput = event => $('#contact-grid').style.setProperty('--thumb', `${event.target.value}px`);
    $('#btn-prev').onclick = $('#develop-prev').onclick = () => stepFrame(-1); $('#btn-next').onclick = $('#develop-next').onclick = () => stepFrame(1);
    $('#pull-range').oninput = event => { const amount = Number(event.target.value); $('#film-strip').style.transform = `translateX(${(100 - amount) * .42}%)`; $('#film-strip').style.opacity = String(.55 + amount * .0045); };
    let suppressFilmClick = false;
    $('#film-strip').onclick = event => { if (suppressFilmClick) return; const card = event.target.closest('[data-frame]'); if (!card) return; const index = Number(card.dataset.frame); if (index === activeFrame) { openGallery(index); return; } activeFrame = index; renderAll(); };
    $('#film-strip').ondblclick = event => { const card = event.target.closest('[data-frame]'); if (!card) return; openGallery(Number(card.dataset.frame)); };
    $('#contact-grid').onclick = event => { const card = event.target.closest('[data-contact-frame]'); if (card) selectFrame(Number(card.dataset.contactFrame), event); };
    $('#contact-grid').ondblclick = event => { const card = event.target.closest('[data-contact-frame]'); if (!card) return; openGallery(Number(card.dataset.contactFrame)); };
    let stripDrag = null; const scroll = $('#film-scroll'); scroll.onpointerdown = event => { if (event.button !== 0) return; stripDrag = { x: event.clientX, scroll: scroll.scrollLeft, moved: false, pointerId: event.pointerId }; }; scroll.onpointermove = event => { if (!stripDrag) return; const delta = event.clientX - stripDrag.x; if (Math.abs(delta) > 4 && !stripDrag.moved) { stripDrag.moved = true; scroll.setPointerCapture?.(event.pointerId); scroll.classList.add('dragging'); } if (stripDrag.moved) scroll.scrollLeft = stripDrag.scroll - delta; }; scroll.onpointerup = scroll.onpointercancel = () => { suppressFilmClick = Boolean(stripDrag?.moved); if (suppressFilmClick) setTimeout(() => suppressFilmClick = false, 0); stripDrag = null; scroll.classList.remove('dragging'); };
    $('#stock-picker').onclick = event => { const card = event.target.closest('[data-stock]'); if (card) setStock(card.dataset.stock); };
    $('#style-filter').onclick = event => { const button = event.target.closest('[data-style-kind]'); if (!button) return; styleKind = button.dataset.styleKind; $$('[data-style-kind]').forEach(node => node.classList.toggle('active', node === button)); renderInspector(); };
    $('#adjustment-list').onpointerdown = event => { if (event.target.matches('[data-adjustment]')) beginContinuousEdit(); };
    $('#adjustment-list').oninput = event => { const input = event.target.closest('[data-adjustment]'); const frame = activeItem(); if (!input || !frame) return; if (!pendingSnapshot) beginContinuousEdit(); frame.edit[input.dataset.adjustment] = Number(input.value); $(`#out-${input.dataset.adjustment}`).textContent = formatAdjustment(input.dataset.adjustment, Number(input.value)); save(); if (currentView === 'develop') renderDevelop(++renderVersion); else if (currentView === 'film') renderFilm(++renderVersion); };
    $('#adjustment-list').onchange = finishContinuousEdit;
    $('#btn-reset-look').onclick = () => { const frame = activeItem(); if (!frame) return; checkpoint(); frame.edit = { ...DEFAULT_EDIT }; save(); renderAll(); };
    $('#btn-copy-look').onclick = () => { const frame = activeItem(); if (!frame) return toast('请先选择一格影像', 'warning'); clipboardEdit = clone(frame.edit); toast('显影参数已复制'); };
    $('#btn-paste-look').onclick = () => { const frame = activeItem(); if (!frame || !clipboardEdit) return toast('剪贴板中没有显影参数', 'warning'); checkpoint(); frame.edit = clone(clipboardEdit); save(); renderAll(); };
    $('#btn-sync-look').onclick = () => { const source = activeItem(); if (!source || !selection.size) return toast('请先在接触印样中选择目标', 'warning'); const count = editSelectedFrames(frame => frame.edit = clone(source.edit)); toast(`已同步到 ${count} 格影像`); };
    $('#develop-mode').onchange = event => { settings.developMode = event.target.checked; save(); };
    $('#develop-rating').onclick = event => { const button = event.target.closest('[data-rating]'); if (button) setRating(Number(button.dataset.rating)); };
    $('#develop-media').onclick = event => { if (!event.target.closest('#btn-reveal-frame')) return; const frame = activeItem(); if (!frame) return; checkpoint(); frame.developed = true; save(); renderAll(); toast(`${currentStock().name} 风格已应用`); };
    const beforeAfter = $('#btn-before-after'); beforeAfter.onpointerdown = () => $('#develop-media').classList.add('original'); beforeAfter.onpointerup = beforeAfter.onpointercancel = beforeAfter.onpointerleave = () => $('#develop-media').classList.remove('original');
    $('#btn-export-frame').onclick = exportCurrentFrame;
    for (const [id, key] of [['meta-name', 'name'], ['meta-format', 'format'], ['meta-status', 'status'], ['meta-camera', 'camera'], ['meta-lens', 'lens'], ['meta-location', 'location'], ['meta-date', 'date'], ['meta-process', 'process'], ['meta-notes', 'notes']]) $('#'+id).onchange = event => { const roll = activeRoll(); if (!roll) return; checkpoint(); roll[key] = event.target.value; save(); renderAll(); };
    $('#btn-delete-roll').onclick = () => { const roll = activeRoll(); if (!roll || !confirm(`删除胶卷“${roll.name}”？可通过撤销恢复。`)) return; checkpoint(); rolls = rolls.filter(item => item.id !== roll.id); activeRollId = rolls[0]?.id || null; activeFrame = 0; selection.clear(); save(); renderAll(); toast('胶卷已移除'); };
    $('#btn-clear-selection').onclick = () => { selection.clear(); renderAll(); };
    $('#btn-rate-selected').onclick = () => { const count = editSelectedFrames(frame => frame.rating = 5); toast(`${count} 格已设为精选`); };
    $('#btn-flag-selected').onclick = () => { const count = editSelectedFrames(frame => frame.flagged = true); toast(`${count} 格已标记`); };
    $('#btn-develop-selected').onclick = () => { const count = editSelectedFrames(frame => frame.developed = true); toast(`${count} 格已套用当前风格`); };
    $('#btn-run-analysis').onclick = analyzeCurrentRoll; $('#btn-ai-select').onclick = smartSelect;
    $('#btn-stage-more').onclick = () => { switchInspector('selection'); if (matchMedia('(max-width:820px)').matches) $('.inspector-panel').classList.add('mobile-show'); };
    $('#brand-home').onclick = () => switchView('film');
    $('#btn-undo').onclick = undo; $('#btn-redo').onclick = redo;
    $('#btn-fullscreen').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    setupPanZoom('develop', '#develop-canvas', '#develop-zoom'); setupPanZoom('gallery', '#gallery-stage', '#gallery-zoom');
    $('#gallery-close').onclick = closeGallery; $('#gallery-prev').onclick = () => stepGallery(-1); $('#gallery-next').onclick = () => stepGallery(1);
    $('#gallery-toggle-thumbs').onclick = () => { const collapsed = $('#gallery').classList.toggle('thumbs-collapsed'); $('#gallery-toggle-thumbs').textContent = collapsed ? '展开缩略图' : '收起缩略图'; };
    $('#gallery-thumbs').onclick = event => { const thumb = event.target.closest('[data-gallery-frame]'); if (!thumb) return; galleryIndex = Number(thumb.dataset.galleryFrame); activeFrame = galleryIndex; resetZoom('gallery'); renderGallery(); };
    $('#gallery-original').onclick = () => { const frame = activeRoll()?.frames[galleryIndex]; if (!frame) return; if (!frame.developed) { checkpoint(); frame.developed = true; save(); renderGallery(); renderAll(); toast(`${currentStock().name} 风格已应用`); } else { const media = $('#gallery-media'); media.classList.toggle('original'); $('#gallery-original').textContent = media.classList.contains('original') ? '返回胶卷风格' : '查看原片'; } };
    $('#btn-project').onclick = event => { event.stopPropagation(); $('#project-menu').hidden = !$('#project-menu').hidden; };
    $('#btn-export-project').onclick = exportProject; $('#btn-export-contact').onclick = exportContactSheet; $('#btn-export-catalog').onclick = exportCatalog; $('#btn-import-project').onclick = () => $('#project-input').click(); $('#project-input').onchange = event => { if (event.target.files[0]) importProject(event.target.files[0]); event.target.value = ''; };
    document.addEventListener('click', event => { if (!event.target.closest('#project-menu') && !event.target.closest('#btn-project')) $('#project-menu').hidden = true; });
    let dragDepth = 0; document.addEventListener('dragenter', event => { if (![...event.dataTransfer.types].includes('Files')) return; event.preventDefault(); dragDepth++; $('#drop-overlay').classList.add('show'); }); document.addEventListener('dragover', event => event.preventDefault()); document.addEventListener('dragleave', () => { dragDepth--; if (dragDepth <= 0) { dragDepth = 0; $('#drop-overlay').classList.remove('show'); } }); document.addEventListener('drop', event => { event.preventDefault(); dragDepth = 0; $('#drop-overlay').classList.remove('show'); addFiles(event.dataTransfer.files); });
    document.addEventListener('keydown', event => { const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName); if (event.key === 'Escape' && !$('#gallery').hidden) { closeGallery(); return; } if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; } if (typing) return; const galleryOpen = !$('#gallery').hidden; if (event.key === 'ArrowLeft') galleryOpen ? stepGallery(-1) : stepFrame(-1); if (event.key === 'ArrowRight') galleryOpen ? stepGallery(1) : stepFrame(1); if (galleryOpen) return; if (event.key === '1') switchView('film'); if (event.key === '2') switchView('contact'); if (event.key === '3') switchView('develop'); });
    $$('[data-mobile-view]').forEach(button => button.onclick = () => { $('.library-panel').classList.remove('mobile-show'); $('.inspector-panel').classList.remove('mobile-show'); switchView(button.dataset.mobileView); });
    $$('[data-mobile]').forEach(button => button.onclick = () => { const panel = button.dataset.mobile === 'library' ? $('.library-panel') : $('.inspector-panel'); const show = !panel.classList.contains('mobile-show'); $$('.panel').forEach(item => item.classList.remove('mobile-show')); panel.classList.toggle('mobile-show', show); });
  }

  function initialize() {
    renderNewRollPicker();
    bind(); navigator.storage?.persist?.().catch(() => {});
    if (!rolls.length && new URLSearchParams(location.search).has('demo')) loadDemo(); else renderAll();
  }
  initialize();
})();
