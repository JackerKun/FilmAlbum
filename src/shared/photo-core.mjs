export const entryKey = (entry) => `${entry.roll.id}:${entry.frame.id}`;
export function allEntries(rolls) {
  return rolls.flatMap((roll) => roll.frames.map((frame, index) => ({ roll, frame, index })));
}
export function resolveRefs(rolls, refs = []) {
  const lookup = new Map(allEntries(rolls).map((entry) => [entryKey(entry), entry]));
  return [...new Set(refs)].map((key) => lookup.get(key)).filter(Boolean);
}
export function mergeRefs(refs, additions) {
  return [...new Set([...refs, ...additions])];
}
export function photoDate(entry) {
  return String(entry.frame.exif?.date || entry.roll.date || '')
    .replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
    .slice(0, 10);
}
export function matchesFrame(entry, criteria = {}, quick = 'all') {
  const { frame, roll } = entry;
  const exif = frame.exif || {};
  const rating = frame.rating || 0;
  if (
    (quick === 'favorites' && rating < 4) ||
    (quick === 'unrated' && rating !== 0) ||
    (quick === 'rejected' && !frame.rejected)
  )
    return false;
  if (
    (criteria.rating === 'unrated' && rating !== 0) ||
    (/^\d$/.test(criteria.rating || '') && rating < Number(criteria.rating))
  )
    return false;
  if (
    criteria.color &&
    criteria.color !== 'all' &&
    (criteria.color === 'none' ? Boolean(frame.color) : frame.color !== criteria.color)
  )
    return false;
  if (criteria.type && criteria.type !== 'all' && frame.type !== criteria.type) return false;
  if (
    (criteria.review === 'kept' && frame.rejected) ||
    (criteria.review === 'rejected' && !frame.rejected)
  )
    return false;
  const width = Number(exif.width),
    height = Number(exif.height);
  const orientation =
    width > 0 && height > 0
      ? width === height
        ? 'square'
        : width > height
          ? 'landscape'
          : 'portrait'
      : 'unknown';
  if (
    criteria.orientation &&
    criteria.orientation !== 'all' &&
    orientation !== criteria.orientation
  )
    return false;
  if (criteria.tag && !(frame.tags || []).includes(criteria.tag)) return false;
  const date = photoDate(entry);
  if ((criteria.from || criteria.to) && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if ((criteria.from && date < criteria.from) || (criteria.to && date > criteria.to)) return false;
  const haystack = [
    frame.name,
    ...(frame.tags || []),
    exif.make,
    exif.model,
    exif.lens,
    roll.name,
    roll.camera,
    roll.lens,
    roll.location,
    roll.project,
  ]
    .join(' ')
    .toLocaleLowerCase();
  return String(criteria.query || '')
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}
export function fitRatio(width, height, viewportWidth, viewportHeight) {
  if (
    ![width, height, viewportWidth, viewportHeight].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    return 1;
  return Math.min(viewportWidth / width, viewportHeight / height, 1);
}
export function viewGeometry(width, height, viewportWidth, viewportHeight, state) {
  const ratio =
    state.ratio === null
      ? fitRatio(width, height, viewportWidth, viewportHeight)
      : Math.max(0.01, Math.min(16, state.ratio));
  const renderedWidth = width * ratio,
    renderedHeight = height * ratio;
  const bound = (center, rendered, viewport) =>
    rendered <= viewport
      ? 0.5
      : Math.max(viewport / rendered / 2, Math.min(1 - viewport / rendered / 2, center));
  const cx = bound(state.cx, renderedWidth, viewportWidth),
    cy = bound(state.cy, renderedHeight, viewportHeight);
  return {
    ratio,
    cx,
    cy,
    width: renderedWidth,
    height: renderedHeight,
    x: (0.5 - cx) * renderedWidth,
    y: (0.5 - cy) * renderedHeight,
  };
}
export function histogramBins(pixels) {
  const bins = [new Array(256).fill(0), new Array(256).fill(0), new Array(256).fill(0)];
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (!pixels[i + 3]) continue;
    bins[0][pixels[i]]++;
    bins[1][pixels[i + 1]]++;
    bins[2][pixels[i + 2]]++;
  }
  return bins;
}
// Keep recorded edge numbers intact and expose gaps between adjacent numbered frames.
export function contactSlots(photos) {
  return photos.flatMap((photo, index) => {
    const before = photos[index - 1]?.frameNo;
    const after = photo.frameNo;
    const numbered = /^\d{1,3}$/;
    const gap = numbered.test(before) && numbered.test(after) ? Number(after) - Number(before) : 0;
    const empty =
      gap > 1 && gap <= 36
        ? Array.from({ length: gap - 1 }, (_, i) => ({
            frameNo: String(Number(before) + i + 1).padStart(String(after).length, '0'),
          }))
        : [];
    return [...empty, photo];
  });
}
