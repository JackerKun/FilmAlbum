import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root =
  process.env.FILMALBUM_ASSET_DIR || fileURLToPath(new URL('../../assets/', import.meta.url));
const fonts = new Map();
export function bookFont(family = 'sans') {
  const key = family === 'serif' ? 'serif' : 'sans';
  if (!fonts.has(key))
    fonts.set(
      key,
      fontkit.create(
        readFileSync(
          join(
            root,
            'fonts',
            key === 'serif' ? 'NotoSerifSC-Regular.otf' : 'NotoSansSC-Regular.otf',
          ),
        ),
      ),
    );
  return fonts.get(key);
}
export function textOverflow(el) {
  const font = bookFont(el.fontFamily),
    size = el.fontSize || 12,
    width = (el.w * 72) / 25.4;
  let lines = 0;
  for (const paragraph of String(el.text || '').split('\n')) {
    lines++;
    let w = 0;
    for (const ch of paragraph) {
      const advance =
        (font.glyphForCodePoint(ch.codePointAt(0)).advanceWidth / font.unitsPerEm) * size;
      if (w && w + advance > width) {
        lines++;
        w = advance;
      } else w += advance;
    }
  }
  return lines * size * (el.lineHeight || 1.35) > (el.h * 72) / 25.4 + 0.5;
}
