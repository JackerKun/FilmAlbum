import { rollPosition, coordinateLabel } from '../shared/geolocation.mjs';

export function mapRollQuery(filters = {}, page = 0) {
  const result = { page, limit: 24, sort: filters.sort || 'date' };
  for (const name of [
    'query',
    'geolocation',
    'year',
    'medium',
    'stockType',
    'stock',
    'place',
    'camera',
    'lens',
    'project',
    'tag',
    'from',
    'to',
  ])
    if (filters[name]) result[name] = filters[name];
  if (filters.hasPhotos) result.hasPhotos = true;
  return result;
}

export function createMapRollPicker({
  api,
  E,
  thumb,
  stocks,
  facets = {},
  onRows = () => {},
  onSelect,
  toast,
}) {
  let host,
    disposed = false,
    request = 0,
    controller,
    timer,
    page = 0,
    total = 0,
    pages = 0,
    filters = { sort: 'date' };
  const t = (zh, en) => (document.documentElement.lang === 'en' ? en : zh);
  const option = (value, label) => `<option value="${E(value)}">${E(label)}</option>`;
  const select = (name, label, rows) =>
    `<label>${label}<select data-picker-filter="${name}">${option('', t('全部', 'All'))}${rows.map(([value, label]) => option(value, label)).join('')}</select></label>`;
  const facet = (key) => (facets[key] || []).map((row) => [row.value, row.value]);
  function render() {
    host.innerHTML = `<section class="map-roll-picker"><div class="map-picker-search"><label><span>${t('检索胶卷', 'Search rolls')}</span><input data-picker-filter="query" type="search" autocomplete="off" placeholder="${t('名称、永久编号、地点、相机、镜头、胶卷标签…', 'Name, permanent code, place, camera, lens, roll tags…')}"></label>${select(
      'geolocation',
      t('定位状态', 'Location status'),
      [
        ['unlocated', t('未定位（无完整坐标）', 'Not located')],
        ['located', t('已定位', 'Located')],
        ['named', t('已填地名，尚无坐标', 'Place name without coordinates')],
      ],
    )}</div><div class="map-picker-filters">${select('year', t('拍摄年份', 'Year'), facet('years'))}${select(
      'medium',
      t('胶卷规格', 'Film format'),
      [
        ['135', '135'],
        ['120', '120'],
        ['220', '220'],
        ['large', t('页片', 'Sheet film')],
      ],
    )}${select('stockType', t('胶片类型', 'Film type'), [
      ['bw', 'BW · ' + t('黑白', 'Black & white')],
      ['color', t('彩色负片', 'Color negative')],
      ['slide', t('彩色反转', 'Color slide')],
      ['cinema', t('电影胶片', 'Cinema')],
    ])}${select(
      'stock',
      t('胶片型号', 'Film stock'),
      (facets.stock || []).map((row) => [
        row.value,
        stocks[row.value] ? stocks[row.value].brand + ' ' + stocks[row.value].name : row.value,
      ]),
    )}</div><details class="map-picker-advanced"><summary>${t('更多条件：日期、地点、设备、项目与标签', 'More filters: dates, place, equipment, project and tags')}</summary><div class="map-picker-filters"><label>${t('拍摄日期起', 'From')}<input type="date" data-picker-filter="from"></label><label>${t('拍摄日期止', 'To')}<input type="date" data-picker-filter="to"></label><label>${t('地点包含', 'Place contains')}<input type="search" data-picker-filter="place" placeholder="${t('省、市、县、街道', 'Country, city, county, street')}"></label>${select('camera', t('相机', 'Camera'), facet('camera'))}${select('lens', t('镜头', 'Lens'), facet('lens'))}${select('project', t('拍摄项目', 'Project'), facet('project'))}<label>${t('胶卷或照片标签', 'Roll or photo tag')}<input data-picker-filter="tag" list="map-picker-tags" placeholder="${t('输入一个完整标签', 'An exact tag')}"><datalist id="map-picker-tags">${(facets.tags || []).map((row) => option(row.value, row.value)).join('')}</datalist></label><label class="map-picker-checkbox"><input type="checkbox" data-picker-filter="hasPhotos"> ${t('只看有照片的胶卷', 'Only rolls with photographs')}</label></div></details><div class="map-picker-results-bar"><p data-picker-count role="status">${t('正在检索…', 'Searching…')}</p><label>${t('排序', 'Sort')}<select data-picker-filter="sort">${[
      ['date', t('拍摄日期：近到远', 'Newest photographed')],
      ['timeline-asc', t('拍摄日期：远到近', 'Oldest photographed')],
      ['name', t('胶卷名称', 'Name')],
      ['code', t('归档编号', 'Archive code')],
    ]
      .map(([value, label]) => option(value, label))
      .join(
        '',
      )}</select></label><button type="button" class="text" data-picker-reset>${t('重置全部条件', 'Reset all filters')}</button></div><p class="map-picker-note">${t('定位状态以有效经纬度为准；地名可以留空。选择已定位胶卷可以查看或修改原位置。', 'Location status is based on valid coordinates. A place name is optional. Select a located roll to review or change its position.')}</p><div class="map-picker-results" data-picker-results aria-live="polite"></div><footer class="map-picker-pagination"><button type="button" class="soft" data-picker-page="previous">‹ ${t('上一页', 'Previous')}</button><span data-picker-page-label></span><button type="button" class="soft" data-picker-page="next">${t('下一页', 'Next')} ›</button></footer></section>`;
    host.oninput = (event) => {
      const control = event.target.closest('[data-picker-filter]');
      if (control && control.tagName === 'INPUT' && control.type !== 'checkbox')
        changed(control, true);
    };
    host.onchange = (event) => {
      const control = event.target.closest('[data-picker-filter]');
      if (control && !(control.tagName === 'INPUT' && ['search', 'text'].includes(control.type)))
        changed(control, false);
    };
    host.onkeydown = (event) => {
      if (event.key === 'Enter' && event.target.matches('input')) {
        event.preventDefault();
        clearTimeout(timer);
        load();
      }
    };
    host.onclick = (event) => {
      const selected = event.target.closest('[data-map-roll-id]');
      if (selected) {
        event.preventDefault();
        Promise.resolve(onSelect(selected.dataset.mapRollId)).catch((error) =>
          toast(error.message, 'warning'),
        );
        return;
      }
      const target = event.target.closest('[data-picker-page]');
      if (target && !target.disabled) {
        page += target.dataset.pickerPage === 'next' ? 1 : -1;
        load();
      }
      if (event.target.closest('[data-picker-reset]')) {
        filters = { sort: 'date' };
        page = 0;
        clearTimeout(timer);
        controller?.abort();
        render();
        load();
      }
    };
  }
  function changed(control, debounce) {
    filters[control.dataset.pickerFilter] =
      control.type === 'checkbox' ? control.checked : control.value;
    page = 0;
    for (const button of host.querySelectorAll('[data-map-roll-id]')) button.disabled = true;
    clearTimeout(timer);
    controller?.abort();
    request++;
    if (debounce) timer = setTimeout(load, 250);
    else load();
  }
  async function load() {
    if (disposed) return;
    controller?.abort();
    controller = new AbortController();
    const token = ++request;
    host.querySelector('[data-picker-results]').setAttribute('aria-busy', 'true');
    for (const button of host.querySelectorAll('[data-map-roll-id]')) button.disabled = true;
    host.querySelector('[data-picker-count]').textContent = t('正在检索…', 'Searching…');
    try {
      const result = await api(
        '/rolls?filter=' + encodeURIComponent(JSON.stringify(mapRollQuery(filters, page))),
        { signal: controller.signal },
      );
      if (disposed || token !== request) return;
      total = result.total;
      pages = result.pages;
      onRows(result.items);
      if (page > 0 && page >= pages) {
        page = Math.max(0, pages - 1);
        return load();
      }
      host.querySelector('[data-picker-count]').textContent = t(
        `共 ${total.toLocaleString()} 卷 · 当前 ${result.items.length} 卷`,
        `${total.toLocaleString()} rolls · ${result.items.length} shown`,
      );
      host.querySelector('[data-picker-results]').innerHTML =
        result.items
          .map((roll) => {
            const position = rollPosition(roll),
              located = position.kind === 'located',
              label = located
                ? t('已定位', 'Located')
                : position.kind === 'name-only'
                  ? t('有地名，未设坐标', 'Place name only')
                  : t('未定位', 'Not located');
            const place =
              position.place ||
              (!located
                ? t('尚未记录拍摄地点', 'No place recorded')
                : t('已保存坐标，未填写地名', 'Coordinates saved; place name optional'));
            const stock = stocks[roll.stock];
            return `<button class="map-roll-choice" type="button" data-map-roll-id="${E(roll.id)}">${roll.coverMedia ? `<img src="${thumb(roll.coverMedia, 320)}" alt="${E(roll.name)}" loading="lazy">` : `<span class="map-picker-no-photo">${t('暂无照片', 'No photos')}</span>`}<span class="map-picker-roll-info"><span class="map-picker-roll-title"><b data-user-content>${E(roll.name)}</b><span class="map-geo-badge ${located ? 'located' : 'unlocated'}">${label}</span></span><small>${E(roll.code)} · ${roll.frameCount || 0} ${t('格', 'frames')} · ${E(roll.format || '—')} · ${E(roll.date || t('日期未记录', 'Undated'))}</small><small data-user-content>${E([stock ? stock.brand + ' ' + stock.name : roll.stock, roll.camera, roll.lens].filter(Boolean).join(' · '))}</small><span class="map-picker-place" data-user-content>${E(place)}</span>${located ? `<code>${E(coordinateLabel(roll))} · WGS84</code>` : ''}</span><span class="map-picker-select">${located ? t('查看 / 修改 →', 'Review / change →') : t('选择定位 →', 'Place on map →')}</span></button>`;
          })
          .join('') ||
        `<div class="map-picker-empty"><b>${t('没有匹配的胶卷', 'No matching rolls')}</b><p>${t('试试减少筛选条件，或清空关键词。', 'Try fewer filters or clear the search.')}</p><button type="button" class="soft" data-picker-reset>${t('清除全部条件', 'Clear filters')}</button></div>`;
      host.querySelector('[data-picker-page-label]').textContent =
        `${page + 1} / ${Math.max(1, pages)}`;
      host.querySelector('[data-picker-page="previous"]').disabled = page === 0;
      host.querySelector('[data-picker-page="next"]').disabled = page + 1 >= pages;
    } catch (error) {
      if (disposed || token !== request || error.name === 'AbortError') return;
      host.querySelector('[data-picker-count]').textContent = t('检索失败', 'Search failed');
      host.querySelector('[data-picker-results]').innerHTML =
        `<p class="map-picker-error">${E(error.message)}</p>`;
    } finally {
      if (!disposed && token === request)
        host.querySelector('[data-picker-results]').removeAttribute('aria-busy');
    }
  }
  return {
    mount(node) {
      host = node;
      render();
      load();
      host.querySelector('[data-picker-filter="query"]').focus();
    },
    destroy() {
      disposed = true;
      request++;
      clearTimeout(timer);
      controller?.abort();
      if (host) {
        host.oninput = host.onchange = host.onclick = host.onkeydown = null;
      }
    },
  };
}
