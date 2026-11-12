// All geometry is in page millimetres; the caller supplies a screen-sized tolerance.
export function elementBounds(el) {
  const angle = ((el.rotation || 0) * Math.PI) / 180;
  const w = Math.abs(Math.cos(angle)) * el.w + Math.abs(Math.sin(angle)) * el.h;
  const h = Math.abs(Math.sin(angle)) * el.w + Math.abs(Math.cos(angle)) * el.h;
  return { x: el.x + (el.w - w) / 2, y: el.y + (el.h - h) / 2, w, h };
}
function union(elements) {
  const boxes = elements.map(elementBounds);
  const x = Math.min(...boxes.map((b) => b.x)),
    y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  };
}
function targets(elements, axis, { width, height, margins = {}, customGuides = [] }) {
  const horizontal = axis === 'x',
    size = horizontal ? width : height;
  const start = horizontal ? margins.left : margins.top,
    end = horizontal ? margins.right : margins.bottom;
  return [
    { at: 0, label: '页面边缘' },
    { at: size / 2, label: '页面中心' },
    { at: size, label: '页面边缘' },
    { at: start || 0, label: '安全边距' },
    { at: size - (end || 0), label: '安全边距' },
    ...customGuides.filter((g) => g.axis === axis).map((g) => ({ at: g.at, label: '辅助线' })),
    ...elements.flatMap((e) => {
      const b = elementBounds(e),
        length = horizontal ? b.w : b.h;
      return [0, 0.5, 1].map((t) => ({
        at: b[axis] + length * t,
        label: t === 0.5 ? '元素中心' : '元素边缘',
      }));
    }),
  ];
}
function nearest(anchors, candidates, tolerance) {
  let best;
  for (const a of anchors)
    for (const target of candidates) {
      const delta = target.at - a;
      if (Math.abs(delta) <= tolerance && (!best || Math.abs(delta) < Math.abs(best.delta)))
        best = { ...target, delta };
    }
  return best;
}
export function snapBookMove(moving, others, dx, dy, options) {
  if (!moving.length) return { dx, dy, guides: [] };
  const b = union(moving),
    guides = [];
  const result = { dx, dy, guides };
  for (const axis of ['x', 'y']) {
    if (options.axis && options.axis !== axis) continue;
    const deltaKey = axis === 'x' ? 'dx' : 'dy',
      size = axis === 'x' ? 'w' : 'h',
      cross = axis === 'x' ? 'y' : 'x',
      crossSize = axis === 'x' ? 'h' : 'w';
    const start = b[axis] + result[deltaKey],
      length = b[size],
      tolerance = options.threshold || 1;
    let match = nearest(
      [start, start + length / 2, start + length],
      targets(others, axis, options),
      tolerance,
    );
    // Equal spacing between adjacent neighbours, and repeated gaps outside a pair.
    const boxes = others
      .map(elementBounds)
      .filter(
        (o) =>
          o[cross] + o[crossSize] > b[cross] + result[axis === 'x' ? 'dy' : 'dx'] &&
          o[cross] < b[cross] + result[axis === 'x' ? 'dy' : 'dx'] + b[crossSize],
      )
      .sort((a, b) => a[axis] - b[axis]);
    const gaps = [];
    for (let i = 1; i < boxes.length; i++) {
      const a = boxes[i - 1],
        z = boxes[i],
        gap = z[axis] - a[axis] - a[size];
      if (gap < 0) continue;
      if (gap >= length)
        gaps.push({ at: a[axis] + a[size] + (gap - length) / 2, label: '等距间隔' });
      gaps.push(
        { at: z[axis] + z[size] + gap, label: '等距间隔' },
        { at: a[axis] - gap - length, label: '等距间隔' },
      );
    }
    const spacing = nearest([start], gaps, tolerance);
    if (spacing && (!match || Math.abs(spacing.delta) < Math.abs(match.delta))) match = spacing;
    if (!match && options.grid)
      match = nearest(
        [start],
        [{ at: Math.round(start / options.grid) * options.grid, label: `${options.grid} mm 网格` }],
        tolerance,
      );
    if (match) {
      result[deltaKey] += match.delta;
      guides.push({ axis, at: match.at, label: match.label });
    }
  }
  return result;
}
export function snapBookResize(original, proposed, handle, others, options) {
  // Rotated corners are resized in their own axes; do not snap their bounding box
  // as if it were an unrotated rectangle (which would shift the opposite corner).
  if (original.rotation) return { rect: proposed, guides: [] };
  const rect = { ...proposed },
    guides = [];
  const matches = [];
  for (const axis of ['x', 'y']) {
    const size = axis === 'x' ? 'w' : 'h',
      negative = handle.includes(axis === 'x' ? 'w' : 'n');
    const anchor = rect[axis] + (negative ? 0 : rect[size]);
    const match = nearest([anchor], targets(others, axis, options), options.threshold || 1);
    if (match) matches.push({ axis, size, negative, ...match });
  }
  const chosen = options.keepAspect
    ? matches.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta)).slice(0, 1)
    : matches;
  for (const m of chosen) {
    const next = rect[m.size] + m.delta * (m.negative ? -1 : 1);
    if (next < 5 || next > 1000) continue;
    const otherSize = m.size === 'w' ? 'h' : 'w';
    const nextOther = (next * original[otherSize]) / original[m.size];
    if (options.keepAspect && (nextOther < 5 || nextOther > 1000)) continue;
    if (m.negative) rect[m.axis] += m.delta;
    rect[m.size] = next;
    if (options.keepAspect) {
      const axis = m.axis === 'x' ? 'y' : 'x',
        size = m.size === 'w' ? 'h' : 'w';
      if (handle.includes(axis === 'x' ? 'w' : 'n')) rect[axis] += rect[size] - nextOther;
      rect[size] = nextOther;
    }
    guides.push({ axis: m.axis, at: m.at, label: m.label });
  }
  return { rect, guides };
}
