import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { elementBounds, snapBookMove, snapBookResize } from '../src/shared/book-snapping.mjs';
import { STICKERS, STICKER_GROUPS, stickerSvg } from '../src/shared/book-graphics.mjs';
const options = {
  width: 200,
  height: 260,
  margins: { left: 15, right: 10, top: 10, bottom: 10 },
  threshold: 1,
};
const rect = (x, y, w = 20, h = 20) => ({ x, y, w, h });
test('drag snaps edges, centres, safety margins, neighbouring elements and preserves group spacing', () => {
  let r = snapBookMove([rect(30, 40)], [], 59.5, 79.4, options);
  assert.equal(r.dx, 60);
  assert.equal(r.dy, 80);
  assert.equal(r.guides.length, 2);
  r = snapBookMove([rect(30, 40)], [], -14.4, 0, options);
  assert.equal(r.dx, -15);
  r = snapBookMove([rect(30, 40)], [rect(63, 80)], 12.4, 0, options);
  assert.ok(Math.abs(r.dx - 13) < 1e-8);
  r = snapBookMove([rect(30, 40), rect(60, 40)], [], 44.5, 0, options);
  assert.equal(r.dx, 45);
  r = snapBookMove([rect(30, 40)], [], 59.5, 0, { ...options, axis: 'y' });
  assert.equal(r.dx, 59.5);
  r = snapBookMove([rect(30, 40)], [], 52, 33, options);
  assert.deepEqual(r.guides, []);
});
test('equal gaps and rotated visual bounds snap without changing element geometry', () => {
  const r = snapBookMove(
    [rect(0, 30, 10, 20)],
    [rect(20, 30, 10, 20), rect(70, 30, 10, 20)],
    45.5,
    0,
    options,
  );
  assert.equal(r.dx, 45);
  assert.ok(r.guides.some((g) => g.label === '等距间隔'));
  const rotated = elementBounds({ ...rect(30, 40, 30, 10), rotation: 90 });
  assert.ok(Math.abs(rotated.w - 10) < 1e-8);
  assert.ok(Math.abs(rotated.h - 30) < 1e-8);
});
test('resize snaps dragged corner, keeps opposite corner and respects aspect ratio', () => {
  const original = rect(20, 30, 40, 20);
  let r = snapBookResize(original, rect(20, 30, 79.5, 20), 'se', [], options);
  assert.equal(r.rect.w, 80);
  assert.equal(r.rect.x, 20);
  r = snapBookResize(original, rect(20, 30, 79.5, 39.75), 'se', [], {
    ...options,
    keepAspect: true,
  });
  assert.equal(r.rect.w / r.rect.h, 2);
  r = snapBookResize({ ...original, rotation: 30 }, rect(20, 30, 79.5, 20), 'se', [], options);
  assert.deepEqual(r.guides, []);
});
test('thirty categorized stickers render to transparent images without remote resources', async () => {
  assert.equal(Object.keys(STICKERS).length, 30);
  assert.equal(Object.values(STICKER_GROUPS).flatMap((g) => Object.keys(g)).length, 30);
  for (const key of Object.keys(STICKERS)) {
    const svg = stickerSvg(key, '#385a4c');
    assert.ok(!svg.includes('href='));
    const { info } = await sharp(Buffer.from(svg))
      .resize(100)
      .png()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 100);
    assert.equal(info.channels, 4);
  }
});

test('custom guides and grid snap only when supplied by the editor', () => {
  const r = snapBookMove([rect(30, 40)], [], 6.5, 0, {
    ...options,
    customGuides: [{ axis: 'x', at: 37 }],
  });
  assert.equal(r.dx, 7);
  assert.ok(r.guides.some((g) => g.label === '辅助线'));
  const g = snapBookMove([rect(31, 41)], [], 8.5, 8.5, { ...options, grid: 10 });
  assert.equal(g.dx, 9);
  assert.equal(g.dy, 9);
});
