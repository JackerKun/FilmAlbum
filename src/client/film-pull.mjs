export function filmGeometry(format) {
  const medium = /^(120|220)(?:\b| ·)/.test(String(format)),
    pair = String(format).match(/6[×x](4\.5|6|7|9|12|17)/);
  return {
    medium,
    perforated: !medium,
    ratio: medium ? Number(pair?.[1] || 6) / 6 : 1.5,
    mechanism: medium ? 'backing-paper-takeup' : 'cassette-leader',
  };
}
export function mountFilmPull(container, rows, roll, { escape: E, stock = {}, open, inspect }) {
  const geometry = filmGeometry(roll?.format),
    medium = geometry.medium,
    key = 'film-pull:' + roll?.id;
  let amount = Number(sessionStorage.getItem(key) ?? 35),
    drag = null,
    suppress = false;
  container.innerHTML = `<section class="pull-studio ${medium ? 'pull120' : 'pull135'}" data-mechanism="${geometry.mechanism}" style="--frame-ratio:${geometry.ratio};--cassette:${stock.color || '#315747'};--label:${stock.color2 || '#e6c16f'}"><header><div><small>TACTILE FILM ARCHIVE</small><h2>${E(roll?.name || '胶片放映台')}</h2><p>拖动金色片头抽出胶片 · 单击查看档案 · 双击沉浸看片</p></div><button class="soft" id="pull-rewind">${medium ? '↶ 复位背纸' : '↶ 收卷'}</button></header><div class="pull-track"><div class="pull-cassette ${medium ? 'spool120' : ''}"><div class="cassette-cap"></div><div class="cassette-label"><small>${E(stock.brand || 'FILM')}</small><strong>${E(stock.name || 'ARCHIVE')}</strong><b>${E(stock.iso || '400')}</b><span>${medium ? '120 ROLL FILM' : '135 / COLOR NEGATIVE'}</span></div><div class="cassette-bottom"></div></div><div class="pull-window"><div class="pull-ribbon"><div class="pull-leader"><span>${medium ? '120 BACKING PAPER' : 'PULL TO DISCOVER'}</span><b>${medium ? '● → 卷向收片轴' : '← 拖动片头'}</b></div>${rows.map((p, i) => `<button class="pull-frame" data-film-id="${E(p.id)}"><span class="edge-code">${E(stock.brand || 'FILM')} ${E(stock.name || '')} • ${E(p.frameNo || String(i + 1))}${medium ? '' : 'A'}</span><img src="/api/v2/preview/${encodeURIComponent(p.mediaId)}?edge=640" alt="${E(p.name)}" draggable="false" loading="lazy"><span class="edge-number">${E(p.frameNo || String(i + 1))}${medium ? '' : 'A'} ▸ ${p.rating ? '★'.repeat(p.rating) : ''}</span></button>`).join('')}<span class="film-end">END / ${rows.length}</span></div></div><button class="pull-tab" id="film-pull-tab" aria-label="${medium ? '拖动收片轴卷动 120 背纸' : '拖动片头抽出 135 胶片'}">${medium ? '<i class="takeup-flange"></i><b>↻</b><span>TAKE-UP</span>' : '⠿<span>PULL</span>'}</button></div><footer><span>${E(roll?.code || '')} · ${E(roll?.format || '')} · 本页 ${rows.length} 格</span><label>${medium ? '卷片' : '抽拉'} <input id="film-pull-range" type="range" min="0" max="100" value="${amount}" aria-label="${medium ? '120 卷片展开比例' : '135 抽出比例'}"><output id="pull-amount"></output></label><button class="soft" id="pull-full">${medium ? '卷至收片轴 →' : '完全展开 →'}</button></footer><p class="pull-tip">${medium ? '120 是无齿孔宽胶片与背纸，从供片轴卷向收片轴；画幅比例随 6×4.5 / 6×6 / 6×7 等变化。复位仅为界面演示。' : '135 从暗盒抽出带双排齿孔的胶片；可收回暗盒。'} 展开后横向拖动浏览，双击底片看片。</p></section>`;
  const root = container.querySelector('.pull-studio'),
    window = root.querySelector('.pull-window'),
    ribbon = root.querySelector('.pull-ribbon'),
    tab = root.querySelector('#film-pull-tab'),
    range = root.querySelector('#film-pull-range');
  function apply() {
    const room = Math.max(100, root.querySelector('.pull-track').clientWidth - 160),
      width = 88 + (amount / 100) * (room - 88);
    root.style.setProperty('--pull-width', width + 'px');
    root.style.setProperty('--winding', amount * 9 + 'deg');
    root.style.setProperty('--takeup-size', (0.65 + amount / 220).toFixed(3));
    range.value = amount;
    root.querySelector('#pull-amount').textContent = Math.round(amount) + '%';
    sessionStorage.setItem(key, String(amount));
  }
  range.oninput = () => {
    amount = Number(range.value);
    apply();
  };
  root.querySelector('#pull-full').onclick = () => {
    amount = 100;
    apply();
  };
  root.querySelector('#pull-rewind').onclick = () => {
    amount = 0;
    window.scrollLeft = 0;
    apply();
  };
  tab.onpointerdown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag = { x: e.clientX, y: e.clientY, amount };
    tab.setPointerCapture(e.pointerId);
    root.classList.add('pulling');
  };
  tab.onpointermove = (e) => {
    if (!drag) return;
    const room = Math.max(100, root.querySelector('.pull-track').clientWidth - 248);
    amount = Math.max(
      0,
      Math.min(
        100,
        drag.amount +
          ((e.clientX - drag.x + (medium ? (e.clientY - drag.y) * 0.65 : 0)) / room) * 100,
      ),
    );
    apply();
  };
  tab.onpointerup = tab.onpointercancel = () => {
    drag = null;
    root.classList.remove('pulling');
  };
  let pan;
  window.onpointerdown = (e) => {
    if (e.button === 0) pan = { x: e.clientX, left: window.scrollLeft, moved: false };
  };
  window.onpointermove = (e) => {
    if (!pan) return;
    const dx = e.clientX - pan.x;
    if (Math.abs(dx) > 5) {
      pan.moved = true;
      window.setPointerCapture(e.pointerId);
      window.scrollLeft = pan.left - dx;
    }
  };
  window.onpointerup = window.onpointercancel = () => {
    suppress = Boolean(pan?.moved);
    pan = null;
    setTimeout(() => (suppress = false), 0);
  };
  window.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        window.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    },
    { passive: false },
  );
  let timer;
  ribbon.onclick = (e) => {
    const b = e.target.closest('[data-film-id]');
    if (!b || suppress) return;
    clearTimeout(timer);
    timer = setTimeout(() => inspect(b.dataset.filmId), 220);
  };
  ribbon.ondblclick = (e) => {
    const b = e.target.closest('[data-film-id]');
    if (!b) return;
    clearTimeout(timer);
    open(b.dataset.filmId);
  };
  const observer = new ResizeObserver(apply);
  observer.observe(root);
  requestAnimationFrame(() => (container.scrollTop = 0));
  new MutationObserver((_, o) => {
    if (!root.isConnected) {
      observer.disconnect();
      o.disconnect();
    }
  }).observe(container, { childList: true });
  apply();
}
