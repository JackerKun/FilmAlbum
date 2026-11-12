// pdf-lib 1.17 treats OpenType glyph indices as CIDs. In CID-keyed CFF fonts
// (including the bundled Noto SC fonts) those are different numbers. Embed
// the raw CFF program and use its charset CIDs consistently for text, widths
// and ToUnicode. Keeping fontkit's original font untouched preserves shaping.
export async function embedPDFFont(doc, bytes) {
  const font = await doc.embedFont(bytes, {
    subset: false,
    features: { locl: false, liga: false },
  });
  const source = font.embedder.font;
  const cff = source['CFF '];
  if (!cff?.isCIDFont) return font;
  const charset = cff.topDict.charset;
  const cids = [0];
  if (charset.ranges) {
    for (const range of charset.ranges)
      for (let i = 0; i <= range.nLeft; i++) cids.push(range.first + i);
  } else if (charset.glyphs) cids.push(...charset.glyphs);
  else throw new Error('不支持的 CFF 字体字符映射');
  const mapGlyph = (glyph) => {
    const cid = cids[glyph.id];
    if (!Number.isInteger(cid)) throw new Error('字体缺少字符映射');
    return { id: cid, advanceWidth: glyph.advanceWidth, codePoints: glyph.codePoints };
  };
  font.embedder.font = new Proxy(source, {
    get(target, key) {
      if (key === 'cff') return true;
      if (key === 'layout')
        return (...args) => {
          const run = target.layout(...args);
          return { ...run, glyphs: run.glyphs.map(mapGlyph) };
        };
      if (key === 'glyphForCodePoint')
        return (...args) => mapGlyph(target.glyphForCodePoint(...args));
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const table = source.directory.tables['CFF '];
  font.embedder.fontData = bytes.subarray(table.offset, table.offset + table.length);
  return font;
}
