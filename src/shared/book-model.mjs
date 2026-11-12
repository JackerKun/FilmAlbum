import { STOCKS } from './film-stocks.mjs';
import { rollCoordinates } from './geolocation.mjs';
export const BOOK_THEMES = {
  quiet: {
    group: '摄影作品',
    single: 'inset',
    pair: 'stack',
    name: '留白摄影集',
    en: 'Quiet collection',
    background: '#faf8f2',
    ink: '#282a25',
    accent: '#827449',
    font: 'serif',
    margin: 16,
    description: '温暖纸白 · 完整构图 · 安静留白',
  },
  city: {
    group: '旅行纪实',
    single: 'hero',
    pair: 'stagger',
    name: '城市漫游',
    en: 'City journal',
    background: '#ffffff',
    ink: '#202b32',
    accent: '#bf4f37',
    font: 'sans',
    margin: 12,
    description: '鲜明章节 · 编辑网格 · 大小图交替',
  },
  archive: {
    group: '胶片档案',
    single: 'editorial',
    pair: 'duo',
    name: '胶片手记',
    en: 'Film notebook',
    background: '#f2efdf',
    ink: '#283c32',
    accent: '#8b713d',
    font: 'sans',
    margin: 14,
    description: '胶卷档案 · 拍摄笔记 · 小型注释',
  },
  gallery: {
    name: '美术馆图录',
    en: 'Gallery edition',
    group: '摄影作品',
    background: '#ffffff',
    ink: '#202020',
    accent: '#8b8174',
    font: 'serif',
    margin: 22,
    single: 'inset',
    pair: 'duo',
    description: '克制黑白 · 宽幅留白 · 对称双图',
  },
  noir: {
    name: '暗调作品集',
    en: 'Noir portfolio',
    group: '摄影作品',
    background: '#181a1b',
    ink: '#f0eee9',
    accent: '#cbb37c',
    font: 'sans',
    margin: 15,
    single: 'single',
    pair: 'stagger',
    description: '深色纸面 · 金色小标 · 错落双图',
  },
  editorial: {
    name: '独立杂志',
    en: 'Editorial magazine',
    group: '摄影作品',
    background: '#fffdf8',
    ink: '#1b292f',
    accent: '#d63b35',
    font: 'sans',
    margin: 10,
    single: 'offset',
    pair: 'stagger',
    description: '大胆网格 · 偏心构图 · 红色章节',
  },
  travel: {
    name: '旅行日记',
    en: 'Travel diary',
    group: '旅行纪实',
    background: '#f7f1e6',
    ink: '#344c54',
    accent: '#b66d42',
    font: 'serif',
    margin: 15,
    single: 'editorial',
    pair: 'stack',
    description: '暖纸日记 · 故事留白 · 上下叙事',
  },
  coast: {
    name: '海岸假日',
    en: 'Coastal days',
    group: '旅行纪实',
    background: '#edf5f4',
    ink: '#28434d',
    accent: '#478c95',
    font: 'sans',
    margin: 16,
    single: 'inset',
    pair: 'duo',
    description: '海盐蓝绿 · 清爽留白 · 并置照片',
  },
  wedding: {
    name: '婚礼纪念',
    en: 'Modern romance',
    group: '生活纪念',
    background: '#fff9f5',
    ink: '#604840',
    accent: '#af887a',
    font: 'serif',
    margin: 20,
    single: 'inset',
    pair: 'stagger',
    description: '柔和奶油 · 优雅衬线 · 大小图错落',
  },
  family: {
    name: '家庭年鉴',
    en: 'Family yearbook',
    group: '生活纪念',
    background: '#fbf3df',
    ink: '#4b4434',
    accent: '#aa7444',
    font: 'sans',
    margin: 14,
    single: 'single',
    pair: 'stack',
    description: '暖黄纸面 · 亲切注释 · 连续故事',
  },
  polaroid: {
    name: '拍立得手帐',
    en: 'Instant memories',
    group: '生活纪念',
    background: '#eae4da',
    ink: '#494539',
    accent: '#a26d53',
    font: 'sans',
    margin: 20,
    single: 'instant',
    pair: 'stagger',
    description: '方形相框 · 宽底留白 · 手帐节奏',
  },
  documentary: {
    name: '纪实档案',
    en: 'Documentary archive',
    group: '胶片档案',
    background: '#eeeae0',
    ink: '#303a34',
    accent: '#697654',
    font: 'sans',
    margin: 12,
    single: 'offset',
    pair: 'duo',
    description: '中性纸色 · 严谨双栏 · 档案注释',
  },
};
export const PAGE_ROLES = {
  cover: '封面',
  title: '扉页',
  chapter: '章节',
  content: '正文',
  notes: '胶卷资料',
  map: '旅行地图',
  contact: '接触印样',
  ending: '结束页',
  back: '封底',
};
export const CAPTION_FIELDS = {
  name: '照片名称',
  location: '地点',
  date: '拍摄日期',
  frameNo: '格号',
  camera: '相机',
  stock: '胶片',
};
const copy = (x) => structuredClone(x);
const uid = () => globalThis.crypto.randomUUID();
export function normalizeBook(input) {
  const book = copy(input);
  book.schemaVersion = 2;
  book.theme ||= 'quiet';
  book.safe ??= 8;
  book.bleed ??= 3;
  book.innerMargin ??= book.safe;
  book.binding ||= 'layflat';
  book.spine ??= 0;
  book.assets ||= {};
  book.pending ||= [];
  book.captionFields ||= [];
  book.pages = (book.pages || []).map((p) => ({
    ...p,
    id: p.id || uid(),
    role: p.role || 'content',
    elements: p.elements.map((e) => ({ ...e, id: e.id || uid() })),
  }));
  return book;
}
export function assetSnapshot(p) {
  // Scanner timestamps must never masquerade as a confirmed shooting date.
  const scanDay = String(p.exif?.date || '')
    .replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
    .slice(0, 10);
  const date =
    p.fileDateSource === 'scan' && (!p.date || p.date === scanDay)
      ? p.rollDate || ''
      : p.date || p.rollDate || '';
  return {
    id: p.id,
    mediaId: p.mediaId,
    name: p.name || '',
    frameNo: p.frameNo || '',
    rollId: p.roll_id || p.rollId || '',
    rollName: p.rollName || '',
    rollCode: p.rollCode || '',
    location: p.placeName || p.location || '',
    date,
    datePrecision:
      date === p.rollDate
        ? p.rollDatePrecision || (date.length === 4 ? 'year' : date.length === 7 ? 'month' : 'day')
        : date.length === 4
          ? 'year'
          : date.length === 7
            ? 'month'
            : 'day',
    camera: p.camera || '',
    lens: p.lens || '',
    stock: STOCKS[p.stock]?.name || p.stock || '',
    notes: p.notes || '',
    rollNotes: p.rollNotes || '',
    lab: p.lab || '',
    process: p.process || '',
    format: p.format || '',
    chapter: p.chapter || '',
    coordinates: rollCoordinates(p) || rollCoordinates(p.coordinates) || p.rollCoordinates || null,
    width: p.exif?.width || p.width || 0,
    height: p.exif?.height || p.height || 0,
  };
}
export function textElement(text, x, y, w, h, extra = {}) {
  return {
    id: uid(),
    type: 'text',
    text,
    x,
    y,
    w,
    h,
    fontSize: 12,
    color: '#282a25',
    fontFamily: 'sans',
    lineHeight: 1.35,
    rotation: 0,
    ...extra,
  };
}
export function imageElement(asset, x, y, w, h) {
  return {
    id: uid(),
    type: 'image',
    photoId: asset?.id,
    mediaId: asset?.mediaId,
    name: asset?.name || '',
    x,
    y,
    w,
    h,
    fit: 'contain',
    cropX: 0.5,
    cropY: 0.5,
    rotation: 0,
  };
}
export function pageMargins(book, index) {
  const safe = Number(book.safe || 0),
    inside = Math.max(safe, Number(book.innerMargin || 0));
  return {
    left: index % 2 === 0 ? inside : safe,
    right: index % 2 === 0 ? safe : inside,
    top: safe,
    bottom: safe,
  };
}
export function layoutRects(book, name, index = 0) {
  const m = pageMargins(book, index),
    w = book.width - m.left - m.right,
    h = book.height - m.top - m.bottom - 12,
    gap = Math.max(10, book.safe / 2);
  if (name === 'inset') return [[m.left + w * 0.13, m.top + h * 0.12, w * 0.74, h * 0.72]];
  if (name === 'offset') return [[m.left, m.top + h * 0.06, w * 0.86, h * 0.78]];
  if (name === 'instant') {
    const side = Math.min(w * 0.84, h * 0.7);
    return [[m.left + (w - side) / 2, m.top + h * 0.08, side, side]];
  }
  if (name === 'stagger')
    return [
      [m.left, m.top, w * 0.56, h * 0.64],
      [m.left + w * 0.62, m.top + h * 0.38, w * 0.38, h * 0.56],
    ];
  if (name === 'hero')
    return [[-book.bleed, -book.bleed, book.width + 2 * book.bleed, book.height + 2 * book.bleed]];
  if (name === 'blank') return [];
  if (name === 'duo')
    return [
      [m.left, m.top, (w - gap) / 2, h],
      [m.left + (w + gap) / 2, m.top, (w - gap) / 2, h],
    ];
  if (name === 'stack')
    return [
      [m.left, m.top, w, (h - gap) / 2],
      [m.left, m.top + (h + gap) / 2, w, (h - gap) / 2],
    ];
  if (name === 'grid' || name === 'contact') {
    const cols = name === 'contact' ? 3 : 2,
      rows = name === 'contact' ? 3 : 2;
    return Array.from({ length: cols * rows }, (_, i) => [
      m.left + ((i % cols) * (w + gap)) / cols,
      m.top + (Math.floor(i / cols) * (h + gap)) / rows,
      (w - gap * (cols - 1)) / cols,
      (h - gap * (rows - 1)) / rows,
    ]);
  }
  if (name === 'editorial') return [[m.left, m.top, w, h * 0.68]];
  return [[m.left, m.top + 5, w, h - 10]];
}
export function applyLayout(book, pageIndex, name, { decorate = true } = {}) {
  const p = book.pages[pageIndex];
  if (p.locked) return false;
  const images = p.elements.filter((e) => e.type === 'image' && !e.locked),
    retained = p.elements.filter((e) => e.locked || (e.type !== 'image' && !e.generated));
  const groups = new Set(p.elements.map((e) => e.spreadId).filter(Boolean));
  if (
    book.pages.some((other) =>
      other.elements.some((e) => groups.has(e.spreadId) && (other.locked || e.locked)),
    )
  )
    return false;
  book.pages.forEach((other) =>
    other.elements.forEach((e) => {
      if (groups.has(e.spreadId)) delete e.spreadId;
    }),
  );
  const rects = layoutRects(book, name, pageIndex).slice(
    p.elements.filter((e) => e.type === 'image' && e.locked).length,
  );
  images.slice(rects.length).forEach((e) => {
    if (e.photoId) book.pending.push({ ...copy(e), spreadId: undefined, fromPage: p.id });
  });
  p.elements = [
    ...rects.map(([x, y, w, h], i) => ({
      ...(images[i] || imageElement(null, x, y, w, h)),
      x,
      y,
      w,
      h,
      fit: name === 'hero' ? 'cover' : images[i]?.fit || 'contain',
    })),
    ...retained,
  ];
  p.layout = name;
  p.manual = false;
  if (name === 'editorial' && !retained.some((e) => e.type === 'text')) {
    const theme = BOOK_THEMES[book.theme] || BOOK_THEMES.quiet;
    p.elements.push(
      textElement(
        '写下这一页的故事',
        book.safe,
        book.height * 0.76,
        book.width - book.safe * 2,
        book.height * 0.13,
        { color: theme.ink, fontFamily: theme.font },
      ),
    );
  }
  if (decorate) refreshDecorations(book);
  return true;
}
export function captionText(asset, fields) {
  return fields
    .map((key) => asset?.[key])
    .filter(Boolean)
    .join(' · ');
}
export function refreshDecorations(book, { skipPages = new Set() } = {}) {
  const usage = photoUsage(book);
  book.pages.forEach((p, index) => {
    for (const e of p.elements) {
      if (e.generated === 'folio') e.text = String(index + 1).padStart(2, '0');
      if (e.generated === 'index-caption') {
        const image = p.elements.find((item) => item.id === e.imageId);
        if (image && !image.captionOverride)
          e.text = `${book.assets[image.photoId]?.frameNo || '—'} · p.${(usage[image.photoId] || []).filter((n) => book.pages[n - 1].role === 'content').join(', ') || '—'}`;
      }
    }
    if (p.locked || skipPages.has(p.id)) return;
    const theme = BOOK_THEMES[p.theme || book.theme] || BOOK_THEMES.quiet;
    p.elements = p.elements.filter(
      (e) => e.locked || !['caption', 'folio', 'index-caption'].includes(e.generated),
    );
    const photos = p.elements.filter((e) => e.type === 'image' && e.photoId);
    if (!['cover', 'back', 'title', 'chapter', 'map', 'ending'].includes(p.role)) {
      for (const el of photos) {
        if (
          p.elements.some(
            (e) =>
              e.locked && e.imageId === el.id && ['caption', 'index-caption'].includes(e.generated),
          )
        )
          continue;
        const asset = book.assets[el.photoId];
        const text =
          el.captionOverride ??
          (p.role === 'contact'
            ? `${asset?.frameNo || '—'} · p.${(usage[el.photoId] || []).filter((n) => book.pages[n - 1].role === 'content').join(', ') || '—'}`
            : captionText(asset, book.captionFields));
        if (text && el.y + el.h + 7 < book.height - book.safe + 1)
          p.elements.push(
            textElement(text, el.x, el.y + el.h + 1, el.w, 7, {
              id: 'caption:' + el.id,
              fontSize: 7,
              color: theme.ink,
              generated: p.role === 'contact' ? 'index-caption' : 'caption',
              imageId: el.id,
              ...(el.captionStyle || {}),
            }),
          );
      }
      if (book.pageNumbers !== false && !p.elements.some((e) => e.generated === 'folio'))
        p.elements.push(
          textElement(
            String(index + 1).padStart(2, '0'),
            book.safe,
            book.height - book.safe + 1,
            book.width - book.safe * 2,
            5,
            {
              id: 'folio:' + p.id,
              fontSize: 7,
              align: index % 2 ? 'left' : 'right',
              color: theme.accent,
              generated: 'folio',
            },
          ),
        );
    }
  });
}
export function photoUsage(book) {
  const used = {};
  book.pages.forEach((p, i) =>
    p.elements.forEach((e) => {
      if (e.photoId) (used[e.photoId] ||= []).push(i + 1);
    }),
  );
  return Object.fromEntries(Object.entries(used).map(([id, pages]) => [id, [...new Set(pages)]]));
}
export function applyTheme(
  book,
  themeId,
  { preserveManual = true, scope = 'all', chapter = '' } = {},
) {
  const theme = BOOK_THEMES[themeId];
  if (!theme) return;
  book.theme = themeId;
  const skipPages = new Set();
  book.pages.forEach((p, i) => {
    if (
      p.locked ||
      (scope === 'chapter' && p.chapter !== chapter) ||
      (preserveManual && p.manual)
    ) {
      skipPages.add(p.id);
      return;
    }
    p.theme = themeId;
    p.background = theme.background;
    for (const e of p.elements)
      if (e.type === 'text' && !e.locked) {
        e.color = e.generated === 'kicker' || e.generated === 'folio' ? theme.accent : theme.ink;
        e.fontFamily = e.generated === 'heading' ? theme.font : 'sans';
      }
    if (p.role === 'content') {
      const count = p.elements.filter((e) => e.type === 'image' && e.photoId).length;
      const layout =
        count > 4 ? 'contact' : count > 2 ? 'grid' : count === 2 ? theme.pair : theme.single;
      applyLayout(book, i, layout || p.layout || 'single', { decorate: false });
      p.elements = p.elements.filter((e) => e.type !== 'image' || e.photoId);
    }
  });
  refreshDecorations(book, { skipPages });
}
function makePage(book, role, title, chapter = '') {
  const theme = BOOK_THEMES[book.theme];
  return {
    id: uid(),
    role,
    chapter,
    title,
    theme: book.theme,
    background: theme.background,
    elements: [],
  };
}
function titlePage(book, role, title, subtitle, chapter = '') {
  const p = makePage(book, role, title, chapter),
    theme = BOOK_THEMES[book.theme],
    s = book.safe;
  p.elements.push(
    textElement(
      role === 'chapter' ? 'CHAPTER / ' + title : 'FILM ALBUM / ' + theme.en.toUpperCase(),
      s,
      book.height * 0.23,
      book.width - s * 2,
      10,
      { fontSize: 9, color: theme.accent, generated: 'kicker' },
    ),
  );
  p.elements.push(
    textElement(title, s, book.height * 0.35, book.width - s * 2, book.height * 0.24, {
      fontSize: book.theme === 'city' ? 38 : book.theme === 'archive' ? 25 : 30,
      fontFamily: theme.font,
      color: theme.ink,
      generated: 'heading',
    }),
  );
  if (subtitle)
    p.elements.push(
      textElement(subtitle, s, book.height * 0.65, book.width - s * 2, book.height * 0.23, {
        fontSize: 11,
        color: theme.ink,
        generated: 'subtitle',
      }),
    );
  return p;
}
export function createPhotobook(photos, options = {}) {
  const themeId = BOOK_THEMES[options.theme] ? options.theme : 'quiet',
    theme = BOOK_THEMES[themeId];
  const book = normalizeBook({
    name: options.name || '我的摄影画册',
    width: Number(options.width) || 210,
    height: Number(options.height) || 260,
    theme: themeId,
    safe: theme.margin,
    innerMargin: theme.margin,
    bleed: 3,
    assets: {},
    pending: [],
    captionFields:
      options.captionFields || (themeId === 'archive' ? ['frameNo', 'stock'] : ['location']),
    pageNumbers: true,
    pages: [],
  });
  if (book.width < 80 || book.width > 450 || book.height < 80 || book.height > 450)
    throw Error('画册宽高需为 80–450 mm');
  const assets = photos.map(assetSnapshot);
  assets.forEach((a) => (book.assets[a.id] = a));
  const cover = titlePage(book, 'cover', book.name, options.author || '');
  const coverStyle =
    themeId === 'city'
      ? { x: book.safe, y: 0.25, h: 0.61, size: 34 }
      : themeId === 'archive'
        ? { x: book.width * 0.16, y: 0.3, h: 0.44, size: 23 }
        : { x: book.safe, y: 0.31, h: 0.47, size: 27 };
  const coverAsset = assets.find((a) => a.id === options.coverId) || assets[0];
  if (coverAsset) {
    cover.elements = [
      {
        ...imageElement(
          coverAsset,
          coverStyle.x,
          book.height * coverStyle.y,
          book.width - coverStyle.x * 2,
          book.height * coverStyle.h,
        ),
        fit: themeId === 'city' ? 'cover' : 'contain',
      },
      textElement(book.name, book.safe, book.safe, book.width - book.safe * 2, book.height * 0.17, {
        fontSize: coverStyle.size,
        fontFamily: theme.font,
        color: theme.ink,
        generated: 'heading',
      }),
      textElement(
        options.author || 'A PHOTOGRAPHIC JOURNAL',
        book.safe,
        book.height * 0.87,
        book.width - book.safe * 2,
        12,
        { fontSize: 9, color: theme.accent, generated: 'subtitle' },
      ),
    ];
  }
  book.pages.push(cover, titlePage(book, 'title', book.name, options.introduction || ''));
  const groups = new Map();
  for (const a of assets) {
    const key =
      options.groupBy === 'roll'
        ? a.rollId
        : options.groupBy === 'year'
          ? a.date.slice(0, 4) || '拍摄年代待考'
          : options.groupBy === 'project'
            ? a.chapter || '未分章'
            : '';
    if (!groups.has(key))
      groups.set(key, { name: options.groupBy === 'roll' ? a.rollName : key, assets: [] });
    groups.get(key).assets.push(a);
  }
  for (const { name, assets: group } of groups.values()) {
    if (name)
      book.pages.push(
        titlePage(
          book,
          'chapter',
          name,
          [...new Set(group.map((a) => [a.location, a.date].filter(Boolean).join(' · ')))]
            .slice(0, 4)
            .join('\n'),
          name,
        ),
      );
    const count = options.density === 'compact' ? 4 : options.density === 'airy' ? 1 : 2;
    for (let n = 0; n < group.length;) {
      const isHero = (options.heroIds || []).includes(group[n].id);
      const nextHero = group
        .slice(n + 1, n + count)
        .findIndex((a) => (options.heroIds || []).includes(a.id));
      const chunk = group.slice(n, n + (isHero ? 1 : nextHero < 0 ? count : nextHero + 1)),
        p = makePage(book, 'content', '', name);
      p.elements = chunk.map((a) =>
        imageElement(
          a,
          book.safe,
          book.safe,
          book.width - book.safe * 2,
          book.height - book.safe * 2 - 12,
        ),
      );
      book.pages.push(p);
      const layout =
        chunk.length > 2
          ? 'grid'
          : chunk.length === 2
            ? theme.pair || 'duo'
            : theme.single || 'single';
      applyLayout(book, book.pages.length - 1, layout);
      p.elements = p.elements.filter((e) => e.type !== 'image' || e.photoId);
      n += chunk.length;
    }
    if (options.rollNotes) book.pages.push(...rollNotePages(book, group, name));
  }
  if (!assets.length) book.pages.push(makePage(book, 'content', ''));
  if (options.map) book.pages.push(...mapPages(book, assets));
  if (options.contact) book.pages.push(...contactPages(book, assets));
  book.pages.push(
    titlePage(book, 'ending', '终章', options.afterword || '照片留住片刻，记忆继续发生。'),
    titlePage(book, 'back', book.name, options.author || 'FILM ALBUM'),
  );
  if (book.pages.length > 200)
    throw Error(`当前设置需要 ${book.pages.length} 页，超过 200 页。请选择紧凑排版或减少照片。`);
  refreshDecorations(book);
  return book;
}
export function rollNotePages(book, assets, chapter = '') {
  const rolls = new Map();
  assets.forEach((a) => {
    if (!rolls.has(a.rollId)) rolls.set(a.rollId, a);
  });
  return [...rolls.values()].map((a) =>
    titlePage(
      book,
      'notes',
      a.rollName || '拍摄手记',
      [
        [a.rollCode, a.stock, a.format].filter(Boolean).join(' · '),
        [a.camera, a.lens].filter(Boolean).join(' / '),
        [a.location, a.date].filter(Boolean).join(' · '),
        [a.lab, a.process].filter(Boolean).join(' · '),
        a.rollNotes || a.notes,
      ]
        .filter(Boolean)
        .join('\n'),
      chapter,
    ),
  );
}
export function contactPages(book, assets) {
  const pages = [];
  for (let n = 0; n < assets.length; n += 9) {
    const p = makePage(book, 'contact', '卷末索引');
    p.elements = assets
      .slice(n, n + 9)
      .map((a, i) => imageElement(a, ...layoutRects(book, 'contact')[i]));
    p.layout = 'contact';
    pages.push(p);
  }
  return pages;
}
export function mapPages(book, assets) {
  const places = [];
  for (const a of assets) {
    const c = rollCoordinates(a.coordinates);
    if (c && !places.some((p) => p.latitude === c.latitude && p.longitude === c.longitude))
      places.push({ ...c, name: a.location || a.rollName || '拍摄位置' });
  }
  if (!places.length) return [];
  const pages = [];
  for (let start = 0; start < places.length; start += 12) {
    const points = places.slice(start, start + 12),
      p = makePage(book, 'map', '旅行地点'),
      s = book.safe;
    p.elements.push(
      textElement('旅行地点 / FIELD LOCATIONS', s, s, book.width - s * 2, 15, {
        fontSize: 16,
        generated: 'heading',
      }),
    );
    p.elements.push({
      id: uid(),
      type: 'map',
      x: s,
      y: s + 22,
      w: book.width - s * 2,
      h: book.height * 0.42,
      points,
      connect: false,
    });
    p.elements.push(
      textElement(
        points
          .map((a, i) => `${i + 1}. ${a.name}  ${a.latitude.toFixed(4)}, ${a.longitude.toFixed(4)}`)
          .join('\n'),
        s,
        book.height * 0.42 + s + 28,
        book.width - s * 2,
        book.height * 0.4 - s - 12,
        { fontSize: 8, lineHeight: 1.4, generated: 'locations' },
      ),
    );
    pages.push(p);
  }
  return pages;
}
export function movePage(book, from, to, wholeChapter = false) {
  if (from === to || !book.pages[from] || !book.pages[to]) return;
  const selected = book.pages[from],
    moving =
      wholeChapter && selected.chapter
        ? book.pages.filter((p) => p.chapter === selected.chapter)
        : [selected];
  const target = book.pages[to];
  if (moving.includes(target)) return;
  book.pages = book.pages.filter((p) => !moving.includes(p));
  book.pages.splice(book.pages.indexOf(target) + (to > from ? 1 : 0), 0, ...moving);
  const linked = new Map();
  book.pages.forEach((p, i) =>
    p.elements.forEach((e) => {
      if (e.spreadId)
        (linked.get(e.spreadId) || linked.set(e.spreadId, []).get(e.spreadId)).push({ i, e });
    }),
  );
  for (const entries of linked.values())
    if (entries.length !== 2 || Math.abs(entries[0].i - entries[1].i) !== 1)
      entries.forEach(({ e }) => delete e.spreadId);
  refreshDecorations(book);
}
export function spreadIndices(book, index) {
  if (index === 0 || (index === book.pages.length - 1 && book.pages[index].role === 'back'))
    return [index];
  const left = index % 2 ? index : index - 1;
  return [left, left + 1].filter((i) => i < book.pages.length && book.pages[i].role !== 'back');
}
export function createCoverDocument(book) {
  const spine = Number(book.spine) || 0,
    w = book.width,
    h = book.height;
  const front = book.pages.find((p) => p.role === 'cover') || book.pages[0],
    back = book.pages.find((p) => p.role === 'back');
  const elements = [
    ...(back?.elements || []).map(copy),
    ...front.elements.map((e) => ({ ...copy(e), x: e.x + w + spine })),
  ];
  if (spine >= 6)
    elements.push(
      textElement(book.name, w + (spine - h * 0.65) / 2, h / 2 - spine / 2, h * 0.65, spine, {
        rotation: 90,
        fontSize: Math.min(12, spine * 1.5),
        align: 'center',
        color: BOOK_THEMES[book.theme]?.ink || '#222222',
      }),
    );
  return {
    ...copy(book),
    width: w * 2 + spine,
    height: h,
    pages: [{ id: uid(), background: front.background, elements }],
    exportMode: 'print',
  };
}
export function reflowChapter(book, chapter, density, preserveManual = true) {
  const eligible = book.pages.filter(
    (p) =>
      p.chapter === chapter &&
      p.role === 'content' &&
      !p.locked &&
      !p.elements.some((e) => e.locked) &&
      !(preserveManual && p.manual),
  );
  if (!eligible.length) return false;
  const photos = eligible.flatMap((p) => p.elements.filter((e) => e.type === 'image' && e.photoId));
  const size = density === 'airy' ? 1 : density === 'compact' ? 4 : 2,
    replacement = [];
  for (let n = 0; n < photos.length; n += size) {
    const p = makePage(book, 'content', '', chapter);
    p.elements = photos.slice(n, n + size).map((e) => ({ ...copy(e), id: uid() }));
    replacement.push(p);
  }
  if (book.pages.length - eligible.length + replacement.length > 200)
    throw Error('重排后超过 200 页，请选择更紧凑的排版');
  eligible.forEach((p) =>
    p.elements
      .filter((e) => ['text', 'sticker'].includes(e.type) && !e.generated)
      .forEach((e) => book.pending.push({ ...copy(e), spreadId: undefined, fromPage: p.id })),
  );
  const first = book.pages.indexOf(eligible[0]);
  book.pages = book.pages.filter((p) => !eligible.includes(p));
  book.pages.splice(first, 0, ...replacement);
  replacement.forEach((p) =>
    applyLayout(
      book,
      book.pages.indexOf(p),
      p.elements.length > 2 ? 'grid' : p.elements.length === 2 ? 'duo' : 'single',
    ),
  );
  replacement.forEach(
    (p) => (p.elements = p.elements.filter((e) => e.type !== 'image' || e.photoId)),
  );
  refreshDecorations(book);
  return true;
}
export function makePanorama(book, pageIndex, elementId) {
  const pair = spreadIndices(book, pageIndex);
  if (
    pair.length !== 2 ||
    pair.some((i) => book.pages[i].role !== 'content' || book.pages[i].locked)
  )
    throw Error('请在两个未锁定的正文页之间使用跨页满版');
  if (pair.some((i) => book.pages[i].elements.some((e) => e.type === 'image' && e.locked)))
    throw Error('请先解锁跨页中的照片');
  const source =
    book.pages[pageIndex].elements.find((e) => e.id === elementId && e.photoId) ||
    book.pages[pageIndex].elements.find((e) => e.photoId);
  if (!source) throw Error('先为当前页放入一张照片');
  const group = uid();
  pair.forEach((i, n) => {
    const p = book.pages[i];
    for (const e of p.elements.filter((e) => e.photoId))
      book.pending.push({ ...copy(e), spreadId: undefined, fromPage: p.id });
    p.elements = p.elements.filter((e) => e.type !== 'image' && !e.generated);
    p.elements.unshift({
      ...copy(source),
      id: uid(),
      spreadId: group,
      x: -book.bleed - n * book.width,
      y: -book.bleed,
      w: book.width * 2 + book.bleed * 2,
      h: book.height + book.bleed * 2,
      fit: 'cover',
      cropX: 0.5,
      cropY: 0.5,
    });
    p.manual = true;
  });
  return pair;
}
export function syncPanorama(book, pageIndex, source) {
  if (!source?.spreadId) return;
  book.pages.forEach((p, i) =>
    p.elements.forEach((e) => {
      if (e === source || e.spreadId !== source.spreadId) return;
      Object.assign(e, {
        x: source.x + (pageIndex - i) * book.width,
        y: source.y,
        w: source.w,
        h: source.h,
        rotation: source.rotation,
        cropX: source.cropX,
        cropY: source.cropY,
        fit: source.fit,
        mask: source.mask,
        photoId: source.photoId,
        mediaId: source.mediaId,
        name: source.name,
      });
    }),
  );
}
