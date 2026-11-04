function coordinate(value, limit) {
  if (value === null || value === undefined || !['number', 'string'].includes(typeof value))
    return null;
  if (
    typeof value === 'string' &&
    (!value.trim() || !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value.trim()))
  )
    return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}
export function rollCoordinates(roll = {}) {
  if (!roll || typeof roll !== 'object') return null;
  const latitude = coordinate(roll.latitude, 90),
    longitude = coordinate(roll.longitude, 180);
  return latitude === null || longitude === null ? null : { latitude, longitude };
}
export function rollPosition(roll = {}) {
  const coordinates = rollCoordinates(roll),
    place = String(roll?.location || '').trim();
  return { coordinates, place, kind: coordinates ? 'located' : place ? 'name-only' : 'unlocated' };
}
export function coordinateLabel(roll) {
  const coordinates = rollCoordinates(roll);
  return coordinates
    ? coordinates.latitude.toFixed(5) + ', ' + coordinates.longitude.toFixed(5)
    : '';
}
