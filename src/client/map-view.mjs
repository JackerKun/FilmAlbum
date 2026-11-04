import { rollCoordinates, rollPosition, coordinateLabel } from '../shared/geolocation.mjs';
import { STOCKS } from '../shared/film-stocks.mjs';
export const COUNTRY_VIEWS = {
  CN: {
    center: [35, 104],
    zoom: 4,
    bounds: [
      [17.5, 73],
      [54, 135.5],
    ],
  },
  WORLD: { center: [25, 12], zoom: 2 },
  JP: { center: [37, 138], zoom: 5 },
  US: { center: [39, -98], zoom: 4 },
  CA: { center: [57, -106], zoom: 3 },
  GB: { center: [55, -3], zoom: 5 },
  FR: { center: [47, 2], zoom: 5 },
  DE: { center: [51, 10], zoom: 5 },
  IT: { center: [42.5, 12.5], zoom: 5 },
  AU: { center: [-25, 134], zoom: 4 },
  NZ: { center: [-41, 174], zoom: 5 },
  IS: { center: [65, -19], zoom: 6 },
  KR: { center: [36, 128], zoom: 6 },
  TH: { center: [15, 101], zoom: 5 },
  VN: { center: [16, 107], zoom: 5 },
  SG: { center: [1.35, 103.8], zoom: 11 },
  IN: { center: [22, 80], zoom: 4 },
  CH: { center: [47, 8], zoom: 7 },
  NO: { center: [65, 14], zoom: 4 },
  ES: { center: [40, -4], zoom: 5 },
  PT: { center: [39.5, -8], zoom: 6 },
  BR: { center: [-14, -52], zoom: 4 },
};
const CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
    ' ',
  );
export function countryOptions(locale = 'zh-CN') {
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  return CODES.map((code) => ({ code, name: names.of(code) })).sort((a, b) =>
    a.name.localeCompare(b.name, locale),
  );
}
let loading;
async function leaflet() {
  if (window.L) return window.L;
  loading ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/leaflet.js';
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(Error('地图组件无法加载'));
    document.head.append(script);
  });
  return loading;
}
export function createAtlas({
  api,
  E,
  thumb,
  toast,
  inspectRoll,
  openRoll,
  savePosition,
  onFilterChange = () => {},
  onAdvancedFilters = () => {},
}) {
  let map,
    markers,
    host,
    currentFilter = {},
    settings = {},
    selectedRoll = null,
    draft = null,
    draftMarker = null,
    sequence = 0,
    rollSequence = 0,
    pointSequence = 0,
    mountId = 0,
    disposed = false,
    requestTimer,
    searchSequence = 0,
    searchMode = 'places',
    placeQuery = '',
    rollQuery = '',
    facets = {},
    resizeObserver;
  const preview = (r, photos) =>
    `<header><b data-user-content>${E(r.name)}</b><code>${E(r.code)}</code></header><div class="atlas-preview-images">${
      photos
        .slice(0, 8)
        .map((p) => `<img src="${thumb(p.mediaId, 320)}" alt="${E(p.name)}" loading="lazy">`)
        .join('') || '<p>此卷尚无照片</p>'
    }</div><small data-atlas-location>${E(positionText(r))} · ${r.frameCount ?? photos.length} 格</small>`;
  function positionText(roll) {
    const position = rollPosition(roll);
    return position.kind === 'located'
      ? '已定位 · ' + (position.place || '已保存坐标') + ' · ' + coordinateLabel(roll)
      : position.kind === 'name-only'
        ? '未定位（尚无完整坐标） · ' + position.place
        : '未定位 · 尚未记录坐标';
  }
  async function details(id) {
    const [roll, result] = await Promise.all([
      api('/rolls/' + encodeURIComponent(id)),
      api(
        '/photos?filter=' +
          encodeURIComponent(JSON.stringify({ rollId: id, limit: 8, sort: 'frame' })),
      ),
    ]);
    return { roll: { ...roll, frameCount: result.total }, photos: result.items };
  }
  async function showRoll(id, assign = false) {
    const token = ++rollSequence,
      data = await details(id);
    if (disposed || token !== rollSequence) return;
    const panel = host.querySelector('#atlas-roll-preview');
    panel.hidden = false;
    panel.innerHTML =
      preview(data.roll, data.photos) +
      `<div class="atlas-preview-actions"><button data-atlas="open-roll">查看整卷</button><button data-atlas="inspect-roll">查看档案</button><button data-atlas="place">${rollCoordinates(data.roll) ? '修改定位' : '为这卷定位'}</button><button data-atlas="dismiss">关闭</button></div><div id="atlas-position-draft"></div>`;
    selectedRoll = data.roll;
    panel.onclick = async (e) => {
      const a = e.target.closest('[data-atlas]')?.dataset.atlas;
      if (a === 'open-roll') openRoll(id);
      if (a === 'inspect-roll') inspectRoll(id);
      if (a === 'place') activatePlacement();
      if (a === 'dismiss') {
        selectedRoll = null;
        draft = null;
        panel.hidden = true;
        draftMarker?.remove();
        draftMarker = null;
        map.getContainer().classList.remove('placing');
      }
      if (a === 'save-point') await commit();
      if (a === 'cancel-point') {
        draft = null;
        draftMarker?.remove();
        draftMarker = null;
        host.querySelector('#atlas-position-draft').innerHTML = '';
        map.getContainer().classList.remove('placing');
      }
    };
    const coordinates = rollCoordinates(data.roll);
    if (coordinates) {
      if (assign && map.getZoom() < 10)
        map.setView([coordinates.latitude, coordinates.longitude], 10);
      else map.panTo([coordinates.latitude, coordinates.longitude]);
    }
    if (assign) activatePlacement();
  }
  function activatePlacement() {
    draft = null;
    map.getContainer().classList.add('placing');
    host.querySelector('#atlas-position-draft').innerHTML =
      '<p class="atlas-placement-hint">正在定位上方这卷照片。请缩放到县城或街道，在地图点击拍摄位置，再确认保存。</p>';
  }
  async function point(latlng) {
    if (!selectedRoll || !map.getContainer().classList.contains('placing')) return;
    const version = ++pointSequence;
    draft = { latitude: latlng.lat, longitude: latlng.lng };
    draftMarker?.remove();
    draftMarker = window.L.circleMarker(latlng, {
      radius: 9,
      color: '#d75b3c',
      fillColor: '#ed9679',
      fillOpacity: 0.8,
    }).addTo(map);
    const target = host.querySelector('#atlas-position-draft');
    target.innerHTML = `<p>${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)} · WGS84</p><label>拍摄地点（省 / 市 / 县 / 街道）<input id="atlas-location-name" value="${E(selectedRoll.location || '')}" placeholder="可手工填写县、镇、街道"></label><button data-atlas="save-point">确认保存到此卷</button><button data-atlas="cancel-point">取消落点</button><button id="atlas-reverse" type="button">识别附近地名</button><p class="atlas-service-note">只有点击识别才查询在线地名；原片与照片资料不会上传。</p>`;
    target.querySelector('#atlas-reverse').onclick = async () => {
      try {
        const rows = await api(
          '/places?' + new URLSearchParams({ reverse: '1', lat: latlng.lat, lon: latlng.lng }),
        );
        if (version !== pointSequence) return;
        const row = rows[0];
        if (row) target.querySelector('#atlas-location-name').value = row.label;
        else toast('附近暂无地名，可手工填写');
      } catch (e) {
        toast(e.message, 'warning');
      }
    };
  }
  async function commit() {
    if (!draft || !selectedRoll) return;
    const patch = { ...draft, location: host.querySelector('#atlas-location-name').value };
    try {
      const saved = await savePosition(selectedRoll, patch);
      selectedRoll = { ...selectedRoll, ...saved };
      host.querySelector('[data-atlas-location]').textContent =
        positionText(selectedRoll) + ' · ' + selectedRoll.frameCount + ' 格';
      host.querySelector('[data-atlas=place]').textContent = '修改定位';
      draft = null;
      draftMarker?.remove();
      draftMarker = null;
      map.getContainer().classList.remove('placing');
      host.querySelector('#atlas-position-draft').innerHTML = '<p>✓ 已保存拍摄地点与坐标</p>';
      toast('已为预览中的胶卷保存位置');
      await clusters();
    } catch (e) {
      toast(e.message, 'warning');
    }
  }
  async function clusters() {
    if (!map || disposed) return;
    const seq = ++sequence,
      b = map.getBounds();
    const result = await api(
      '/atlas?filter=' +
        encodeURIComponent(
          JSON.stringify({
            ...currentFilter,
            zoom: map.getZoom(),
            bounds: {
              west: Math.max(-180, b.getWest()),
              east: Math.min(180, b.getEast()),
              south: Math.max(-90, b.getSouth()),
              north: Math.min(90, b.getNorth()),
            },
          }),
        ),
    );
    if (disposed || seq !== sequence) return;
    markers.clearLayers();
    for (const c of result.clusters) {
      const marker = window.L.circleMarker([c.latitude, c.longitude], {
        radius: c.count > 1 ? Math.min(22, 10 + Math.log2(c.count) * 2) : 7,
        color: '#fff',
        weight: 2,
        fillColor: c.count > 1 ? '#806d3c' : '#3e6554',
        fillOpacity: 0.95,
      }).addTo(markers);
      marker.bindTooltip(c.count > 1 ? `${c.count} 卷胶片` : E(c.name), { direction: 'top' });
      marker.on('click', async () => {
        try {
          if (c.count === 1) return await showRoll(c.id);
          if (map.getZoom() < 17)
            return map.setView([c.latitude, c.longitude], Math.min(19, map.getZoom() + 2));
          const cell = 360 / 2 ** (map.getZoom() + 3),
            r = await api(
              '/rolls?filter=' +
                encodeURIComponent(
                  JSON.stringify({
                    ...currentFilter,
                    bounds: {
                      west: c.longitude - cell,
                      east: c.longitude + cell,
                      south: c.latitude - cell,
                      north: c.latitude + cell,
                    },
                    limit: 200,
                  }),
                ),
            ),
            box = host.querySelector('#atlas-search-results');
          box.hidden = false;
          box.innerHTML =
            '<p>此处胶卷（点击预览）</p>' +
            r.items
              .map(
                (roll) =>
                  `<button data-map-roll="${E(roll.id)}">${roll.coverMedia ? `<img src="${thumb(roll.coverMedia, 320)}" alt="">` : ''}<b>${E(roll.name)}</b><small>${E(roll.code)}</small></button>`,
              )
              .join('');
          box.onclick = (e) => {
            const button = e.target.closest('[data-map-roll]');
            if (button) {
              box.hidden = true;
              box.innerHTML = '';
              showRoll(button.dataset.mapRoll).catch((e) => toast(e.message));
            }
          };
        } catch (e) {
          toast(e.message);
        }
      });
    }
    host.querySelector('#atlas-count').textContent =
      `当前视野 ${result.total} 卷 · ${result.clusters.length} 个位置 · 缩放 ${map.getZoom()} / 19`;
  }
  function reset() {
    const config =
      settings.mapDefaultView ||
      COUNTRY_VIEWS[settings.mapDefaultCountry || 'CN'] ||
      COUNTRY_VIEWS.CN;
    if (config.bounds) map.fitBounds(config.bounds, { padding: [12, 12] });
    else map.setView(config.center, config.zoom);
  }
  function activeFilters() {
    const names = {
      query: '胶卷',
      year: '年份',
      stock: '胶片',
      camera: '相机',
      lens: '镜头',
      location: '地点',
      from: '从',
      to: '至',
      format: '规格',
      medium: '规格',
      stockType: '类型',
      project: '项目',
      tag: '标签',
      semantic: '语义检索',
      rules: '组合条件',
      rollId: '指定胶卷',
      collectionId: '收藏范围',
      rating: '评分',
      review: '审阅',
      type: '影像',
      color: '色标',
    };
    return Object.entries(currentFilter)
      .filter(
        ([key, value]) =>
          names[key] && value && value !== 'all' && (key !== 'rules' || value.conditions?.length),
      )
      .map(([key, value]) => ({
        key,
        label:
          names[key] +
          (key === 'semantic'
            ? ''
            : key === 'rules'
              ? ' ' + value.conditions.length
              : key === 'rollId' || key === 'collectionId'
                ? ''
                : ' · ' + (key === 'stock' ? STOCKS[value]?.name || value : String(value))),
      }));
  }
  function syncFilters() {
    const entries = activeFilters(),
      chips = host.querySelector('#atlas-filter-chips');
    chips.hidden = !entries.length;
    chips.innerHTML =
      entries
        .map(
          ({ key, label }) =>
            `<button type="button" data-clear-map-filter="${E(key)}" aria-label="移除${E(label)}">${E(label)} <span aria-hidden="true">×</span></button>`,
        )
        .join('') +
      (entries.length
        ? '<button type="button" data-map-reset class="atlas-clear-all">清除全部</button>'
        : '');
    host.querySelector('#atlas-filter-count').textContent = entries.length || '';
    for (const key of ['year', 'stock'])
      host.querySelector('[data-atlas-filter="' + key + '"]').value = currentFilter[key] || '';
  }
  async function changeFilters(patch, resetAll = false) {
    currentFilter = resetAll ? {} : { ...currentFilter, ...patch };
    for (const key of Object.keys(currentFilter))
      if (!currentFilter[key]) delete currentFilter[key];
    if (resetAll || Object.hasOwn(patch, 'query')) rollQuery = currentFilter.query || '';
    if (searchMode === 'rolls') host.querySelector('#atlas-place-query').value = rollQuery;
    syncFilters();
    onFilterChange({ ...currentFilter });
    await clusters();
  }
  function switchMode(mode) {
    const input = host.querySelector('#atlas-place-query');
    if (searchMode === 'places') placeQuery = input.value;
    else rollQuery = input.value;
    searchMode = mode;
    searchSequence++;
    const target = host.querySelector('#atlas-search-results');
    target.hidden = true;
    target.innerHTML = '';
    for (const b of host.querySelectorAll('[data-map-search-mode]'))
      b.setAttribute('aria-pressed', String(b.dataset.mapSearchMode === mode));
    input.value = mode === 'places' ? placeQuery : rollQuery;
    input.placeholder =
      mode === 'places' ? '省 / 市 / 县 / 街道，如：浙江省德清县' : '胶卷名称、编号、相机、标签…';
    input.setAttribute('aria-label', mode === 'places' ? '搜索地图地名' : '搜索地图胶卷');
    input.focus();
  }
  async function search() {
    const input = host.querySelector('#atlas-place-query'),
      q = input.value.trim(),
      target = host.querySelector('#atlas-search-results'),
      token = ++searchSequence,
      mode = searchMode;
    host.querySelector('#atlas-map-filters').open = false;
    target.hidden = false;
    target.innerHTML =
      '<div class="atlas-search-heading">' +
      (mode === 'places' ? '正在查找地名…' : '正在检索胶卷…') +
      '</div>';
    try {
      if (mode === 'places') {
        placeQuery = q;
        if (!q) {
          target.hidden = true;
          return;
        }
        const rows = await api(
          '/places?' +
            new URLSearchParams({
              q,
              country:
                settings.mapDefaultCountry === 'WORLD' ? '' : settings.mapDefaultCountry || 'CN',
            }),
        );
        if (disposed || token !== searchSequence) return;
        target.innerHTML =
          '<div class="atlas-search-heading"><span>地名结果 · 选择后移动地图</span><button type="button" data-close-map-results aria-label="关闭搜索结果">×</button></div>' +
          rows
            .map(
              (r, i) =>
                `<button type="button" data-place-result="${i}"><span class="atlas-result-pin" aria-hidden="true">⌖</span><span><b>${E(r.name)}</b><small>${E(r.label)}</small></span></button>`,
            )
            .join('') +
          (rows.length ? '' : '<p>没有匹配地名，试试加上省、市名称。</p>');
        target.onclick = (e) => {
          if (e.target.closest('[data-close-map-results]')) {
            target.hidden = true;
            return;
          }
          const item = e.target.closest('[data-place-result]');
          if (!item) return;
          const r = rows[Number(item.dataset.placeResult)];
          map.setView([r.latitude, r.longitude], r.county || /县|区|镇/.test(q) ? 12 : 10);
          target.hidden = true;
        };
      } else {
        rollQuery = q;
        await changeFilters({ query: q });
        if (disposed || token !== searchSequence) return;
        const result = await api(
          '/rolls?filter=' + encodeURIComponent(JSON.stringify({ ...currentFilter, limit: 8 })),
        );
        if (disposed || token !== searchSequence) return;
        target.innerHTML =
          '<div class="atlas-search-heading"><span>' +
          result.total +
          ' 卷匹配 · 点击预览</span><button type="button" data-close-map-results aria-label="关闭搜索结果">×</button></div>' +
          result.items
            .map(
              (r) =>
                `<button type="button" data-map-roll="${E(r.id)}">${r.coverMedia ? `<img src="${thumb(r.coverMedia, 320)}" alt="">` : '<span class="atlas-result-pin" aria-hidden="true">◉</span>'}<span><b data-user-content>${E(r.name)}</b><small>${E(r.code)} · ${E(r.location || '未记录地点')} · ${r.frameCount} 格</small></span></button>`,
            )
            .join('') +
          (result.total > 8
            ? '<p>仅显示前 8 卷，请补充关键词或筛选条件。</p>'
            : result.total
              ? ''
              : '<p>没有匹配胶卷，试试减少筛选条件。</p>');
        target.onclick = (e) => {
          if (e.target.closest('[data-close-map-results]')) {
            target.hidden = true;
            return;
          }
          const button = e.target.closest('[data-map-roll]');
          if (button) {
            target.hidden = true;
            showRoll(button.dataset.mapRoll).catch((e) => toast(e.message));
          }
        };
      }
    } catch (e) {
      if (!disposed && token === searchSequence) target.textContent = e.message;
    }
  }
  function outsideToolbar(e) {
    if (!host?.contains(e.target) || !e.target.closest('.atlas-filter-wrap')) {
      const details = host?.querySelector('#atlas-map-filters');
      if (details) details.open = false;
    }
  }
  return {
    async mount(
      container,
      { filter = {}, facets: availableFacets = {}, preferences = {}, focusId, assignId, view } = {},
    ) {
      const generation = ++mountId;
      disposed = false;
      host = container;
      currentFilter = { ...filter };
      settings = preferences;
      facets = availableFacets;
      rollQuery = currentFilter.query || '';
      host.innerHTML = `<div class="atlas-workbench"><div class="atlas-toolbar" role="search" aria-label="地图搜索与筛选"><div class="atlas-search-mode" role="group" aria-label="搜索用途"><button type="button" data-map-search-mode="places" aria-pressed="${searchMode === 'places'}">查地点</button><button type="button" data-map-search-mode="rolls" aria-pressed="${searchMode === 'rolls'}">找胶卷</button></div><div class="atlas-unified-search"><span aria-hidden="true">⌕</span><input id="atlas-place-query" type="search" autocomplete="off" value="${E(searchMode === 'places' ? placeQuery : rollQuery)}" placeholder="${searchMode === 'places' ? '省 / 市 / 县 / 街道，如：浙江省德清县' : '胶卷名称、编号、相机、标签…'}" aria-label="${searchMode === 'places' ? '搜索地图地名' : '搜索地图胶卷'}"><button type="button" id="atlas-place-search" aria-label="执行地图搜索" title="搜索 · Enter">↵</button></div><div class="atlas-filter-wrap"><details id="atlas-map-filters"><summary aria-controls="atlas-filter-panel">☷ <span>筛选</span><b id="atlas-filter-count"></b></summary><div id="atlas-filter-panel" class="atlas-filter-panel"><header><b>筛选胶卷</b><button type="button" data-map-close-filters aria-label="收起地图筛选">×</button></header><label>拍摄年份<select data-atlas-filter="year"><option value="">全部年份</option>${(facets.years || []).map((r) => `<option value="${E(r.value)}">${E(r.value)}</option>`).join('')}</select></label><label>胶片型号<select data-atlas-filter="stock"><option value="">全部胶片</option>${(facets.stock || []).map((r) => `<option value="${E(r.value)}">${E(STOCKS[r.value]?.name || r.value)}</option>`).join('')}</select></label><p>条件只筛选档案，不改变地名查找范围。</p><footer><button type="button" id="atlas-advanced-filters">更多组合条件…</button><button type="button" data-map-reset>重置</button></footer></div></details></div></div><div id="atlas-filter-chips" class="atlas-filter-chips" aria-label="已应用的地图筛选" hidden></div><div class="atlas-stage"><div id="atlas-detailed-map" aria-label="可缩放至县城与街道的胶卷地图"></div><div id="atlas-search-results" hidden></div><div class="atlas-view-controls" role="group" aria-label="地图视野"><button type="button" id="atlas-home" title="返回设置中的默认国家">⌂ 默认区域</button><button type="button" id="atlas-world">◎ 全球</button></div><aside id="atlas-roll-preview" class="atlas-roll-preview" hidden></aside></div><div class="atlas-bottom"><span id="atlas-count">正在读取拍摄位置…</span><span id="atlas-tile-status">WGS84 · 联网底图</span></div></div>`;
      const L = await leaflet();
      if (disposed || generation !== mountId) return;
      map = L.map(host.querySelector('#atlas-detailed-map'), {
        minZoom: 2,
        maxZoom: 19,
        worldCopyJump: false,
        maxBounds: [
          [-85, -180],
          [85, 180],
        ],
      });
      markers = L.layerGroup().addTo(map);
      resizeObserver = new ResizeObserver(() => {
        if (map && !disposed) map.invalidateSize({ pan: false });
      });
      resizeObserver.observe(host.querySelector('.atlas-stage'));
      const tileURL = settings.mapTileURL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
      const tiles = L.tileLayer(tileURL, {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
      }).addTo(map);
      let failures = 0;
      tiles.on('tileerror', () => {
        if (++failures > 2)
          host.querySelector('#atlas-tile-status').textContent =
            '底图网络暂不可达，可在设置更换服务；坐标落点仍可用。';
      });
      tiles.on('load', () => {
        if (failures === 0)
          host.querySelector('#atlas-tile-status').textContent = 'WGS84 · 县城 / 街道';
      });
      if (view) map.setView(view.center, view.zoom);
      else reset();
      map.on('moveend', () => {
        clearTimeout(requestTimer);
        requestTimer = setTimeout(() => clusters().catch((e) => toast(e.message)), 160);
      });
      map.on('click', (e) => point(e.latlng).catch((e) => toast(e.message)));
      syncFilters();
      document.addEventListener('pointerdown', outsideToolbar);
      host.querySelector('#atlas-place-search').onclick = search;
      host
        .querySelectorAll('[data-map-search-mode]')
        .forEach((b) => (b.onclick = () => switchMode(b.dataset.mapSearchMode)));
      host.querySelectorAll('[data-atlas-filter]').forEach(
        (select) =>
          (select.onchange = () => {
            searchSequence++;
            host.querySelector('#atlas-search-results').hidden = true;
            changeFilters({ [select.dataset.atlasFilter]: select.value })
              .then(() => map.invalidateSize({ pan: false }))
              .catch((e) => toast(e.message, 'warning'));
          }),
      );
      host.querySelector('#atlas-map-filters').onclick = (e) => {
        if (e.target.closest('[data-map-close-filters]')) e.currentTarget.open = false;
      };
      host.querySelector('#atlas-advanced-filters').onclick = () => {
        host.querySelector('#atlas-map-filters').open = false;
        onAdvancedFilters();
      };
      host.querySelector('#atlas-filter-chips').onclick = (e) => {
        const button = e.target.closest('[data-clear-map-filter]'),
          resetAll = e.target.closest('[data-map-reset]');
        if (button || resetAll) {
          searchSequence++;
          host.querySelector('#atlas-search-results').hidden = true;
          changeFilters(button ? { [button.dataset.clearMapFilter]: null } : {}, Boolean(resetAll))
            .then(() => map.invalidateSize({ pan: false }))
            .catch((e) => toast(e.message, 'warning'));
        }
      };
      for (const button of host.querySelectorAll('[data-map-reset]'))
        button.onclick = () => {
          searchSequence++;
          host.querySelector('#atlas-search-results').hidden = true;
          changeFilters({}, true)
            .then(() => map.invalidateSize({ pan: false }))
            .catch((e) => toast(e.message, 'warning'));
        };
      host.querySelector('.atlas-toolbar').onkeydown = (e) => {
        if (e.key === 'Escape') {
          host.querySelector('#atlas-map-filters').open = false;
          host.querySelector('#atlas-search-results').hidden = true;
        }
      };
      host.querySelector('#atlas-place-query').oninput = (e) => {
        searchSequence++;
        if (searchMode === 'places') placeQuery = e.target.value;
        else rollQuery = e.target.value;
        host.querySelector('#atlas-search-results').hidden = true;
      };
      host.querySelector('#atlas-place-query').onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          search();
        }
      };
      host.querySelector('#atlas-home').onclick = reset;
      host.querySelector('#atlas-world').onclick = () => map.setView([25, 12], 2);
      await clusters();
      if (focusId || assignId) await showRoll(focusId || assignId, Boolean(assignId));
    },
    showRoll,
    async assign(id) {
      await showRoll(id, true);
    },
    destroy() {
      resizeObserver?.disconnect();
      resizeObserver = null;
      document.removeEventListener('pointerdown', outsideToolbar);
      searchSequence++;
      mountId++;
      disposed = true;
      sequence++;
      rollSequence++;
      pointSequence++;
      clearTimeout(requestTimer);
      map?.remove();
      map = null;
      draft = null;
      selectedRoll = null;
    },
    getView() {
      return map
        ? { center: [map.getCenter().lat, map.getCenter().lng], zoom: map.getZoom() }
        : null;
    },
  };
}
