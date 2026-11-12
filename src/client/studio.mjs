import { createMapRollPicker } from './map-roll-picker.mjs';
import { renderTaskRows } from './task-center.mjs';
import { createFileActions } from './file-actions.mjs';
import { emptyPhotoState } from './offline-ui.mjs';
import { renderTimeline } from './timeline.mjs';
import {
  createAtlas,
  COUNTRY_VIEWS,
  countryOptions,
  mountLocationPicker,
  mountLocationPreview,
} from './map-view.mjs';
import { coordinateLabel, rollCoordinates } from '../shared/geolocation.mjs';
import { filterStocks, mergeCustomStocks } from '../shared/stock-catalog.mjs';
let DEBUG_MODE = new URLSearchParams(location.search).get('debug') === '1';
import { mountFilmPull } from './film-pull.mjs';
import { createBookDesigner } from './book-designer.mjs';
import { installLocale } from './i18n.mjs';
import { STOCKS } from '../shared/film-stocks.mjs';
import { Sha256 } from '../shared/sha256.mjs';
import { createReviewer } from './studio-review.mjs';
const $ = (selector) => document.querySelector(selector),
  $$ = (selector) => [...document.querySelectorAll(selector)];
const E = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const bytes = (n) => {
  if (!n) return '0 B';
  const unit = Math.min(4, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** unit).toFixed(unit ? 1 : 0)} ${['B', 'KB', 'MB', 'GB', 'TB'][unit]}`;
};
const dateLabel = (row) =>
  !row.date
    ? '未定年'
    : row.datePrecision === 'year'
      ? `约 ${row.date.slice(0, 4)} 年`
      : row.datePrecision === 'month'
        ? row.date.slice(0, 7)
        : row.date;
const STATUS = {
  shooting: '拍摄中',
  exposed: '已拍完',
  developing: '显影中',
  developed: '已显影',
  scanned: '已扫描',
  archived: '已归档',
};
class EntityCache extends Map {
  set(key, value) {
    super.delete(key);
    super.set(key, value);
    if (this.size > 1200) {
      for (const old of this.keys()) {
        if (old !== STATE?.focus?.id && !STATE?.selected?.has(old)) {
          super.delete(old);
          break;
        }
      }
    }
    return this;
  }
}
const STATE = {
  workspace: 'archive',
  query: {},
  view: 'cards',
  page: 0,
  limit: 50,
  result: { items: [], total: 0 },
  selected: new Set(),
  allMatching: false,
  anchor: null,
  focus: null,
  inspectorTab: 'details',
  multi: false,
  boot: null,
  entities: new EntityCache(),
  projectId: null,
  projectStage: 'all',
  storageTab: 'overview',
  projectView: 'photos',
  jobs: [],
  editor: null,
  request: 0,
  layout: {},
  importFiles: [],
  uploadSources: new Map(),
  uploading: new Set(),
  uploadPaused: new Set(),
  restoreJobs: new Set(),
  verifyJobs: new Map(),
  commandIndex: 0,
  commandActions: [],
  map: { x: 0, y: 0, w: 1000, h: 500, zoom: 0 },
  curationScale: 1,
};
let searchTimer, commandTimer, pollTimer, landData, closeMenuTimer;
let navigationEntry,
  navigationEnd = 0;
const navigationSnapshots = new Map(),
  navigationEndKey = 'filmalbum-navigation-end';
function toast(message, type = '', link) {
  const node = document.createElement('div');
  node.className = 'toast ' + type;
  node.setAttribute('role', 'status');
  node.textContent = message;
  if (link) {
    const button = document.createElement('button');
    button.className = 'text';
    button.textContent = link.label;
    button.onclick = () =>
      Promise.resolve(link.run()).catch((error) => toast(error.message, 'warning'));
    node.append(button);
  }
  const dialogs = [...document.querySelectorAll('dialog[open]')];
  (dialogs.at(-1) || $('#toast-stack')).append(node);
  setTimeout(() => node.remove(), link ? 12000 : 6000);
}
const fileActions = createFileActions({ toast }),
  exportRequests = new Set(),
  savedExports = new Map();
async function saveExport(j) {
  if (!j?.result?.file) throw Error('PDF 尚未生成');
  const result = await fileActions.save(
    '/api/v2/exports/' + encodeURIComponent(j.result.file),
    j.result.filename || 'FilmAlbum.pdf',
  );
  savedExports.set(j.id, result);
  renderJobs();
  return result;
}

async function api(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch('/api/v2' + path, {
    method,
    signal,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('服务响应异常，请检查终端并重启服务');
  }
  if (!response.ok)
    throw Object.assign(new Error(data.error || '操作失败'), { status: response.status });
  return data;
}
const thumb = (id, edge = 640) => '/api/v2/preview/' + encodeURIComponent(id) + '?edge=' + edge;
const raw = (id) => '/api/v2/media/' + encodeURIComponent(id);
const img = (id, name = '', className = '') =>
  id
    ? `<img loading="lazy" decoding="async" src="${thumb(id)}" alt="${E(name)}" class="${className}">`
    : '<span class="muted">尚未装入影像</span>';
let archivePager, archiveMoreObserver, archiveFilmObserver, disposeInspectorMap;
const currentEntity = () => (STATE.workspace === 'archive' ? 'rolls' : 'photos');
const resultQuery = () => ({
  ...STATE.query,
  ...(STATE.workspace === 'projects' && STATE.projectId
    ? {
        projectId: STATE.projectId,
        ...(STATE.projectStage !== 'all' ? { stage: STATE.projectStage } : {}),
      }
    : {}),
  page: STATE.workspace === 'archive' ? 0 : STATE.page,
  limit: STATE.limit,
  sort:
    STATE.workspace === 'archive' && STATE.view === 'timeline'
      ? STATE.layout.timelineOrder === 'asc'
        ? 'timeline-asc'
        : 'timeline-desc'
      : STATE.query.sort ||
        (STATE.workspace === 'archive' ? 'code' : STATE.query.rollId ? 'frame' : 'date'),
});
const option = (value, label, selected) =>
  `<option value="${E(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${E(label)}</option>`;
const select = (name, items, value = '', attributes = '') =>
  `<select name="${E(name)}" ${attributes}>${items.map((item) => option(item[0], item[1], value)).join('')}</select>`;
const field = (name, label, value = '', type = 'text', attrs = '') =>
  `<label>${E(label)}<input name="${E(name)}" type="${type}" value="${E(value)}" ${attrs}></label>`;
const datePrecisions = [
  ['day', '具体日期'],
  ['month', '月份'],
  ['year', '大约年份'],
];
function dateValueControl(name, value, precision, required) {
  const label = { day: '拍摄日期', month: '拍摄月份', year: '拍摄年份' }[precision],
    attrs = required ? 'required' : '';
  if (precision === 'year') {
    const currentYear = new Date().getFullYear(),
      latestYear = currentYear + 10,
      years = new Set(Array.from({ length: latestYear - 1799 }, (_, i) => String(latestYear - i)));
    for (const year of STATE.boot.facets?.years || []) years.add(year.value);
    if (value) years.add(value.slice(0, 4));
    return `<label>${label}${select(name, [['', '选择年份'], ...[...years].sort((a, b) => Number(b) - Number(a)).map((year) => [year, year])], value.slice(0, 4), attrs)}</label>`;
  }
  const month = precision === 'month',
    length = month ? 7 : 10;
  return field(
    name,
    label,
    value.slice(0, length),
    month ? 'month' : 'date',
    `${attrs} min="${month ? '0001-01' : '0001-01-01'}" max="${month ? '9999-12' : '9999-12-31'}"`,
  );
}
function dateFields(value = '', precision = 'day', { name = 'date', required = false } = {}) {
  value = String(value ?? '');
  if (value.length === 4) precision = 'year';
  else if (value.length === 7 && precision !== 'year') precision = 'month';
  if (!datePrecisions.some(([key]) => key === precision)) precision = 'day';
  const precisionName = name === 'ruleValue' ? 'ruleValuePrecision' : 'datePrecision';
  return `<div class="date-fields wide" data-date-name="${name}" data-date-required="${required}" data-date-value="${E(value)}"><label>日期精度${select(precisionName, datePrecisions, precision, 'data-date-precision')}</label><div class="date-value">${dateValueControl(name, value, precision, required)}</div></div>`;
}
function modal(title, html, submit, label = '保存', kicker = 'FILM ALBUM STUDIO') {
  STATE.editor = submit;
  $('#editor-title').textContent = title;
  $('#editor-kicker').textContent = kicker;
  $('#editor-body').innerHTML = html;
  $('#editor-footer').innerHTML =
    `<button type="button" class="soft" data-action="close-editor">取消</button>${submit ? `<button type="submit" class="primary">${E(label)}</button>` : ''}`;
  if (!$('#editor').open) $('#editor').showModal();
  $('#editor-body').scrollTop = 0;
}
function formValues(form = $('#editor-form')) {
  return Object.fromEntries(new FormData(form));
}
function selection() {
  return STATE.allMatching
    ? { query: resultQuery(), expectedRevision: STATE.result.revision }
    : { ids: [...STATE.selected] };
}
function selectedRows() {
  return [...STATE.selected].map((id) => STATE.entities.get(id)).filter(Boolean);
}
async function bootstrap() {
  const boot = await api('/bootstrap');
  STATE.boot = boot;
  DEBUG_MODE ||= Boolean(boot.experimentalMode);
  mergeCustomStocks(boot.lists?.customStocks || []);
  if (DEBUG_MODE && !document.querySelector('[data-action=demo]')) {
    const b = document.createElement('button');
    b.dataset.action = 'demo';
    b.textContent = '◈ 演示 / 调试模式';
    $('#workspace-nav').append(b);
  }
  const settings = boot.lists?.settings || {};
  document.body.dataset.theme =
    settings.theme || localStorage.getItem('filmalbum-theme') || 'paper';
  STATE.layout = settings.layouts?.[STATE.workspace] || {};
  applyLayout();
  const demoButton = document.querySelector('[data-action=demo]');
  if (demoButton) {
    demoButton.textContent = boot.lists?.demo ? '◈ 演示模式 · 返回' : '◈ 演示 / 调试模式';
    demoButton.classList.toggle('demo-active', Boolean(boot.lists?.demo));
  }
  $('#library-title').textContent = boot.lists?.libraryName || '资料库恢复';
  $('#library-counts').textContent = boot.stats
    ? `${boot.stats.rolls.toLocaleString()} 卷 · ${boot.stats.photos.toLocaleString()} 张照片`
    : '档案暂不可用，可从备份恢复';
  renderSidebar();
  return boot;
}
function applyLayout() {
  const l = STATE.layout;
  if (l.sideWidth) document.documentElement.style.setProperty('--side-width', l.sideWidth + 'px');
  if (l.inspectWidth)
    document.documentElement.style.setProperty('--inspect-width', l.inspectWidth + 'px');
  document.body.classList.toggle('inspector-hidden', Boolean(l.inspectorHidden));
  document.body.classList.remove('density-compact', 'density-comfortable');
  if (l.density && l.density !== 'standard') document.body.classList.add('density-' + l.density);
}
async function saveSettings(patch) {
  const settings = { ...STATE.boot.lists.settings, ...patch };
  await api('/settings', { method: 'PUT', body: patch });
  STATE.boot.lists.settings = settings;
}
function sideRow(label, action, data = '', count = '', active = false, extra = '') {
  return `<div class="side-row ${active ? 'active' : ''}"><button data-action="${action}" data-value="${E(data)}"><span>${E(label)}</span><small>${E(count)}</small></button>${extra}</div>`;
}
function renderSidebar() {
  const b = STATE.boot,
    lists = b?.lists || {},
    q = STATE.query;
  $('#workspace-nav')
    .querySelectorAll('[data-workspace]')
    .forEach((button) =>
      button.classList.toggle('active', button.dataset.workspace === STATE.workspace),
    );
  $('#side-content').innerHTML =
    `<section class="side-section"><header>资料浏览 <button data-action="command">⌘ K</button></header>${sideRow('全部胶卷', 'scope', 'rolls', b.stats?.rolls || 0, STATE.workspace === 'archive' && !Object.keys(q).length)}${sideRow('全库照片', 'scope', 'photos', b.stats?.photos || 0, STATE.workspace === 'lighttable' && !Object.keys(q).length)}${sideRow('四星精选', 'scope', 'favorites', b.stats?.favorites || 0, q.rating === '4')}${sideRow('离线 / 断链', 'scope', 'offline', b.stats?.offline || 0, q.offline)}${sideRow('回收站', 'scope', 'trash', b.stats?.trash || 0, q.trash)}</section><section class="side-section"><header>收藏与智能集合 <button data-action="new-collection">＋</button></header>${
      (lists.collections || [])
        .filter((c) => !c.parentId)
        .map(
          (c) =>
            sideRow(
              (c.kind === 'smart' ? '⚙ ' : '◫ ') + c.name,
              'collection',
              c.id,
              '',
              q.collectionId === c.id,
              `<button data-action="edit-collection" data-value="${E(c.id)}" aria-label="编辑收藏 ${E(c.name)}">···</button>`,
            ) +
            (lists.collections || [])
              .filter((child) => child.parentId === c.id)
              .map(
                (child) =>
                  '<div style="padding-left:12px">' +
                  sideRow(
                    '↳ ' + child.name,
                    'collection',
                    child.id,
                    '',
                    q.collectionId === child.id,
                    `<button data-action="edit-collection" data-value="${E(child.id)}">···</button>`,
                  ) +
                  '</div>',
              )
              .join(''),
        )
        .join('') || '<small class="muted">把照片收进自己的主题收藏</small>'
    }</section><section class="side-section"><header>拍摄项目 <button data-action="new-project">＋</button></header>${
      (lists.projects || [])
        .slice(0, 100)
        .map((p) => sideRow(p.name, 'project', p.id, '', STATE.projectId === p.id))
        .join('') || '<small class="muted">旅行、专题与作品系列</small>'
    }</section><section class="side-section"><header>拍摄年代</header><div class="year-tree">${(b.facets?.years || []).map((y) => `<button data-action="year" data-value="${E(y.value)}">${E(y.value)} <small>${y.count}</small></button>`).join('') || '<small class="muted">填写拍摄日期后按年代浏览</small>'}</div></section>`;
}
function clearSelection() {
  STATE.selected.clear();
  STATE.allMatching = false;
  STATE.anchor = null;
  renderSelection();
}
function resultScroller() {
  const content = $('#view-content');
  return content.querySelector('.table-wrap, .curation-viewport') || content;
}
function captureNavigation() {
  const scroller = resultScroller();
  return {
    query: { ...STATE.query },
    view: STATE.view,
    page: STATE.page,
    archivePage: archivePager?.page || 0,
    projectStage: STATE.projectStage,
    focus: STATE.focus,
    inspectorTab: STATE.inspectorTab,
    scrollTop: scroller.scrollTop,
    scrollLeft: scroller.scrollLeft,
    ...(STATE.workspace === 'atlas' && { map: atlas.getNavigationState() }),
  };
}
function rememberNavigation(snapshot = captureNavigation()) {
  if (navigationEntry) navigationSnapshots.set(navigationEntry.index, snapshot);
}
function updateNavigationButtons() {
  $('#nav-back').disabled = !navigationEntry?.index;
  $('#nav-forward').disabled = !navigationEntry || navigationEntry.index >= navigationEnd;
}
function navigate(workspace, query = {}, extra = {}) {
  const snapshot = captureNavigation(),
    current = navigationEntry;
  if (
    current?.workspace === workspace &&
    JSON.stringify(snapshot.query) === JSON.stringify(query) &&
    (!extra.view || extra.view === snapshot.view) &&
    STATE.projectId === (extra.projectId || null) &&
    STATE.projectView === (extra.projectView || 'photos') &&
    STATE.storageTab === (extra.storageTab || 'overview') &&
    !extra.mapFocusId
  ) {
    return refresh();
  }
  rememberNavigation(snapshot);
  const index = current ? current.index + 1 : 0,
    entry = { filmAlbum: true, index, workspace, query, extra };
  for (const key of navigationSnapshots.keys()) {
    if (key >= index) navigationSnapshots.delete(key);
  }
  const url = new URL(location.href);
  url.searchParams.set('workspace', workspace);
  if (DEBUG_MODE) url.searchParams.set('debug', '1');
  if (query.rollId) url.searchParams.set('roll', query.rollId);
  else url.searchParams.delete('roll');
  if (current) history.pushState(entry, '', url);
  else history.replaceState(entry, '', url);
  navigationEnd = index;
  sessionStorage.setItem(navigationEndKey, String(index));
  return openNavigation(entry);
}
async function openNavigation(entry, snapshot) {
  const { workspace, extra } = entry,
    query = snapshot?.query || entry.query;
  navigationEntry = entry;
  updateNavigationButtons();
  clearTimeout(searchTimer);
  if (STATE.workspace === 'atlas') atlas.destroy();
  STATE.workspace = workspace;
  STATE.query = { ...query };
  STATE.page = snapshot?.page || 0;
  STATE.projectId = extra.projectId || null;
  STATE.storageTab = extra.storageTab || 'overview';
  STATE.projectView = extra.projectView || 'photos';
  STATE.projectStage = snapshot?.projectStage || extra.projectStage || 'all';
  STATE.mapFocusId = snapshot?.map ? snapshot.map.focusId : extra.mapFocusId;
  STATE.mapFocusCoordinates = snapshot?.map
    ? snapshot.map.focusCoordinates
    : extra.mapFocusCoordinates;
  STATE.mapRestoreView = snapshot?.map?.view || extra.mapView;
  clearSelection();
  STATE.layout = STATE.boot?.lists?.settings?.layouts?.[workspace] || {};
  STATE.view =
    snapshot?.view ||
    extra.view ||
    (workspace === 'archive'
      ? STATE.layout.view || 'cards'
      : !query.rollId && STATE.layout.view === 'yearbook'
        ? 'yearbook'
        : 'grid');
  applyLayout();
  $('.sidebar').classList.remove('mobile-open');
  renderSidebar();
  renderHeader();
  renderQuery();
  resultScroller().scrollTo(0, 0);
  if (snapshot) {
    STATE.focus = snapshot.focus;
    STATE.inspectorTab = snapshot.inspectorTab;
    if (snapshot.focus) inspect(snapshot.focus.id, snapshot.focus.entity);
    else resetInspector();
  }
  await refresh(snapshot?.archivePage);
  if (snapshot && navigationEntry === entry)
    resultScroller().scrollTo(snapshot.scrollLeft, snapshot.scrollTop);
}
function renderHeader() {
  const q = STATE.query,
    roll = q.rollId ? STATE.entities.get(q.rollId) : null,
    collection = STATE.boot.lists?.collections?.find((c) => c.id === q.collectionId),
    project = STATE.boot.lists?.projects?.find((p) => p.id === STATE.projectId);
  const names = {
    archive: ['FILM ARCHIVE', q.trash ? '胶卷回收站' : '胶片档案馆'],
    lighttable: [
      'LIGHT TABLE',
      q.trash
        ? '照片回收站'
        : q.offline
          ? '离线与断链照片'
          : collection?.name || roll?.name || (q.rating === '4' ? '四星精选' : '全库照片'),
    ],
    projects: ['PROJECTS & CURATION', project?.name || '摄影项目'],
    atlas: ['MEMORY ATLAS', '回忆地图'],
    storage: ['LIBRARY & BACKUP', '资料库与备份'],
  };
  const [eyebrow, title] = names[STATE.workspace];
  let tools = `<button class="soft" data-action="sidebar" title="切换导航">☰</button>`;
  if (STATE.workspace === 'archive')
    tools += `<div class="segmented">${[
      ['cards', '卡片'],
      ['table', '档案表格'],
      ['rack', '胶卷架'],
      ['film', '胶片条'],
      ['timeline', '时间轴'],
    ]
      .map(
        ([v, l]) =>
          `<button data-action="view" data-value="${v}" class="${STATE.view === v ? 'active' : ''}">${l}</button>`,
      )
      .join('')}</div><button class="soft" data-action="new-roll">＋ 胶卷</button>`;
  if (STATE.workspace === 'lighttable')
    tools += `<div class="segmented">${[
      ['grid', '灯箱'],
      ...(roll ? [['film', '胶片条']] : []),
      ['yearbook', '年鉴'],
    ]
      .map(
        ([v, l]) =>
          `<button data-action="view" data-value="${v}" class="${STATE.view === v ? 'active' : ''}">${l}</button>`,
      )
      .join(
        '',
      )}</div><button class="soft" data-action="multi" aria-pressed="${STATE.multi}">${STATE.multi ? '多选中' : '多选'}</button>`;
  if (STATE.workspace === 'lighttable' && roll)
    tools +=
      '<button class="soft" data-action="roll-contact-pdf">导出接触印样</button><button class="primary" data-action="import-roll" data-value="' +
      E(roll.id) +
      '">装入扫描</button>';
  if (STATE.workspace === 'projects')
    tools += project
      ? `<button class="soft" data-action="edit-project">项目设置</button><button class="soft" data-action="project-view" data-value="${STATE.projectView === 'canvas' ? 'photos' : 'canvas'}">${STATE.projectView === 'canvas' ? '照片序列' : '策展画布'}</button><button class="soft" data-action="project-export">导出作品集</button><button class="soft" data-action="project-contact">定稿印样</button><button class="soft" data-action="project-book">定稿转画册</button>`
      : '<button class="soft" data-action="new-project">＋ 新项目</button>';
  if (STATE.workspace === 'atlas')
    tools += `<button class="soft" data-action="map-mode">${q.mapMode === 'photos' ? '按照片 · 切换到按卷' : '按卷 · 切换到按照片'}</button><button class="soft" data-action="map-help">地图使用指南</button><button class="soft" data-action="yearbook">摄影年鉴</button><button class="soft" data-action="map-place">定位选中胶卷</button>`;
  if (STATE.workspace === 'storage')
    tools += `<div class="segmented">${[
      ['overview', '总览'],
      ['backups', '备份'],
      ['history', '历史'],
      ['trash', '回收站'],
      ['settings', '设置'],
    ]
      .map(
        ([v, l]) =>
          `<button data-action="storage-tab" data-value="${v}" class="${STATE.storageTab === v ? 'active' : ''}">${l}</button>`,
      )
      .join('')}</div>`;
  tools += `<button class="soft" data-action="inspector" title="切换检查器">◧</button>`;
  $('#workspace-header').innerHTML =
    `<div><span class="eyebrow">${eyebrow}</span><h1>${E(title)}</h1><p>${q.trash ? '可恢复归档记录；清空回收站才释放托管原片空间' : STATE.workspace === 'archive' ? '胶卷、实物位置与摄影记忆，一处归档' : STATE.workspace === 'lighttable' ? '跨胶卷查询 · 扫描版本 · 专注选片' : STATE.workspace === 'projects' ? '候选、定稿与自由策展' : STATE.workspace === 'atlas' ? '按地点与年代重访你的胶片' : '原片、离线存储与可校验备份'}</p></div><div class="workspace-tools">${tools}</div>`;
}
function renderQuery() {
  if (
    STATE.workspace === 'atlas' ||
    STATE.workspace === 'storage' ||
    (STATE.workspace === 'projects' && !STATE.projectId)
  ) {
    $('#query-bar').hidden = true;
    return;
  }
  $('#query-bar').hidden = false;
  const q = STATE.query,
    photo = STATE.workspace === 'lighttable' || STATE.workspace === 'projects';
  let html = `<input id="query-input" type="search" value="${E(q.query || '')}" placeholder="${q.semantic ? '按识图标签、OCR 与文字线索查询…' : '搜索名称、编号、相机、地点、标签…'}" aria-label="当前范围搜索"><select data-filter="year" aria-label="拍摄年份">${option('', '全部年份', q.year)}${(STATE.boot.facets?.years || []).map((y) => option(y.value, y.value, q.year)).join('')}</select>`;
  if (photo)
    html += `<select data-filter="rating" aria-label="照片评分">${[
      ['', '全部评分'],
      ['unrated', '未评分'],
      ['3', '★3 及以上'],
      ['4', '★4 及以上'],
      ['5', '★5'],
    ]
      .map(([v, l]) => option(v, l, q.rating))
      .join('')}</select><select data-filter="color" aria-label="照片色标">${[
      ['', '全部色标'],
      ['none', '无色标'],
      ['red', '红色'],
      ['yellow', '黄色'],
      ['green', '绿色'],
      ['blue', '蓝色'],
      ['purple', '紫色'],
    ]
      .map(([v, l]) => option(v, l, q.color))
      .join('')}</select>`;
  else
    html += `<select data-filter="stock" aria-label="胶片型号">${option('', '全部胶片', q.stock)}${(STATE.boot.facets?.stock || []).map((s) => option(s.value, STOCKS[s.value]?.name || s.value, q.stock)).join('')}</select>`;
  html += `<button class="soft" data-action="filters">组合筛选${q.rules?.conditions?.length ? ' ' + q.rules.conditions.length : ''}</button><button class="text" data-action="reset-filters">重置</button>${q.rollId ? '<button class="text" data-action="exit-roll">返回全库</button>' : ''}${q.collectionId ? '<span class="badge">收藏范围</span>' : ''}${q.semantic ? '<span class="badge">语义线索</span>' : ''}`;
  if (STATE.projectId) {
    const p = STATE.boot.lists.projects.find((p) => p.id === STATE.projectId);
    html += `<select data-filter="chapter" aria-label="章节">${option('', '全部章节', q.chapter)}${(p?.chapters || []).map((c) => option(c, c, q.chapter)).join('')}</select>`;
  }
  const active = [
    ['camera', '相机'],
    ['lens', '镜头'],
    ['location', '地点'],
    ['from', '从'],
    ['to', '至'],
    ['tag', '标签'],
  ].filter(([key]) => q[key]);
  if (active.length)
    html += `<div class="active-query-filters">${active.map(([key, label]) => `<button class="soft" data-action="remove-query-filter" data-value="${key}">${label} · ${E(q[key])} ×</button>`).join('')}</div>`;
  $('#query-bar').innerHTML = html;
  $('#query-input').oninput = (event) => {
    STATE.query.query = event.target.value;
    STATE.page = 0;
    clearSelection();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => refresh(), 220);
  };
}
function renderSelection() {
  const count = STATE.allMatching ? STATE.result.total : STATE.selected.size;
  $('#selection-bar').hidden = !count;
  $$('[data-record]').forEach((node) => {
    const selected = STATE.selected.has(node.dataset.record) || STATE.allMatching;
    node.classList.toggle('selected', selected);
    const checkbox = node.querySelector('input[type=checkbox]');
    if (checkbox) checkbox.checked = selected;
  });
  if (!count) return;
  const entity = currentEntity(),
    photo = entity === 'photos';
  $('#selection-bar').innerHTML =
    `<strong>${count.toLocaleString()} ${photo ? '张' : '卷'}已选择${STATE.allMatching ? ' · 全部匹配' : ''}</strong><button data-action="batch">批量修改</button>${photo ? (STATE.projectId ? '<button data-action="organize-project">章节 / 定稿</button>' : '') + '<button data-action="compare" ' + (![2, 4].includes(count) || STATE.allMatching ? 'disabled' : '') + '>对比所选 C</button><button data-action="add-to">加入收藏 / 项目</button>' : '<button data-action="labels">打印二维码标签</button>'}${STATE.query.trash ? '<button data-action="restore-selected">移出回收站</button>' : '<button data-action="trash-selected">放入回收站</button>'}${photo && STATE.query.collectionId ? '<button data-action="remove-members">移出收藏</button>' : ''}${!STATE.allMatching && STATE.result.total > STATE.selected.size ? '<button data-action="select-all-matching">选择全部 ' + STATE.result.total.toLocaleString() + ' 条匹配</button>' : ''}<button data-action="clear-selection">清除</button>`;
  $$('[data-record]').forEach((node) =>
    node.classList.toggle('selected', STATE.selected.has(node.dataset.record) || STATE.allMatching),
  );
}
function observeArchiveMore() {
  archiveMoreObserver?.disconnect();
  const content = $('#view-content'),
    scroller = content.querySelector('.table-wrap') || content;
  content.querySelector('[data-archive-more]')?.remove();
  if (!archivePager || archivePager.restoring || archivePager.page + 1 >= STATE.result.pages)
    return;
  const marker = document.createElement('div');
  const pager = archivePager;
  marker.dataset.archiveMore = '';
  marker.setAttribute('aria-hidden', 'true');
  scroller.append(marker);
  archiveMoreObserver = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting && archivePager === pager && !pager.failed) loadArchiveMore();
    },
    { root: scroller, rootMargin: '0px 0px 180px' },
  );
  archiveMoreObserver.observe(marker);
}
async function loadArchiveMore() {
  const pager = archivePager;
  if (
    STATE.workspace !== 'archive' ||
    !pager ||
    pager.loading ||
    pager.page + 1 >= STATE.result.pages
  )
    return;
  pager.loading = true;
  pager.failed = false;
  renderPagination();
  try {
    const result = await api(
      '/rolls?filter=' +
        encodeURIComponent(
          JSON.stringify({
            ...pager.query,
            page: pager.page + 1,
          }),
        ),
    );
    if (archivePager !== pager) return;
    const previous = STATE.result.items,
      seen = new Set(previous.map((roll) => roll.id)),
      added = result.items.filter((roll) => !seen.has(roll.id)),
      content = $('#view-content'),
      scrollTop = (content.querySelector('.table-wrap') || content).scrollTop;
    pager.page++;
    STATE.result = { ...result, items: [...previous, ...added] };
    for (const roll of added) STATE.entities.set(roll.id, roll);
    if (STATE.view === 'film') renderArchiveFilm(added, true);
    else if (['cards', 'rack'].includes(STATE.view) && content.querySelector('.roll-grid'))
      content
        .querySelector('.roll-grid')
        .insertAdjacentHTML('beforeend', added.map(rollCard).join(''));
    else renderResults();
    (content.querySelector('.table-wrap') || content).scrollTop = scrollTop;
    renderSelection();
    observeArchiveMore();
  } catch (error) {
    if (archivePager === pager) {
      pager.failed = true;
      toast(error.message, 'warning');
    }
  } finally {
    if (archivePager === pager) {
      pager.loading = false;
      renderPagination();
    }
  }
}
function renderPagination() {
  const result = STATE.result;
  $('#pagination').hidden =
    ['atlas', 'storage'].includes(STATE.workspace) ||
    (STATE.workspace === 'projects' && (!STATE.projectId || STATE.projectView === 'canvas'));
  if (STATE.workspace === 'archive') {
    const more = archivePager && archivePager.page + 1 < result.pages;
    $('#pagination').innerHTML =
      `<span>已加载 ${result.items.length.toLocaleString()} / ${result.total.toLocaleString()} 卷</span><div><button data-action="select-page">全选已加载</button><button data-action="density">密度</button>${STATE.view === 'table' ? '<button data-action="columns">列设置</button>' : ''}${more ? `<button data-action="archive-more" ${archivePager.loading ? 'disabled' : ''}>${archivePager.loading ? '正在加载…' : archivePager.failed ? '重试加载' : '加载更多'}</button>` : ''}</div>`;
    return;
  }
  $('#pagination').innerHTML =
    `<span>${result.total.toLocaleString()} ${currentEntity() === 'rolls' ? '卷' : '张'}匹配 · 当前只加载 ${result.items.length} 条</span><div><button data-action="select-page">全选本页</button><button data-action="density">密度</button>${STATE.workspace === 'archive' && STATE.view === 'table' ? '<button data-action="columns">列设置</button>' : ''}<button data-action="page-prev" ${STATE.page === 0 ? 'disabled' : ''}>‹</button><span>${STATE.page + 1} / ${Math.max(1, result.pages || 1)}</span><button data-action="page-next" ${STATE.page + 1 >= (result.pages || 1) ? 'disabled' : ''}>›</button></div>`;
}
async function refresh(restoreArchivePage = 0) {
  const request = ++STATE.request;
  archivePager = null;
  archiveMoreObserver?.disconnect();
  archiveFilmObserver?.disconnect();
  try {
    if (STATE.workspace === 'storage') {
      await renderStorage(request);
      return;
    }
    if (STATE.workspace === 'atlas') {
      await renderAtlas();
      return;
    }
    if (STATE.workspace === 'projects' && !STATE.projectId) {
      renderProjects();
      return;
    }
    if (STATE.workspace === 'projects' && STATE.projectView === 'canvas') {
      await renderCanvas(request);
      return;
    }
    const rollId = STATE.query.rollId;
    if (STATE.workspace === 'lighttable' && rollId && !STATE.entities.has(rollId)) {
      const roll = await api('/rolls/' + encodeURIComponent(rollId));
      if (request !== STATE.request) return;
      STATE.entities.set(rollId, roll);
      renderHeader();
    }
    const entity = currentEntity(),
      query = resultQuery(),
      result = await api('/' + entity + '?filter=' + encodeURIComponent(JSON.stringify(query)));
    if (request !== STATE.request) return;
    STATE.result = result;
    if (entity === 'rolls')
      archivePager = { query, page: query.page, restoring: restoreArchivePage > 0 };
    for (const row of result.items) STATE.entities.set(row.id, row);
    renderResults();
    renderPagination();
    renderSelection();
    if (archivePager) {
      const pager = archivePager;
      while (!pager.failed && pager.page < Math.min(restoreArchivePage, STATE.result.pages - 1)) {
        await loadArchiveMore();
        if (request !== STATE.request) return;
      }
      pager.restoring = false;
      observeArchiveMore();
    }
    $('#status-text').textContent =
      `${STATE.boot.lists?.demo ? '演示资料库 / DEMO' : '本地资料库'} · ${STATE.boot.stats?.rolls.toLocaleString() || 0} 卷 · 目录版本 ${result.revision}`;
  } catch (error) {
    if (request !== STATE.request) return;
    $('#view-content').innerHTML =
      `<div class="empty">${E(error.message)}<button class="soft" data-action="retry">重新读取</button><button class="text" data-action="open-recovery">打开备份恢复</button></div>`;
    $('#pagination').hidden = true;
  }
}
function photoCard(p) {
  return `<article class="photo-card ${STATE.selected.has(p.id) ? 'selected' : ''}" data-record="${E(p.id)}" data-entity="photos" tabindex="0" draggable="${STATE.workspace === 'projects' || Boolean(STATE.query.collectionId)}"><span class="select-dot">${STATE.selected.has(p.id) ? '✓' : ''}</span><div class="image-wrap">${p.mime?.startsWith('video/') ? `<video src="${raw(p.mediaId)}" muted preload="metadata"></video>` : img(p.mediaId, p.name)}</div>${p.versionCount > 1 ? `<span class="version-badge">${p.versionCount} 版本</span>` : ''}${['offline', 'missing', 'changed'].includes(p.availability) ? `<span class="offline-badge">${p.availability === 'offline' ? '离线' : p.availability === 'changed' ? '内容变化' : '断链'}</span>` : ''}${p.rejected ? '<span class="reject-badge">淘汰</span>' : ''}<div class="card-name" data-user-content>${E(p.name)}</div><div class="card-meta"><span>${E(p.rollName)} · ${E(p.frameNo || '—')}</span><i class="color-dot ${E(p.color)}"></i><b class="star-value">${p.rating ? '★'.repeat(p.rating) : '未评分'}</b></div></article>`;
}
function rollCard(r) {
  const stock = STOCKS[r.stock] || {},
    physical = r.physical || {};
  return `<article class="roll-card ${STATE.selected.has(r.id) ? 'selected' : ''}" data-record="${E(r.id)}" data-entity="rolls" tabindex="0"><div class="roll-cover">${img(r.coverMedia, r.name)}<span class="stock-pill" style="--stock:${stock.color2 || '#d7c891'}">${E(stock.brand || 'FILM')} · ${E(stock.name || r.stock)}</span><code class="roll-code">${E(r.code)}</code></div><h3 data-user-content>${E(r.name)}</h3><button class="text roll-open" data-action="roll-photos" data-value="${E(r.id)}">打开整卷 →</button><p>${E(r.camera || '相机未记录')} · ${E(r.format)}<br>${E(r.location || '地点未记录')}</p><footer class="roll-footer"><span>${E(dateLabel(r))}</span><span>${r.frameCount} 格 · ${E(STATUS[r.status] || r.status)}</span></footer>${physical.box ? `<small class="muted">▣ ${E([physical.cabinet, physical.box, physical.album, physical.page, physical.pocket].filter(Boolean).join(' / '))}</small>` : ''}</article>`;
}
const COLUMN_NAMES = {
  code: '永久编号',
  name: '胶卷名称',
  stock: '胶片',
  format: '画幅',
  camera: '相机',
  lens: '镜头',
  date: '拍摄日期',
  location: '地点',
  project: '项目',
  frameCount: '格数',
  status: '状态',
  physical: '底片位置',
};
function renderArchiveFilm(rows, append = false) {
  const content = $('#view-content');
  if (!append) {
    content.innerHTML = '<div class="archive-film-list"></div>';
    archiveFilmObserver?.disconnect();
    archiveFilmObserver = new IntersectionObserver(
      (entries, observer) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          loadFilmPanel(entry.target);
        }
      },
      { root: content, rootMargin: '140px 0px' },
    );
  }
  const list = content.querySelector('.archive-film-list'),
    start = list.children.length;
  list.insertAdjacentHTML(
    'beforeend',
    rows
      .map((roll) => {
        const stock = STOCKS[roll.stock];
        return `<section class="archive-film-roll"><header data-record="${E(roll.id)}" data-entity="rolls" tabindex="0"><div class="archive-film-cover">${img(roll.coverMedia, '')}</div><div><h3 data-user-content>${E(roll.name)}</h3><p>${[roll.code, stock?.name || roll.stock, roll.format, dateLabel(roll)].filter(Boolean).map(E).join(' · ')}</p></div><span>${roll.frameCount} 格</span><button type="button" class="text" data-action="roll-photos" data-value="${E(roll.id)}">打开整卷 →</button></header><div class="archive-film-panel" ${roll.frameCount ? 'data-film-pending' : ''} data-film-roll="${E(roll.id)}"><p class="muted">${roll.frameCount ? '等待载入胶片…' : '这卷还没有扫描。'}</p></div></section>`;
      })
      .join(''),
  );
  for (const section of [...list.children].slice(start)) {
    const panel = section.querySelector('[data-film-pending]');
    if (panel) archiveFilmObserver.observe(panel);
  }
}
async function loadFilmPanel(panel) {
  const roll =
    STATE.entities.get(panel.dataset.filmRoll) ||
    STATE.result.items.find((item) => item.id === panel.dataset.filmRoll);
  if (!roll || !panel.isConnected) return;
  panel.querySelector('p').textContent = '正在读取胶片…';
  try {
    const query = { rollId: roll.id, sort: 'frame', page: 0, limit: STATE.limit },
      result = await api('/photos?filter=' + encodeURIComponent(JSON.stringify(query)));
    if (!panel.isConnected) return;
    if (!result.items.length) {
      panel.querySelector('p').textContent = '这卷还没有扫描。';
      return;
    }
    for (const photo of result.items) STATE.entities.set(photo.id, photo);
    mountFilmPull(panel, result.items, roll, {
      escape: E,
      stock: STOCKS[roll.stock],
      open: (id) =>
        openPhoto(id, reviewOptions(result, query)).catch((error) =>
          toast(error.message, 'warning'),
        ),
      inspect: (id) => inspect(id, 'photos'),
    });
  } catch (error) {
    if (panel.isConnected) panel.querySelector('p').textContent = error.message;
  } finally {
    panel.removeAttribute('data-film-pending');
  }
}
function renderResults() {
  const rows = STATE.result.items;
  if (STATE.workspace === 'archive' && STATE.view === 'film' && rows.length) {
    renderArchiveFilm(rows);
    return;
  }
  if (
    STATE.view === 'film' &&
    rows.length &&
    STATE.workspace === 'lighttable' &&
    STATE.query.rollId
  ) {
    const roll = STATE.entities.get(STATE.query.rollId) || {
      name: rows[0].rollName,
      format: rows[0].format,
      code: rows[0].rollCode,
      id: STATE.query.rollId || 'all',
    };
    mountFilmPull($('#view-content'), rows, roll, {
      escape: E,
      stock: STOCKS[rows[0].stock],
      open: openPhoto,
      inspect: (id) => inspect(id, 'photos'),
    });
    return;
  }
  if (!rows.length) {
    const state = emptyPhotoState({
      query: STATE.query,
      photos: STATE.boot.stats?.photos || 0,
      offline: STATE.boot.stats?.offline || 0,
    });
    $('#view-content').innerHTML =
      `<div class="empty"><strong>${E(state.title)}</strong><small>${E(state.message)}</small><div class="empty-actions">${state.actions.map((a) => `<button class="soft" data-action="${a.action}" data-value="${E(a.value || '')}">${E(a.label)}</button>`).join('')}</div></div>`;
    return;
  }
  let html = '';
  if (STATE.workspace === 'archive') {
    if (STATE.view === 'table') {
      const columns = STATE.layout.columns || [
        'code',
        'name',
        'stock',
        'format',
        'camera',
        'date',
        'location',
        'frameCount',
        'status',
      ];
      html = `<div class="table-wrap"><table class="archive-table"><thead><tr><th>选</th>${columns.map((key) => `<th draggable="true" data-column="${key}">${COLUMN_NAMES[key]}</th>`).join('')}</tr></thead><tbody>${rows
        .map(
          (r) =>
            `<tr data-record="${E(r.id)}" data-entity="rolls" class="${STATE.selected.has(r.id) ? 'selected' : ''}"><td><input type="checkbox" tabindex="-1" ${STATE.selected.has(r.id) ? 'checked' : ''} aria-label="选择 ${E(r.name)}"></td>${columns
              .map((key) =>
                key === 'location'
                  ? `<td><button type="button" class="text" data-action="edit-roll-location" data-value="${E(r.id)}">${E(r.location || '设置地点')}</button></td>`
                  : key === 'date'
                    ? `<td><button type="button" class="text" data-action="edit-roll-date" data-value="${E(r.id)}" aria-label="编辑拍摄日期">${E(r.date || '设置日期')}</button></td>`
                    : `<td ${['name', 'camera', 'lens', 'project'].includes(key) ? `contenteditable="true" data-edit-roll="${E(r.id)}" data-field="${key}" tabindex="0"` : ''}>${E(
                        key === 'stock'
                          ? STOCKS[r.stock]?.name || r.stock
                          : key === 'status'
                            ? STATUS[r.status] || r.status
                            : key === 'physical'
                              ? Object.values(r.physical || {})
                                  .filter(Boolean)
                                  .join(' / ')
                              : r[key],
                      )}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('')}</tbody></table></div>`;
    } else if (STATE.view === 'timeline')
      html = renderTimeline(rows, {
        E,
        thumb,
        stocks: STOCKS,
        statuses: STATUS,
        selected: STATE.selected,
        order: STATE.layout.timelineOrder || 'desc',
      });
    else
      html = `<div class="roll-grid ${STATE.view === 'rack' ? 'roll-rack' : ''}">${rows.map(rollCard).join('')}</div>`;
  } else {
    if (STATE.workspace === 'projects') {
      const project = STATE.boot.lists.projects.find((p) => p.id === STATE.projectId);
      html += `<div class="chapter-strip">${[
        ['all', '全部'],
        ['candidate', '候选'],
        ['final', '定稿'],
      ]
        .map(
          ([key, label]) =>
            `<button data-action="project-stage" data-value="${key}" data-stage-drop="${key}" class="${STATE.projectStage === key ? 'active' : ''}">${label}</button>`,
        )
        .join('')}<small class="muted">可拖动照片到候选 / 定稿，也可拖动排序</small></div>`;
    }
    if (STATE.view === 'yearbook') {
      const year = STATE.query.year || '全库';
      html += `<div class="yearbook-cover"><div><h1>${E(year)}</h1><p>${STATE.result.total.toLocaleString()} 张影像，构成你的摄影记忆。按当前筛选挑选作品并导出摄影年鉴。</p></div><button data-action="export-yearbook">导出 PDF 年鉴</button></div>`;
    }
    html += `<div class="${STATE.view === 'film' ? 'film-strip-view' : 'photo-grid'}">${rows.map(photoCard).join('')}</div>`;
  }
  $('#view-content').innerHTML = html;
  const order = $('#timeline-order');
  if (order)
    order.onchange = () => {
      STATE.layout.timelineOrder = order.value;
      STATE.page = 0;
      $('#view-content').scrollTop = 0;
      clearSelection();
      refresh();
    };
}
function pickRecord(id, entity, event = {}) {
  const row = STATE.entities.get(id) || STATE.result.items.find((item) => item.id === id);
  if (!row) return;
  STATE.entities.set(id, row);
  const ids = STATE.result.items.map((r) => r.id),
    anchor = ids.indexOf(STATE.anchor),
    at = ids.indexOf(id);
  STATE.allMatching = false;
  if (event.shiftKey && anchor >= 0) {
    for (let i = Math.min(anchor, at); i <= Math.max(anchor, at); i++) STATE.selected.add(ids[i]);
  } else if (STATE.multi || event.metaKey || event.ctrlKey) {
    STATE.selected.has(id) ? STATE.selected.delete(id) : STATE.selected.add(id);
    STATE.anchor = id;
  } else {
    STATE.selected.clear();
    STATE.selected.add(id);
    STATE.anchor = id;
  }
  STATE.focus = { id, entity };
  STATE.inspectorTab = 'details';
  renderSelection();
  renderInspector(row, entity);
}
function resetInspector() {
  disposeInspectorMap?.();
  disposeInspectorMap = null;
  $('#inspector').innerHTML =
    '<div class="empty">选择胶卷或照片<br><small>档案、版本与实物位置会显示在这里</small></div>';
}
async function inspect(id, entity, tab) {
  STATE.focus = { id, entity };
  if (tab) STATE.inspectorTab = tab;
  let row = STATE.entities.get(id);
  if (!row || entity === 'photos')
    try {
      row = await api(
        '/' + entity + '/' + encodeURIComponent(id) + (STATE.query.trash ? '?trash=1' : ''),
      );
      STATE.entities.set(id, { ...STATE.entities.get(id), ...row });
    } catch (error) {
      toast(error.message, 'warning');
      return;
    }
  if (STATE.focus?.id === id && STATE.focus.entity === entity)
    renderInspector(STATE.entities.get(id), entity);
}
function renderInspector(row, entity) {
  disposeInspectorMap?.();
  disposeInspectorMap = null;
  if (!row) return;
  const tab = STATE.inspectorTab,
    roll = entity === 'rolls';
  $('#inspector').innerHTML =
    `<header class="inspector-header"><small>${E(roll ? row.code : row.rollCode || row.frameNo)}</small><h2>${E(row.name)}</h2><div class="inspector-tabs">${(roll
      ? [
          ['details', '档案'],
          ['physical', '底片位置'],
          ['notes', '记录'],
        ]
      : [
          ['details', '照片'],
          ['versions', '扫描版本'],
          ['exif', 'EXIF'],
        ]
    )
      .map(
        ([v, l]) =>
          `<button data-action="inspect-tab" data-value="${v}" class="${tab === v ? 'active' : ''}">${l}</button>`,
      )
      .join(
        '',
      )}</div></header><div class="inspector-body">${roll ? rollInspector(row, tab) : photoInspector(row, tab)}</div>`;
  const mapHost = $('#inspector').querySelector('[data-roll-map-preview]');
  if (mapHost)
    disposeInspectorMap = mountLocationPreview(
      mapHost,
      rollCoordinates(row),
      STATE.boot.lists.settings || {},
    );
  if (entity === 'photos' && tab === 'versions' && !row.versions) inspect(row.id, entity, tab);
}
function rollInspector(r, tab) {
  if (tab === 'physical') {
    const p = r.physical || {};
    return `<div class="qr-label"><img src="/api/v2/rolls/${encodeURIComponent(r.id)}/qr.svg" alt="胶卷永久编号二维码"><code>${E(r.code)}</code></div><p class="form-note">给片袋贴上编号，从照片直接找到原始底片。</p>${['cabinet', 'box', 'album', 'page', 'pocket'].map((k, i) => field('physical.' + k, ['柜子 / 架位', '盒子', '片册', '页码', '片袋 / 条号'][i], p[k] || '', 'text', 'data-inspect-field')).join('')}<button class="soft" data-action="print-one-label">打印此卷标签</button><button class="soft" data-action="scan-qr">识别片袋二维码</button>`;
  }
  if (tab === 'notes')
    return `${field('exposureIndex', '实际曝光指数 EI', r.exposureIndex, 'number', 'min="1" max="102400" data-inspect-field')}${field('processType', '冲洗方式', r.processType, 'text', 'data-inspect-field')}${field('lab', '冲洗店家', r.lab, 'text', 'data-inspect-field')}<label>冲洗记录<textarea name="process" rows="4" data-inspect-field>${E(r.process || '')}</textarea></label><label>归档备注<textarea name="notes" rows="5" data-inspect-field>${E(r.notes || '')}</textarea></label><div class="two-cols">${field('latitude', '纬度', r.latitude ?? '', 'number', 'step="any" data-inspect-field')}${field('longitude', '经度', r.longitude ?? '', 'number', 'step="any" data-inspect-field')}</div><div class="inspector-actions"><button data-action="map-selected">在地图中查看</button><button data-action="save-film-preset">保存为胶卷模板</button><button data-action="trash-focus">放入回收站</button></div>`;
  const coordinates = rollCoordinates(r);
  const location = `<section class="roll-location"><small>地点</small><strong>${E(r.location || (coordinates ? '未命名地点' : '未设置地点'))}</strong>${coordinates ? `<div class="roll-location-preview" data-roll-map-preview aria-label="胶卷拍摄位置"></div><small>${coordinateLabel(coordinates)}</small>` : r.location ? '<small>尚未在地图定位</small>' : ''}<div class="inspector-actions"><button data-action="edit-roll-location" data-value="${E(r.id)}">在地图设置</button>${coordinates ? `<button data-action="map-selected" data-value="${E(r.id)}">回忆地图</button>` : ''}</div></section>`;
  return `${field('name', '胶卷名称', r.name, 'text', 'data-inspect-field')}<label>胶片${select(
    'stock',
    Object.entries(STOCKS).map(([id, s]) => [id, s.brand + ' ' + s.name]),
    r.stock,
    'data-inspect-field',
  )}</label><div class="two-cols"><label>画幅${select(
    'format',
    ['135', '120 · 6×4.5', '120 · 6×6', '120 · 6×7', '120 · 6×9', '120 · 6×12', '120 · 6×17'].map(
      (v) => [v, v],
    ),
    r.format,
    'data-inspect-field',
  )}</label><label>状态${select('status', Object.entries(STATUS), r.status, 'data-inspect-field')}</label></div>${field('camera', '相机', r.camera, 'text', 'data-inspect-field')}${field('lens', '镜头', r.lens, 'text', 'data-inspect-field')}${location}<div class="inspector-date">${dateFields(r.date, r.datePrecision)}<button class="soft" data-action="save-roll-date">保存拍摄日期</button></div>${field('project', '拍摄项目', r.project, 'text', 'data-inspect-field')}<div class="inspector-actions"><button data-action="roll-photos" data-value="${E(r.id)}">查看整卷照片</button><button data-action="import-roll" data-value="${E(r.id)}">装入影像</button><button data-action="inspect-tab" data-value="physical">定位底片</button></div>`;
}
function photoInspector(p, tab) {
  if (tab === 'exif') {
    const exif = p.exif || {};
    return `<dl class="detail-list">${[
      ['相机', [exif.make, exif.model].filter(Boolean).join(' ') || p.camera],
      ['镜头', exif.lens || p.lens],
      ['尺寸', exif.width && `${exif.width} × ${exif.height}`],
      ['拍摄日期', p.date || p.rollDate],
      [p.fileDateSource === 'scan' ? '文件 EXIF 时间（扫描件）' : '文件 EXIF 时间', exif.date],
      ['ISO', exif.iso],
      ['光圈', exif.aperture && 'f/' + exif.aperture],
      [
        '快门',
        exif.exposure &&
          `${exif.exposure < 1 ? '1/' + Math.round(1 / exif.exposure) : exif.exposure} s`,
      ],
      ['焦距', exif.focalLength && exif.focalLength + ' mm'],
      ['文件', bytes(p.size)],
      ['原片', p.availability || '未检查'],
      ['底片编号', p.rollCode],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${E(v)}</dd></div>`)
      .join(
        '',
      )}</dl><section class="analysis-clues"><h3>本机识图线索</h3><p>${p.analysis?.analyzedAt ? new Date(p.analysis.analyzedAt).toLocaleString('zh-CN') : '尚未分析'}</p><p>${(
      p.analysis?.labels || []
    )
      .slice(0, 10)
      .map((label) => E(label.label) + ' ' + Math.round(label.confidence * 100) + '%')
      .join(
        ' · ',
      )}</p>${p.analysis?.text ? `<label>识别文字<textarea readonly rows="4">${E(p.analysis.text)}</textarea></label>` : ''}<small>线索用于辅助查找，不会改写人工标签。</small></section><div class="inspector-actions"><button data-action="inspect-roll">查看胶卷档案</button><button data-action="photo-analyze">分析此张影像</button><button data-action="locate-negative">定位原始底片</button></div>`;
  }
  if (tab === 'versions')
    return `<p class="form-note">同一格底片可收纳店扫、自扫、重扫和调色版本。主版本用于默认预览。</p>${(p.versions || []).map((v) => `<div class="version-row"><b>${E(v.name)}</b>${p.primary_version === v.id ? ' <span class="badge">主版本</span>' : ''}<p>${E({ scan: '扫描原版', rescan: '重扫', edit: '调色版本', export: '导出副本' }[v.kind] || v.kind)} · ${bytes(v.size)} · ${E(v.availability)}</p><div><button data-action="view-version" data-value="${E(v.id)}">查看</button>${p.primary_version !== v.id ? `<button data-action="primary-version" data-value="${E(v.id)}">设为主版本</button><button data-action="compare-version" data-value="${E(v.id)}">与主版本对比</button>` : ''}<button data-action="rename-version" data-value="${E(v.id)}">命名</button></div></div>`).join('')}<button class="soft" data-action="import-version">＋ 加入扫描版本</button>`;
  return `<div class="stars">${[1, 2, 3, 4, 5].map((n) => `<button data-action="rate" data-value="${n}" class="${n <= p.rating ? 'active' : ''}" aria-label="${n} 星">★</button>`).join('')}</div>${field('name', '照片名称', p.name, 'text', 'data-inspect-field')}${field('frameNo', '底片边码 / 格号', p.frameNo || '', 'text', 'data-inspect-field')}${field('strip', '底片条号', p.strip || '', 'text', 'data-inspect-field')}<div class="two-cols"><label>色标${select(
    'color',
    [
      ['', '无色标'],
      ['red', '红色'],
      ['yellow', '黄色'],
      ['green', '绿色'],
      ['blue', '蓝色'],
      ['purple', '紫色'],
    ],
    p.color,
    'data-inspect-field',
  )}</label><label>选片${select(
    'rejected',
    [
      ['0', '保留'],
      ['1', '淘汰'],
    ],
    p.rejected ? '1' : '0',
    'data-inspect-field',
  )}</label></div>${field('tags', '照片标签（逗号分隔）', (p.tags || []).join(', '), 'text', 'data-inspect-field')}<label>备注<textarea name="notes" rows="3" data-inspect-field>${E(p.notes || '')}</textarea></label><div class="inspector-actions"><button data-action="review-focus">进入看片台</button><button data-action="inspect-tab" data-value="versions">扫描版本 ${p.versionCount || 1}</button><button data-action="locate-negative">找到底片</button><button data-action="photo-location">设置拍摄位置</button><button class="soft" data-action="download-original" data-value="${E(p.id)}" ${['offline', 'missing'].includes(p.availability) ? 'disabled title="请连接原片后再导出；预览不能代替原片"' : ''}>导出原片…</button><button data-action="set-roll-cover">设为胶卷封面</button><button data-action="trash-focus">回收站</button></div>`;
}
async function patchRecord(entity, id, patch) {
  const row = STATE.entities.get(id) || (await api('/' + entity + '/' + encodeURIComponent(id))),
    updated = await api('/' + entity + '/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: { patch, expectedVersion: row.version },
    });
  STATE.entities.set(id, { ...row, ...updated });
  $('#save-status').textContent = '已保存 · ' + new Date().toLocaleTimeString('zh-CN');
  if (STATE.focus?.id === id) renderInspector(STATE.entities.get(id), entity);
  return STATE.entities.get(id);
}
async function saveRollDate(id, date, datePrecision) {
  await patchRecord('rolls', id, { date, datePrecision });
  await bootstrap();
  await refresh();
}
const atlas = createAtlas({
  api,
  E,
  thumb,
  toast,
  onFilterChange: (filter) => {
    STATE.query = { ...filter };
    STATE.page = 0;
    clearSelection();
  },
  onAdvancedFilters: advancedFilters,
  inspectRoll: (id) => inspect(id, 'rolls'),
  openRoll: (id) => action('roll-photos', id),
  openPhoto,
  savePosition: async (roll, patch) => {
    const r = await api('/rolls/' + encodeURIComponent(roll.id), {
      method: 'PATCH',
      body: { patch, expectedVersion: roll.version },
    });
    STATE.entities.set(r.id, r);
    return r;
  },
});
const bookDesigner = createBookDesigner({ api, job, toast, E, thumb });
const localeControl = installLocale();
const reviewer = createReviewer({
  api,
  formatSize: bytes,
  rollStatus: (status) => STATUS[status] || status,
  getMapTileURL: () => STATE.boot?.lists?.settings?.mapTileURL,
  toast,
  E,
  thumb,
  raw,
  patch: async (photo, patch) => {
    const result = await patchRecord('photos', photo.id, patch);
    return result;
  },
  onClose: (mapDestination, reviewed) => {
    if (mapDestination) {
      navigate(
        'atlas',
        {},
        {
          mapFocusId: mapDestination.rollId,
          mapFocusCoordinates: mapDestination.coordinates,
        },
      );
      return;
    }
    if (STATE.workspace === 'archive') {
      if (STATE.focus) inspect(STATE.focus.id, STATE.focus.entity);
      return;
    }
    const content = $('#view-content'),
      scroll = content.scrollTop,
      followsRoll =
        STATE.workspace === 'lighttable' &&
        STATE.query.rollId &&
        reviewed?.photo?.roll_id === STATE.query.rollId;
    if (followsRoll) {
      STATE.focus = { id: reviewed.photo.id, entity: 'photos' };
      STATE.inspectorTab = 'details';
      STATE.page = reviewed.page;
      if (!STATE.multi && STATE.selected.size <= 1) {
        STATE.selected.clear();
        STATE.selected.add(reviewed.photo.id);
      }
    }
    refresh().then(() => {
      content.scrollTop = scroll;
      if (followsRoll)
        content
          .querySelector('[data-record="' + CSS.escape(reviewed.photo.id) + '"]')
          ?.scrollIntoView({ block: 'nearest' });
    });
    if (STATE.focus) inspect(STATE.focus.id, STATE.focus.entity);
  },
  saveWinners: (ids) => newCollection(ids),
});
function rulesEditor(existing = {}, seed = true) {
  const conditions = existing.conditions || [];
  return `<div class="form-grid"><label class="wide">匹配方式${select(
    'ruleMatch',
    [
      ['all', '全部条件都满足（AND）'],
      ['any', '任一条件满足（OR）'],
    ],
    existing.match || 'all',
  )}</label></div><div id="rules-list" class="rules">${(conditions.length ? conditions : seed ? [{ field: 'rating', op: 'gte', value: '4' }] : []).map(ruleRow).join('')}</div><button type="button" class="text" data-action="add-rule">＋ 增加条件</button>`;
}
function ruleValueControl(fieldName, value = '') {
  return fieldName === 'date'
    ? dateFields(value, 'day', { name: 'ruleValue' })
    : `<input name="ruleValue" value="${E(value)}" placeholder="条件值">`;
}
function ruleRow(rule = {}) {
  return `<div class="rule-row">${select('ruleField', Object.entries({ rating: '照片评分', color: '照片色标', rejected: '淘汰标记', name: '名称', stock: '胶片编号', camera: '相机', lens: '镜头', location: '地点', date: '日期', project: '项目' }), rule.field || 'rating')}${select(
    'ruleOp',
    [
      ['eq', '等于'],
      ['neq', '不等于'],
      ['gte', '大于或等于'],
      ['lte', '小于或等于'],
      ['contains', '包含'],
    ],
    rule.op || 'eq',
  )}<div data-rule-value>${ruleValueControl(rule.field, rule.value ?? '')}</div><button type="button" data-action="remove-rule" aria-label="移除条件">×</button></div>`;
}
function readRules() {
  return {
    match: $('#editor-form [name="ruleMatch"]')?.value || 'all',
    conditions: $$('#rules-list .rule-row')
      .map((row) => ({
        field: row.querySelector('[name="ruleField"]').value,
        op: row.querySelector('[name="ruleOp"]').value,
        value: row.querySelector('[name="ruleValue"]').value,
      }))
      .filter((rule) => rule.value !== ''),
  };
}
function advancedFilters() {
  const q = STATE.query;
  modal(
    '组合筛选与排序',
    `<p class="form-note">条件在服务端执行。可以把这组条件保存成自动更新的智能集合。</p><div class="form-grid"><label>相机${select('camera', [['', '全部相机'], ...(STATE.boot.facets.camera || []).map((r) => [r.value, r.value])], q.camera)}</label><label>胶片${select('stock', [['', '全部胶片'], ...(STATE.boot.facets.stock || []).map((r) => [r.value, STOCKS[r.value]?.name || r.value])], q.stock)}</label>${field('from', '起始日期', q.from || '', 'date')}${field('to', '结束日期', q.to || '', 'date')}<label>选片${select(
      'review',
      [
        ['', '全部照片'],
        ['kept', '排除淘汰'],
        ['rejected', '仅淘汰'],
      ],
      q.review,
    )}</label><label>影像类型${select(
      'type',
      [
        ['', '照片与视频'],
        ['image', '照片'],
        ['video', '视频'],
      ],
      q.type,
    )}</label>${field('tag', '指定照片标签', q.tag || '')}<label>排序${select(
      'sort',
      STATE.workspace === 'archive'
        ? [
            ['code', '编号倒序'],
            ['date', '拍摄日期'],
            ['name', '名称'],
          ]
        : [
            ['date', '拍摄日期'],
            ['rating', '评分'],
            ['name', '名称'],
            ['frame', '底片顺序'],
          ],
      q.sort || 'date',
    )}</label><label class="wide"><input name="semantic" type="checkbox" ${q.semantic ? 'checked' : ''}> 语义线索：结合本地识图标签和 OCR 检索，不改变人工标签</label></div>${rulesEditor(q.rules, STATE.workspace !== 'atlas')}<div class="form-grid" style="margin-top:15px">${field('smartName', '可选：保存成智能集合', '')}</div>`,
    async (form) => {
      const v = formValues(form);
      for (const key of ['camera', 'stock', 'from', 'to', 'review', 'type', 'tag', 'sort']) {
        if (v[key]) STATE.query[key] = v[key];
        else delete STATE.query[key];
      }
      STATE.query.semantic = form.elements.semantic.checked;
      STATE.query.rules = readRules();
      if (v.smartName.trim()) {
        await api('/collections', {
          method: 'POST',
          body: { name: v.smartName.trim(), kind: 'smart', rules: { ...STATE.query } },
        });
        await bootstrap();
      }
      STATE.page = 0;
      clearSelection();
      renderQuery();
      refresh();
    },
    '应用筛选',
    'QUERY BUILDER',
  );
}
async function newCollection(ids = null, id = null) {
  const existing = STATE.boot.lists.collections.find((c) => c.id === id);
  modal(
    existing ? '编辑收藏' : '新建收藏',
    `<div class="form-grid">${field('name', '收藏名称', existing?.name || '', 'text', 'required maxlength="60"')}<label>归属集合${select('parentId', [['', '顶层集合'], ...STATE.boot.lists.collections.filter((c) => c.id !== id && !c.parentId).map((c) => [c.id, c.name])], existing?.parentId || '')}</label><label class="wide">集合类型${select(
      'kind',
      [
        ['manual', '手动收藏：加入指定照片'],
        ['smart', '智能集合：自动匹配条件'],
      ],
      existing?.kind || 'manual',
    )}</label></div>${rulesEditor(existing?.rules?.rules || existing?.rules || {})}${existing ? '<div class="inspector-actions"><button type="button" class="danger" data-action="delete-list" data-type="collections" data-value="' + E(id) + '">移入回收站</button></div>' : ''}`,
    async (form) => {
      const v = formValues(form),
        data = {
          name: v.name.trim(),
          parentId: v.parentId || null,
          kind: v.kind,
          rules:
            v.kind === 'smart'
              ? { ...STATE.query, collectionId: undefined, rules: readRules() }
              : undefined,
        };
      if (!data.name) throw new Error('请填写收藏名称');
      let result;
      if (existing)
        result = await api('/collections/' + encodeURIComponent(id), {
          method: 'PATCH',
          body: { patch: data, expectedVersion: existing.version },
        });
      else result = await api('/collections', { method: 'POST', body: data });
      if (ids?.length && v.kind === 'manual')
        await api('/collections/' + result.id + '/members', { method: 'POST', body: { ids } });
      await bootstrap();
      toast('收藏已保存');
      renderSidebar();
    },
    '保存收藏',
    'COLLECTIONS',
  );
}
function editProject(id = null) {
  const p = STATE.boot.lists.projects.find((row) => row.id === (id || STATE.projectId));
  modal(
    p ? '项目设置' : '新建摄影项目',
    `<div class="form-grid">${field('name', '项目名称', p?.name || '', 'text', 'required maxlength="80"')}<label>章节（逗号分隔）<input name="chapters" value="${E((p?.chapters || ['未分章']).join(', '))}"></label><label class="wide">项目说明<textarea name="description" rows="4">${E(p?.description || '')}</textarea></label></div>${p ? '<button type="button" class="text" data-action="delete-list" data-type="projects" data-value="' + E(p.id) + '">将项目移入回收站</button>' : ''}`,
    async (form) => {
      const v = formValues(form),
        patch = {
          name: v.name.trim(),
          description: v.description,
          chapters: [
            ...new Set(
              v.chapters
                .split(/[,，]/)
                .map((s) => s.trim())
                .filter(Boolean),
            ),
          ],
        };
      const result = p
        ? await api('/projects/' + p.id, {
            method: 'PATCH',
            body: { patch, expectedVersion: p.version },
          })
        : await api('/projects', { method: 'POST', body: patch });
      await bootstrap();
      navigate('projects', {}, { projectId: result.id });
    },
    '保存项目',
    'PROJECTS',
  );
}
async function addTo() {
  if (STATE.allMatching) {
    const preview = await api('/batch-preview', {
      method: 'POST',
      body: { entity: 'photos', selection: selection() },
    });
    if (preview.count > 10000) throw new Error('请缩小选择范围');
    const all = await loadSelectedIds();
    STATE.selected = new Set(all);
    STATE.allMatching = false;
  }
  const ids = [...STATE.selected];
  if (!ids.length) throw new Error('请先选择照片');
  modal(
    '把照片加入主题',
    `<p class="form-note">已选择 ${ids.length} 张照片；归类不复制原始文件。</p><div class="form-grid"><label>加入收藏${select('collectionId', [['', '不加入'], ...STATE.boot.lists.collections.filter((c) => c.kind !== 'smart').map((c) => [c.id, c.name])], '')}</label><label>加入项目${select('projectId', [['', '不加入'], ...STATE.boot.lists.projects.map((p) => [p.id, p.name])], '')}</label>${field('newCollection', '或新建收藏', '')}${field('newProject', '或新建项目', '')}</div>`,
    async (form) => {
      const v = formValues(form);
      let col = v.collectionId,
        project = v.projectId;
      if (v.newCollection.trim())
        col = (
          await api('/collections', {
            method: 'POST',
            body: { name: v.newCollection.trim(), kind: 'manual' },
          })
        ).id;
      if (v.newProject.trim())
        project = (
          await api('/projects', {
            method: 'POST',
            body: { name: v.newProject.trim(), chapters: ['未分章'] },
          })
        ).id;
      if (col) await api('/collections/' + col + '/members', { method: 'POST', body: { ids } });
      if (project)
        await api('/projects/' + project + '/members', { method: 'POST', body: { ids } });
      await bootstrap();
      toast('已加入归类');
    },
    '加入',
  );
}
async function loadSelectedIds() {
  if (!STATE.allMatching) return [...STATE.selected];
  const ids = [];
  for (let page = 0; ids.length < STATE.result.total; page++) {
    const result = await api(
      '/photos?filter=' +
        encodeURIComponent(JSON.stringify({ ...resultQuery(), page, limit: 200 })),
    );
    ids.push(...result.items.map((r) => r.id));
    if (!result.items.length) break;
  }
  return ids;
}
function locationPickerFields(name = 'value', record = {}, { split = false } = {}) {
  const coordinates = rollCoordinates(record),
    search = `<div class="batch-location-search"><label>搜索地点<input type="search" data-location-search value="${E(record.location || '')}"></label><button type="button" class="soft" data-location-find disabled>搜索</button></div><select data-location-results aria-label="地点搜索结果" hidden></select>`,
    map = `<div class="batch-location-map" aria-label="设置拍摄位置"></div><output>${coordinates ? coordinateLabel(coordinates) : '点击地图标记拍摄位置'}</output>`,
    place = `<label>地名（可选）<input data-location-name name="${name}" value="${E(record.location || '')}"></label>`;
  return (
    (split ? `<div>${search}${place}</div><div>${map}</div>` : search + map + place) +
    `<input type="hidden" name="latitude" value="${E(coordinates?.latitude)}"><input type="hidden" name="longitude" value="${E(coordinates?.longitude)}">`
  );
}
function rollLocationPatch(values) {
  const location = String(values.location ?? '').trim(),
    coordinates = rollCoordinates(values);
  if (location && !coordinates) throw Error('请选择搜索结果或在地图上点选位置');
  return {
    location,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
  };
}
async function batchEditor() {
  const entity = currentEntity(),
    rolls = entity === 'rolls',
    sel = selection(),
    preview = await api('/batch-preview', {
      method: 'POST',
      body: { entity, selection: sel, includeTags: true },
    }),
    fields = rolls
      ? {
          stock: '胶片型号',
          format: '画幅',
          status: '胶卷状态',
          date: '拍摄日期',
          camera: '相机',
          lens: '镜头',
          location: '地点',
          project: '拍摄项目',
          name: '胶卷名称',
          tags: '胶卷标签',
        }
      : {
          rating: '照片评分',
          color: '照片色标',
          rejected: '选片',
          date: '拍摄日期',
          tags: '照片标签',
          notes: '照片备注',
        };
  const choices = (values) => [...new Set(values.filter(Boolean))].map((value) => [value, value]);
  const facets = STATE.boot.facets || {},
    facetValues = (key) => (facets[key] || []).map((entry) => entry.value),
    options = {
      stock: Object.entries(STOCKS).map(([id, stock]) => [
        id,
        [stock.brand, stock.name].filter(Boolean).join(' '),
      ]),
      format: choices([
        '135',
        '120 · 6×4.5',
        '120 · 6×6',
        '120 · 6×7',
        '120 · 6×9',
        '120 · 6×12',
        '120 · 6×17',
        ...facetValues('format'),
      ]),
      status: Object.entries(STATUS),
      rating: [[0, '未评分'], ...[1, 2, 3, 4, 5].map((rating) => [rating, '★'.repeat(rating)])],
      color: [
        ['none', '无色标'],
        ['red', '红色'],
        ['yellow', '黄色'],
        ['green', '绿色'],
        ['blue', '蓝色'],
        ['purple', '紫色'],
      ],
      rejected: [
        ['0', '保留'],
        ['1', '淘汰'],
      ],
    };
  const clearable = new Set(['date', 'camera', 'lens', 'location', 'project', 'tags', 'notes']);
  modal(
    rolls ? '批量修改胶卷档案' : '批量修改照片档案',
    `<p class="form-note important">将修改 ${preview.count.toLocaleString()} ${rolls ? '卷' : '张'}。修改会写入历史，可在记录未再次修改时撤销。</p><div class="batch-edit"><label>修改字段${select('field', Object.entries(fields), Object.keys(fields)[0])}</label><fieldset data-batch-value></fieldset><label data-batch-clear><input type="checkbox" name="clear"><span>清空此字段</span></label></div>`,
    async (form) => {
      const key = form.elements.field.value,
        clear = form.elements.clear.checked && clearable.has(key),
        data = new FormData(form);
      let value = clear ? '' : String(data.get('value') ?? '').trim();
      if (key === 'tags') {
        const tags = value
          .split(/[,，]/)
          .map((tag) => tag.trim())
          .filter(Boolean);
        value = clear ? [] : [...new Set([...data.getAll('existingTag'), ...tags])];
        if (!clear && !value.length) throw Error('请输入或选择标签，或勾选清空此字段');
      } else if (key !== 'location' && !clear && !value) throw Error('请设置要写入的值');
      if (key === 'rating') value = Number(value);
      if (key === 'rejected') value = value === '1';
      if (key === 'color' && value === 'none') value = '';
      const patch = { [key]: value };
      if (key === 'location') {
        const coordinates = rollCoordinates({
          latitude: data.get('latitude'),
          longitude: data.get('longitude'),
        });
        if (!clear && !coordinates) throw Error('请在地图上设置地点');
        Object.assign(patch, clear ? { latitude: null, longitude: null } : coordinates);
      }
      if (rolls && key === 'date')
        patch.datePrecision = clear ? 'day' : form.elements.datePrecision.value;
      await api('/batch', {
        method: 'POST',
        body: {
          entity,
          selection: { ...sel, expectedRevision: preview.revision },
          patch,
          label: '批量修改' + fields[key],
        },
      });
      clearSelection();
      await bootstrap();
      refresh();
      toast('批量修改已保存');
    },
    '确认修改',
    'BATCH METADATA',
  );
  const form = $('#editor-form'),
    valueBox = form.querySelector('[data-batch-value]'),
    clearBox = form.querySelector('[data-batch-clear]');
  let disposeLocation;
  $('#editor').addEventListener('close', () => disposeLocation?.(), { once: true });
  function renderValue() {
    const key = form.elements.field.value;
    disposeLocation?.();
    disposeLocation = null;
    clearBox.hidden = !clearable.has(key);
    clearBox.querySelector('span').textContent =
      key === 'location' ? '清空地点和坐标' : '清空此字段';
    form.elements.clear.checked = false;
    valueBox.disabled = false;
    if (key === 'date')
      valueBox.innerHTML = dateFields('', 'day', { name: 'value', required: true });
    else if (key === 'tags') {
      valueBox.innerHTML = `${field('value', fields[key], '', 'text', 'placeholder="多个标签用逗号分隔"')}${
        preview.tags.length
          ? `<p class="batch-tag-label">已有标签</p><div class="batch-tags">${preview.tags.map((tag) => `<label><input type="checkbox" name="existingTag" value="${E(tag)}"><span>${E(tag)}</span></label>`).join('')}</div>`
          : ''
      }<small>本次设置的标签将替换原有标签。</small>`;
    } else if (key === 'location') {
      valueBox.innerHTML = locationPickerFields();
      disposeLocation = mountLocationPicker(valueBox, {
        api,
        preferences: STATE.boot.lists.settings || {},
      });
    } else if (key === 'notes') {
      valueBox.innerHTML =
        '<label>照片备注<textarea name="value" rows="4" required></textarea></label>';
    } else if (Object.hasOwn(options, key)) {
      const list = options[key];
      valueBox.innerHTML = `<label>${fields[key]}${select('value', [['', '请选择'], ...list], '', 'required')}</label>`;
    } else {
      const suggestions = facetValues(key);
      valueBox.innerHTML = field(
        'value',
        fields[key],
        '',
        'text',
        suggestions.length ? 'required list="batch-field-suggestions"' : 'required',
      );
      if (suggestions.length)
        valueBox.innerHTML += `<datalist id="batch-field-suggestions">${suggestions.map((value) => option(value, value)).join('')}</datalist>`;
    }
  }
  form.elements.field.onchange = renderValue;
  form.elements.clear.onchange = () => (valueBox.disabled = form.elements.clear.checked);
  renderValue();
}
async function trashSelected(restore = false) {
  const entity = currentEntity(),
    sel = selection(),
    preview = await api('/batch-preview', { method: 'POST', body: { entity, selection: sel } });
  modal(
    restore ? '恢复归档记录' : '移入回收站',
    `<p class="form-note">${preview.count} ${entity === 'rolls' ? '卷' : '张'}记录将${restore ? '恢复到资料库' : '移入回收站，原始文件会保留，清空回收站时才释放托管文件空间'}。</p>`,
    async () => {
      await api('/batch', {
        method: 'POST',
        body: {
          entity,
          selection: { ...sel, expectedRevision: preview.revision },
          patch: { deleted_at: restore ? null : Date.now() },
          label: restore ? '从回收站恢复' : '移入回收站',
        },
      });
      clearSelection();
      await bootstrap();
      refresh();
    },
    restore ? '恢复' : '移入回收站',
    'RECOVERABLE ARCHIVE',
  );
}
function newRoll() {
  const presets = STATE.boot.lists.presets || [],
    defaults = presets[0]?.metadata || {};
  modal(
    '装一卷新胶片',
    `<div class="form-grid new-roll-form"><label>胶卷模板${select('rollPreset', [['', '手动设置'], ...presets.map((preset) => [preset.id, preset.name])], '')}</label>${field('name', '胶卷名称', '新胶卷', 'text', 'required maxlength="80" autofocus')}<label>画幅${select(
      'format',
      ['135', '120 · 6×4.5', '120 · 6×6', '120 · 6×7', '120 · 6×9', '120 · 6×12', '120 · 6×17'].map(
        (v) => [v, v],
      ),
      defaults.format || '135',
    )}</label>${field('camera', '相机', defaults.camera || '')}${dateFields()}<section class="wide roll-location-editor" data-new-roll-location>${locationPickerFields('location', {}, { split: true })}</section><label class="wide">搜索胶片<input id="stock-search" placeholder="搜索型号、厂牌、ISO…"></label><input name="stock" type="hidden" value="portra400"><div class="wide stock-filters"><label>规格${select(
      'stockFormat',
      [
        ['all', '全部规格'],
        ['135', '135'],
        ['120', '120'],
      ],
      String(defaults.format || '135').startsWith('120') ? '120' : '135',
      'id="stock-format-filter"',
    )}</label><label>类型${select(
      'stockType',
      [
        ['all', 'BW + Color'],
        ['bw', 'BW · 黑白'],
        ['color', 'Color · 彩色'],
      ],
      'all',
      'id="stock-type-filter"',
    )}</label><label>厂牌${select('stockBrand', [['all', '全部厂牌'], ...[...new Set(Object.values(STOCKS).map((s) => s.brand))].sort().map((v) => [v, v])], 'all', 'id="stock-brand-filter"')}</label><button type="button" class="soft" data-action="custom-stock">＋ 添加未收录胶片</button></div><p id="stock-count" class="wide"></p><div class="wide stock-picker" id="stock-picker"></div></div>`,
    async (form) => {
      const v = formValues(form),
        row = await api('/rolls', {
          method: 'POST',
          body: {
            ...presets.find((preset) => preset.id === v.rollPreset)?.metadata,
            ...v,
            ...rollLocationPatch(v),
          },
        });
      STATE.entities.set(row.id, row);
      await bootstrap();
      navigate('lighttable', { rollId: row.id });
      await inspect(row.id, 'rolls');
      toast('胶卷已创建 · ' + row.code);
    },
    '创建胶卷',
    'NEW FILM ROLL',
  );
  const locationHost = $('#editor-body').querySelector('[data-new-roll-location]'),
    mapPreferences = STATE.boot.lists.settings || {};
  let disposeLocation = mountLocationPicker(locationHost, { api, preferences: mapPreferences });
  $('#editor').addEventListener('close', () => disposeLocation(), { once: true });
  $('#editor-form [name="rollPreset"]').onchange = (event) => {
    const preset = presets.find((item) => item.id === event.target.value);
    if (!preset) return;
    const form = event.target.form;
    for (const key of ['camera', 'format', 'stock']) {
      if (preset.metadata[key]) form.elements[key].value = preset.metadata[key];
    }
    disposeLocation();
    locationHost.innerHTML = locationPickerFields('location', preset.metadata, { split: true });
    disposeLocation = mountLocationPicker(locationHost, { api, preferences: mapPreferences });
    form.querySelector('[name=format]').dispatchEvent(new Event('change'));
    renderStocks('');
  };
  renderStocks('');
  $('#stock-search').oninput = (e) => renderStocks(e.target.value);
  for (const id of ['#stock-format-filter', '#stock-type-filter', '#stock-brand-filter'])
    $(id).onchange = () => {
      const format = $('#stock-format-filter').value,
        field = $('#editor-form [name=format]');
      if (format === '135') field.value = '135';
      if (format === '120' && !field.value.startsWith('120')) field.value = '120 · 6×6';
      renderStocks($('#stock-search').value);
    };
  $('#editor-form [name=format]').onchange = (e) => {
    $('#stock-format-filter').value = e.target.value.startsWith('120') ? '120' : '135';
    renderStocks($('#stock-search').value);
  };
}
function renderStocks(query) {
  const chosen = $('#editor-form [name="stock"]').value,
    results = filterStocks({
      query,
      format: $('#stock-format-filter')?.value || 'all',
      type: $('#stock-type-filter')?.value || 'all',
      brand: $('#stock-brand-filter')?.value || 'all',
    });
  $('#stock-count').textContent =
    `${results.length} 个型号 · 当前选择 ${STOCKS[chosen]?.brand || ''} ${STOCKS[chosen]?.name || chosen} · 含历史型号，非在售清单`;
  $('#stock-picker').innerHTML =
    results
      .map(
        ([id, s]) =>
          `<button type="button" class="stock-choice ${chosen === id ? 'active' : ''}" data-action="choose-stock" data-value="${id}" style="--stock:${s.color2}"><b>${E(s.name)}</b><small>${E(s.brand)} · ISO ${E(s.iso)} · ${s.group === 'bw' ? 'BW' : 'Color'} · ${E(s.formats.join(' / '))}</small></button>`,
      )
      .join('') || '<p class="muted">没有匹配型号。可清除筛选，或添加自己的胶片。</p>';
  requestAnimationFrame(() => $('#stock-picker .active')?.scrollIntoView({ block: 'nearest' }));
}
function customStock() {
  const dialog = document.createElement('dialog');
  dialog.className = 'book-format-dialog';
  dialog.innerHTML = `<form><h2>添加未收录的胶片</h2>${field('brand', '厂牌', '', 'text', 'required')}${field('name', '胶片型号', '', 'text', 'required')}${field('iso', 'ISO / 感光度', '100')}<label>类型${select(
    'group',
    [
      ['color', 'Color 彩色负片'],
      ['bw', 'BW 黑白'],
      ['slide', '彩色反转'],
      ['cinema', '电影胶片'],
    ],
    'color',
  )}</label><fieldset><legend>支持规格</legend>${['135', '120', '110', '127', '220', 'sheet', 'other'].map((v) => `<label><input type="checkbox" name="formats" value="${v}" ${v === '135' ? 'checked' : ''}> ${v}</label>`).join('')}</fieldset>${field('aliases', '搜索别名 / 旧名称', '')}<button type="submit">保存并选择</button><button type="button" id="custom-cancel">取消</button><p class="form-note">可记录停产、分装、小厂牌或自定义型号；不会改名已有胶卷。</p></form>`;
  document.body.append(dialog);
  dialog.querySelector('#custom-cancel').onclick = () => dialog.close();
  dialog.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const data = new FormData(e.target),
        stock = await api('/stocks', {
          method: 'POST',
          body: { ...Object.fromEntries(data), formats: data.getAll('formats') },
        });
      STATE.boot.lists.customStocks = [...(STATE.boot.lists.customStocks || []), stock];
      mergeCustomStocks(STATE.boot.lists.customStocks);
      $('#editor-form [name=stock]').value = stock.id;
      $('#stock-search').value = '';
      $('#stock-format-filter').value = 'all';
      $('#stock-type-filter').value = 'all';
      $('#stock-brand-filter').value = 'all';
      renderStocks('');
      dialog.close();
    } catch (e) {
      toast(e.message, 'warning');
    }
  };
  dialog.onclose = () => dialog.remove();
  dialog.showModal();
}

function renderProjects() {
  const projects = STATE.boot.lists.projects;
  $('#view-content').innerHTML = projects.length
    ? `<div class="project-grid">${projects.map((p) => `<article class="project-card" data-action="project" data-value="${p.id}"><small>PHOTOGRAPHIC PROJECT</small><h2>${E(p.name)}</h2><p>${E(p.description || '开始构建你的摄影系列')}</p><footer>${(p.chapters || []).length || 1} 个章节 · 进入项目 →</footer></article>`).join('')}</div>`
    : '<div class="empty">创建旅行、专题或作品系列<button class="soft" data-action="new-project">新建摄影项目</button></div>';
  $('#pagination').hidden = true;
}
let projectItems = [];
async function renderCanvas(request = STATE.request) {
  const items = await api('/projects/' + STATE.projectId + '/items');
  if (request !== STATE.request) return;
  projectItems = items;
  const html = projectItems
    .map(
      (item) =>
        `<article class="curation-item" data-item="${item.id}" style="left:${Number(item.x)}px;top:${Number(item.y)}px;width:${Number(item.w)}px;height:${Number(item.h)}px;transform:rotate(${Number(item.rotation)}deg)">${img(item.mediaId, item.name)}<small>${E(item.name)}</small><i class="resize-corner" aria-label="拖动缩放照片"></i></article>`,
    )
    .join('');
  $('#view-content').innerHTML = html
    ? `<div class="curation-viewport"><div class="curation-board" style="transform:scale(${STATE.curationScale})">${html}</div></div>${projectItems.length === 2000 ? '<p class="form-note">画布显示前 2,000 张，更多照片请通过项目照片序列浏览。</p>' : ''}<div class="curation-toolbar"><button data-action="canvas-minus">−</button><span>${Math.round(STATE.curationScale * 100)}%</span><button data-action="canvas-plus">＋</button><button data-action="canvas-arrange">自动排版</button><button data-action="project-view" data-value="photos">返回照片序列</button></div>`
    : '<div class="empty">先从看片台选择照片加入项目，再来策展<button class="soft" data-action="all-photos">浏览全库照片</button></div>';
  $('#pagination').hidden = true;
}
async function renderStorage(request) {
  const tab = STATE.storageTab;
  $('#pagination').hidden = true;
  $('#selection-bar').hidden = true;
  let html = '';
  const stats = STATE.boot.stats || {};
  if (tab === 'overview') {
    const health = STATE.boot.error ? null : await api('/health');
    html = `<section class="section-card library-next"><header><h2>待处理事项</h2></header><div class="inspector-actions"><button data-action="job-previews">补齐预览 · ${health?.previews?.missing || 0}</button><button data-action="scope" data-value="offline">离线 / 断链 · ${health?.offline || 0}</button><button data-action="storage-tab" data-value="backups">查看并核验备份</button></div>${(health?.previews?.affectedRolls || []).map((roll) => `<div class="storage-row"><div><b>${E(roll.name)}</b><p>${[roll.missing && roll.missing + ' 个大预览待补', roll.disconnected && roll.disconnected + ' 个原片需检查'].filter(Boolean).join(' · ')}</p></div><button data-action="roll-photos" data-value="${E(roll.id)}">看整卷</button>${roll.missing ? `<button data-action="roll-previews" data-value="${E(roll.id)}">补齐这卷</button>` : ''}</div>`).join('')}</section><div class="stats-grid">${[
      ['胶卷', stats.rolls || 0],
      ['影像', stats.photos || 0],
      ['原片占用', bytes(health?.bytes || 0)],
      ['离线 / 断链', health?.offline || 0],
    ]
      .map(
        ([l, v]) =>
          `<div class="stat-card"><small>${l}</small><b>${E(typeof v === 'number' ? v.toLocaleString() : v)}</b></div>`,
      )
      .join(
        '',
      )}</div><section class="section-card"><header><h2>当前资料库</h2><button class="soft" data-action="switch-library">打开其他资料库</button></header><p>${E(STATE.boot.root)}</p><p>${STATE.boot.error ? E(STATE.boot.error) : '主数据库按记录保存；照片、扫描版本与底片位置分别归档。'}</p><div class="inspector-actions"><button data-action="job-index">检查原片</button><button data-action="job-previews">生成离线预览</button><button data-action="job-analyze">本地识图与 OCR</button><button data-action="job-integrity">数据库完整性检查</button></div></section><section class="section-card offline-summary"><header><h2>离线预览</h2><button class="soft" data-action="offline-help">怎么使用</button></header><p><strong>${health?.previews?.ready || 0} / ${health?.previews?.images || 0}</strong> 份原片已有浏览缓存 · ${health?.previews?.large || 0} 份有较大预览</p><p>在线时生成预览；外置盘断开后，仍在“全库照片”中查看。离线 / 断链只是原片状态筛选，不是导入入口。</p><div class="inspector-actions"><button data-action="job-previews">生成或补齐预览</button><button data-action="scope" data-value="photos">查看照片</button></div></section><section class="section-card"><header><h2>存储卷与离线原片</h2><button class="soft" data-action="new-storage">＋ 登记外部存储</button></header>${(STATE.boot.lists?.storages || []).map((s) => `<div class="storage-row"><div><b>${E(s.name)}</b> <span class="badge">${s.managed ? '托管原片' : '引用原片'}</span><p>${E(s.root)}</p></div>${!s.managed ? `<button data-action="storage-import" data-value="${s.id}">引用导入</button><button data-action="storage-reconnect" data-value="${s.id}">重新连接</button>` : ''}</div>`).join('')}</section>${health ? `<section class="section-card"><header><h2>断链与离线文件</h2><small>显示前 200 项</small></header>${health.missing.length ? health.missing.map((m) => `<div class="storage-row"><div><b>${E(m.path)}</b><p>${E(m.availability === 'offline' ? '存储卷离线' : m.availability === 'changed' ? '内容已变化，原始哈希不匹配' : '原片暂缺')} · ${m.hash ? '已有哈希校验' : '尚无原始哈希'}</p></div><button data-action="repair-media" data-value="${E(m.id)}">连接原片</button>${m.photoId ? `<button data-action="inspect-photo" data-value="${E(m.photoId)}">查看档案</button>` : ''}</div>`).join('') : '<p>当前没有发现断链。</p>'}</section><section class="section-card"><header><h2>未归档原片</h2><small>${health.orphans?.count || 0} 个 · 不自动删除</small></header>${(health.orphans?.files || []).map((f) => `<p>${E(f.path)} · ${bytes(f.size)}</p>`).join('') || '<p>检查原片后显示未被目录引用的托管文件。</p>'}</section><section class="section-card"><header><h2>完全重复的原片</h2><small>${health.duplicateGroupTotal ?? health.duplicates.length} 组 · 仅展示检查结果</small></header>${health.duplicates.map((g) => `<div class="storage-row"><div><b>${g.copies} 份相同文件 · 每份 ${bytes(g.size)}</b><p>${E(g.hash.slice(0, 20))}…</p></div><button data-action="duplicate-group" data-value="${g.hash}">查看这一组</button></div>`).join('') || '<p>尚未发现完全相同的原片。</p>'}</section>` : ''}<section class="section-card"><h2>个人胶片数据库</h2><h3>常用胶片</h3>${bars(stats.stocks || [], (r) => STOCKS[r.label]?.name || r.label)}<h3 style="margin-top:22px">相机搭配</h3>${bars(stats.cameras || [], (r) => r.label)}</section>`;
  }
  if (tab === 'backups') {
    const backups = await api(
      '/backups' + (STATE.backupRoot ? '?root=' + encodeURIComponent(STATE.backupRoot) : ''),
    );
    STATE.backupRoot = backups.root;
    html = `<section class="section-card"><header><h2>可校验的原片备份</h2><button class="primary" data-action="backup">创建增量备份</button></header><p>每次保存独立目录快照，已备份的相同原片对象会复用。恢复先验证内容，再写入新的资料库文件夹。</p><div class="query-bar" style="padding:0;border:0;background:none"><input id="backup-root" value="${E(backups.root)}" aria-label="备份位置"><button class="soft" data-action="backup-root">读取此位置</button></div></section><section class="section-card"><header><h2>备份快照</h2><small>${backups.items.length} 个</small></header>${backups.items.map((b) => `<div class="backup-row"><div><b>${E(b.title)}</b> <span class="badge ${b.complete ? '' : 'bad'}">${b.complete ? '原片完整' : '缺失 ' + b.missing + ' 个原片'}</span><p>${new Date(b.createdAt).toLocaleString('zh-CN')} · ${b.files} 个文件 · 本次新增 ${bytes(b.newBytes)} · ${b.verification?.state === 'completed' ? '已校验 ' + new Date(b.verification.time).toLocaleDateString('zh-CN') : b.verification?.state === 'failed' ? '校验失败' : '待校验'}</p></div><button class="soft" data-action="verify-backup" data-value="${b.id}">验证与恢复预览</button></div>`).join('') || '<p>还没有备份。选择本地、移动硬盘或 NAS 文件夹创建第一份快照。</p>'}</section>`;
    STATE.backups = backups.items;
  }
  if (tab === 'history') {
    const historyRows = await api('/history');
    html = `<section class="section-card"><h2>操作历史</h2><p>逐条保存和批量修改都保留记录；撤销会检查后续修改，避免覆盖新内容。</p>${historyRows.map((h) => `<div class="history-row"><div><b>${E(h.label)}</b><p>${new Date(h.time).toLocaleString('zh-CN')} · ${h.state === 'undone' ? '已撤销' : '已应用'}</p></div><button data-action="history-${h.state === 'undone' ? 'redo' : 'undo'}" data-value="${h.id}">${h.state === 'undone' ? '重做' : '撤销'}</button></div>`).join('') || '<p>新的操作会显示在这里。</p>'}</section>`;
  }
  if (tab === 'trash') {
    const plan = await api('/purge-plan'),
      lists = await api('/trash-lists');
    html = `<section class="section-card"><header><h2>回收站</h2><span class="badge">${plan.rolls} 卷 · ${plan.photos} 张</span></header><p>回收站中的记录和托管原片仍然保留。清空后删除不再被任何扫描版本使用的托管原片；外部存储卷的源文件会保留。</p><div class="inspector-actions"><button data-action="scope" data-value="trash">浏览并恢复记录</button><button data-action="trash-rolls">查看已删除胶卷</button><button class="danger" data-action="purge" ${!plan.photos && !plan.rolls ? 'disabled' : ''}>永久清空回收站</button></div></section><section class="section-card"><h2>已删除的收藏与项目</h2>${lists.map((row) => `<div class="history-row"><b>${E(row.name)}</b><button data-action="restore-list" data-type="${row.entity}" data-value="${E(row.id)}">恢复${row.entity === 'projects' ? '项目' : row.entity === 'books' ? '画册' : '收藏'}</button></div>`).join('') || '<p>没有已删除的主题。</p>'}</section>`;
  }
  if (tab === 'settings') {
    const settings = STATE.boot.lists?.settings || {};
    html = `<section class="section-card"><h2>工作台偏好</h2><div class="form-grid">${field('libraryName', '资料库名称', STATE.boot.lists?.libraryName || '我的胶片档案馆')}<label>主题${select(
      'theme',
      [
        ['paper', '纸张白'],
        ['darkroom', '暗房黑'],
        ['lightbox', '灯箱灰'],
      ],
      document.body.dataset.theme,
    )}</label><label>自动备份频率${select(
      'backupHours',
      [
        ['0', '关闭'],
        ['24', '每 24 小时'],
        ['168', '每周'],
      ],
      String(settings.backupHours || 0),
    )}</label>${field('backupRoot', '备份位置', settings.backupRoot || STATE.backupRoot || STATE.boot.home + '/backups')}</div><p>自动备份在本地服务运行时检查到期任务；关闭服务期间不会执行。</p><button class="primary" data-action="save-preferences">保存偏好</button></section><section class="section-card"><h2>地图默认区域</h2><div class="form-grid"><label>默认国家 / 范围${select(
      'mapDefaultCountry',
      [
        ['CN', '中国 · 全国'],
        ['WORLD', '全球'],
        ...countryOptions()
          .filter((c) => c.code !== 'CN')
          .map((c) => [c.code, c.name]),
      ],
      settings.mapDefaultCountry || 'CN',
    )}</label><label>底图地址<input name="mapTileURL" value="${E(settings.mapTileURL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png')}"></label></div><p>地图采用 WGS84 坐标，在线底图可缩放至县城和街道。可填写支持 {z}/{x}/{y} 的自有瓦片服务；地名查询只在主动查找时联网。</p><button data-action="save-map-preferences" class="primary">保存地图设置</button></section><section class="section-card"><h2>布局与键盘</h2><p>拖动两侧分隔线调整宽度，可按工作区保存布局。⌘K 搜索和执行命令；1 / 2 切换档案馆和看片台，C 对比所选，Tab 在对比照片间切换，F 适合、Z 原像素、I 信息、X 淘汰。</p><button class="soft" data-action="save-layout">保存当前工作区布局</button></section>`;
  }
  if (request === STATE.request) $('#view-content').innerHTML = html;
}
function bars(rows, label) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return `<div class="bars">${rows.map((r) => `<div class="bar-row"><span>${E(label(r) || '未记录')}</span><i style="width:${Math.max(2, (r.count / max) * 100)}%"></i><em>${r.count}</em></div>`).join('') || '<small class="muted">记录胶片和相机后，统计会逐步形成。</small>'}</div>`;
}
async function job(kind, extra = {}, label) {
  const result = await api('/jobs', { method: 'POST', body: { kind, ...extra, label } });
  if (['pdf', 'book-pdf'].includes(kind)) exportRequests.add(result.id);
  $('#task-drawer').hidden = false;
  await pollJobs();
  toast(
    ['pdf', 'book-pdf'].includes(kind)
      ? '正在生成 PDF，完成后将提示保存位置'
      : '任务已加入后台队列',
  );
  return result;
}
async function pollJobs() {
  clearTimeout(pollTimer);
  try {
    const old = new Map(STATE.jobs.map((j) => [j.id, j.state]));
    STATE.jobs = await api('/jobs');
    renderJobs();
    for (const j of STATE.jobs) {
      if (j.state === 'completed' && old.get(j.id) !== 'completed') {
        if (exportRequests.delete(j.id))
          saveExport(j).catch((error) => toast(error.message, 'warning'));
        if (j.kind === 'previews') {
          await bootstrap();
          if (STATE.workspace === 'storage') refresh();
        }
        if (STATE.verifyJobs.has(j.id)) {
          const snapshotId = STATE.verifyJobs.get(j.id);
          STATE.verifyJobs.delete(j.id);
          showRestorePreview(snapshotId, j.result);
        }
        if (j.kind === 'upload') {
          await bootstrap();
          await refresh();
          if (STATE.focus?.entity === 'photos') await inspect(STATE.focus.id, 'photos');
        }
        if (
          STATE.workspace === 'storage' &&
          ['backup', 'restore', 'index', 'integrity', 'external-import', 'analyze'].includes(j.kind)
        ) {
          await bootstrap();
          refresh();
        }
      }
    }
  } catch {
  } finally {
    pollTimer = setTimeout(pollJobs, 2000);
  }
}
function renderJobs() {
  const count = STATE.jobs.filter((j) =>
    ['queued', 'running', 'waiting_source', 'pause_requested'].includes(j.state),
  ).length;
  $('#task-count').textContent = count;
  $('#task-list').innerHTML = renderTaskRows(STATE.jobs, {
    E,
    activeRoot: STATE.boot?.root,
    savedExports,
  });
}
function showRestorePreview(snapshotId, result) {
  const snapshot = STATE.backups?.find((s) => s.id === snapshotId);
  modal(
    '备份校验与恢复预览',
    `<p class="form-note important">${result.verified ? '目录与全部已收录原片对象的 SHA-256 校验通过。' : '尚未通过验证。'}恢复会新建资料库，当前资料库保留。</p><div class="stats-grid">${[
      ['胶卷', result.rolls],
      ['照片', result.photos],
      ['已备份原片', result.files],
      ['缺少原片', result.missing],
    ]
      .map(([l, v]) => `<div class="stat-card"><small>${l}</small><b>${v}</b></div>`)
      .join(
        '',
      )}</div><div class="form-grid">${field('destination', '恢复到新的空文件夹', STATE.boot.home + '/restored/' + snapshotId.slice(0, 8), 'text', 'required class="wide"')}<label class="wide"><input name="allowPartial" type="checkbox"> ${result.complete ? '恢复完整快照' : '我了解缺少 ' + result.missing + ' 个原片，允许恢复其余内容与档案'}</label></div>`,
    async (form) => {
      const v = formValues(form);
      if (!result.complete && !form.elements.allowPartial.checked)
        throw new Error('请明确允许部分恢复，或选择原片完整的备份');
      await job(
        'restore',
        {
          backupRoot: STATE.backupRoot,
          snapshotId,
          destination: v.destination,
          allowPartial: form.elements.allowPartial.checked,
        },
        '恢复到新资料库',
      );
    },
    '开始恢复',
    'RESTORE PREVIEW',
  );
}
async function renderAtlas() {
  const focusId = STATE.mapFocusId,
    coordinates = STATE.mapFocusCoordinates,
    assignId = STATE.mapAssignId,
    restoreView = STATE.mapRestoreView,
    view =
      restoreView ||
      (coordinates
        ? { center: [coordinates.latitude, coordinates.longitude], zoom: 8 }
        : atlas.getView());
  STATE.mapFocusId = null;
  STATE.mapFocusCoordinates = null;
  STATE.mapAssignId = null;
  STATE.mapRestoreView = null;
  atlas.destroy();
  $('#pagination').hidden = true;
  $('#selection-bar').hidden = true;
  await atlas.mount($('#view-content'), {
    filter: STATE.query,
    facets: STATE.boot.facets || {},
    preferences: STATE.boot.lists.settings || {},
    view,
    focusId,
    focusCoordinates: coordinates,
    recenterFocus: !restoreView,
    assignId,
  });
}
function chooseImport(targetRoll = null, targetPhoto = null) {
  STATE.importTargetRoll = targetRoll;
  STATE.importTargetPhoto = targetPhoto;
  STATE.resumeUploadId = null;
  STATE.importFiles = [];
  showImportWizard();
}
function showImportWizard() {
  const presets = STATE.boot.lists.presets || [],
    pathOf = (file) => file.webkitRelativePath || file.name,
    files = [...STATE.importFiles].sort((a, b) =>
      pathOf(a).localeCompare(pathOf(b), undefined, { numeric: true }),
    ),
    plans = new Map(),
    duplicateChecks = new Map(),
    groups = new Set(
      files.map(
        (file) =>
          (file.webkitRelativePath || file.name).split('/').slice(0, -1).join('/') || '未分组',
      ),
    );
  modal(
    STATE.importTargetPhoto ? '加入新的扫描版本' : '批量装入影像',
    `<div class="import-drop"><div>${!STATE.importTargetRoll && !STATE.importTargetPhoto ? '<button type="button" class="soft" data-action="new-storage">引用外置盘目录</button>' : ''}<button type="button" class="soft" data-action="pick-files">选择文件</button><button type="button" class="soft" data-action="pick-folder">选择文件夹</button></div><p>${files.length ? files.length.toLocaleString() + ' 个文件 · ' + bytes(files.reduce((n, f) => n + f.size, 0)) + ' · ' + groups.size + ' 个来源文件夹' : '这些照片会复制到资料库；外置盘原片不想复制时，请使用“引用外置盘目录”'}</p></div><div data-import-plan></div>${files.length ? '<p class="form-note">重扫归入已有格号。文件内容重复按下方规则在上传时核对。</p>' : ''}<div class="form-grid"><label>导入模板${select('preset', [['', '手动填写'], ...presets.map((p) => [p.id, p.name])], '', 'id="import-preset"')}</label><label>重复文件${select(
      'dedup',
      [
        ['skip', '跳过哈希完全相同的文件'],
        ['reuse', '复用原片，创建新的底片记录'],
        ['keep', '保留独立副本'],
      ],
      'skip',
    )}</label>${
      STATE.importTargetRoll || STATE.importTargetPhoto
        ? '<p class="form-note wide">影像将加入已选胶卷 / 底片，不会新建其他胶卷。</p>'
        : `<label>分卷方式${select(
            'groupMode',
            [
              ['folders', '按来源文件夹分卷'],
              ['single', '全部装入一卷'],
            ],
            'folders',
          )}</label>${field('name', '单卷名称', '导入胶卷')}`
    }<label>边码编号${select(
      'numbering',
      [
        ['sequential', '按装入顺序编号'],
        ['filename', '从文件名末尾提取（如 frame-03A）'],
      ],
      'sequential',
    )}</label><label>胶片${select(
      'stock',
      Object.entries(STOCKS).map(([id, s]) => [id, s.brand + ' ' + s.name]),
      'portra400',
    )}</label><label>画幅${select(
      'format',
      ['135', '120 · 6×4.5', '120 · 6×6', '120 · 6×7', '120 · 6×9'].map((v) => [v, v]),
      '135',
    )}</label>${field('camera', '相机', '')}${field('lens', '镜头', '')}${STATE.importTargetRoll || STATE.importTargetPhoto ? '' : `<details class="wide roll-location-editor" data-import-location><summary>设置胶卷地点</summary><div data-import-location-fields>${locationPickerFields('location')}</div></details>`}${dateFields()}${field('project', '拍摄项目', '')}<label class="wide"><input name="useFileDate" type="checkbox"> 文件 EXIF 日期是实际拍摄日期</label><label>扫描版本类型${select(
      'kind',
      [
        ['scan', '扫描原版'],
        ['rescan', '重扫'],
        ['edit', '调色版本'],
        ['export', '导出副本'],
      ],
      'scan',
    )}</label>${field('presetName', '可选：将本次档案设置保存为模板', '')}</div>`,
    async (form) => {
      if (!STATE.importFiles.length) throw new Error('请先选择照片或视频');
      const v = formValues(form),
        numbers = proposedFrames(),
        presetMetadata = presets.find((preset) => preset.id === v.preset)?.metadata || {},
        metadata = Object.fromEntries(
          [
            'name',
            'stock',
            'format',
            'camera',
            'lens',
            'location',
            'date',
            'datePrecision',
            'project',
          ].map((k) => [k, v[k] || '']),
        );
      for (const key of ['exposureIndex', 'processType', 'lab', 'process']) {
        if (presetMetadata[key] !== undefined) metadata[key] = presetMetadata[key];
      }
      if (!STATE.importTargetRoll && !STATE.importTargetPhoto)
        Object.assign(metadata, rollLocationPatch(v));
      if (v.presetName.trim())
        await api('/presets', { method: 'POST', body: { name: v.presetName.trim(), metadata } });
      const record = await api('/imports', {
        method: 'POST',
        body: {
          name: STATE.importTargetPhoto
            ? '加入扫描版本'
            : '批量导入 ' + STATE.importFiles.length + ' 个文件',
          files: files.map((file) => ({
            path: pathOf(file),
            ...plans.get(file),
            frameNo: numbers.get(file),
            size: file.size,
            mtime: file.lastModified,
          })),
          metadata,
          useFileDate: v.useFileDate === 'on',
          dedup: v.dedup,
          groupMode: v.groupMode,
          numbering: v.numbering,
          targetRoll: STATE.importTargetRoll,
          targetPhoto: STATE.importTargetPhoto,
          kind: v.kind,
        },
      });
      STATE.uploadSources.set(record.id, STATE.importFiles);
      $('#task-drawer').hidden = false;
      uploadBatch(record.id).catch((error) => toast(error.message, 'warning'));
    },
    '开始导入',
    'IMPORT DESK',
  );
  const form = $('#editor-form'),
    planHost = form.querySelector('[data-import-plan]'),
    rollId = STATE.importTargetRoll,
    targetPhoto = STATE.importTargetPhoto;
  let existingFrames = [],
    planPage = 0,
    checkingDuplicates = false;
  function proposedFrames() {
    const totals = new Map(),
      initial = rollId ? Math.max(-1, ...existingFrames.map((photo) => photo.position)) + 1 : 0;
    return new Map(
      files.map((file) => {
        const plan = plans.get(file);
        if (targetPhoto || plan?.targetPhoto) return [file, ''];
        const folder =
          form.elements.groupMode?.value === 'folders'
            ? pathOf(file).split('/').slice(0, -1).join('/')
            : '';
        const order = (totals.get(folder) || initial) + 1;
        totals.set(folder, order);
        const detected =
          form.elements.numbering.value === 'filename'
            ? file.name.match(/(?:^|[ _-])(\d{1,3}[a-z]?)(?=\.[^.]+$)/i)?.[1]
            : '';
        return [file, plan?.frameNo || detected || String(order).padStart(2, '0')];
      }),
    );
  }
  function renderPlan() {
    const start = planPage * 40,
      groupMode = form.elements.groupMode?.value,
      rollName = STATE.entities.get(rollId)?.name || '当前胶卷',
      numbers = proposedFrames();
    planHost.innerHTML = files.length
      ? `<div class="import-plan-head"><b>导入预演</b><button type="button" data-plan-page="-1" ${planPage ? '' : 'disabled'}>‹ 上页</button><span>${planPage + 1} / ${Math.ceil(files.length / 40)}</span><button type="button" data-plan-page="1" ${start + 40 < files.length ? '' : 'disabled'}>下页 ›</button><button type="button" class="soft" data-check-duplicates ${checkingDuplicates ? 'disabled' : ''}>${checkingDuplicates ? '核对中…' : '核对本页重复文件'}</button></div><div class="import-plan">${files
          .slice(start, start + 40)
          .map((file, i) => {
            const index = start + i,
              plan = plans.get(file) || {},
              path = pathOf(file),
              folder = path.split('/').slice(0, -1).at(-1),
              group = targetPhoto
                ? '当前底片的扫描版本'
                : rollId
                  ? rollName
                  : groupMode === 'folders' && folder
                    ? folder
                    : form.elements.name?.value || '导入胶卷';
            return `<div class="import-plan-row" data-plan-index="${index}"><div><b>${E(file.name)}</b><small>${E(group)}</small>${duplicateChecks.has(file) ? `<small>${duplicateChecks.get(file) ? '内容重复' : '未发现相同内容'}</small>` : ''}</div>${targetPhoto ? '' : `<label>格号<input data-plan-frame aria-label="格号" maxlength="24" value="${E(plan.frameNo || '')}" placeholder="${E(numbers.get(file))}" ${plan.targetPhoto ? 'disabled' : ''}></label>${rollId ? `<label>导入方式${select('planTarget', [['', '新底片'], ...existingFrames.map((photo) => [photo.id, '重扫 · ' + photo.frameNo + ' · ' + photo.name])], plan.targetPhoto)}</label>` : ''}`}<div class="import-plan-order"><button type="button" data-plan-move="-1" aria-label="上移" ${index ? '' : 'disabled'}>↑</button><button type="button" data-plan-move="1" aria-label="下移" ${index < files.length - 1 ? '' : 'disabled'}>↓</button></div></div>`;
          })
          .join('')}</div>`
      : '';
  }
  planHost.oninput = (event) => {
    if (!event.target.hasAttribute('data-plan-frame')) return;
    const file = files[Number(event.target.closest('[data-plan-index]').dataset.planIndex)];
    plans.set(file, { ...plans.get(file), frameNo: event.target.value.trim() });
  };
  planHost.onchange = (event) => {
    if (event.target.name !== 'planTarget') return;
    const row = event.target.closest('[data-plan-index]'),
      file = files[Number(row.dataset.planIndex)];
    plans.set(file, { ...plans.get(file), targetPhoto: event.target.value });
    renderPlan();
  };
  planHost.onclick = async (event) => {
    if (event.target.closest('[data-check-duplicates]')) {
      if (checkingDuplicates) return;
      checkingDuplicates = true;
      renderPlan();
      try {
        const pageFiles = files.slice(planPage * 40, planPage * 40 + 40),
          checks = [];
        for (const file of pageFiles) {
          const hasher = new Sha256();
          for (let offset = 0; offset < file.size; offset += 8 * 1024 * 1024) {
            if (!planHost.isConnected || !$('#editor').open) return;
            hasher.update(await file.slice(offset, offset + 8 * 1024 * 1024).arrayBuffer());
          }
          checks.push({ hash: hasher.hex(), size: file.size });
        }
        const matches = await api('/imports/check-duplicates', {
          method: 'POST',
          body: { files: checks },
        });
        const counts = new Map();
        for (const { hash } of checks) counts.set(hash, (counts.get(hash) || 0) + 1);
        pageFiles.forEach((file, i) =>
          duplicateChecks.set(file, matches[i] || counts.get(checks[i].hash) > 1),
        );
      } catch (error) {
        if (planHost.isConnected && $('#editor').open) toast(error.message, 'warning');
      } finally {
        checkingDuplicates = false;
        if (planHost.isConnected && $('#editor').open) renderPlan();
      }
      return;
    }
    const paging = event.target.closest('[data-plan-page]'),
      moving = event.target.closest('[data-plan-move]');
    if (paging) planPage += Number(paging.dataset.planPage);
    if (moving) {
      const index = Number(moving.closest('[data-plan-index]').dataset.planIndex),
        destination = index + Number(moving.dataset.planMove);
      [files[index], files[destination]] = [files[destination], files[index]];
      planPage = Math.floor(destination / 40);
    }
    if (paging || moving) renderPlan();
  };
  for (const name of ['groupMode', 'numbering', 'name']) {
    if (form.elements[name]) form.elements[name].onchange = renderPlan;
  }
  renderPlan();
  if (rollId && files.length) {
    api(
      '/photos?filter=' + encodeURIComponent(JSON.stringify({ rollId, sort: 'frame', limit: 200 })),
    )
      .then((result) => {
        if (!planHost.isConnected) return;
        existingFrames = result.items;
        renderPlan();
      })
      .catch((error) => toast(error.message, 'warning'));
  }
  const importLocation = form.querySelector('[data-import-location]');
  let disposeImportLocation;
  if (importLocation) {
    const mountImportLocation = () => {
      if (importLocation.open && !disposeImportLocation)
        disposeImportLocation = mountLocationPicker(importLocation, {
          api,
          preferences: STATE.boot.lists.settings || {},
        });
    };
    importLocation.addEventListener('toggle', mountImportLocation);
    $('#editor').addEventListener('close', () => disposeImportLocation?.(), { once: true });
  }
  const preset = $('#import-preset');
  if (preset)
    preset.onchange = (event) => {
      const p = presets.find((p) => p.id === event.target.value);
      if (!p) return;
      const form = $('#editor-form');
      form.querySelector('.date-fields').outerHTML = dateFields(
        p.metadata.date,
        p.metadata.datePrecision,
      );
      if (importLocation) {
        disposeImportLocation?.();
        disposeImportLocation = null;
        importLocation.querySelector('[data-import-location-fields]').innerHTML =
          locationPickerFields('location', p.metadata);
        if (p.metadata.location || rollCoordinates(p.metadata)) importLocation.open = true;
        if (importLocation.open)
          disposeImportLocation = mountLocationPicker(importLocation, {
            api,
            preferences: STATE.boot.lists.settings || {},
          });
      }
      for (const [key, value] of Object.entries(p.metadata))
        if (
          !['date', 'datePrecision', 'location', 'latitude', 'longitude'].includes(key) &&
          form.elements[key]
        )
          form.elements[key].value = value;
    };
}
async function uploadBatch(id) {
  if (STATE.uploading.has(id)) return;
  const sources = STATE.uploadSources.get(id);
  if (!sources?.length) throw new Error('请重选相同的来源文件或文件夹继续');
  STATE.uploading.add(id);
  STATE.uploadPaused.delete(id);
  try {
    await api('/jobs/' + id + '/resume', { method: 'POST', body: {} });
    const record = await api('/imports/' + id);
    for (const item of record.files) {
      if (STATE.uploadPaused.has(id)) break;
      if (['done', 'skipped'].includes(item.state)) continue;
      const file =
        sources.find(
          (file) => (file.webkitRelativePath || file.name) === item.path && file.size === item.size,
        ) ||
        sources.find(
          (file) =>
            file.name === item.name && file.size === item.size && file.lastModified === item.mtime,
        );
      if (!file) {
        toast('未找到 ' + item.path + '，其余来源继续处理', 'warning');
        continue;
      }
      if (item.state === 'error' && item.offset === item.size) {
        await api('/imports/' + id + '/' + item.key + '?reset=1', { method: 'POST', body: {} });
        item.offset = 0;
      }
      const hasher = new Sha256();
      let remote = item.offset;
      for (let at = 0; at < file.size; at += 8 * 1024 * 1024) {
        if (STATE.uploadPaused.has(id)) break;
        const end = Math.min(file.size, at + 8 * 1024 * 1024),
          buffer = await file.slice(at, end).arrayBuffer();
        hasher.update(buffer);
        if (end <= remote && end < file.size) continue;
        const offset = Math.max(at, remote);
        const headers = {};
        if (end === file.size) headers['X-File-SHA256'] = hasher.hex();
        const response = await fetch(`/api/v2/imports/${id}/${item.key}?offset=${offset}`, {
            method: 'PUT',
            headers,
            body: file.slice(offset, end),
          }),
          result = await response.json();
        if (!response.ok) throw new Error(result.error || '上传失败');
        remote = result.offset;
        await pollJobs();
      }
    }
    await bootstrap();
    refresh();
  } finally {
    STATE.uploading.delete(id);
    pollJobs();
  }
}
async function showOfflineHelp(generate = false) {
  const health = await api('/health'),
    cache = health.previews || {};
  modal(
    generate ? '生成离线浏览预览' : '离线预览怎么用',
    `<p class="form-note">已有 ${cache.ready || 0} / ${cache.images || 0} 份原片缓存，${cache.missing || 0} 份尚未缓存。预览保存在当前资料库的 previews 目录，无需另行下载。</p><ol class="offline-steps"><li><b>先连接原片。</b> 普通导入会复制照片；外置盘 / NAS 可用“登记外部存储 → 引用导入”保留源位置。</li><li><b>在线时生成预览。</b> 保存 640 与 1600 像素 JPEG，适合离线浏览和选片；大资料库可在任务中心查看进度与失败原因。</li><li><b>断开外置盘后照常看片。</b> 打开“全库照片”或“离线 / 断链”，有缓存的照片仍会显示。原片全部在线时，“离线 / 断链”为空是正常的。</li><li><b>需要原片时重新连接。</b> 原片导出、原像素和画册打印需要连接原片；预览不能代替原片。没有预先缓存的离线文件无法凭空显示图片。</li></ol><div class="inspector-actions"><button type="button" data-action="scope" data-value="photos">查看照片</button><button type="button" data-action="open-storage">管理存储卷</button></div>`,
    generate ? async () => job('previews', { selection: { query: {} } }, '生成离线浏览预览') : null,
    generate ? '开始生成预览' : '关闭',
    'OFFLINE PREVIEWS',
  );
}
function newStorage() {
  modal(
    '登记外部存储卷',
    `<p class="form-note">引用导入会保留原片在所选目录，资料库记录路径和预览。适合移动硬盘、NAS 或已有扫描归档目录。</p><div class="form-grid">${field('name', '存储卷名称', '', 'text', 'required')}<label class="wide"><input type="checkbox" name="importNow" checked> 登记后立即引用导入，并缓存离线预览</label>${field('root', '本机或已挂载目录的完整路径', '', 'text', 'required placeholder="/Volumes/FilmArchive/Scans"')}${window.filmAlbumDesktop ? '<button type="button" class="soft" data-action="choose-storage-folder">选择照片文件夹…</button>' : ''}<label class="wide"><input type="checkbox" name="watch"> 持续监控并引用导入新照片</label></div>`,
    async (form) => {
      const v = formValues(form);
      const storage = await api('/storages', {
        method: 'POST',
        body: { name: v.name, root: v.root, watch: form.elements.watch.checked },
      });
      await bootstrap();
      navigate('storage');
      if (form.elements.importNow.checked)
        await job(
          'external-import',
          { storageId: storage.id, offlinePreviews: true },
          '引用导入并缓存预览',
        );
      else toast('存储卷已登记，可点击引用导入');
    },
    '登记存储卷',
    'OFFLINE STORAGE',
  );
}
function reconnectStorage(id) {
  const s = STATE.boot.lists.storages.find((s) => s.id === id);
  modal(
    '重新连接存储卷',
    `<p class="form-note">修改存储卷根路径即可批量连接原有相对路径，归档和收藏保持原样。</p><div class="form-grid">${field('name', '名称', s.name)}${field('root', '当前挂载路径', s.root, 'text', 'required')}${window.filmAlbumDesktop ? '<button type="button" class="soft" data-action="choose-storage-folder">选择新的挂载目录…</button>' : ''}<label class="wide"><input type="checkbox" name="watch" ${JSON.parse(s.data || '{}').watch ? 'checked' : ''}> 监控新照片并引用导入</label></div>`,
    async (form) => {
      const v = formValues(form);
      await api('/storages/' + id, {
        method: 'PATCH',
        body: { ...v, watch: form.elements.watch.checked },
      });
      await bootstrap();
      refresh();
    },
    '连接并检查',
    'RECONNECT VOLUME',
  );
}
function command() {
  if ($('#editor').open) return;
  $('#command-input').value = '';
  $('#command-dialog').showModal();
  STATE.commandIndex = 0;
  updateCommands('');
  $('#command-input').focus();
}
async function updateCommands(text) {
  const commands = [
    ['档案馆 · 管理胶卷', () => navigate('archive')],
    ['看片台 · 全库照片', () => navigate('lighttable')],
    ['项目与策展', () => navigate('projects')],
    ['回忆地图', () => navigate('atlas')],
    ['资料库与备份', () => navigate('storage', {}, { storageTab: 'backups' })],
    ['新建胶卷', newRoll],
    ['导入影像', () => chooseImport()],
    ['扫描片袋二维码', () => $('#barcode-file').click()],
    ['随机抽一卷', () => action('random')],
    ['操作历史与撤销', () => navigate('storage', {}, { storageTab: 'history' })],
    ['检查原片', () => job('index', { all: true })],
    ['生成离线预览', () => showOfflineHelp(true)],
    ['本地识图与 OCR', () => job('analyze', { selection: { query: {} } })],
    ['回收站', () => navigate('storage', {}, { storageTab: 'trash' })],
    ['保存当前布局', () => action('save-layout')],
  ];
  let results = commands
    .filter(([label]) => !text || label.toLowerCase().includes(text.toLowerCase()))
    .map(([label, run]) => ({ label, type: '命令', run }));
  if (text.trim()) {
    try {
      const [rolls, photos] = await Promise.all([
        api('/rolls?filter=' + encodeURIComponent(JSON.stringify({ query: text, limit: 5 }))),
        api('/photos?filter=' + encodeURIComponent(JSON.stringify({ query: text, limit: 5 }))),
      ]);
      if ($('#command-input').value !== text) return;
      results.push(
        ...rolls.items.map((r) => ({
          label: r.code + ' · ' + r.name,
          type: '胶卷',
          run: () => {
            STATE.entities.set(r.id, r);
            navigate('lighttable', { rollId: r.id });
            inspect(r.id, 'rolls');
          },
        })),
        ...photos.items.map((p) => ({
          label: p.name + ' · ' + p.rollName,
          type: '照片',
          run: () => {
            STATE.entities.set(p.id, p);
            reviewer.open([p]);
          },
        })),
      );
    } catch {}
  }
  STATE.commandActions = results;
  STATE.commandIndex = Math.min(STATE.commandIndex, Math.max(0, results.length - 1));
  $('#command-results').innerHTML =
    results
      .map(
        (item, index) =>
          `<button class="command-item ${index === STATE.commandIndex ? 'active' : ''}" data-command="${index}"><span>${E(item.label)}</span><small>${item.type}</small></button>`,
      )
      .join('') || '<div class="empty">没有匹配结果</div>';
}
function selectCommand(index) {
  const command = STATE.commandActions[index];
  if (!command) return;
  $('#command-dialog').close();
  Promise.resolve(command.run()).catch((e) => toast(e.message, 'warning'));
}
function reviewOptions(result = STATE.result, query = resultQuery()) {
  let page = query.page || 0;
  return {
    page,
    pages: result.pages || 1,
    candidates: result.items,
    loadCandidates: async (delta) => {
      const next = page + delta;
      if (next < 0) return [];
      const result = await api(
        '/photos?filter=' + encodeURIComponent(JSON.stringify({ ...query, page: next })),
      );
      if (!result.items.length) return [];
      page = next;
      for (const row of result.items) STATE.entities.set(row.id, row);
      return result.items;
    },
  };
}
async function openPhoto(id, options) {
  let photo = STATE.entities.get(id);
  if (!photo?.mediaId) {
    photo = await api('/photos/' + encodeURIComponent(id));
    STATE.entities.set(id, photo);
  }
  STATE.focus = { id, entity: 'photos' };
  reviewer.open(
    [photo],
    options ||
      (STATE.workspace === 'lighttable' || STATE.workspace === 'projects'
        ? reviewOptions()
        : { candidates: [photo] }),
  );
}
async function action(name, value, element) {
  if (['scope', 'open-storage'].includes(name) && element?.closest('#editor')) $('#editor').close();
  switch (name) {
    case 'nav-back':
      if (navigationEntry?.index > 0) history.back();
      break;
    case 'nav-forward':
      if (navigationEntry && navigationEntry.index < navigationEnd) history.forward();
      break;
    case 'home':
      navigate('archive');
      break;
    case 'command':
      command();
      break;
    case 'scope':
      if (value === 'rolls') navigate('archive');
      else
        navigate(
          'lighttable',
          value === 'favorites'
            ? { rating: '4' }
            : value === 'offline'
              ? { offline: true }
              : value === 'trash'
                ? { trash: true }
                : {},
        );
      break;
    case 'all-photos':
      navigate('lighttable');
      break;
    case 'collection':
      navigate('lighttable', { collectionId: value });
      break;
    case 'project':
      navigate('projects', {}, { projectId: value });
      break;
    case 'year':
      navigate(STATE.workspace === 'archive' ? 'archive' : 'lighttable', { year: value });
      break;
    case 'timeline-jump':
      $('#timeline-year-' + value)?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
      break;
    case 'view':
      if (value !== STATE.view) navigate(STATE.workspace, STATE.query, { view: value });
      break;
    case 'multi':
      STATE.multi = !STATE.multi;
      renderHeader();
      break;
    case 'new-roll':
      newRoll();
      break;
    case 'custom-stock':
      customStock();
      break;
    case 'choose-stock':
      $('#editor-form [name="stock"]').value = value;
      renderStocks($('#stock-search').value);
      break;
    case 'filters':
      advancedFilters();
      break;
    case 'add-rule':
      $('#rules-list').insertAdjacentHTML('beforeend', ruleRow());
      break;
    case 'remove-rule':
      element.closest('.rule-row').remove();
      break;
    case 'remove-query-filter':
      delete STATE.query[value];
      STATE.page = 0;
      clearSelection();
      renderQuery();
      refresh();
      break;
    case 'reset-filters': {
      const keep = {
        rollId: STATE.query.rollId,
        collectionId: STATE.query.collectionId,
        trash: STATE.query.trash,
      };
      STATE.query = Object.fromEntries(Object.entries(keep).filter(([, v]) => v));
      STATE.page = 0;
      clearSelection();
      renderQuery();
      refresh();
      break;
    }
    case 'exit-roll':
      navigate('lighttable');
      break;
    case 'new-collection':
      newCollection();
      break;
    case 'edit-collection':
      newCollection(null, value);
      break;
    case 'new-project':
      editProject();
      break;
    case 'edit-project':
      editProject(STATE.projectId);
      break;
    case 'delete-list':
      await api('/' + element.dataset.type + '/' + encodeURIComponent(value), {
        method: 'PATCH',
        body: {
          patch: { deleted_at: Date.now() },
          expectedVersion: (STATE.boot.lists[element.dataset.type] || []).find(
            (row) => row.id === value,
          )?.version,
        },
      });
      $('#editor').close();
      await bootstrap();
      navigate(element.dataset.type === 'projects' ? 'projects' : 'lighttable');
      break;
    case 'select-page':
      STATE.selected = new Set(STATE.result.items.map((r) => r.id));
      STATE.allMatching = false;
      renderSelection();
      break;
    case 'select-all-matching':
      STATE.allMatching = true;
      STATE.selected.clear();
      renderSelection();
      break;
    case 'clear-selection':
      clearSelection();
      break;
    case 'compare': {
      const rows = selectedRows();
      if (
        STATE.allMatching ||
        ![2, 4].includes(rows.length) ||
        rows.some((p) => p.mime?.startsWith('video/'))
      )
        throw new Error('请选择恰好 2 或 4 张照片');
      reviewer.open(rows, reviewOptions());
      break;
    }
    case 'add-to':
      await addTo();
      break;
    case 'remove-members':
      await api('/collections/' + STATE.query.collectionId + '/members', {
        method: 'POST',
        body: { ids: await loadSelectedIds(), remove: true },
      });
      clearSelection();
      refresh();
      break;
    case 'batch':
      await batchEditor();
      break;
    case 'trash-selected':
      await trashSelected();
      break;
    case 'restore-selected':
      await trashSelected(true);
      break;
    case 'trash-focus':
      if (STATE.focus) {
        STATE.workspace = STATE.focus.entity === 'rolls' ? 'archive' : 'lighttable';
        STATE.selected = new Set([STATE.focus.id]);
        STATE.allMatching = false;
        await trashSelected();
      }
      break;
    case 'archive-more':
      await loadArchiveMore();
      break;
    case 'page-prev':
      if (STATE.page > 0) {
        STATE.page--;
        clearSelection();
        refresh();
      }
      break;
    case 'page-next':
      if (STATE.page + 1 < STATE.result.pages) {
        STATE.page++;
        clearSelection();
        refresh();
      }
      break;
    case 'retry':
      await bootstrap();
      renderHeader();
      renderQuery();
      refresh();
      break;
    case 'density': {
      const densities = ['compact', 'standard', 'comfortable'],
        next = densities[(densities.indexOf(STATE.layout.density || 'standard') + 1) % 3];
      STATE.layout.density = next;
      applyLayout();
      break;
    }
    case 'columns': {
      const columns = STATE.layout.columns || [
        'code',
        'name',
        'stock',
        'format',
        'camera',
        'date',
        'location',
        'frameCount',
        'status',
      ];
      modal(
        '档案表格列设置',
        `<p class="form-note">勾选需要的列；表头可以拖动调整顺序，编号列保持可见。</p><div class="form-grid">${Object.entries(
          COLUMN_NAMES,
        )
          .map(
            ([key, label]) =>
              `<label><input name="column" value="${key}" type="checkbox" ${columns.includes(key) ? 'checked' : ''}> ${label}</label>`,
          )
          .join('')}</div>`,
        async (form) => {
          const selected = new Set(new FormData(form).getAll('column'));
          selected.add('code');
          STATE.layout.columns = [...columns.filter((c) => selected.has(c)), ...selected].filter(
            (v, i, a) => a.indexOf(v) === i,
          );
          renderResults();
          await saveLayout();
        },
      );
      break;
    }
    case 'sidebar':
      $('.sidebar').classList.toggle('mobile-open');
      break;
    case 'inspector':
      if (innerWidth <= 960) $('.inspector').classList.toggle('mobile-open');
      else {
        STATE.layout.inspectorHidden = !STATE.layout.inspectorHidden;
        applyLayout();
      }
      break;
    case 'save-layout':
      await saveLayout();
      toast('当前工作区布局已保存');
      break;
    case 'theme': {
      const themes = ['paper', 'lightbox', 'darkroom'],
        theme = themes[(themes.indexOf(document.body.dataset.theme) + 1) % 3];
      document.body.dataset.theme = theme;
      localStorage.setItem('filmalbum-theme', theme);
      await saveSettings({ theme });
      break;
    }
    case 'inspect-tab':
      STATE.inspectorTab = value;
      if (STATE.focus) await inspect(STATE.focus.id, STATE.focus.entity, value);
      break;
    case 'save-roll-date': {
      const container = element.closest('.inspector-date'),
        date = container.querySelector('[name="date"]');
      if (date.reportValidity())
        await saveRollDate(
          STATE.focus.id,
          date.value,
          container.querySelector('[data-date-precision]').value,
        );
      break;
    }
    case 'edit-roll-date': {
      const roll = STATE.entities.get(value);
      modal('编辑拍摄日期', dateFields(roll.date, roll.datePrecision), async (form) => {
        const { date, datePrecision } = formValues(form);
        await saveRollDate(roll.id, date, datePrecision);
      });
      break;
    }
    case 'roll-photos':
      STATE.entities.set(
        value,
        STATE.entities.get(value) || (await api('/rolls/' + encodeURIComponent(value))),
      );
      navigate('lighttable', { rollId: value });
      break;
    case 'inspect-roll':
      if (STATE.focus) {
        const p = STATE.entities.get(STATE.focus.id);
        await inspect(p.roll_id, 'rolls');
      }
      break;
    case 'photo-location': {
      const photo = STATE.entities.get(STATE.focus.id);
      modal(
        '设置照片拍摄位置',
        '<div class="batch-edit" data-photo-location>' + locationPickerFields() + '</div>',
        async (form) => {
          const v = formValues(form),
            coordinates = rollCoordinates(v);
          if (!coordinates) throw Error('请在地图上设置地点');
          await patchRecord('photos', photo.id, { ...coordinates, placeName: v.value.trim() });
          refresh();
        },
      );
      const host = $('#editor-body').querySelector('[data-photo-location]');
      host.querySelector('[name=value]').value = photo.placeName || '';
      const dispose = mountLocationPicker(host, {
        api,
        preferences: STATE.boot.lists.settings || {},
      });
      $('#editor').addEventListener('close', dispose, { once: true });
      break;
    }
    case 'locate-negative': {
      const p = STATE.entities.get(STATE.focus.id),
        r = await api('/rolls/' + encodeURIComponent(p.roll_id));
      STATE.entities.set(r.id, r);
      STATE.focus = { id: r.id, entity: 'rolls' };
      STATE.inspectorTab = 'physical';
      renderInspector(r, 'rolls');
      const location = document.createElement('p');
      location.className = 'negative-frame-location';
      location.textContent = [p.strip && '底片条 ' + p.strip, p.frameNo && '格号 ' + p.frameNo]
        .filter(Boolean)
        .join(' · ');
      if (location.textContent) $('.inspector-body').prepend(location);
      $('.inspector').classList.add('mobile-open');
      break;
    }
    case 'save-film-preset': {
      const roll = STATE.entities.get(STATE.focus.id);
      const keys = [
        'stock',
        'format',
        'camera',
        'lens',
        'location',
        'project',
        'exposureIndex',
        'processType',
        'lab',
        'process',
      ];
      const metadata = Object.fromEntries(keys.map((key) => [key, roll[key]]));
      modal(
        '保存胶卷模板',
        field('name', '模板名称', roll.name, 'text', 'required'),
        async (form) => {
          await api('/presets', {
            method: 'POST',
            body: { name: formValues(form).name, metadata },
          });
          await bootstrap();
          toast('胶卷模板已保存');
        },
      );
      break;
    }
    case 'rate':
      if (STATE.focus?.entity === 'photos') {
        const p = STATE.entities.get(STATE.focus.id),
          n = Number(value);
        await patchRecord('photos', p.id, { rating: p.rating === n ? 0 : n });
        refresh();
      }
      break;
    case 'review-focus':
      if (STATE.focus?.entity === 'photos') await openPhoto(STATE.focus.id);
      break;
    case 'inspect-photo':
      await inspect(value, 'photos');
      $('.inspector').classList.add('mobile-open');
      break;
    case 'view-version': {
      const p = await api('/photos/' + encodeURIComponent(STATE.focus.id)),
        v = p.versions.find((v) => v.id === value);
      reviewer.open([
        {
          ...p,
          mediaId: v.mediaId,
          mime: v.mime,
          availability: v.availability,
          versionName: v.name,
          versionId: v.id,
          size: v.size,
          fileDateSource: v.fileDateSource,
          exif: v.exif || p.exif,
        },
      ]);
      break;
    }
    case 'compare-version': {
      const p = await api('/photos/' + encodeURIComponent(STATE.focus.id)),
        a = p.versions.find((v) => v.id === p.primary_version),
        b = p.versions.find((v) => v.id === value);
      reviewer.open(
        [a, b].map((v) => ({
          ...p,
          mediaId: v.mediaId,
          mime: v.mime,
          availability: v.availability,
          versionName: v.name,
          versionId: v.id,
          size: v.size,
          fileDateSource: v.fileDateSource,
          exif: v.exif || p.exif,
        })),
      );
      break;
    }
    case 'primary-version':
      await patchRecord('photos', STATE.focus.id, { primary_version: value });
      await inspect(STATE.focus.id, 'photos', 'versions');
      refresh();
      break;
    case 'rename-version': {
      const p = STATE.entities.get(STATE.focus.id),
        v = p.versions.find((v) => v.id === value);
      modal(
        '扫描版本命名',
        `<div class="form-grid">${field('name', '版本名称', v.name, 'text', 'required')}<label>版本类型${select(
          'kind',
          [
            ['scan', '扫描原版'],
            ['rescan', '重扫'],
            ['edit', '调色'],
            ['export', '导出副本'],
          ],
          v.kind,
        )}</label></div>`,
        async (form) => {
          await api('/versions/' + value, {
            method: 'PATCH',
            body: { patch: formValues(form), expectedVersion: v.version },
          });
          await inspect(p.id, 'photos', 'versions');
        },
      );
      break;
    }
    case 'import':
      chooseImport(STATE.query.rollId || null);
      break;
    case 'import-roll':
      chooseImport(value);
      break;
    case 'import-version':
      chooseImport(null, STATE.focus.id);
      break;
    case 'pick-files':
      $('#import-files').value = '';
      $('#import-files').click();
      break;
    case 'pick-folder':
      $('#import-folder').value = '';
      $('#import-folder').click();
      break;
    case 'photo-analyze':
      await job('analyze', { selection: { ids: [STATE.focus.id] } });
      break;
    case 'set-roll-cover': {
      const p = STATE.entities.get(STATE.focus.id);
      await patchRecord('rolls', p.roll_id, { coverId: p.id });
      toast('已设为胶卷封面');
      break;
    }
    case 'restore-list':
      await api('/' + element.dataset.type + '/' + encodeURIComponent(value), {
        method: 'PATCH',
        body: { patch: { deleted_at: null } },
      });
      await bootstrap();
      refresh();
      break;
    case 'map-help':
      modal(
        '地图使用指南',
        `<ol><li>默认显示中国全国。在“资料库 → 设置 → 地图默认区域”可更换国家或全球。</li><li>点击“定位选中胶卷”，先看封面、卷名和编号；选卷后会在地图旁显示该卷的照片预览。</li><li>在统一搜索栏选择“查地点”，输入省、市、县或街道并按 Enter；也可滚轮缩放至县城 / 街道（最高 19 级）。选择搜索结果仅移动地图，不会修改档案。</li><li>点击地图落点后，再检查照片预览、坐标和地点文字，点击“确认保存到此卷”才会写入。</li><li>搜索栏切换“找胶卷”可按名称、编号、相机和标签检索。年份与胶片位于“筛选”浮层，已选条件可单独移除或清空。</li><li>点击单卷标记可以预览照片；聚合点可继续放大，最高级的同位置胶卷可以逐卷选择。</li><li>详细底图和地名查询需要联网；地图坐标统一为 WGS84。原片不上传，地名查找或主动识别地名只发送必要的查询。</li></ol>`,
        null,
      );
      break;
    case 'demo':
      if (!DEBUG_MODE) break;
      modal(
        '演示 / 调试模式',
        `<p>独立测试资料库包含 8 卷、98 张模拟照片、多扫描版本、世界地图坐标、断链 / 离线案例、项目、智能集合和示范画册。正式资料不会被修改。重新生成会创建新的演示库，旧演示库保留。</p><button type="button" data-action="demo-create">生成全新演示资料库</button><button type="button" data-action="demo-return">返回正式资料库</button>`,
        null,
      );
      break;
    case 'demo-create':
      if (!DEBUG_MODE) break;
      $('#editor').close();
      await job('demo', {}, '生成演示资料库');
      break;
    case 'demo-return':
      await api('/demo/return', { method: 'POST', body: {} });
      location.reload();
      break;
    case 'demo-open':
      await api('/demo/open', { method: 'POST', body: { root: value } });
      location.reload();
      break;
    case 'books': {
      const list = await bookDesigner.list();
      modal(
        '定制摄影画册',
        `<p>自由设计页面、图文与裁切，保存后导出含出血与裁切标记的 PDF。</p><button type="button" data-action="book-new">＋ 新建画册</button>${list.map((b) => `<div class="history-row"><b>${E(b.name)}</b><button type="button" data-action="book-open" data-value="${b.id}">编辑画册</button><button type="button" data-action="book-delete" data-value="${b.id}">移入回收站</button></div>`).join('')}`,
        null,
      );
      break;
    }
    case 'book-new':
      $('#editor').close();
      await bookDesigner.open();
      break;
    case 'book-open':
      $('#editor').close();
      await bookDesigner.open(value);
      break;
    case 'book-delete':
      await api('/books/' + value, { method: 'DELETE' });
      await action('books');
      break;
    case 'scan-qr':
      $('#barcode-file').click();
      break;
    case 'organize-project': {
      const p = STATE.boot.lists.projects.find((p) => p.id === STATE.projectId);
      modal(
        '整理项目选片',
        `<div class="form-grid"><label>章节${select('chapter', [['', '保持原章节'], ...(p?.chapters || ['未分章']).map((c) => [c, c])], '')}</label><label>选片状态${select(
          'stage',
          [
            ['', '保持原状态'],
            ['candidate', '候选'],
            ['final', '定稿'],
          ],
          '',
        )}</label></div>`,
        async (form) => {
          const v = formValues(form),
            patch = Object.fromEntries(Object.entries(v).filter(([, v]) => v));
          await api('/projects/' + STATE.projectId + '/organize', {
            method: 'POST',
            body: { ids: await loadSelectedIds(), patch },
          });
          refresh();
        },
        '应用',
      );
      break;
    }
    case 'resume-upload':
      STATE.resumeUploadId = value;
      modal(
        '继续导入来源',
        `<p class="form-note">重新选择同一批来源文件或文件夹。已经完成的文件会跳过，未完成文件会从服务端断点继续，并在完成时核对完整 SHA-256。</p><div class="import-drop"><div>${!STATE.importTargetRoll && !STATE.importTargetPhoto ? '<button type="button" class="soft" data-action="new-storage">引用外置盘目录</button>' : ''}<button type="button" class="soft" data-action="pick-files">重选文件</button><button type="button" class="soft" data-action="pick-folder">重选文件夹</button></div></div>`,
        null,
      );
      break;
    case 'tasks':
      $('#task-drawer').hidden = !$('#task-drawer').hidden;
      renderJobs();
      break;
    case 'task-pause':
      STATE.uploadPaused.add(value);
      await api('/jobs/' + value + '/pause', { method: 'POST', body: {} });
      await pollJobs();
      break;
    case 'task-cancel':
      STATE.uploadPaused.add(value);
      await api('/jobs/' + value + '/cancel', { method: 'POST', body: {} });
      await pollJobs();
      break;
    case 'task-resume':
      STATE.uploadPaused.delete(value);
      await api('/jobs/' + value + '/resume', { method: 'POST', body: {} });
      if (STATE.jobs.find((j) => j.id === value)?.kind === 'upload') {
        if (STATE.uploadSources.has(value))
          uploadBatch(value).catch((e) => toast(e.message, 'warning'));
        else await action('resume-upload', value);
      }
      await pollJobs();
      break;
    case 'storage-tab':
      if (value !== STATE.storageTab) navigate('storage', {}, { storageTab: value });
      break;
    case 'open-recovery':
      navigate('storage', {}, { storageTab: 'backups' });
      break;
    case 'history':
      navigate('storage', {}, { storageTab: 'history' });
      break;
    case 'history-undo':
    case 'history-redo':
      await api('/history/' + value + '/' + (name === 'history-undo' ? 'undo' : 'redo'), {
        method: 'POST',
        body: {},
      });
      await bootstrap();
      refresh();
      toast(name === 'history-undo' ? '操作已撤销' : '操作已重做');
      break;
    case 'backup': {
      const configured = $('#backup-root')?.value || STATE.backupRoot;
      await job('backup', {
        backupRoot: configured,
        title: '胶片档案快照 ' + new Date().toLocaleString('zh-CN'),
      });
      break;
    }
    case 'backup-root':
      STATE.backupRoot = $('#backup-root').value;
      refresh();
      break;
    case 'verify-backup': {
      const result = await job('verify', { backupRoot: STATE.backupRoot, snapshotId: value });
      STATE.verifyJobs.set(result.id, value);
      break;
    }
    case 'open-restored':
      await api('/switch', { method: 'POST', body: { root: value } });
      STATE.entities.clear();
      await bootstrap();
      navigate('archive');
      toast('已打开恢复后的资料库');
      break;
    case 'switch-library':
      modal(
        '打开其他资料库',
        `<p class="form-note">选择包含 catalog.sqlite 的资料库文件夹。当前资料库会保留。</p><div class="form-grid">${field('root', '资料库完整路径', STATE.boot.root, 'text', 'required class="wide"')}</div>`,
        async (form) => {
          await api('/switch', { method: 'POST', body: formValues(form) });
          STATE.entities.clear();
          await bootstrap();
          navigate('archive');
        },
        '打开',
      );
      break;
    case 'job-index':
      await job('index', { all: true, force: true });
      break;
    case 'roll-previews':
      await job('previews', { selection: { query: { rollId: value } } }, '补齐胶卷预览');
      break;
    case 'job-previews':
      await showOfflineHelp(true);
      break;
    case 'job-analyze':
      modal(
        '本地识图与文字检索',
        `<p class="form-note">在本机分析影像，提取场景标签、主色和图中文字，用于语义线索检索。人工标签保持原样。结果用于辅助查找，不会自动淘汰或删除照片。</p>`,
        async () => job('analyze', { selection: { query: {} } }),
        '开始本地分析',
        'ON-DEVICE VISION',
      );
      break;
    case 'job-integrity':
      await job('integrity');
      break;
    case 'duplicate-group':
      navigate('lighttable', { hash: value });
      break;
    case 'repair-media':
      STATE.repairMediaId = value;
      modal(
        '连接缺失原片',
        `<p class="form-note">系统会检查目标是否仍然缺失。已有原始哈希时，必须匹配才会写入；未知哈希时，请选择对应的原始文件。外部卷请使用“重新连接”。</p><button type="button" class="soft" data-action="choose-repair">选择原片</button>`,
        null,
      );
      break;
    case 'choose-repair':
      $('#repair-file').value = '';
      $('#repair-file').click();
      break;
    case 'save-export': {
      const label = element?.textContent;
      if (element) {
        element.disabled = true;
        element.textContent = '保存中…';
      }
      try {
        await saveExport(STATE.jobs.find((j) => j.id === value));
      } finally {
        if (element) {
          element.disabled = false;
          element.textContent = label;
        }
      }
      break;
    }
    case 'download-original': {
      const p = STATE.entities.get(value);
      if (!p) throw Error('请重新选择照片');
      await fileActions.save(
        raw(p.mediaId) + '?download=1&name=' + encodeURIComponent(p.name),
        p.name,
      );
      break;
    }
    case 'retry-previews': {
      const previous = STATE.jobs.find((j) => j.id === value);
      if (previous?.payload?.root !== STATE.boot.root) throw Error('请先打开这个任务所属的资料库');
      await job('previews', { selection: previous.payload.selection || { query: {} } });
      break;
    }
    case 'offline-help':
      await showOfflineHelp();
      break;
    case 'open-storage':
      navigate('storage');
      break;
    case 'choose-storage-folder': {
      const directory = await window.filmAlbumDesktop?.chooseDirectory();
      if (directory) {
        const form = $('#editor-form');
        form.elements.root.value = directory;
        if (!form.elements.name.value)
          form.elements.name.value = directory.split(/[\\/]/).filter(Boolean).at(-1) || '外部存储';
      }
      break;
    }
    case 'new-storage':
      newStorage();
      break;
    case 'storage-reconnect':
      reconnectStorage(value);
      break;
    case 'storage-import':
      modal(
        '引用导入外部目录',
        `<p class="form-note">按子文件夹分卷，保留源文件位置。大目录在后台逐项处理，可暂停和继续；离线预览用于硬盘拔出后的浏览。</p><label class="form-note"><input id="external-previews" type="checkbox" checked> 同时生成离线预览</label>`,
        async () =>
          job('external-import', {
            storageId: value,
            offlinePreviews: $('#external-previews').checked,
          }),
        '开始引用导入',
      );
      break;
    case 'save-map-preferences': {
      const box = $('#view-content'),
        country = box.querySelector('[name=mapDefaultCountry]').value,
        tile = box.querySelector('[name=mapTileURL]').value.trim();
      if (!/^https?:\/\//.test(tile) || !['{z}', '{x}', '{y}'].every((t) => tile.includes(t)))
        throw Error('底图地址需为带 {z}/{x}/{y} 的 HTTP(S) 模板');
      let view = COUNTRY_VIEWS[country];
      if (!view) {
        const name = countryOptions().find((c) => c.code === country)?.name || country;
        const places = await api('/places?' + new URLSearchParams({ q: name, country }));
        if (!places.length) throw Error('暂时无法确定此国家范围，请稍后重试');
        view = { center: [places[0].latitude, places[0].longitude], zoom: 5 };
      }
      await saveSettings({ mapDefaultCountry: country, mapDefaultView: view, mapTileURL: tile });
      toast('地图默认区域已保存');
      break;
    }
    case 'save-preferences': {
      const content = $('#view-content'),
        settings = {
          libraryName: content.querySelector('[name="libraryName"]').value,
          theme: content.querySelector('[name="theme"]').value,
          backupHours: Number(content.querySelector('[name="backupHours"]').value),
          backupRoot: content.querySelector('[name="backupRoot"]').value,
        };
      await saveSettings(settings);
      document.body.dataset.theme = settings.theme;
      await bootstrap();
      toast('偏好已保存');
      break;
    }
    case 'trash-rolls':
      navigate('archive', { trash: true });
      break;
    case 'purge': {
      const plan = await api('/purge-plan');
      modal(
        '永久清空回收站',
        `<p class="form-note important">将永久移除 ${plan.rolls} 卷与 ${plan.photos} 张回收站记录，删除不再被其他版本使用的托管原片。操作历史也会清空。</p><div class="form-grid">${field('confirm', '请输入：永久清空回收站', '', 'text', 'required autocomplete="off"')}</div>`,
        async (form) => {
          const v = formValues(form);
          if (v.confirm !== '永久清空回收站') throw new Error('确认文字不一致');
          await api('/purge', { method: 'POST', body: v });
          await bootstrap();
          refresh();
          toast('回收站已清空');
        },
        '永久清空',
        'PERMANENT DELETE',
      );
      break;
    }
    case 'labels':
      await job('pdf', { mode: 'labels', title: '胶卷归档标签', selection: selection() });
      break;
    case 'print-one-label':
      await job('pdf', {
        mode: 'labels',
        title: '胶卷归档标签',
        selection: { ids: [STATE.focus.id] },
      });
      break;
    case 'yearbook':
      navigate('lighttable', {}, { view: 'yearbook' });
      break;
    case 'export-yearbook':
      await job('pdf', {
        title: (STATE.query.year || '我的') + ' · 胶片摄影年鉴',
        selection: selection(),
      });
      break;
    case 'roll-contact-pdf': {
      const roll = STATE.entities.get(STATE.query.rollId);
      await job('pdf', {
        mode: 'contact',
        rollId: roll.id,
        title: roll.name + ' · 接触印样',
        selection: { query: { rollId: roll.id, sort: 'frame' } },
      });
      break;
    }
    case 'project-contact':
      await job('pdf', {
        mode: 'contact',
        title: '定稿接触印样',
        selection: { query: { projectId: STATE.projectId, stage: 'final' } },
      });
      break;
    case 'project-book': {
      const projectId = STATE.projectId,
        title = STATE.boot.lists.projects.find((p) => p.id === projectId)?.name || '摄影项目',
        result = await api(
          '/photos?filter=' +
            encodeURIComponent(
              JSON.stringify({ projectId, stage: 'final', type: 'image', limit: 200 }),
            ),
        );
      if (!result.total) throw Error('请先将照片标为定稿');
      if (result.total > 200) throw Error('每册最多 200 页，请分批整理定稿');
      const pages = result.items.map((photo) => ({
        background: '#ffffff',
        elements: [
          {
            id: photo.id,
            type: 'image',
            photoId: photo.id,
            mediaId: photo.mediaId,
            name: photo.name,
            x: 8,
            y: 8,
            w: 194,
            h: 194,
            fit: 'contain',
          },
        ],
      }));
      const book = await api('/books', {
        method: 'POST',
        body: { name: title, width: 210, height: 210, pages },
      });
      await bookDesigner.open(book.id);
      break;
    }
    case 'project-export':
      await job('pdf', {
        title:
          STATE.boot.lists.projects.find((p) => p.id === STATE.projectId)?.name || '摄影作品集',
        selection: { query: { projectId: STATE.projectId, stage: 'final' } },
      });
      break;
    case 'project-view':
      if (value !== STATE.projectView)
        navigate('projects', STATE.query, {
          projectId: STATE.projectId,
          projectStage: STATE.projectStage,
          projectView: value,
        });
      break;
    case 'project-stage':
      STATE.projectStage = value;
      STATE.page = 0;
      clearSelection();
      refresh();
      break;
    case 'canvas-plus':
      STATE.curationScale = Math.min(2, STATE.curationScale * 1.2);
      renderCanvas();
      break;
    case 'canvas-minus':
      STATE.curationScale = Math.max(0.2, STATE.curationScale / 1.2);
      renderCanvas();
      break;
    case 'canvas-arrange':
      for (const [i, item] of projectItems.entries())
        await api('/items/' + item.id, {
          method: 'PATCH',
          body: {
            patch: { x: (i % 4) * 290, y: Math.floor(i / 4) * 210, w: 260, h: 190, rotation: 0 },
            expectedVersion: item.version,
          },
        });
      renderCanvas();
      break;
    case 'random': {
      const roll = await api('/random');
      if (!roll) {
        toast('先装入一卷影像，再来抽取回忆');
        break;
      }
      const r = await api('/rolls/' + encodeURIComponent(roll.id));
      STATE.entities.set(r.id, r);
      navigate('lighttable', { rollId: r.id });
      inspect(r.id, 'rolls');
      toast('抽到了 ' + r.name);
      break;
    }
    case 'map-mode':
      {
        const { view, ...selection } = atlas.getNavigationState();
        navigate(
          'atlas',
          { ...STATE.query, mapMode: STATE.query.mapMode === 'photos' ? 'rolls' : 'photos' },
          { ...selection, mapView: view },
        );
      }
      break;
    case 'map-place': {
      modal('选择要定位的胶卷', '<div id="map-roll-picker"></div>', null);
      const dialog = $('#editor');
      dialog.classList.add('map-picker-dialog');
      const picker = createMapRollPicker({
        api,
        E,
        thumb,
        stocks: STOCKS,
        facets: STATE.boot.facets || {},
        toast,
        onRows: (rows) => {
          for (const roll of rows) STATE.entities.set(roll.id, roll);
        },
        onSelect: async (id) => {
          dialog.close();
          await atlas.assign(id);
        },
      });
      dialog.addEventListener(
        'close',
        () => {
          picker.destroy();
          dialog.classList.remove('map-picker-dialog');
        },
        { once: true },
      );
      picker.mount($('#map-roll-picker'));
      break;
    }
    case 'map-assign-roll':
      $('#editor').close();
      await atlas.assign(value);
      break;
    case 'edit-roll-location': {
      const roll = STATE.entities.get(value) || (await api('/rolls/' + encodeURIComponent(value)));
      modal(
        '设置胶卷地点',
        `<section class="roll-location-editor" data-edit-roll-location>${locationPickerFields('location', roll)}<button type="button" class="text" data-location-clear>清空地点和坐标</button></section>`,
        async (form) => {
          await patchRecord('rolls', roll.id, rollLocationPatch(formValues(form)));
          await bootstrap();
          refresh();
        },
      );
      const dispose = mountLocationPicker(
        $('#editor-body').querySelector('[data-edit-roll-location]'),
        {
          api,
          preferences: STATE.boot.lists.settings || {},
        },
      );
      $('#editor').addEventListener('close', dispose, { once: true });
      break;
    }
    case 'map-selected': {
      const row = STATE.entities.get(value || STATE.focus?.id);
      if (!row) break;
      navigate('atlas', {}, { mapFocusId: row.id, mapFocusCoordinates: rollCoordinates(row) });
      break;
    }
    case 'close-editor':
      $('#editor').close();
      break;
  }
}
async function saveLayout() {
  const width =
      parseInt(getComputedStyle(document.documentElement).getPropertyValue('--side-width')) || 244,
    inspectWidth =
      parseInt(getComputedStyle(document.documentElement).getPropertyValue('--inspect-width')) ||
      286;
  const layout = { ...STATE.layout, sideWidth: width, inspectWidth, view: STATE.view };
  STATE.layout = layout;
  const layouts = { ...(STATE.boot.lists.settings.layouts || {}), [STATE.workspace]: layout };
  await saveSettings({ layouts });
}
// Delegation keeps grid selection responsive without recreating every card after each click.
document.addEventListener('click', (event) => {
  const command = event.target.closest('[data-command]');
  if (command) {
    selectCommand(Number(command.dataset.command));
    return;
  }
  const a = event.target.closest('[data-action]');
  if (a) {
    event.preventDefault();
    Promise.resolve(action(a.dataset.action, a.dataset.value, a)).catch((error) =>
      toast(error.message, 'warning'),
    );
    return;
  }
  const workspace = event.target.closest('[data-workspace]');
  if (workspace) {
    navigate(workspace.dataset.workspace);
    return;
  }
  const cluster = event.target.closest('[data-mapcluster]');
  if (cluster) {
    const c = mapClusters[Number(cluster.dataset.mapcluster)];
    if (c.count > 1)
      mapZoom(0.35, ((c.longitude + 180) / 360) * 1000, ((90 - c.latitude) / 180) * 500);
    else inspect(c.id, 'rolls', 'notes');
    return;
  }
  const record = event.target.closest('[data-record]');
  if (record && !event.target.closest('[contenteditable=true]'))
    pickRecord(record.dataset.record, record.dataset.entity, event);
});
document.addEventListener('dblclick', (event) => {
  if (event.target.closest('[data-action="edit-roll-date"],[data-action="edit-roll-location"]'))
    return;
  const record = event.target.closest('[data-record]');
  if (record && event.target.closest('[contenteditable=true]')) return;
  if (record) {
    if (record.dataset.entity === 'rolls') action('roll-photos', record.dataset.record);
    else openPhoto(record.dataset.record).catch((error) => toast(error.message, 'warning'));
  }
  const item = event.target.closest('[data-item]');
  if (item) {
    const row = projectItems.find((i) => i.id === item.dataset.item);
    if (row) openPhoto(row.photo_id).catch((e) => toast(e.message, 'warning'));
  }
});
document.addEventListener('change', (event) => {
  const control = event.target;
  if (control.hasAttribute('data-date-precision')) {
    const group = control.closest('.date-fields');
    group.querySelector('.date-value').innerHTML = dateValueControl(
      group.dataset.dateName,
      group.dataset.dateValue,
      control.value,
      group.dataset.dateRequired === 'true',
    );
    return;
  }
  const dateGroup = control.closest('.date-value')?.closest('.date-fields');
  if (dateGroup) {
    dateGroup.dataset.dateValue = control.value;
    return;
  }
  if (control.name === 'ruleField') {
    const host = control.closest('.rule-row').querySelector('[data-rule-value]');
    if (control.value === 'date' || host.querySelector('.date-fields'))
      host.innerHTML = ruleValueControl(control.value);
    return;
  }
  if (control.dataset.filter !== undefined) {
    const key = control.dataset.filter;
    if (control.value) STATE.query[key] = control.value;
    else delete STATE.query[key];
    STATE.page = 0;
    clearSelection();
    refresh();
    return;
  }
  if (control.hasAttribute('data-inspect-field') && STATE.focus) {
    const { id, entity } = STATE.focus;
    let key = control.name,
      value = control.value,
      patch = {};
    if (key.startsWith('physical.'))
      patch.physical = { ...STATE.entities.get(id).physical, [key.slice(9)]: value };
    else {
      if (key === 'tags')
        value = value
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean);
      if (key === 'rejected') value = value === '1';
      patch[key] = value;
    }
    patchRecord(entity, id, patch)
      .then(() => {
        if (entity === 'rolls') {
          bootstrap().then(() => refresh());
        } else refresh();
      })
      .catch((e) => {
        toast(e.message, 'warning');
        inspect(id, entity);
      });
  }
});
document.addEventListener('focusout', (event) => {
  const cell = event.target.closest('[data-edit-roll]');
  if (!cell) return;
  const row = STATE.entities.get(cell.dataset.editRoll),
    key = cell.dataset.field,
    value = cell.textContent.trim();
  if (value === String(row[key] || '')) return;
  patchRecord('rolls', row.id, { [key]: value })
    .then(() => {
      STATE.entities.set(row.id, { ...STATE.entities.get(row.id), [key]: value });
    })
    .catch((error) => {
      cell.textContent = row[key] || '';
      toast(error.message, 'warning');
    });
});
$('#editor-form').onsubmit = async (event) => {
  event.preventDefault();
  const handler = STATE.editor;
  if (!handler) return;
  const button = $('#editor-footer button[type="submit"]');
  button.disabled = true;
  try {
    await handler(event.target);
    if (STATE.editor === handler) $('#editor').close();
  } catch (error) {
    toast(error.message, 'warning');
  } finally {
    if (button.isConnected) button.disabled = false;
  }
};
$('#editor').addEventListener('close', (event) => {
  if (!event.target.open) STATE.editor = null;
});
$('#command-input').oninput = (event) => {
  clearTimeout(commandTimer);
  STATE.commandIndex = 0;
  commandTimer = setTimeout(() => updateCommands(event.target.value), 160);
};
$('#command-input').onkeydown = (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    STATE.commandIndex =
      (STATE.commandIndex + (event.key === 'ArrowDown' ? 1 : -1) + STATE.commandActions.length) %
      STATE.commandActions.length;
    $$('[data-command]').forEach((item, index) =>
      item.classList.toggle('active', index === STATE.commandIndex),
    );
    $(`[data-command="${STATE.commandIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    selectCommand(STATE.commandIndex);
  }
};
for (const selector of ['#import-files', '#import-folder'])
  $(selector).onchange = (event) => {
    const files = [...event.target.files].filter((file) => file.size > 0);
    if (STATE.resumeUploadId) {
      const id = STATE.resumeUploadId;
      STATE.resumeUploadId = null;
      STATE.uploadSources.set(id, files);
      $('#editor').close();
      uploadBatch(id).catch((error) => toast(error.message, 'warning'));
    } else {
      STATE.importFiles = files;
      showImportWizard();
    }
  };
$('#barcode-file').onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    toast('正在识别片袋编号');
    const response = await fetch('/api/v2/barcode', { method: 'POST', body: file }),
      result = await response.json();
    if (!response.ok) throw new Error(result.error);
    if (!result.roll) throw new Error('没有找到本资料库的胶卷标签');
    STATE.entities.set(result.roll.id, await api('/rolls/' + encodeURIComponent(result.roll.id)));
    navigate('lighttable', { rollId: result.roll.id });
    inspect(result.roll.id, 'rolls', 'physical');
  } catch (error) {
    toast(error.message, 'warning');
  }
};
$('#repair-file').onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const response = await fetch('/api/v2/repair/' + encodeURIComponent(STATE.repairMediaId), {
        method: 'PUT',
        body: file,
      }),
      result = await response.json();
    if (!response.ok) throw new Error(result.error);
    $('#editor').close();
    toast(result.verified ? 'SHA-256 核对通过，原片已连接' : '已连接所选文件');
    await bootstrap();
    refresh();
  } catch (error) {
    toast(error.message, 'warning');
  }
};
for (const [selector, variable, min, max] of [
  ['#side-resizer', '--side-width', 170, 380],
  ['#inspector-resizer', '--inspect-width', 230, 420],
]) {
  const handle = $(selector);
  let start;
  handle.onpointerdown = (e) => {
    start = {
      x: e.clientX,
      width: parseFloat(getComputedStyle(document.documentElement).getPropertyValue(variable)),
    };
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  handle.onpointermove = (e) => {
    if (start)
      document.documentElement.style.setProperty(
        variable,
        Math.max(
          min,
          Math.min(
            max,
            start.width + (e.clientX - start.x) * (variable === '--side-width' ? 1 : -1),
          ),
        ) + 'px',
      );
  };
  handle.onpointerup = handle.onpointercancel = () => {
    if (start) {
      start = null;
      saveLayout().catch(() => {});
    }
  };
}
let draggedPhoto = null,
  draggedColumn = null,
  canvasDrag = null;
document.addEventListener('dragstart', (event) => {
  const column = event.target.closest('[data-column]');
  if (column) {
    draggedColumn = column.dataset.column;
    event.dataTransfer.setData('text/plain', draggedColumn);
    return;
  }
  const card = event.target.closest('[data-record]');
  if (
    card &&
    (STATE.workspace === 'projects' ||
      (STATE.query.collectionId &&
        STATE.boot.lists.collections.find((c) => c.id === STATE.query.collectionId)?.kind !==
          'smart'))
  ) {
    draggedPhoto = card.dataset.record;
    event.dataTransfer.setData('application/x-filmalbum-photo', draggedPhoto);
  }
});
document.addEventListener('dragover', (event) => {
  if (
    event.target.closest('[data-column],[data-stage-drop],[data-record]') ||
    [...event.dataTransfer.types].includes('Files')
  )
    event.preventDefault();
});
document.addEventListener('drop', async (event) => {
  try {
    if ([...event.dataTransfer.types].includes('Files')) {
      event.preventDefault();
      const result = [];
      async function collect(entry, path = '') {
        if (entry.isFile)
          await new Promise((resolve) =>
            entry.file((file) => {
              Object.defineProperty(file, 'webkitRelativePath', { value: path + file.name });
              result.push(file);
              resolve();
            }, resolve),
          );
        else if (entry.isDirectory) {
          const reader = entry.createReader();
          while (true) {
            const entries = await new Promise((resolve) =>
              reader.readEntries(resolve, () => resolve([])),
            );
            if (!entries.length) break;
            for (const child of entries) await collect(child, path + entry.name + '/');
          }
        }
      }
      for (const item of event.dataTransfer.items) {
        const entry = item.webkitGetAsEntry?.();
        if (entry) await collect(entry);
        else if (item.getAsFile()) result.push(item.getAsFile());
      }
      chooseImport(STATE.query.rollId || null);
      STATE.importFiles = result;
      showImportWizard();
      return;
    }
    const column = event.target.closest('[data-column]');
    if (column && draggedColumn) {
      event.preventDefault();
      const cols = STATE.layout.columns || [
          'code',
          'name',
          'stock',
          'format',
          'camera',
          'date',
          'location',
          'frameCount',
          'status',
        ],
        from = cols.indexOf(draggedColumn),
        to = cols.indexOf(column.dataset.column);
      if (from >= 0 && to >= 0) {
        cols.splice(from, 1);
        cols.splice(to, 0, draggedColumn);
        STATE.layout.columns = cols;
        renderResults();
        await saveLayout();
      }
      draggedColumn = null;
      return;
    }
    if (draggedPhoto && STATE.query.collectionId && !STATE.projectId) {
      event.preventDefault();
      const target = event.target.closest('[data-record]');
      if (target)
        await api('/collections/' + STATE.query.collectionId + '/reorder', {
          method: 'POST',
          body: { photoId: draggedPhoto, beforeId: target.dataset.record },
        });
      draggedPhoto = null;
      refresh();
      return;
    }
    if (draggedPhoto && STATE.projectId) {
      event.preventDefault();
      const stage = event.target.closest('[data-stage-drop]');
      if (stage && stage.dataset.stageDrop !== 'all') {
        const items = await api('/projects/' + STATE.projectId + '/items'),
          item = items.find((i) => i.photo_id === draggedPhoto);
        if (item)
          await api('/items/' + item.id, {
            method: 'PATCH',
            body: { patch: { stage: stage.dataset.stageDrop }, expectedVersion: item.version },
          });
      } else {
        const target = event.target.closest('[data-record]');
        if (target)
          await api('/projects/' + STATE.projectId + '/reorder', {
            method: 'POST',
            body: { photoId: draggedPhoto, beforeId: target.dataset.record },
          });
      }
      draggedPhoto = null;
      refresh();
    }
  } catch (error) {
    toast(error.message, 'warning');
  }
});
$('#view-content').addEventListener('pointerdown', (event) => {
  const node = event.target.closest('[data-item]');
  if (!node || event.button !== 0) return;
  const item = projectItems.find((i) => i.id === node.dataset.item);
  STATE.canvasSelected = item.id;
  canvasDrag = {
    node,
    item: { ...item },
    x: event.clientX,
    y: event.clientY,
    resize: Boolean(event.target.closest('.resize-corner')),
    moved: false,
  };
  node.setPointerCapture(event.pointerId);
  event.preventDefault();
});
$('#view-content').addEventListener('pointermove', (event) => {
  if (!canvasDrag) return;
  const d = canvasDrag,
    dx = (event.clientX - d.x) / STATE.curationScale,
    dy = (event.clientY - d.y) / STATE.curationScale;
  if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
  if (d.resize) {
    d.node.style.width = Math.max(80, Math.min(1500, d.item.w + dx)) + 'px';
    d.node.style.height =
      Math.max(
        80,
        Math.min(1200, event.shiftKey ? ((d.item.w + dx) * d.item.h) / d.item.w : d.item.h + dy),
      ) + 'px';
  } else {
    d.node.style.left = Math.max(0, Math.min(5000, d.item.x + dx)) + 'px';
    d.node.style.top = Math.max(0, Math.min(5000, d.item.y + dy)) + 'px';
  }
});
$('#view-content').addEventListener('pointerup', async () => {
  const d = canvasDrag;
  canvasDrag = null;
  if (!d?.moved) return;
  try {
    const patch = {
        x: parseFloat(d.node.style.left),
        y: parseFloat(d.node.style.top),
        w: parseFloat(d.node.style.width),
        h: parseFloat(d.node.style.height),
      },
      item = await api('/items/' + d.item.id, {
        method: 'PATCH',
        body: { patch, expectedVersion: d.item.version },
      });
    Object.assign(
      projectItems.find((i) => i.id === item.id),
      item,
    );
  } catch (error) {
    toast(error.message, 'warning');
    renderCanvas();
  }
});
$('#view-content').addEventListener('pointercancel', () => (canvasDrag = null));
document.addEventListener('keydown', async (event) => {
  try {
    if (document.querySelector('.book-designer[open]')) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      command();
      return;
    }
    if ($('#command-dialog').open || $('#editor').open) return;
    const typing =
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) ||
      document.activeElement.isContentEditable;
    if (typing) return;
    if (reviewer.isOpen()) {
      await reviewer.key(event);
      return;
    }
    if (event.key === 'Escape') {
      clearSelection();
      $('.inspector').classList.remove('mobile-open');
      $('.sidebar').classList.remove('mobile-open');
      return;
    }
    if (event.key === '1') navigate('archive');
    if (event.key === '2') navigate('lighttable');
    if (event.key.toLowerCase() === 'c' && STATE.selected.size) await action('compare');
    if (event.key.toLowerCase() === 'x' && STATE.focus?.entity === 'photos') {
      const p = STATE.entities.get(STATE.focus.id);
      await patchRecord('photos', p.id, { rejected: !p.rejected });
      refresh();
    }
    if (event.key === 'Enter' && STATE.focus) {
      STATE.focus.entity === 'photos'
        ? await openPhoto(STATE.focus.id)
        : await action('roll-photos', STATE.focus.id);
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      const list = await api('/history'),
        last = list.find((h) => h.state === 'applied');
      if (last) {
        await api('/history/' + last.id + '/undo', { method: 'POST', body: {} });
        await bootstrap();
        refresh();
      }
    }
  } catch (error) {
    toast(error.message, 'warning');
  }
});
history.scrollRestoration = 'manual';
window.addEventListener('popstate', (event) => {
  if (!event.state?.filmAlbum || !navigationEntry) return;
  rememberNavigation();
  openNavigation(event.state, navigationSnapshots.get(event.state.index));
});
async function start() {
  try {
    await bootstrap();
    const params = new URLSearchParams(location.search),
      workspace = params.get('workspace') || 'archive';
    if (STATE.boot.error) {
      navigate('storage', {}, { storageTab: 'backups' });
    } else if (history.state?.filmAlbum) {
      navigationEnd = Math.max(
        history.state.index,
        Number(sessionStorage.getItem(navigationEndKey)) || 0,
      );
      openNavigation(history.state);
    } else if (params.get('roll')) navigate('lighttable', { rollId: params.get('roll') });
    else
      navigate(
        ['archive', 'lighttable', 'projects', 'atlas', 'storage'].includes(workspace)
          ? workspace
          : 'archive',
      );
    pollJobs();
    if (DEBUG_MODE) await action('demo');
  } catch (error) {
    $('#view-content').innerHTML =
      `<div class="empty">无法连接本地服务<small>${E(error.message)}</small><button class="soft" data-action="retry">重试</button></div>`;
  }
}
start();
window.filmAlbumDesktop
  ?.checkForUpdate?.()
  .then((update) => {
    if (!update) return;
    const banner = $('#update-banner');
    $('#update-version').textContent = 'v' + update.version;
    $('#update-download').href = update.url;
    $('#update-dismiss').onclick = () => (banner.hidden = true);
    banner.hidden = false;
  })
  .catch(() => {});

document.addEventListener(
  'error',
  (event) => {
    const image = event.target;
    if (image.tagName !== 'IMG' || image.closest('#reviewer') || !image.src.includes('/preview/'))
      return;
    image.hidden = true;
    const hint = document.createElement('span');
    hint.className = 'preview-unavailable';
    hint.textContent = '暂无预览 · 连接原片后重试';
    image.parentElement.append(hint);
  },
  true,
);
