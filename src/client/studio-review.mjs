import { viewGeometry, histogramBins } from '../shared/photo-core.mjs';
export function createReviewer({ api, toast, E, thumb, raw, patch, onClose, saveWinners }) {
  const $ = (s) => document.querySelector(s),
    $$ = (s) => [...document.querySelectorAll(s)];
  const dialog = $('#reviewer');
  let items = [],
    candidates = [],
    focus = 0,
    sync = true,
    locked = false,
    wipe = false,
    info = false,
    hist = false,
    states = [],
    generation = 0;
  const winners = new Set(),
    histCache = new Map();
  let pan,
    loadCandidates,
    stepping = false,
    resultPage = 0,
    resultPages = 1;
  const fresh = () => ({ ratio: null, cx: 0.5, cy: 0.5 });
  const source = (p, full = false) =>
    p.mime?.startsWith('video/')
      ? raw(p.mediaId)
      : ['ready', 'unknown'].includes(p.availability) &&
          [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif',
            'image/avif',
            'image/svg+xml',
          ].includes(p.mime)
        ? raw(p.mediaId)
        : thumb(p.mediaId, full ? 0 : 2048);
  function render() {
    const token = ++generation;
    $('#review-title').textContent =
      items.length === 1 ? '沉浸翻阅' : items.length === 2 ? '双图对比' : '四图对比';
    $('#review-grid').className =
      'review-grid ' +
      (items.length === 2 ? 'two' : items.length === 4 ? 'four' : '') +
      (wipe ? ' wipe' : '');
    $('#review-grid').innerHTML = items
      .map(
        (p, i) =>
          `<section class="review-pane ${i === focus ? 'focused' : ''}" data-review-index="${i}"><div class="review-viewport" tabindex="0" aria-label="审阅照片 ${i + 1}：${E(p.name)}">${p.mime?.startsWith('video/') ? `<video src="${raw(p.mediaId)}" controls playsinline></video>` : `<img src="${source(p, states[i].ratio === 1)}" alt="${E(p.name)}" draggable="false">`}</div><footer><span>${E(p.versionName || p.name)} · ${E(p.rollName || '')} ${E(p.frameNo || '')}${['offline', 'missing'].includes(p.availability) ? ' · 离线预览' : ''}</span><output>载入中</output></footer></section>`,
      )
      .join('');
    $$('#review-grid img').forEach((image) => {
      image.onload = () => {
        if (token !== generation) return;
        apply();
        if (hist) details();
      };
      image.onerror = () => {
        if (!image.dataset.fallback) {
          image.dataset.fallback = '1';
          image.src = thumb(
            items[Number(image.closest('[data-review-index]').dataset.reviewIndex)].mediaId,
            640,
          );
        } else
          image.closest('.review-pane').querySelector('output').textContent =
            '原片离线 / 预览不可用';
      };
    });
    $('#review-sync').setAttribute('aria-pressed', String(sync));
    $('#review-lock').setAttribute('aria-pressed', String(locked));
    $('#review-wipe').setAttribute('aria-pressed', String(wipe));
    $('#review-info').setAttribute('aria-pressed', String(info));
    $('#review-hist').setAttribute('aria-pressed', String(hist));
    $('#wipe-control').hidden = !wipe;
    marks();
    details();
    apply();
    renderThumbs();
  }
  function renderThumbs() {
    let strip = $('#review-result-thumbs');
    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'review-result-thumbs';
      strip.className = 'review-result-thumbs';
      $('#reviewer').insertBefore(strip, $('#reviewer').querySelector(':scope > footer'));
    }
    strip.innerHTML = `<div class="review-thumb-heading"><b>此查询结果 · ${resultPage + 1} / ${resultPages}</b><button data-result-page="-1" ${resultPage === 0 ? 'disabled' : ''}>‹ 上页</button><button data-result-page="1" ${resultPage + 1 >= resultPages ? 'disabled' : ''}>下页 ›</button><span>点击缩略图替换当前对比位置</span></div><div class="review-thumb-track">${candidates.map((p, i) => `<button data-result-thumb="${i}" class="${items[focus]?.id === p.id && items[focus]?.mediaId === p.mediaId ? 'current' : ''}" aria-label="查看 ${E(p.name)}"><img src="${thumb(p.mediaId, 320)}" alt="${E(p.name)}" loading="lazy"><small>${E(p.frameNo || p.name)}</small></button>`).join('')}</div>`;
    strip.onclick = async (e) => {
      e.stopPropagation();
      try {
        const paging = e.target.closest('[data-result-page]');
        if (paging && loadCandidates) {
          const delta = Number(paging.dataset.resultPage),
            rows = await loadCandidates(delta);
          if (rows?.length) {
            candidates = rows;
            resultPage += delta;
            renderThumbs();
          }
          return;
        }
        const target = e.target.closest('[data-result-thumb]');
        if (target) {
          if (locked && items.length === 1) {
            items.push({ ...items[0] });
            states.push(fresh());
            focus = 1;
          }
          const slot = locked && focus === 0 && items.length > 1 ? 1 : focus;
          items[slot] = { ...candidates[Number(target.dataset.resultThumb)] };
          states[slot] = fresh();
          focus = slot;
          render();
        }
      } catch (e) {
        toast(e.message, 'warning');
      }
    };
    strip.querySelector('.current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    requestAnimationFrame(apply);
  }
  function marks() {
    const p = items[focus];
    if (!p) return;
    $('#review-name').textContent = p.name;
    $('#review-rating').innerHTML = [1, 2, 3, 4, 5]
      .map(
        (n) =>
          `<button data-review-rating="${n}" class="${n <= p.rating ? 'active' : ''}" aria-label="${n} 星">★</button>`,
      )
      .join('');
    $('#review-color').value = p.color || '';
    $('#review-reject').textContent = p.rejected ? '取消淘汰 X' : '淘汰 X';
    $('#review-reject').setAttribute('aria-pressed', String(Boolean(p.rejected)));
    $('#review-save-winners').textContent = `保存本轮精选${winners.size ? ' ' + winners.size : ''}`;
    $$('[data-review-index]').forEach((pane) =>
      pane.classList.toggle('focused', Number(pane.dataset.reviewIndex) === focus),
    );
  }
  function apply() {
    items.forEach((p, i) => {
      const viewport = $(`[data-review-index="${i}"] .review-viewport`),
        image = viewport?.querySelector('img');
      if (!image?.naturalWidth) return;
      const g = viewGeometry(
        image.naturalWidth,
        image.naturalHeight,
        viewport.clientWidth,
        viewport.clientHeight,
        states[i],
      );
      image.style.width = g.width + 'px';
      image.style.height = g.height + 'px';
      image.style.transform = `translate(calc(-50% + ${g.x}px),calc(-50% + ${g.y}px))`;
      viewport.classList.toggle(
        'can-pan',
        g.width > viewport.clientWidth || g.height > viewport.clientHeight,
      );
      viewport.closest('.review-pane').querySelector('output').textContent =
        Math.round(g.ratio * 100) + '%';
    });
  }
  function choose(index) {
    focus = index;
    marks();
    details();
    renderThumbs();
  }
  function setState(next) {
    if (sync) states = items.map(() => ({ ...next }));
    else states[focus] = { ...next };
    apply();
  }
  function zoom(direction, x, y) {
    const viewport = $(`[data-review-index="${focus}"] .review-viewport`),
      image = viewport?.querySelector('img');
    if (!image?.naturalWidth) return;
    if (direction === 'fit') return setState(fresh());
    if (direction === 'actual') {
      const targets = sync ? items.map((p, i) => i) : [focus];
      let changed = false;
      for (const i of targets) {
        if (['offline', 'missing'].includes(items[i].availability)) {
          toast('原片离线时仅能检查缓存预览，接回存储卷后可检查原像素', 'warning');
          continue;
        }
        const img = $(`[data-review-index="${i}"] img`),
          url = source(items[i], true);
        if (img.getAttribute('src') !== url) {
          img.src = url;
          changed = true;
        }
      }
      setState({ ratio: 1, cx: 0.5, cy: 0.5 });
      return;
    }
    const g = viewGeometry(
        image.naturalWidth,
        image.naturalHeight,
        viewport.clientWidth,
        viewport.clientHeight,
        states[focus],
      ),
      ratio = Math.min(16, Math.max(0.01, g.ratio * (direction === 'in' ? 1.2 : 1 / 1.2))),
      rect = viewport.getBoundingClientRect(),
      px = Number.isFinite(x) ? x - rect.left - rect.width / 2 : 0,
      py = Number.isFinite(y) ? y - rect.top - rect.height / 2 : 0;
    setState({
      ratio,
      cx: g.cx + (px / image.naturalWidth) * (1 / g.ratio - 1 / ratio),
      cy: g.cy + (py / image.naturalHeight) * (1 / g.ratio - 1 / ratio),
    });
  }
  async function update(change) {
    const p = items[focus],
      result = await patch(p, change);
    items = items.map((item) =>
      item.id === p.id
        ? { ...item, ...result, mediaId: item.mediaId, versionName: item.versionName }
        : item,
    );
    candidates = candidates.map((item) => (item.id === p.id ? { ...item, ...result } : item));
    marks();
  }
  async function details() {
    const token = generation,
      p = items[focus],
      panel = $('#review-details');
    panel.hidden = !(info || hist);
    $('#review-info').setAttribute('aria-pressed', String(info));
    $('#review-hist').setAttribute('aria-pressed', String(hist));
    if (panel.hidden) {
      panel.innerHTML = '';
      apply();
      return;
    }
    const exif = p.exif || {},
      rows = [
        ['胶卷', p.rollName],
        ['底片编号', p.rollCode],
        ['相机', exif.model || p.camera],
        ['镜头', exif.lens || p.lens],
        ['拍摄时间', exif.date || p.date],
        ['尺寸', exif.width && `${exif.width} × ${exif.height}`],
        ['ISO', exif.iso],
        ['光圈', exif.aperture && 'f/' + exif.aperture],
        [
          '快门',
          exif.exposure &&
            `${exif.exposure < 1 ? '1/' + Math.round(1 / exif.exposure) : exif.exposure}s`,
        ],
        ['标签', (p.tags || []).join(' · ')],
      ];
    panel.innerHTML = `<h3>${E(p.versionName || p.name)}</h3>${
      info
        ? `<dl class="detail-list">${rows
            .filter(([, v]) => v)
            .map(([k, v]) => `<div><dt>${k}</dt><dd>${E(v)}</dd></div>`)
            .join('')}</dl>`
        : ''
    }${hist ? '<canvas width="256" height="110" role="img" aria-label="显示影像 RGB 直方图"></canvas><small>显示影像 RGB 取样 · 不修改原片</small>' : ''}`;
    apply();
    if (hist) {
      try {
        let bins = histCache.get(p.mediaId);
        if (!bins) {
          const sourceImage = new Image();
          sourceImage.src = source(p, false);
          await sourceImage.decode();
          if (generation !== token || items[focus]?.mediaId !== p.mediaId) return;
          const scale = Math.min(
              1,
              512 / Math.max(sourceImage.naturalWidth, sourceImage.naturalHeight),
            ),
            canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(sourceImage.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(sourceImage.naturalHeight * scale));
          const context = canvas.getContext('2d', { willReadFrequently: true });
          context.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
          bins = histogramBins(context.getImageData(0, 0, canvas.width, canvas.height).data);
          if (histCache.size > 64) histCache.delete(histCache.keys().next().value);
          histCache.set(p.mediaId, bins);
        }
        const target = panel.querySelector('canvas');
        if (!target) return;
        const ctx = target.getContext('2d'),
          max = Math.max(1, ...bins.flat());
        ctx.clearRect(0, 0, 256, 110);
        ctx.globalCompositeOperation = 'screen';
        bins.forEach((channel, c) => {
          ctx.beginPath();
          ctx.moveTo(0, 110);
          channel.forEach((count, x) => ctx.lineTo(x, 110 - (count / max) * 105));
          ctx.lineTo(255, 110);
          ctx.closePath();
          ctx.fillStyle = ['#db676a88', '#70b57b88', '#6c9fd588'][c];
          ctx.fill();
        });
      } catch {
        const canvas = panel.querySelector('canvas');
        if (canvas)
          canvas.replaceWith(
            Object.assign(document.createElement('p'), { textContent: '此影像暂不支持直方图' }),
          );
      }
    }
  }
  async function step(delta) {
    if (stepping || !candidates.length) return;
    stepping = true;
    try {
      if (locked && items.length === 1) {
        items.push({ ...items[0] });
        states.push(fresh());
        focus = 1;
      }
      const slot = locked && focus === 0 && items.length > 1 ? 1 : focus,
        current = items[slot],
        position = candidates.findIndex((p) => p.id === current.id);
      let next = position + delta;
      if ((next < 0 || next >= candidates.length) && loadCandidates) {
        const page = await loadCandidates(delta);
        if (page?.length) {
          candidates = page;
          resultPage += delta;
          next = delta > 0 ? 0 : page.length - 1;
        } else {
          toast(delta > 0 ? '已到本次查询的最后一张' : '已到本次查询的第一张');
          return;
        }
      } else next = (next + candidates.length) % candidates.length;
      for (let i = 0; i < candidates.length; i++) {
        if (!items.some((p, index) => index !== slot && p.id === candidates[next].id)) break;
        next = (next + delta + candidates.length) % candidates.length;
      }
      items[slot] = { ...candidates[next] };
      states[slot] = fresh();
      focus = slot;
      render();
    } finally {
      stepping = false;
    }
  }
  async function action(name) {
    try {
      if (name === 'review-fit') zoom('fit');
      if (name === 'review-actual') zoom('actual');
      if (name === 'review-minus') zoom('out');
      if (name === 'review-plus') zoom('in');
      if (name === 'review-prev') await step(-1);
      if (name === 'review-next') await step(1);
      if (name === 'review-sync') {
        sync = !sync;
        if (sync) setState(states[focus]);
        marks();
        $('#review-sync').setAttribute('aria-pressed', String(sync));
      }
      if (name === 'review-lock') {
        locked = !locked;
        $('#review-lock').setAttribute('aria-pressed', String(locked));
      }
      if (name === 'review-info') {
        info = !info;
        details();
      }
      if (name === 'review-hist') {
        hist = !hist;
        details();
      }
      if (name === 'review-reject') await update({ rejected: !items[focus].rejected });
      if (name === 'review-wipe') {
        if (items.length !== 2) {
          toast('擦拭对照需要恰好两张照片或两个扫描版本');
          return;
        }
        wipe = !wipe;
        render();
      }
      if (name === 'review-winner') {
        winners.add(items[focus].id);
        if (items.length > 1) {
          items[0] = { ...items[focus] };
          states[0] = fresh();
          focus = 1;
          locked = true;
        }
        await step(1);
        marks();
      }
      if (name === 'review-save-winners') {
        if (!winners.size) winners.add(items[focus].id);
        await saveWinners([...winners]);
      }
      if (name === 'close-review') dialog.close();
    } catch (error) {
      toast(error.message, 'warning');
    }
  }
  dialog.onclick = (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (actionButton) {
      event.stopPropagation();
      action(actionButton.dataset.action);
      return;
    }
    const rating = event.target.closest('[data-review-rating]');
    if (rating) {
      const n = Number(rating.dataset.reviewRating);
      update({ rating: items[focus].rating === n ? 0 : n }).catch((e) =>
        toast(e.message, 'warning'),
      );
    }
  };
  $('#review-color').onchange = (e) =>
    update({ color: e.target.value }).catch((error) => toast(error.message, 'warning'));
  $('#wipe-range').oninput = (e) =>
    $('#review-grid').style.setProperty('--wipe', e.target.value + '%');
  const grid = $('#review-grid');
  grid.onpointerdown = (event) => {
    const pane = event.target.closest('[data-review-index]');
    if (!pane || event.button !== 0) return;
    choose(Number(pane.dataset.reviewIndex));
    const viewport = pane.querySelector('.review-viewport'),
      image = viewport.querySelector('img');
    viewport.focus();
    if (!image?.naturalWidth || !event.target.closest('.review-viewport')) return;
    const geometry = viewGeometry(
      image.naturalWidth,
      image.naturalHeight,
      viewport.clientWidth,
      viewport.clientHeight,
      states[focus],
    );
    if (!viewport.classList.contains('can-pan')) return;
    pan = {
      x: event.clientX,
      y: event.clientY,
      geometry,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
    grid.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  grid.onpointermove = (event) => {
    if (!pan) return;
    setState({
      ratio: pan.geometry.ratio,
      cx: pan.geometry.cx - (event.clientX - pan.x) / (pan.width * pan.geometry.ratio),
      cy: pan.geometry.cy - (event.clientY - pan.y) / (pan.height * pan.geometry.ratio),
    });
  };
  grid.onpointerup = grid.onpointercancel = () => (pan = null);
  grid.addEventListener(
    'wheel',
    (event) => {
      const pane = event.target.closest('[data-review-index]');
      if (!pane) return;
      event.preventDefault();
      choose(Number(pane.dataset.reviewIndex));
      zoom(event.deltaY < 0 ? 'in' : 'out', event.clientX, event.clientY);
    },
    { passive: false },
  );
  window.addEventListener('resize', apply);
  dialog.addEventListener('close', () => {
    generation++;
    grid.innerHTML = '';
    onClose();
  });
  return {
    open(rows, options = {}) {
      loadCandidates = options.loadCandidates;
      resultPage = options.page || 0;
      resultPages = options.pages || 1;
      items = rows.map((p) => ({ ...p }));
      candidates = (options.candidates || rows).map((p) => ({ ...p }));
      focus = 0;
      states = items.map(fresh);
      wipe = false;
      winners.clear();
      if (!dialog.open) dialog.showModal();
      render();
      grid.querySelector('.review-viewport')?.focus();
    },
    close() {
      dialog.close();
    },
    isOpen: () => dialog.open,
    current: () => items[focus],
    async key(event) {
      const key = event.key.toLowerCase();
      if (event.key === 'Tab' && document.activeElement.classList.contains('review-viewport')) {
        event.preventDefault();
        choose((focus + (event.shiftKey ? -1 : 1) + items.length) % items.length);
        $(`[data-review-index="${focus}"] .review-viewport`).focus();
        return;
      }
      const shortcuts = {
        f: 'review-fit',
        z: 'review-actual',
        i: 'review-info',
        h: 'review-hist',
        x: 'review-reject',
        '+': 'review-plus',
        '=': 'review-plus',
        '-': 'review-minus',
        arrowleft: 'review-prev',
        arrowright: 'review-next',
      };
      if (shortcuts[key]) {
        event.preventDefault();
        await action(shortcuts[key]);
      } else if (/^[0-5]$/.test(key)) {
        event.preventDefault();
        await update({
          rating: key === '0' ? 0 : items[focus].rating === Number(key) ? 0 : Number(key),
        });
      }
    },
  };
}
