import { STOCKS } from '../shared/film-stocks.mjs';
export function createBookLibrary({
  api,
  E,
  thumb,
  t,
  onAdd,
  onBatch,
  toast,
  getUsage = () => ({}),
  getSelected = () => [],
  onUse,
  onReplace,
}) {
  let root,
    filters = { dateSource: 'photo', sort: 'date' },
    items = [],
    total = 0,
    page = 0,
    loading = false,
    error = '',
    facets = {},
    lists = {},
    rollLabel = '',
    rollRows = [],
    rollQuery = '',
    rollTotal = 0,
    rollOpen = false,
    advanced = false,
    expanded = false,
    onlyUnused = false,
    selectionAnchor = null,
    loadedUsage = '',
    request = 0,
    rollRequest = 0,
    timer,
    rollTimer;
  const limit = 50,
    $ = (s) => root?.querySelector(s),
    option = (v, label, value) =>
      `<option value="${E(v)}" ${String(value || '') === String(v) ? 'selected' : ''}>${E(label)}</option>`;
  function select(key, label, rows) {
    return `<label>${label}<select data-book-filter="${key}">${['sort', 'dateSource'].includes(key) ? '' : option('', t('全部', 'All'), filters[key])}${rows.map(([v, l]) => option(v, l, filters[key])).join('')}</select></label>`;
  }
  const facetRows = (key) =>
    (facets[key] || []).map((r) => [
      r.value,
      key === 'stock' ? STOCKS[r.value]?.name || r.value : r.value,
    ]);
  function filterCount() {
    return Object.entries(filters).filter(([k, v]) => v && k !== 'sort' && k !== 'dateSource')
      .length;
  }
  function mount(node) {
    const filterScroll = root?.querySelector('.book-photo-filters')?.scrollTop || 0,
      resultScroll = root?.querySelector('.book-library-results')?.scrollTop || 0;
    root = node;
    root.classList.toggle('filters-expanded', expanded);
    root.innerHTML = `<div class="book-library-heading"><h3>${t('照片素材', 'Photo library')}</h3><button data-library="filters" title="展开筛选">筛选</button><button data-library="reset">${t('重置', 'Reset')}</button></div><form class="book-photo-filters"><input id="book-search" data-book-filter="query" type="search" value="${E(filters.query || '')}" placeholder="${t('搜索名称、编号、文字与标签', 'Search names, codes, text & tags')}" aria-label="${t('搜索照片素材', 'Search photo library')}"><label>${t('地点 · 省 / 市 / 县 / 街道', 'Location · region / city / street')}<input data-book-filter="place" value="${E(filters.place || '')}" list="book-place-options" placeholder="${t('输入地点，可匹配部分名称', 'Type a full or partial place')}" type="search"></label><datalist id="book-place-options">${facetRows(
      'location',
    )
      .map(([v]) => `<option value="${E(v)}">`)
      .join(
        '',
      )}</datalist><div class="book-roll-filter"><label>${t('胶卷 · 名称 / 永久编号', 'Roll · name / archive code')}<input id="book-roll-search" type="search" value="${E(rollLabel || rollQuery)}" placeholder="${t('检索全部胶卷', 'Search all rolls')}" autocomplete="off" aria-expanded="${rollOpen}"></label><div id="book-roll-results" ${rollOpen ? '' : 'hidden'}></div><button type="button" data-library="clear-roll" ${filters.rollId ? '' : 'hidden'}>${t('取消此胶卷限制', 'Clear roll selection')}</button></div><div class="book-filter-pair"><label>${t('日期起', 'Date from')}<input type="date" data-book-filter="from" value="${E(filters.from || '')}"></label><label>${t('日期止', 'Date to')}<input type="date" data-book-filter="to" value="${E(filters.to || '')}"></label></div>${select(
      'dateSource',
      t('日期依据', 'Date source'),
      [
        ['photo', t('照片拍摄日期（无则用胶卷）', 'Photo date, fallback to roll')],
        ['roll', t('胶卷拍摄日期', 'Roll date')],
      ],
    )}<details class="book-library-advanced" ${advanced ? 'open' : ''}><summary>${t('更多组合筛选', 'More filters')} <span>${filterCount() || ''}</span></summary><div class="book-filter-pair">${select(
      'medium',
      t('胶片规格', 'Format'),
      [
        ['135', '135'],
        ['120', '120'],
        ['220', '220'],
        ['large', t('页片', 'Sheet film')],
      ],
    )}${select('stockType', t('色彩类型', 'Film type'), [
      ['bw', 'BW · 黑白'],
      ['color', 'Color · 彩色'],
    ])}</div>${select('stock', t('胶片型号', 'Film stock'), facetRows('stock'))}<div class="book-filter-pair">${select('camera', t('相机', 'Camera'), facetRows('camera'))}${select('lens', t('镜头', 'Lens'), facetRows('lens'))}</div><label>${t('照片标签（完整标签）', 'Photo tag (exact)')}<input data-book-filter="tag" list="book-tag-options" value="${E(filters.tag || '')}" placeholder="${t('如：街拍', 'e.g. street')}"></label><datalist id="book-tag-options">${facetRows(
      'tags',
    )
      .map(([v]) => `<option value="${E(v)}">`)
      .join('')}</datalist><div class="book-filter-pair">${select(
      'rating',
      t('最低评分', 'Minimum rating'),
      [
        ['unrated', t('未评分', 'Unrated')],
        ['1', '★ 1+'],
        ['2', '★ 2+'],
        ['3', '★ 3+'],
        ['4', '★ 4+'],
        ['5', '★ 5'],
      ],
    )}${select('color', t('色标', 'Color label'), [
      ['none', t('无', 'None')],
      ['red', t('红', 'Red')],
      ['yellow', t('黄', 'Yellow')],
      ['green', t('绿', 'Green')],
      ['blue', t('蓝', 'Blue')],
      ['purple', t('紫', 'Purple')],
    ])}</div><div class="book-filter-pair">${select('orientation', t('照片方向', 'Orientation'), [
      ['landscape', t('横向', 'Landscape')],
      ['portrait', t('竖向', 'Portrait')],
      ['square', t('方形', 'Square')],
    ])}${select('review', t('审阅状态', 'Review state'), [
      ['kept', t('未淘汰', 'Not rejected')],
      ['rejected', t('已淘汰', 'Rejected')],
    ])}</div>${select(
      'collectionId',
      t('收藏 / 智能集合', 'Collection'),
      (lists.collections || []).map((c) => [c.id, c.name]),
    )}${select(
      'projectId',
      t('策展项目', 'Project'),
      (lists.projects || []).map((p) => [p.id, p.name]),
    )}${select(
      'storageId',
      t('存储卷', 'Storage volume'),
      (lists.storages || []).map((s) => [s.id, s.name || s.id]),
    )}<div class="book-filter-pair">${select('availability', t('原片状态', 'Original status'), [
      ['ready', t('在线可用', 'Available')],
      ['offline', t('离线 / 缺失', 'Offline / missing')],
    ])}${select('minVersions', t('扫描版本', 'Scan versions'), [['2', t('多版本照片', 'Multiple versions')]])}</div></details>${select(
      'sort',
      t('排序', 'Sort'),
      [
        ['date', t('拍摄日期 · 新到旧', 'Date · newest first')],
        ['date-asc', t('拍摄日期 · 旧到新', 'Date · oldest first')],
        ['rating', t('评分优先', 'Highest rated')],
        ['frame', t('胶卷 / 格号', 'Roll / frame')],
        ['name', t('照片名称', 'Photo name')],
      ],
    )}<button class="book-filter-apply" type="submit">${t('应用组合筛选', 'Apply filters')}</button></form><div class="book-library-results" aria-live="polite"></div>`;
    if (onBatch) {
      const quick = document.createElement('div');
      quick.className = 'book-quick-filters';
      quick.append(
        root.querySelector('#book-search'),
        root.querySelector('.book-roll-filter'),
        root.querySelector('[data-book-filter=camera]').closest('label'),
      );
      root.querySelector('.book-library-heading').after(quick);
    }
    root.onclick = (e) => {
      const use = e.target.closest('[data-used-page]');
      if (use) {
        onUse?.(Number(use.dataset.usedPage) - 1);
        return;
      }
      const replace = e.target.closest('[data-replace-photo]');
      if (replace) {
        onReplace?.(replace.dataset.replacePhoto);
        return;
      }
      const photo = e.target.closest('[data-photo]');
      if (photo) {
        const id = photo.dataset.photo;
        const from = items.findIndex((p) => p.id === selectionAnchor),
          to = items.findIndex((p) => p.id === id);
        if (onBatch && e.shiftKey && from >= 0 && to >= 0)
          onBatch(items.slice(Math.min(from, to), Math.max(from, to) + 1));
        else {
          selectionAnchor = id;
          onAdd(id);
        }
        return;
      }
      const roll = e.target.closest('[data-library-roll]');
      if (roll) {
        const r = rollRows.find((r) => r.id === roll.dataset.libraryRoll);
        if (!r) return;
        filters.rollId = r.id;
        rollLabel = r.name + ' · ' + r.code;
        rollQuery = '';
        rollOpen = false;
        rollRequest++;
        page = 0;
        mount(root);
        load();
        return;
      }
      const a = e.target.closest('[data-library]')?.dataset.library;
      if (a === 'filters') {
        expanded = !expanded;
        root.classList.toggle('filters-expanded', expanded);
        return;
      }
      if (a === 'unused') {
        onlyUnused = !onlyUnused;
        page = 0;
        load();
        return;
      }
      if (a === 'reset') {
        clearTimeout(timer);
        clearTimeout(rollTimer);
        filters = { dateSource: 'photo', sort: 'date' };
        page = 0;
        rollLabel = '';
        rollQuery = '';
        rollOpen = false;
        rollRequest++;
        mount(root);
        load();
      }
      if (a === 'clear-roll') {
        delete filters.rollId;
        rollLabel = '';
        rollQuery = '';
        rollOpen = false;
        rollRequest++;
        page = 0;
        mount(root);
        load();
      }
      if (a === 'prev' && page) {
        page--;
        load();
      }
      if (a === 'next' && (page + 1) * limit < total) {
        page++;
        load();
      }
      if (a === 'retry') load();
    };
    root.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      clearTimeout(timer);
      page = 0;
      load();
    };
    root.oninput = (e) => {
      if (e.target.id === 'book-roll-search') {
        rollQuery = e.target.value;
        rollLabel = '';
        if (filters.rollId) {
          delete filters.rollId;
          page = 0;
          schedule();
        }
        clearTimeout(rollTimer);
        const generation = ++rollRequest;
        rollTimer = setTimeout(() => findRolls(rollQuery, generation), 250);
        return;
      }
      const k = e.target.dataset.bookFilter;
      if (k) {
        filters[k] = e.target.value;
        page = 0;
        schedule();
      }
    };
    root.onchange = (e) => {
      const k = e.target.dataset.bookFilter;
      if (k) {
        filters[k] = e.target.value;
        page = 0;
        schedule();
      }
    };
    root.querySelector('details').ontoggle = (e) => (advanced = e.target.open);
    root.ondragstart = (e) => {
      const p = e.target.closest('[data-photo]');
      if (p) {
        e.dataTransfer.setData('application/film-photo', p.dataset.photo);
        e.dataTransfer.effectAllowed = 'copy';
      }
    };
    showRolls();
    showResults();
    $('.book-photo-filters').scrollTop = filterScroll;
    $('.book-library-results').scrollTop = resultScroll;
    if (onlyUnused && Object.keys(getUsage()).sort().join(',') !== loadedUsage) {
      page = 0;
      load();
    }
  }
  function schedule() {
    const count = $('summary span');
    if (count) count.textContent = filterCount() || '';
    request++;
    loading = true;
    showResults();
    clearTimeout(timer);
    timer = setTimeout(load, 300);
  }
  async function findRolls(query, generation) {
    try {
      const result = await api(
        '/rolls?filter=' + encodeURIComponent(JSON.stringify({ query, limit: 8 })),
      );
      if (generation !== rollRequest) return;
      rollRows = result.items;
      rollTotal = result.total;
      rollOpen = true;
      showRolls();
    } catch (e) {
      if (generation === rollRequest) toast(e.message, 'warning');
    }
  }
  function showRolls() {
    const box = $('#book-roll-results');
    if (!box) return;
    box.hidden = !rollOpen;
    $('#book-roll-search').setAttribute('aria-expanded', String(rollOpen));
    box.innerHTML =
      rollRows
        .map(
          (r) =>
            `<button type="button" data-library-roll="${E(r.id)}"><b>${E(r.name)}</b><small>${E(r.code)} · ${E(r.location || '')} · ${r.frameCount} ${t('张', 'photos')}</small></button>`,
        )
        .join('') || `<p>${t('没有匹配的胶卷', 'No matching rolls')}</p>`;
    if (rollTotal > 8)
      box.innerHTML += `<small>${t('共', 'Total')} ${rollTotal} ${t('卷，继续输入以缩小范围', 'rolls · type more to narrow')}</small>`;
  }
  function showResults() {
    const box = $('.book-library-results');
    if (!box) return;
    const active = filterCount();
    const usage = getUsage(),
      chosen = getSelected();
    box.innerHTML = `<div class="book-library-count">${loading ? t('正在筛选…', 'Filtering…') : `${total.toLocaleString()} ${t('张匹配', 'matches')}`}<small>${t('点击添加 · 拖入指定照片框', 'Click to add · drop onto a frame')}</small>${onUse ? `<button data-library="unused" aria-pressed="${onlyUnused}">${onlyUnused ? '✓ 只看未使用' : '只看未使用'}</button>` : ''}</div>${error ? `<p class="book-library-error">${E(error)} <button data-library="retry">重试</button></p>` : ''}<div class="book-photo-list" ${loading ? 'aria-busy="true"' : ''}>${items.map((p) => `<article class="book-asset ${chosen.includes(p.id) ? 'picked' : ''}"><button data-photo="${E(p.id)}" draggable="true" title="${E([p.name, p.rollName, p.location, p.date].filter(Boolean).join(' · '))}" ${loading ? 'disabled' : ''}><img src="${thumb(p.mediaId, 320)}" draggable="false" loading="lazy" alt="${E(p.name)}"><span>${chosen.includes(p.id) ? '✓ ' : ''}${E(p.rollName)} · ${E(p.frameNo || '')}</span></button>${usage[p.id]?.length ? `<small>已用 ${usage[p.id].map((n) => `<button data-used-page="${n}">p.${n}</button>`).join(' ')}</small>` : ''}${onReplace ? `<button class="book-replace-link" data-replace-photo="${E(p.id)}">替换选中框</button>` : ''}</article>`).join('')}</div>${!loading && !error && !items.length ? '<p>没有匹配照片，试试减少筛选条件。</p>' : ''}<div class="book-photo-pagination"><button data-library="prev" aria-label="素材上一页" ${!page || loading ? 'disabled' : ''}>‹</button><span>${total ? page + 1 : 0} / ${Math.ceil(total / limit)}<small>每页 50 张</small></span><button data-library="next" aria-label="素材下一页" ${loading || (page + 1) * limit >= total ? 'disabled' : ''}>›</button></div>`;
  }
  async function load() {
    const generation = ++request;
    ((selectionAnchor = null), (loadedUsage = Object.keys(getUsage()).sort().join(',')));
    loading = true;
    error = '';
    showResults();
    try {
      if (filters.from && filters.to && filters.from > filters.to)
        throw Error(t('起始日期不能晚于结束日期', 'Start date must not follow end date'));
      const result = await api('/photos/query', {
        method: 'POST',
        body: {
          ...filters,
          page,
          limit,
          type: 'image',
          ...(onlyUnused ? { excludeIds: Object.keys(getUsage()) } : {}),
        },
      });
      if (generation !== request) return;
      items = result.items;
      total = result.total;
      if ($('.book-library-results')) $('.book-library-results').scrollTop = 0;
    } catch (e) {
      if (generation !== request) return;
      error = e.message;
      items = [];
      total = 0;
    } finally {
      if (generation === request) {
        loading = false;
        showResults();
      }
    }
  }
  return {
    mount,
    refresh: showResults,
    setFilters(next) {
      filters = { dateSource: 'roll', sort: 'frame', ...next };
      page = 0;
      if (root) mount(root);
      return load();
    },
    async matching() {
      const rows = [],
        snapshot = { ...filters };
      for (let index = 0; ; index++) {
        const result = await api(
          '/photos?filter=' +
            encodeURIComponent(
              JSON.stringify({ ...snapshot, page: index, limit: 50, type: 'image' }),
            ),
        );
        if (result.total > 1200)
          throw Error('一次最多选择 1200 张照片，请先按胶卷、项目或日期缩小范围');
        rows.push(...result.items);
        if (rows.length >= result.total || !result.items.length) return rows;
      }
    },
    visible: () => items.slice(),
    getPhoto: (id) => items.find((p) => p.id === id),
    async open(initialFilters = {}) {
      clearTimeout(timer);
      clearTimeout(rollTimer);
      request++;
      rollRequest++;
      filters = { dateSource: 'roll', sort: 'frame', ...initialFilters };
      onlyUnused = false;
      items = [];
      page = 0;
      total = 0;
      rollLabel = '';
      rollQuery = '';
      rollOpen = false;
      error = '';
      loading = false;
      try {
        const boot = await api('/bootstrap');
        facets = boot.facets || {};
        lists = boot.lists || {};
      } catch (e) {
        toast(e.message, 'warning');
      }
      if (root) mount(root);
      await load();
    },
    close() {
      request++;
      rollRequest++;
      clearTimeout(timer);
      clearTimeout(rollTimer);
      root = null;
    },
  };
}
