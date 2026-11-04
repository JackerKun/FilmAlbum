import { STOCKS } from './film-stocks.mjs';
// Archival catalogue: entries include historical films, not a claim of current retail availability.
const EXTRA = [
  ['kodakpro100', 'KODAK', 'PRO IMAGE 100', 100, 'color', '135', '柯达 专业影像'],
  ['kodakel160', 'KODAK', 'EKTACOLOR PRO 160', 160, 'color', '135,120', '柯达'],
  ['kodakel400', 'KODAK', 'EKTACOLOR PRO 400', 400, 'color', '135,120', '柯达'],
  ['kodakel800', 'KODAK', 'EKTACOLOR PRO 800', 800, 'color', '135,120', '柯达'],
  ['ektapan100', 'KODAK', 'EKTAPAN 100', 100, 'bw', '135,120', '柯达'],
  ['ektapan400', 'KODAK', 'EKTAPAN 400', 400, 'bw', '135,120', '柯达'],
  ['ektapan3200', 'KODAK', 'EKTAPAN P3200', 3200, 'bw', '135', '柯达'],
  ['tmax3200', 'KODAK', 'T-MAX P3200', 3200, 'bw', '135', '柯达'],
  ['doublex', 'KODAK', 'DOUBLE-X 5222 / 7222', 250, 'bw', '135', '柯达 电影 黑白'],
  ['vision50d', 'KODAK', 'VISION3 50D 5203', 50, 'cinema', '135', '柯达 电影'],
  ['vision200t', 'KODAK', 'VISION3 200T 5213', 200, 'cinema', '135', '柯达 电影'],
  ['portra160nc', 'KODAK', 'PORTRA 160 NC', 160, 'color', '135,120', '历史 停产 柯达'],
  ['portra160vc', 'KODAK', 'PORTRA 160 VC', 160, 'color', '135,120', '历史 停产 柯达'],
  ['portra400nc', 'KODAK', 'PORTRA 400 NC', 400, 'color', '135,120', '历史 停产 柯达'],
  ['portra400vc', 'KODAK', 'PORTRA 400 VC', 400, 'color', '135,120', '历史 停产 柯达'],
  ['ektar25', 'KODAK', 'EKTAR 25', 25, 'color', '135', '历史 停产 柯达'],
  ['kodachrome64', 'KODAK', 'KODACHROME 64', 64, 'slide', '135', '历史 K14 停产 柯达'],
  ['kodachrome25', 'KODAK', 'KODACHROME 25', 25, 'slide', '135', '历史 K14 停产 柯达'],
  ['plusx125', 'KODAK', 'PLUS-X 125', 125, 'bw', '135,120', '历史 停产 柯达'],
  ['fuji100', 'FUJIFILM', 'FUJICOLOR 100', 100, 'color', '135', '富士'],
  ['fuji200', 'FUJIFILM', 'FUJICOLOR 200', 200, 'color', '135', '富士'],
  ['fuji400', 'FUJIFILM', 'FUJICOLOR 400', 400, 'color', '135', '富士'],
  ['fujiindustrial100', 'FUJIFILM', '業務用 100', 100, 'color', '135', '富士 业务用 业务卷 工业'],
  ['fujiindustrial400', 'FUJIFILM', '業務用 400', 400, 'color', '135', '富士 业务用 工业'],
  ['premium400', 'FUJIFILM', 'SUPERIA PREMIUM 400', 400, 'color', '135', '富士'],
  ['natura1600', 'FUJIFILM', 'NATURA 1600', 1600, 'color', '135', '历史 停产 富士'],
  ['superia800', 'FUJIFILM', 'SUPERIA X-TRA 800', 800, 'color', '135', '历史 富士'],
  ['superia1600', 'FUJIFILM', 'SUPERIA 1600', 1600, 'color', '135', '历史 富士'],
  ['reala100', 'FUJIFILM', 'REALA 100', 100, 'color', '135,120', '历史 富士'],
  ['pro160ns', 'FUJIFILM', 'PRO 160 NS', 160, 'color', '120', '历史 富士'],
  ['pro160c', 'FUJIFILM', 'PRO 160 C', 160, 'color', '135,120', '历史 富士'],
  ['pro160s', 'FUJIFILM', 'PRO 160 S', 160, 'color', '135,120', '历史 富士'],
  ['pro800z', 'FUJIFILM', 'PRO 800 Z', 800, 'color', '135,120', '历史 富士'],
  ['astia100f', 'FUJIFILM', 'ASTIA 100F', 100, 'slide', '135,120', '历史 富士'],
  ['sensia100', 'FUJIFILM', 'SENSIA 100', 100, 'slide', '135', '历史 富士'],
  ['provia400x', 'FUJIFILM', 'PROVIA 400X', 400, 'slide', '135,120', '历史 富士'],
  ['acrosoriginal', 'FUJIFILM', 'NEOPAN ACROS 100', 100, 'bw', '135,120', '历史 富士'],
  ['neopan400', 'FUJIFILM', 'NEOPAN 400', 400, 'bw', '135,120', '历史 富士'],
  ['neopan1600', 'FUJIFILM', 'NEOPAN 1600', 1600, 'bw', '135', '历史 富士'],
  ['panaf50', 'ILFORD', 'PAN F PLUS 50', 50, 'bw', '135,120', '伊尔福 依尔福'],
  ['delta3200', 'ILFORD', 'DELTA 3200', 3200, 'bw', '135,120', '伊尔福 依尔福'],
  ['xp2', 'ILFORD', 'XP2 SUPER 400', 400, 'bw', '135,120', '伊尔福 C41 黑白'],
  ['sfx200', 'ILFORD', 'SFX 200', 200, 'bw', '135,120', '伊尔福 红外'],
  ['ortho80', 'ILFORD', 'ORTHO PLUS 80', 80, 'bw', '135,120', '伊尔福 正色'],
  ['pan100', 'ILFORD', 'PAN 100', 100, 'bw', '135', '伊尔福'],
  ['pan400', 'ILFORD', 'PAN 400', 400, 'bw', '135', '伊尔福'],
  ['kentmere100', 'KENTMERE', 'PAN 100', 100, 'bw', '135,120', '肯特米尔 凯特梅尔'],
  ['kentmere200', 'KENTMERE', 'PAN 200', 200, 'bw', '135,120', '肯特米尔 凯特梅尔'],
  ['kentmere400', 'KENTMERE', 'PAN 400', 400, 'bw', '135,120', '肯特米尔 凯特梅尔'],
  ['phoenix200', 'HARMAN', 'PHOENIX 200', 200, 'color', '135,120', '哈曼 凤凰'],
  ['phoenixii', 'HARMAN', 'PHOENIX II 200', 200, 'color', '135,120', '哈曼 凤凰二代'],
  ['switchazure', 'HARMAN', 'SWITCH AZURE 125', 125, 'color', '135', '哈曼 创意'],
  ['foma100', 'FOMAPAN', '100 CLASSIC', 100, 'bw', '135,120', '福马 福玛'],
  ['foma200', 'FOMAPAN', '200 CREATIVE', 200, 'bw', '135,120', '福马 福玛'],
  ['foma400', 'FOMAPAN', '400 ACTION', 400, 'bw', '135,120', '福马 福玛'],
  ['fomar100', 'FOMAPAN', 'R 100', 100, 'bw', '135', '福马 黑白反转'],
  ['adoxchs100', 'ADOX', 'CHS 100 II', 100, 'bw', '135', '阿多克斯 正色'],
  ['adoxcms20', 'ADOX', 'CMS 20 II', 20, 'bw', '135', '阿多克斯 高分辨率'],
  ['adoxhr50', 'ADOX', 'HR-50', 50, 'bw', '135', '阿多克斯'],
  ['adoxscala50', 'ADOX', 'SCALA 50', 50, 'bw', '135', '黑白反转'],
  ['rollei80s', 'ROLLEI', 'RETRO 80S', 80, 'bw', '135,120', '禄来'],
  ['rollei400s', 'ROLLEI', 'RETRO 400S', 400, 'bw', '135,120', '禄来'],
  ['rolleiinfrared', 'ROLLEI', 'INFRARED 400', 400, 'bw', '135,120', '禄来 红外'],
  ['rolleisuperpan', 'ROLLEI', 'SUPERPAN 200', 200, 'bw', '135,120', '禄来'],
  ['rolleiortho25', 'ROLLEI', 'ORTHO 25 PLUS', 25, 'bw', '135,120', '禄来 正色'],
  ['rpx25', 'ROLLEI', 'RPX 25', 25, 'bw', '135,120', '禄来'],
  ['rpx100', 'ROLLEI', 'RPX 100', 100, 'bw', '135,120', '禄来'],
  ['rpx400', 'ROLLEI', 'RPX 400', 400, 'bw', '135,120', '禄来'],
  ['bergger400', 'BERGGER', 'PANCRO 400', 400, 'bw', '135,120', '贝格尔'],
  ['lomo100', 'LOMOGRAPHY', 'COLOR NEGATIVE 100', 100, 'color', '135,120', '乐魔'],
  ['lomo400', 'LOMOGRAPHY', 'COLOR NEGATIVE 400', 400, 'color', '135,120', '乐魔'],
  ['lomo800', 'LOMOGRAPHY', 'COLOR NEGATIVE 800', 800, 'color', '135,120', '乐魔'],
  [
    'lomoturquoise',
    'LOMOGRAPHY',
    'LOMOCHROME TURQUOISE XR',
    400,
    'color',
    '135,120',
    '乐魔 绿松石',
  ],
  ['lomocolor92', 'LOMOGRAPHY', 'LOMOCHROME COLOR 92', 400, 'color', '135,120', '乐魔'],
  ['lomoredscale', 'LOMOGRAPHY', 'REDSCALE XR 50-200', 200, 'color', '135,120', '乐魔 红调'],
  ['lomoberlin', 'LOMOGRAPHY', 'BERLIN KINO 400', 400, 'bw', '135,120', '乐魔 柏林'],
  ['lomopotsdam', 'LOMOGRAPHY', 'POTSDAM KINO 100', 100, 'bw', '135,120', '乐魔 波茨坦'],
  ['lomofantome', 'LOMOGRAPHY', 'FANTOME KINO 8', 8, 'bw', '135', '乐魔'],
  ['lomobabylon', 'LOMOGRAPHY', 'BABYLON KINO 13', 13, 'bw', '135', '乐魔'],
  ['cinestillbwxx', 'CINESTILL', 'BWXX DOUBLE-X', 250, 'bw', '135,120', '电影 黑白'],
  ['cinestillredrum', 'CINESTILL', 'REDRUM 200', 200, 'color', '135', '电影 红调'],
  ['agfavista100', 'AGFA', 'VISTA 100', 100, 'color', '135', '历史 爱克发'],
  ['agfavista200', 'AGFA', 'VISTA 200', 200, 'color', '135', '历史 爱克发'],
  ['agfavista400', 'AGFA', 'VISTA 400', 400, 'color', '135', '历史 爱克发'],
  ['agfaapx100', 'AGFA', 'APX 100', 100, 'bw', '135', '爱克发'],
  ['agfaapx400', 'AGFA', 'APX 400', 400, 'bw', '135', '爱克发'],
  ['agfaultra100', 'AGFA', 'ULTRA 100', 100, 'color', '135', '历史 爱克发'],
  ['agfaportrait160', 'AGFA', 'PORTRAIT XPS 160', 160, 'color', '135,120', '历史 爱克发'],
  ['agfarsx100', 'AGFA', 'RSX II 100', 100, 'slide', '135,120', '历史 爱克发'],
  ['orwonp100', 'ORWO', 'WOLFEN NP100', 100, 'bw', '135', '奥沃'],
  ['orwonc500', 'ORWO', 'WOLFEN NC500', 500, 'color', '135', '奥沃'],
  ['orwon75', 'ORWO', 'N75', 400, 'bw', '135', '奥沃'],
  ['orwoun54', 'ORWO', 'UN54', 100, 'bw', '135', '奥沃'],
  ['luckyshd100', 'LUCKY', 'SHD 100', 100, 'bw', '135,120', '乐凯'],
  ['luckyshd400', 'LUCKY', 'SHD 400', 400, 'bw', '135', '乐凯'],
  ['shanghai100', 'SHANGHAI', 'GP3 100', 100, 'bw', '135,120', '上海'],
  ['santacolor100', 'SANTACOLOR', '100', 100, 'color', '135', '圣诞'],
  ['silbersalz50d', 'SILBERSALZ35', '50D', 50, 'cinema', '135', '银盐 电影'],
  ['silbersalz250d', 'SILBERSALZ35', '250D', 250, 'cinema', '135', '银盐 电影'],
  ['silbersalz500t', 'SILBERSALZ35', '500T', 500, 'cinema', '135', '银盐 电影'],
  ['ferraniap30', 'FERRANIA', 'P30 80', 80, 'bw', '135', '费拉尼亚'],
  ['ferraniaorto', 'FERRANIA', 'ORTO 50', 50, 'bw', '135', '费拉尼亚'],
  ['jchstreetpan', 'JCH', 'STREETPAN 400', 400, 'bw', '135,120', '街拍'],
];
const only135 = new Set([
  'colorplus200',
  'ultramax400',
  'superia400',
  'c200',
  'vision250d',
  'vision500t',
]);
for (const [id, s] of Object.entries(STOCKS)) {
  s.formats = only135.has(id) ? ['135'] : ['135', '120'];
  s.aliases = [
    s.brand === 'KODAK'
      ? '柯达'
      : s.brand === 'FUJIFILM'
        ? '富士'
        : s.brand === 'ILFORD'
          ? '伊尔福 依尔福'
          : '',
    s.group === 'bw' ? 'bw black white 黑白' : 'color 彩色',
    s.kind,
    /portra/i.test(s.name)
      ? '炮塔 波特拉'
      : /ektar/i.test(s.name)
        ? '艾克塔'
        : /gold/i.test(s.name)
          ? '金 金卷'
          : /colorplus/i.test(s.name)
            ? '易拍'
            : /velvia/i.test(s.name)
              ? '维尔维亚'
              : /provia/i.test(s.name)
                ? '普罗维亚'
                : /acros/i.test(s.name)
                  ? '阿克罗斯'
                  : '',
  ].join(' ');
}
for (const [id, brand, name, iso, group, formats, aliases] of EXTRA)
  STOCKS[id] = {
    brand,
    name,
    iso: String(iso),
    group,
    formats: formats.split(','),
    aliases,
    kind:
      group === 'bw'
        ? 'BLACK & WHITE'
        : group === 'slide'
          ? 'COLOR REVERSAL'
          : group === 'cinema'
            ? 'CINEMA FILM'
            : 'COLOR NEGATIVE',
    color: group === 'bw' ? '#232323' : '#315747',
    color2: group === 'bw' ? '#dfd9c8' : '#e4be70',
  };
export function mergeCustomStocks(items = []) {
  for (const [id, s] of Object.entries(STOCKS)) if (s.custom) delete STOCKS[id];
  for (const s of items) if (s.id && s.name && s.brand) STOCKS[s.id] = { ...s, custom: true };
}
export function filterStocks({ query = '', format = 'all', type = 'all', brand = 'all' } = {}) {
  const normalized = query
      .normalize('NFKC')
      .toLowerCase()
      .replace(/黑白|black\s*(?:and\s*)?white/g, 'bw')
      .replace(/彩色|colour/g, 'color'),
    terms = normalized.split(/\s+/).filter(Boolean);
  return Object.entries(STOCKS).filter(([id, s]) => {
    if (format !== 'all' && !s.formats?.includes(format)) return false;
    if ((type === 'bw' && s.group !== 'bw') || (type === 'color' && s.group === 'bw')) return false;
    if (brand !== 'all' && s.brand !== brand) return false;
    const hay = [
      id,
      s.name,
      s.brand,
      s.iso,
      s.aliases,
      s.group === 'bw' ? 'bw black white 黑白' : 'color 彩色',
      ...(s.formats || []),
    ]
      .join(' ')
      .toLowerCase();
    const compact = hay.replace(/[^a-z0-9\p{Script=Han}]/gu, '');
    return terms.every(
      (t) => hay.includes(t) || compact.includes(t.replace(/[^a-z0-9\p{Script=Han}]/gu, '')),
    );
  });
}
export function validateCustomStock(input, id) {
  const name = String(input.name || '')
      .trim()
      .slice(0, 80),
    brand = String(input.brand || '')
      .trim()
      .slice(0, 60),
    iso = String(input.iso || '')
      .trim()
      .slice(0, 20);
  if (!name || !brand) throw Object.assign(Error('请填写胶片型号和厂牌'), { status: 400 });
  const formats = (Array.isArray(input.formats) ? input.formats : []).filter((v) =>
    ['135', '120', '110', '127', '220', 'sheet', 'other'].includes(v),
  );
  if (!formats.length) throw Object.assign(Error('请至少选择一种胶片规格'), { status: 400 });
  const group = ['bw', 'color', 'slide', 'cinema'].includes(input.group) ? input.group : 'color';
  return {
    id,
    name,
    brand,
    iso,
    group,
    formats: [...new Set(formats)],
    aliases: String(input.aliases || '').slice(0, 300),
    kind: group === 'bw' ? 'BLACK & WHITE' : 'COLOR FILM',
    color: /^#[0-9a-f]{6}$/i.test(input.color || '') ? input.color : '#315747',
    color2: '#d9bf7e',
    custom: true,
  };
}
