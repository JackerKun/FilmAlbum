import { themeGallery, filterThemeGallery } from './book-themes.mjs';
import { openBookSizePicker } from './book-size-picker.mjs';
import { createBookLibrary } from './book-library.mjs';
import { BOOK_THEMES, createPhotobook } from '../shared/book-model.mjs';
import { pageThumbnail, loadBookLand } from './book-view.mjs';
export function createBookBuilder({ api, E, thumb, toast }) {
  return async function build({ photos = [], filters = {}, name = '', groupBy = 'roll' } = {}) {
    const host = document.createElement('dialog');
    host.className = 'book-builder';
    let step = 0,
      result = null,
      selected = new Map(photos.map((p) => [p.id, p])),
      busy = false,
      draft,
      source = filters.projectId
        ? 'project:' + filters.projectId
        : filters.collectionId
          ? 'collection:' + filters.collectionId
          : filters.rollId
            ? 'current'
            : '';
    const options = {
      name: name || '我的摄影画册',
      theme: 'quiet',
      width: 210,
      height: 260,
      density: 'balanced',
      groupBy,
      author: '',
      introduction: '',
      coverId: '',
      heroIds: [],
      rollNotes: false,
      map: false,
      contact: false,
    };
    const boot = await api('/bootstrap');
    const library = createBookLibrary({
      api,
      E,
      thumb,
      toast,
      t: (a) => a,
      getSelected: () => [...selected.keys()],
      onBatch: (rows) => {
        for (const p of rows) selected.set(p.id, p);
        library.refresh();
        updateSelection();
      },
      onAdd: (id) => {
        if (selected.has(id)) selected.delete(id);
        else selected.set(id, library.getPhoto(id));
        library.refresh();
        updateSelection();
      },
    });
    const $ = (s) => host.querySelector(s);
    function updateSelection() {
      $('#builder-selected-count').textContent = `已选择 ${selected.size} 张`;
      $('#builder-selection').innerHTML =
        [...selected.values()]
          .map(
            (p, i) =>
              `<div draggable="true" data-sequence="${E(p.id)}"><img loading="lazy" src="${thumb(p.mediaId, 320)}" alt="${E(p.name)}"><span>${i + 1}. ${E(p.name)}</span><button data-cover="${E(p.id)}" aria-pressed="${options.coverId === p.id}" title="用作封面">${options.coverId === p.id ? '封面 ✓' : '封面'}</button><button data-hero="${E(p.id)}" aria-pressed="${options.heroIds.includes(p.id)}" title="重点照片单独成页">${options.heroIds.includes(p.id) ? '★' : '☆'}</button><button data-remove="${E(p.id)}" title="移出选片">×</button></div>`,
          )
          .join('') || '<p>点击照片加入选片。拖动已选照片调整顺序。</p>';
    }
    function updatePreview() {
      if (!$('#builder-preview')) return;
      try {
        draft = createPhotobook([...selected.values()], options);
        $('#builder-estimate').textContent =
          `${selected.size} 张照片 · ${draft.pages.length} 页 · ${options.width} × ${options.height} mm`;
        $('#builder-preview').innerHTML = draft.pages
          .slice(0, step === 2 ? 200 : 6)
          .map(
            (p, i) =>
              `<article>${pageThumbnail(draft, p, i, thumb)}<small>${i + 1} · ${E(p.title || p.chapter || '正文')}</small></article>`,
          )
          .join('');
        $('#builder-error').textContent = '';
      } catch (e) {
        draft = null;
        $('#builder-error').textContent = e.message;
      }
    }
    function render() {
      host.innerHTML = `<header><div><small>FILM ALBUM / NEW BOOK</small><h2>把照片编成一本书</h2></div><button data-builder="cancel" aria-label="取消新建画册">×</button></header><nav class="book-steps">${['选择照片', '风格与结构', '全册初稿'].map((title, i) => `<button data-step="${i}" aria-current="${step === i ? 'step' : 'false'}">0${i + 1} ${title}</button>`).join('')}</nav><main>${
        step === 0
          ? `<section class="builder-source"><div class="builder-source-bar"><select id="builder-source" aria-label="照片来源"><option value="">全库照片 · 手动挑选</option>${filters.rollId ? '<option value="current">当前胶卷</option>' : ''}<optgroup label="策展项目定稿">${(boot.lists.projects || []).map((p) => `<option value="project:${E(p.id)}">${E(p.name)}</option>`).join('')}</optgroup><optgroup label="收藏">${(boot.lists.collections || []).map((c) => `<option value="collection:${E(c.id)}">${E(c.name)}</option>`).join('')}</optgroup></select><button data-builder="page">全选本页</button><button data-builder="unpage">取消本页</button><button data-builder="all">加入全部匹配照片</button></div><div id="builder-library"></div></section><aside class="builder-selected"><h3 id="builder-selected-count"></h3><p>Shift 点击连续多选；拖动右侧照片调整顺序。</p><button data-builder="clear">清空选片</button><div id="builder-selection"></div></aside>`
          : `${
              step === 1
                ? `<form class="builder-options"><label>画册名称<input name="name" value="${E(options.name)}" maxlength="120" required></label><label>作者 / 封面副标题<input name="author" value="${E(options.author)}"></label>${themeGallery(options.theme)}<label>画册规格<button type="button" data-builder="size" class="book-size-trigger"><span style="aspect-ratio:${options.width}/${options.height}"></span><b>${options.width} × ${options.height} mm</b>选择规格 ›</button></label><div class="book-field-pair"><label>宽 mm<input type="number" name="width" min="80" max="450" value="${options.width}"></label><label>高 mm<input type="number" name="height" min="80" max="450" value="${options.height}"></label></div><label>排版密度<select name="density"><option value="airy" ${options.density === 'airy' ? 'selected' : ''}>留白较多 · 每页一张</option><option value="balanced" ${options.density === 'balanced' ? 'selected' : ''}>均衡叙事 · 每页一至两张</option><option value="compact" ${options.density === 'compact' ? 'selected' : ''}>紧凑记录 · 每页最多四张</option></select></label><label>章节组织<select name="groupBy">${[
                    ['roll', '按胶卷'],
                    ['project', '沿用策展章节'],
                    ['year', '按拍摄年份'],
                    ['none', '保留照片顺序，不自动分章'],
                  ]
                    .map(
                      ([v, n]) =>
                        `<option value="${v}" ${options.groupBy === v ? 'selected' : ''}>${n}</option>`,
                    )
                    .join(
                      '',
                    )}</select></label><label>扉页文字<textarea name="introduction" rows="3">${E(options.introduction)}</textarea></label>${[
                    ['rollNotes', '胶卷资料页'],
                    ['map', '旅行地点地图'],
                    ['contact', '接触印样附录'],
                  ]
                    .map(
                      ([k, n]) =>
                        `<label class="book-check"><input type="checkbox" name="${k}" ${options[k] ? 'checked' : ''}>${n}</label>`,
                    )
                    .join(
                      '',
                    )}<p class="book-hint">默认完整构图，满版页面可调整裁切。地图只使用已记录坐标；扫描时间不会用来代替拍摄年代。</p></form>`
                : ''
            }<section class="builder-proof"><h3 id="builder-estimate"></h3><p id="builder-error" role="alert"></p><div id="builder-preview" class="${step === 2 ? 'full' : ''}"></div></section>`
      }</main><footer><span>${step === 0 ? '先挑照片，也可以直接创建空白画册。' : '初稿可随时调整；创建后进入跨页编辑。'}</span><button data-builder="back" ${step === 0 ? 'disabled' : ''}>上一步</button><button class="primary" data-builder="next">${step === 2 ? '创建并开始编辑' : '下一步'}</button></footer>`;
      if (step === 0) {
        library.mount($('#builder-library'));
        $('#builder-source').value = source;
        updateSelection();
      } else updatePreview();
    }
    host.onclick = async (e) => {
      const cover = e.target.closest('[data-cover]');
      if (cover) {
        options.coverId = cover.dataset.cover;
        updateSelection();
        return;
      }
      const hero = e.target.closest('[data-hero]');
      if (hero) {
        const value = hero.dataset.hero;
        options.heroIds = options.heroIds.includes(value)
          ? options.heroIds.filter((id) => id !== value)
          : [...options.heroIds, value];
        updateSelection();
        return;
      }
      const remove = e.target.closest('[data-remove]');
      if (remove) {
        selected.delete(remove.dataset.remove);
        library.refresh();
        updateSelection();
        return;
      }
      const theme = e.target.closest('button[data-theme]');
      if (theme) {
        options.theme = theme.dataset.theme;
        render();
        return;
      }
      const nav = e.target.closest('[data-step]');
      if (nav) {
        step = Number(nav.dataset.step);
        render();
        return;
      }
      const action = e.target.closest('[data-builder]')?.dataset.builder;
      if (!action || busy) return;
      if (action === 'size') {
        openBookSizePicker({
          ...options,
          onSelect: (p) => {
            if (p) {
              options.width = p.width;
              options.height = p.height;
              render();
            } else $('[name=width]').focus();
          },
        });
        return;
      }
      if (action === 'page' || action === 'unpage') {
        for (const p of library.visible()) {
          if (action === 'page') selected.set(p.id, p);
          else selected.delete(p.id);
        }
        library.refresh();
        updateSelection();
        return;
      }
      if (action === 'cancel') {
        host.close();
        return;
      }
      if (action === 'back') {
        step--;
        render();
        return;
      }
      if (action === 'clear') {
        selected.clear();
        library.refresh();
        updateSelection();
        return;
      }
      if (action === 'all') {
        busy = true;
        e.target.disabled = true;
        e.target.textContent = '正在加入…';
        try {
          for (const p of await library.matching()) selected.set(p.id, p);
          library.refresh();
          updateSelection();
        } catch (err) {
          toast(err.message, 'warning');
        } finally {
          busy = false;
          e.target.disabled = false;
          e.target.textContent = '加入全部匹配照片';
        }
        return;
      }
      if (action === 'next') {
        if (step === 1 && !$('.builder-options').reportValidity()) return;
        if (step === 2) {
          if (!draft) {
            toast('请先修正画册设置', 'warning');
            return;
          }
          result = draft;
          host.close();
          return;
        }
        step++;
        render();
      }
    };
    let timer;
    host.oninput = (e) => {
      if (!e.target.name) return;
      const { name, value, type, checked } = e.target;
      options[name] = type === 'checkbox' ? checked : type === 'number' ? Number(value) : value;
      clearTimeout(timer);
      timer = setTimeout(updatePreview, 180);
    };
    host.onchange = async (e) => {
      if (filterThemeGallery(e)) return;
      if (e.target.id === 'builder-source') {
        source = e.target.value;
        const [kind, id] = source.split(':');
        await library.setFilters(
          kind === 'project'
            ? { projectId: id, stage: 'final' }
            : kind === 'collection'
              ? { collectionId: id }
              : kind === 'current'
                ? filters
                : {},
        );
        if (kind === 'project') options.groupBy = 'project';
        return;
      }
      if (e.target.name === 'size' && e.target.value !== 'custom') {
        [options.width, options.height] = e.target.value.split(',').map(Number);
        render();
      }
    };
    host.onsubmit = (e) => e.preventDefault();
    host.ondragstart = (e) => {
      const node = e.target.closest('[data-sequence]');
      if (node) e.dataTransfer.setData('application/book-selection', node.dataset.sequence);
    };
    host.ondragover = (e) => {
      if (e.target.closest('[data-sequence]')) e.preventDefault();
    };
    host.ondrop = (e) => {
      const target = e.target.closest('[data-sequence]'),
        id = e.dataTransfer.getData('application/book-selection');
      if (!target || !selected.has(id)) return;
      e.preventDefault();
      const order = [...selected.keys()].filter((p) => p !== id);
      order.splice(order.indexOf(target.dataset.sequence), 0, id);
      selected = new Map(order.map((k) => [k, selected.get(k)]));
      updateSelection();
    };
    document.body.append(host);
    render();
    host.showModal();
    const closed = new Promise((resolve) =>
      host.addEventListener(
        'close',
        () => {
          library.close();
          clearTimeout(timer);
          host.remove();
          resolve(result);
        },
        { once: true },
      ),
    );
    try {
      await Promise.all([library.open(filters), loadBookLand()]);
    } catch (e) {
      toast(e.message, 'warning');
    }
    return closed;
  };
}
