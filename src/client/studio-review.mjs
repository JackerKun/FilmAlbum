import { viewGeometry, histogramBins } from '../shared/photo-core.mjs';
import { coordinateLabel, rollCoordinates } from '../shared/geolocation.mjs';
import { STOCKS } from '../shared/film-stocks.mjs';
import { leaflet, mapTiles } from './map-view.mjs';
const versionKinds = { scan: '扫描原版', rescan: '重扫', edit: '调色版本', export: '导出副本' };
const mediaStatuses = { ready: '可用', offline: '离线', missing: '缺失', unknown: '未检查' };

export function createReviewer({
  api,
  formatSize,
  rollStatus,
  toast,
  E,
  thumb,
  raw,
  patch,
  onClose,
  saveWinners,
  getMapTileURL,
}) {
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
    locationMap,
    mapDestination,
    states = [],
    generation = 0;
  const winners = new Set(),
    histCache = new Map(),
    prefetches = new Map();
  let pan,
    loadCandidates,
    stepping = false,
    resultPage = 0,
    resultPages = 1,
    reviewFilter = 'all';
  const fresh = () => ({ ratio: null, cx: 0.5, cy: 0.5 });
  const source = (p, full = false) =>
    p.mime?.startsWith('video/')
      ? raw(p.mediaId)
      : full &&
          ['ready', 'unknown'].includes(p.availability) &&
          [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif',
            'image/avif',
            'image/svg+xml',
          ].includes(p.mime)
        ? raw(p.mediaId)
        : thumb(p.mediaId, full ? 0 : 1600);
  function render() {
    const photo = items[focus];
    const token = ++generation,
      previous = $$('#review-grid .review-viewport');
    pan = null;
    $('#review-title').textContent =
      items.length === 1
        ? [
            photo?.rollName,
            photo?.frameNo && '第 ' + photo.frameNo + ' 格',
            photo?.versionName || '主版本',
          ]
            .filter(Boolean)
            .join(' · ')
        : items.length === 2
          ? '双图对比'
          : '四图对比';
    $('#review-grid').className =
      'review-grid ' +
      (items.length === 2 ? 'two' : items.length === 4 ? 'four' : '') +
      (wipe ? ' wipe' : '');
    $('#review-grid').innerHTML = items
      .map(
        (p, i) =>
          `<section class="review-pane ${i === focus ? 'focused' : ''}" data-review-index="${i}"><div class="review-viewport" tabindex="0" aria-label="审阅照片 ${i + 1}：${E(p.name)}">${p.mime?.startsWith('video/') ? `<video src="${raw(p.mediaId)}" controls playsinline></video>` : `<img class="review-image" alt="${E(p.name)}" draggable="false" hidden>`}</div><footer><span>${E(p.versionName || p.name)} · ${E(p.rollName || '')} ${E(p.frameNo || '')}${['offline', 'missing'].includes(p.availability) ? ' · 离线预览' : ''}</span><output></output></footer></section>`,
      )
      .join('');
    $$('#review-grid .review-pane').forEach((pane, i) => {
      const viewport = pane.querySelector('.review-viewport'),
        status = pane.querySelector('output'),
        oldImage = previous[i]?.querySelector('.review-image'),
        oldOutgoing = previous[i]?.querySelector('.review-outgoing'),
        url = source(items[i], states[i].ratio === 1);
      let image = viewport.querySelector('.review-image');
      if (!image) return;
      const reused = oldImage?.dataset.source === url && oldImage.dataset.failed !== '1';
      if (reused) {
        image.replaceWith(oldImage);
        image = oldImage;
        image.alt = items[i].name;
      }
      const outgoing =
        !reused && oldImage && !oldImage.hidden ? oldImage : image.hidden ? oldOutgoing : null;
      if (outgoing) {
        outgoing.getAnimations().forEach((animation) => animation.cancel());
        outgoing.className = 'review-outgoing';
        outgoing.setAttribute('aria-hidden', 'true');
        viewport.prepend(outgoing);
      }
      status.textContent = outgoing ? '正在载入下一张' : '载入中';
      image.onload = () => {
        if (token !== generation) return;
        apply();
      };
      image.onerror = () => {
        if (token !== generation) return;
        if (!image.dataset.fallback) {
          image.dataset.fallback = '1';
          image.src = thumb(items[i].mediaId, 640);
        } else {
          image.dataset.failed = '1';
          viewport.querySelector('.review-outgoing')?.remove();
          status.textContent = '原片离线 / 预览不可用';
          if (info && i === focus) drawHistogram();
        }
      };
      if (!reused) {
        image.dataset.source = url;
        image.src = url;
      }
    });
    $('#review-sync').setAttribute('aria-pressed', String(sync));
    $('#review-lock').setAttribute('aria-pressed', String(locked));
    $('#review-wipe').setAttribute('aria-pressed', String(wipe));
    $('#wipe-control').hidden = !wipe;
    marks();
    details();
    renderThumbs();
    const index = candidates.findIndex((candidate) => candidate.id === photo?.id);
    if (index >= 0) {
      for (const neighbor of [candidates[index - 1], candidates[index + 1]]) {
        if (!neighbor || neighbor.mime?.startsWith('video/')) continue;
        const url = source(neighbor);
        if (prefetches.has(url)) continue;
        if (prefetches.size >= 4) prefetches.delete(prefetches.keys().next().value);
        const preview = new Image();
        preview.fetchPriority = 'low';
        preview.src = url;
        prefetches.set(url, preview);
      }
    }
  }
  function visibleCandidates() {
    return candidates.filter(
      (p) =>
        reviewFilter === 'all' ||
        (reviewFilter === 'pending' && !p.rating && !p.rejected && !winners.has(p.id)) ||
        (reviewFilter === 'picked' && !p.rejected && (p.rating > 0 || winners.has(p.id))),
    );
  }
  function renderThumbs() {
    let strip = $('#review-result-thumbs');
    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'review-result-thumbs';
      strip.className = 'review-result-thumbs';
      $('#reviewer').insertBefore(strip, $('#reviewer').querySelector(':scope > footer'));
    }
    const shown = visibleCandidates().map((p) => ({ p, i: candidates.indexOf(p) }));
    strip.innerHTML = `<div class="review-thumb-heading"><b>此查询结果 · ${resultPage + 1} / ${resultPages}</b><button data-result-page="-1" ${resultPage === 0 ? 'disabled' : ''}>‹ 上页</button><button data-result-page="1" ${resultPage + 1 >= resultPages ? 'disabled' : ''}>下页 ›</button><select aria-label="缩略图选片筛选" data-review-filter><option value="all" ${reviewFilter === 'all' ? 'selected' : ''}>全部底片</option><option value="pending" ${reviewFilter === 'pending' ? 'selected' : ''}>未评选</option><option value="picked" ${reviewFilter === 'picked' ? 'selected' : ''}>已选</option></select></div><div class="review-thumb-track">${shown.map(({ p, i }) => `<button data-result-thumb="${i}" class="${items[focus]?.id === p.id && items[focus]?.mediaId === p.mediaId ? 'current' : ''}" aria-label="查看 ${E(p.name)}"><img src="${thumb(p.mediaId, 320)}" alt="${E(p.name)}" loading="lazy"><small>${E(p.frameNo || p.name)}${p.rejected ? ' · 淘汰' : p.rating || winners.has(p.id) ? ' · ★' : ''}${p.versionCount > 1 ? ' · ' + p.versionCount + ' 版' : ''}</small></button>`).join('')}</div>`;
    strip.querySelector('[data-review-filter]').onchange = (event) => {
      reviewFilter = event.target.value;
      renderThumbs();
      strip.querySelector('[data-review-filter]').focus();
    };
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
        image = viewport?.querySelector('.review-image');
      if (!image?.naturalWidth || (image.hidden && !image.complete)) return;
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
      if (image.hidden) {
        image.hidden = false;
        const outgoing = viewport.querySelector('.review-outgoing');
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) outgoing?.remove();
        else {
          const timing = { duration: 200, easing: 'ease-in-out' };
          image.animate([{ opacity: 0 }, { opacity: 1 }], timing);
          outgoing
            ?.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, fill: 'forwards' })
            .finished.then(
              () => outgoing.remove(),
              () => {},
            );
        }
        if (info && i === focus) drawHistogram();
      }
      viewport.classList.toggle(
        'can-pan',
        g.width > viewport.clientWidth || g.height > viewport.clientHeight,
      );
      viewport.closest('.review-pane').querySelector('output').textContent =
        Math.round(g.ratio * 100) + '%';
    });
  }
  function choose(index) {
    if (index === focus) return;
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
      image = viewport?.querySelector('.review-image');
    if (!image?.naturalWidth || image.hidden) return;
    if (direction === 'fit') return setState(fresh());
    if (direction === 'actual') {
      const targets = sync ? items.map((p, i) => i) : [focus];
      for (const i of targets) {
        if (['offline', 'missing'].includes(items[i].availability)) {
          toast('原片离线时仅能检查缓存预览，接回存储卷后可检查原像素', 'warning');
          continue;
        }
        const img = $(`[data-review-index="${i}"] .review-image`),
          url = source(items[i], true);
        if (img && img.getAttribute('src') !== url) {
          img.hidden = true;
          delete img.dataset.fallback;
          delete img.dataset.failed;
          img.dataset.source = url;
          img.closest('.review-pane').querySelector('output').textContent = '载入中';
          img.src = url;
        }
      }
      setState({ ratio: 1, cx: 0.5, cy: 0.5 });
      if (info) drawHistogram();
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
      result = await patch(p, change),
      updated = Object.fromEntries(Object.keys(change).map((key) => [key, result[key]]));
    const merge = (item) =>
      item.id === p.id ? { ...item, ...updated, version: result.version } : item;
    items = items.map(merge);
    candidates = candidates.map(merge);
    marks();
    renderThumbs();
    const photoSection = $('#review-details').querySelector('[data-review-photo]');
    if (photoSection && items[focus]?.id === p.id)
      photoSection.innerHTML = photoDetails(items[focus]);
  }
  function clearLocationMap() {
    locationMap?.remove();
    locationMap = null;
  }
  const photoCoordinates = (p) =>
    rollCoordinates(p) || rollCoordinates(p.exif) || p.rollCoordinates;

  async function showLocationMap(host, coordinates) {
    const status = host.nextElementSibling;
    try {
      const L = await leaflet();
      if (!host.isConnected || !dialog.open) return;
      const position = [coordinates.latitude, coordinates.longitude];
      locationMap = L.map(host, { scrollWheelZoom: false, maxZoom: 19 }).setView(position, 9);
      L.circleMarker(position, {
        radius: 6,
        color: '#fff0ba',
        weight: 2,
        fillColor: '#bd5a36',
        fillOpacity: 1,
      }).addTo(locationMap);
      locationMap.attributionControl.setPrefix(false);
      let hasTiles = false;
      mapTiles(L, getMapTileURL?.() || undefined)
        .on('tileload', () => {
          hasTiles = true;
          status.hidden = true;
        })
        .on('tileerror', () => {
          if (!hasTiles) status.hidden = false;
        })
        .addTo(locationMap);
    } catch {
      status.hidden = false;
    }
  }
  function detailList(rows) {
    return `<dl class="detail-list">${rows
      .filter(([, value]) => value !== '' && value != null)
      .map(([label, value]) => `<div><dt>${label}</dt><dd>${E(value)}</dd></div>`)
      .join('')}</dl>`;
  }
  function photoDetails(p) {
    return detailList([
      ['照片名称', p.name],
      ['底片边码 / 格号', p.frameNo || '—'],
      ['底片条', p.strip],
      ['拍摄地点', p.placeName],
      ['评分', p.rating ? p.rating + ' / 5' : '未评分'],
      [
        '色标',
        [...$('#review-color').options].find((option) => option.value === (p.color || ''))
          ?.textContent,
      ],
      ['选片', p.rejected ? '淘汰' : '保留'],
      ['照片标签', p.tags?.join(' · ') || '—'],
      ['备注', p.notes || '—'],
      ['文件类型', p.mime],
      ['文件大小', p.size ? formatSize(p.size) : ''],
      ['原片', mediaStatuses[p.availability] || p.availability],
    ]);
  }
  function rollDetails(roll) {
    const stock = STOCKS[roll.stock],
      physical = roll.physical || {};
    return detailList([
      ['胶卷名称', roll.name],
      ['底片编号', roll.code],
      ['胶片型号', stock ? [stock.brand, stock.name].filter(Boolean).join(' ') : roll.stock],
      ['胶片 ISO', stock?.iso],
      ['实际曝光指数 EI', roll.exposureIndex],
      ['冲洗方式', roll.processType],
      ['冲洗店家', roll.lab],
      ['画幅', roll.format],
      ['状态', rollStatus(roll.status)],
      ['相机', roll.camera],
      ['镜头', roll.lens],
      ['地点', roll.location],
      ['胶卷坐标', coordinateLabel(roll)],
      ['拍摄日期 / 年份', roll.date],
      ['日期精度', { day: '具体日期', month: '只确定月份', year: '大约年份' }[roll.datePrecision]],
      ['拍摄项目', roll.project],
      ['胶卷标签', roll.tags?.join(' · ')],
      ['冲洗记录', roll.process],
      ['归档备注', roll.notes],
      ['柜子 / 架位', physical.cabinet],
      ['盒子', physical.box],
      ['片册', physical.album],
      ['页码', physical.page],
      ['片袋 / 条号', physical.pocket],
    ]);
  }
  async function showRollDetails(host, rollId) {
    try {
      const roll = await api('/rolls/' + encodeURIComponent(rollId));
      if (host.isConnected) host.innerHTML = rollDetails(roll);
    } catch {
      if (host.isConnected)
        host.insertAdjacentHTML('beforeend', '<small>暂时无法读取完整胶卷档案</small>');
    }
  }
  async function showVersions(host, photo) {
    try {
      const path = '/photos/' + encodeURIComponent(photo.id) + (photo.deleted_at ? '?trash=1' : ''),
        versions = photo.versions || (await api(path)).versions;
      if (!host.isConnected) return;
      host.innerHTML = versions.length
        ? versions
            .map(
              (v) =>
                `<article class="review-version"><b>${E(v.name)}</b><p>${[
                  versionKinds[v.kind] || v.kind,
                  v.id === photo.primary_version ? '主版本' : '',
                  v.id === (photo.versionId || photo.primary_version) ? '当前预览' : '',
                  v.size ? formatSize(v.size) : '',
                  mediaStatuses[v.availability] || v.availability,
                ]
                  .filter(Boolean)
                  .map(E)
                  .join(' · ')}</p>${v.notes ? `<p>${E(v.notes)}</p>` : ''}</article>`,
            )
            .join('')
        : '<small>暂无扫描版本</small>';
    } catch {
      if (host.isConnected) host.textContent = '暂时无法读取扫描版本';
    }
  }
  function details() {
    const p = items[focus],
      panel = $('#review-details');
    clearLocationMap();
    panel.hidden = !info;
    $('#review-info').setAttribute('aria-expanded', String(info));
    if (panel.hidden || !p) {
      panel.replaceChildren();
      apply();
      return;
    }
    const exif = p.exif || {},
      rows = [
        ['相机', [exif.make, exif.model].filter(Boolean).join(' ') || p.camera],
        ['镜头', exif.lens || p.lens],
        ['拍摄日期', p.date || p.rollDate],
        [p.fileDateSource === 'scan' ? '文件 EXIF 时间（扫描件）' : '文件 EXIF 时间', exif.date],
        ['尺寸', exif.width && `${exif.width} × ${exif.height}`],
        ['ISO', exif.iso],
        ['光圈', exif.aperture && 'f/' + exif.aperture],
        [
          '快门',
          exif.exposure &&
            `${exif.exposure < 1 ? '1/' + Math.round(1 / exif.exposure) : exif.exposure}s`,
        ],
        ['焦距', exif.focalLength && exif.focalLength + ' mm'],
      ],
      coordinates = photoCoordinates(p),
      mapButton = p.roll_id
        ? '<button class="review-map-link" type="button" data-action="review-map" title="在回忆地图中查看此卷" aria-label="在回忆地图中查看此卷"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/></svg></button>'
        : '',
      roll = {
        name: p.rollName,
        code: p.rollCode,
        stock: p.stock,
        format: p.format,
        camera: p.camera,
        lens: p.lens,
        location: p.location,
        project: p.project,
        physical: p.physical,
        ...p.rollCoordinates,
      };
    panel.innerHTML = `<h3>${E(p.versionName || p.name)}</h3><p class="review-record-context">${[p.rollName, p.frameNo && '第 ' + p.frameNo + ' 格'].filter(Boolean).map(E).join(' · ')}</p><details open><summary>EXIF</summary>${detailList(rows)}</details><section><h4>直方图</h4><canvas width="256" height="110" role="img" aria-label="显示影像 RGB 直方图" hidden></canvas><small class="review-histogram-status"></small></section>${
      coordinates || mapButton
        ? `<section><h4 class="review-location-heading"><span>拍摄位置</span>${mapButton}</h4>${
            coordinates
              ? `<div class="review-location-map" aria-label="拍摄位置"></div><small hidden>底图暂不可用</small><p class="review-coordinates">${coordinateLabel(coordinates)}</p>`
              : '<small>未记录坐标</small>'
          }</section>`
        : ''
    }<section><h4>照片信息</h4><div data-review-photo>${photoDetails(p)}</div></section><details><summary>胶卷与胶片</summary><div data-review-roll>${rollDetails(roll)}</div></details><details><summary>扫描版本</summary><div data-review-versions><small>载入中</small></div></details>`;
    apply();
    drawHistogram();
    if (coordinates) showLocationMap(panel.querySelector('.review-location-map'), coordinates);
    if (p.roll_id) showRollDetails(panel.querySelector('[data-review-roll]'), p.roll_id);
    showVersions(panel.querySelector('[data-review-versions]'), p);
  }
  function drawHistogram() {
    const panel = $('#review-details'),
      target = panel.querySelector('canvas'),
      status = panel.querySelector('.review-histogram-status'),
      image = $(`[data-review-index="${focus}"] .review-image`);
    if (!target) return;
    target.hidden = true;
    status.hidden = false;
    if (!image || image.dataset.failed) {
      status.textContent = '此影像暂不支持直方图';
      return;
    }
    if (image.hidden) {
      status.textContent = '载入中';
      return;
    }
    try {
      const key = image.currentSrc;
      let bins = histCache.get(key);
      if (!bins) {
        const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight)),
          canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        bins = histogramBins(context.getImageData(0, 0, canvas.width, canvas.height).data);
        if (histCache.size >= 64) histCache.delete(histCache.keys().next().value);
        histCache.set(key, bins);
      }
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
      target.hidden = false;
      status.hidden = true;
    } catch {
      status.textContent = '此影像暂不支持直方图';
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
      const slot = locked && focus === 0 && items.length > 1 ? 1 : focus;
      const eligible = () =>
        visibleCandidates().filter(
          (candidate) => !items.some((item, index) => index !== slot && item.id === candidate.id),
        );
      let pool = eligible(),
        position = pool.findIndex((candidate) => candidate.id === items[slot].id),
        next = position < 0 ? (delta > 0 ? 0 : pool.length - 1) : position + delta;
      if (position < 0) {
        const current = candidates.findIndex((candidate) => candidate.id === items[slot].id);
        if (current >= 0) {
          const nextPhoto =
            delta > 0
              ? pool.find((candidate) => candidates.indexOf(candidate) > current)
              : pool.findLast((candidate) => candidates.indexOf(candidate) < current);
          next = nextPhoto ? pool.indexOf(nextPhoto) : delta > 0 ? pool.length : -1;
        }
      }
      if ((next < 0 || next >= pool.length) && loadCandidates) {
        const token = generation;
        for (;;) {
          const page = await loadCandidates(delta);
          if (!dialog.open || generation !== token) return;
          if (!page?.length) break;
          candidates = page;
          resultPage += delta;
          pool = eligible();
          next = delta > 0 ? 0 : pool.length - 1;
          if (pool.length) break;
        }
      } else if (pool.length) next = (next + pool.length) % pool.length;
      if (!pool[next]) {
        renderThumbs();
        toast('此方向没有更多符合条件的照片');
        return;
      }
      items[slot] = { ...pool[next] };
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
      if (name === 'review-map') {
        const photo = items[focus];
        mapDestination = { rollId: photo.roll_id, coordinates: photoCoordinates(photo) };
        dialog.close();
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
      image = viewport.querySelector('.review-image');
    viewport.focus();
    if (!image?.naturalWidth || image.hidden || !event.target.closest('.review-viewport')) return;
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
    prefetches.clear();
    clearLocationMap();
    $('#review-details').replaceChildren();
    grid.innerHTML = '';
    const destination = mapDestination;
    mapDestination = null;
    onClose(destination, { photo: items[focus], page: resultPage });
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
      reviewFilter = 'all';
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
      if (event.target.closest?.('.review-location-map')) return;
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
        h: 'review-info',
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
