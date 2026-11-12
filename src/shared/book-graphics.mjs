export const MASKS = {
  rect: '矩形',
  rounded: '圆角',
  ellipse: '圆形 / 椭圆',
  diamond: '菱形',
  hexagon: '六边形',
  star: '星形',
  heart: '心形',
};
export function maskPoints(shape) {
  if (shape === 'ellipse')
    return Array.from({ length: 80 }, (_, i) => [
      0.5 + 0.5 * Math.cos((i * Math.PI) / 40),
      0.5 + 0.5 * Math.sin((i * Math.PI) / 40),
    ]);
  if (shape === 'rounded')
    return Array.from({ length: 40 }, (_, i) => {
      const c = [
          [0.85, 0.85],
          [0.15, 0.85],
          [0.15, 0.15],
          [0.85, 0.15],
        ][Math.floor(i / 10)],
        a = ((i / 10) * Math.PI) / 2;
      return [c[0] + 0.15 * Math.cos(a), c[1] + 0.15 * Math.sin(a)];
    });
  if (shape === 'diamond')
    return [
      [0.5, 0],
      [1, 0.5],
      [0.5, 1],
      [0, 0.5],
    ];
  if (shape === 'hexagon')
    return [
      [0.25, 0],
      [0.75, 0],
      [1, 0.5],
      [0.75, 1],
      [0.25, 1],
      [0, 0.5],
    ];
  if (shape === 'star')
    return Array.from({ length: 10 }, (_, i) => {
      const a = (i * Math.PI) / 5 - Math.PI / 2,
        r = i % 2 ? 0.22 : 0.5;
      return [0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)];
    });
  if (shape === 'heart')
    return Array.from({ length: 100 }, (_, i) => {
      const t = (i * Math.PI) / 50;
      return [
        0.5 + Math.sin(t) ** 3 / 2,
        0.5 - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 34,
      ];
    });
  return [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
}
export const maskCss = (shape) =>
  'polygon(' +
  maskPoints(shape)
    .map((p) => p.map((n) => n * 100 + '%').join(' '))
    .join(',') +
  ')';
export const STICKERS = {
  tape: '纸胶带',
  frame: '胶片框',
  star: '星星',
  heart: '爱心',
  arrow: '箭头',
  circle: '圆点',
};
export const STICKER_GROUPS = {
  胶片与暗房: {
    roll135: '135 胶卷',
    roll120: '120 胶卷',
    strip: '齿孔胶片条',
    contact: '接触印样',
    reel: '冲洗片芯',
    tank: '冲洗罐',
    negative: '底片套',
    frame: '胶片框',
  },
  相机与镜头: {
    rangefinder: '旁轴相机',
    slr: '单反相机',
    tlr: '双反相机',
    viewcamera: '大画幅相机',
    instant: '拍立得相机',
    compact: '口袋相机',
    lens: '镜头',
    aperture: '光圈',
    flash: '闪光灯',
    tripod: '三脚架',
  },
  档案与标记: {
    label: '档案标签',
    stamp: '日期印章',
    barcode: '底片条码',
    pin: '地点标记',
    focus: '对焦框',
    exposure: '测光刻度',
  },
  纸张与装饰: {
    tape: '纸胶带',
    corner: '相角',
    star: '星星',
    heart: '爱心',
    arrow: '箭头',
    circle: '圆点',
  },
};
Object.assign(STICKERS, ...Object.values(STICKER_GROUPS));
const lineArt = {
  roll135:
    '<rect x="24" y="12" width="50" height="76" rx="10"/><path d="M24 25h50M24 73h50M37 12V4h24v8M39 39h20v20H39zM74 30h18v42H74"/>',
  roll120:
    '<path d="M23 8h54v8H23zM23 84h54v8H23zM30 16h40v68H30zM30 30h40M30 69h40M41 41h18v16H41z"/>',
  strip:
    '<rect x="3" y="12" width="94" height="76" rx="3"/><path d="M10 28h35v44H10zM55 28h35v44H55z"/>' +
    Array.from(
      { length: 8 },
      (_, i) => `<path d="M${8 + i * 11} 18h5v4h-5zM${8 + i * 11} 78h5v4h-5z"/>`,
    ).join(''),
  contact:
    '<rect x="8" y="4" width="84" height="92" rx="2"/>' +
    Array.from(
      { length: 6 },
      (_, i) =>
        `<rect x="${17 + (i % 2) * 36}" y="${13 + Math.floor(i / 2) * 27}" width="30" height="21"/>`,
    ).join(''),
  reel:
    '<circle cx="50" cy="50" r="44"/><circle cx="50" cy="50" r="10"/>' +
    Array.from(
      { length: 6 },
      (_, i) =>
        `<circle cx="${50 + 28 * Math.cos((i * Math.PI) / 3)}" cy="${50 + 28 * Math.sin((i * Math.PI) / 3)}" r="10"/>`,
    ).join(''),
  tank: '<path d="M25 25h50v62H25zM20 17h60v8H20zM36 17V8h28v9M34 39h32M34 49h32M34 59h32"/>',
  negative:
    '<path d="M12 7h76v86H12zM12 22h76M24 34h21v20H24zM55 34h21v20H55zM24 63h21v20H24zM55 63h21v20H55z"/>',
  rangefinder:
    '<rect x="6" y="28" width="88" height="54" rx="7"/><circle cx="54" cy="55" r="21"/><circle cx="54" cy="55" r="14"/><path d="M15 20h20v8M74 38h12v9H74zM15 38h13v8H15zM19 61h9"/>',
  slr: '<path d="M8 33h25l8-14h25l9 14h17v49H8z"/><circle cx="53" cy="57" r="21"/><circle cx="53" cy="57" r="13"/><path d="M15 25h13v8M78 43h7"/>',
  tlr: '<rect x="23" y="10" width="54" height="80" rx="7"/><circle cx="50" cy="35" r="16"/><circle cx="50" cy="69" r="17"/><circle cx="50" cy="69" r="10"/><path d="M33 10V4h34v6M77 46h10v15H77"/>',
  viewcamera:
    '<path d="M12 24h16v52H12zM72 21h16v58H72zM28 31l8-7 8 7 8-7 8 7 12-7v50l-12-7-8 7-8-7-8 7-8-7zM7 82h86M50 82v13"/>',
  instant:
    '<path d="M18 12h64l10 55H8zM8 67v16h84V67M28 83v13h44V83M65 21h12v10H65z"/><circle cx="44" cy="42" r="17"/>',
  compact:
    '<rect x="5" y="25" width="90" height="55" rx="12"/><circle cx="59" cy="53" r="19"/><circle cx="59" cy="53" r="11"/><path d="M14 34h20v9H14zM19 19h15v6M84 37v8"/>',
  lens: '<path d="M27 16h46v69H27zM23 25h54v16H23zM23 60h54v16H23zM32 5h36v11"/><path d="M33 29v8M41 29v8M49 29v8M57 29v8M65 29v8M33 64v8M43 64v8M53 64v8M63 64v8"/>',
  aperture:
    '<circle cx="50" cy="50" r="44"/><path d="M30 15l40 18-6 35-35 3-14-31M70 33l20 17M64 68l-9 25M29 71L9 59M15 40l9-24M50 7l20 26M84 24L64 68"/>',
  flash:
    '<path d="M18 10h64v38H18zM26 18h48v20H26zM38 48h24v32H38zM28 80h44v10H28zM51 17l-9 12h12l-8 10"/>',
  tripod:
    '<path d="M35 7h30v14H35zM50 21v20M32 41h36M44 41L16 94M56 41l28 53M50 41v53M20 82h11M69 82h11"/>',
  label:
    '<path d="M5 28l20-18h68v80H25L5 72z"/><circle cx="20" cy="50" r="5"/><path d="M36 30h44M36 44h44M36 58h28M36 72h36"/>',
  stamp:
    '<rect x="5" y="20" width="90" height="60" rx="4"/><path d="M12 28h76v44H12zM22 40v20M35 40v20M48 40v20M61 40v20M74 40v20M27 51h3M53 51h3"/>',
  barcode: Array.from(
    { length: 17 },
    (_, i) => `<path d="M${7 + i * 5} 20v60" stroke-width="${i % 3 === 0 ? 3 : 1}"/>`,
  ).join(''),
  pin: '<path d="M50 94S16 57 16 36a34 34 0 0168 0c0 21-34 58-34 58z"/><circle cx="50" cy="36" r="12"/>',
  focus: '<path d="M7 30V7h23M70 7h23v23M93 70v23H70M30 93H7V70M40 50h20M50 40v20"/>',
  exposure: '<path d="M7 50h86M10 34v32M30 42v16M50 28v44M70 42v16M90 34v32M43 13h14M50 6v14"/>',
  corner: '<path d="M8 8h84L8 92zM8 8l40 40"/>',
};
export function stickerSvg(kind, color = '#b39a61') {
  if (lineArt[kind])
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none" stroke="${/^#[0-9a-f]{6}$/i.test(color) ? color : '#b39a61'}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${lineArt[kind]}</g></svg>`;
  const shape =
    kind === 'tape'
      ? '<path d="M0 7L10 0H90L100 7 94 15 100 23 90 30H10L0 23 6 15Z"/>'
      : kind === 'frame'
        ? '<path fill-rule="evenodd" d="M0 0H100V100H0ZM12 15V85H88V15Z"/>'
        : kind === 'arrow'
          ? '<path d="M0 42H65V20L100 50 65 80V58H0Z"/>'
          : kind === 'circle'
            ? '<circle cx="50" cy="50" r="48"/>'
            : `<polygon points="${maskPoints(kind)
                .map((p) => p.map((n) => n * 100).join(','))
                .join(' ')}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 ${kind === 'tape' ? 30 : 100}"><g fill="${/^#[0-9a-f]{6}$/i.test(color) ? color : '#b39a61'}">${shape}</g></svg>`;
}
