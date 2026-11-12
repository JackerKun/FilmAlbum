import { rollCoordinates } from './geolocation.mjs';
export function mapGeometry(points, land, width = 800, height = 480) {
  const valid = points
    .map((p) => ({ ...p, ...rollCoordinates(p) }))
    .filter((p) => rollCoordinates(p));
  const lons = valid.map((p) => p.longitude),
    lats = valid.map((p) => p.latitude);
  const centerLon = lons.length ? (Math.min(...lons) + Math.max(...lons)) / 2 : 0,
    centerLat = lats.length ? (Math.min(...lats) + Math.max(...lats)) / 2 : 20;
  let spanX = Math.max(12, (Math.max(...lons) - Math.min(...lons)) * 1.5 || 12),
    spanY = Math.max(10, (Math.max(...lats) - Math.min(...lats)) * 1.5 || 10);
  if (spanX / spanY < width / height) spanX = (spanY * width) / height;
  else spanY = (spanX * height) / width;
  spanX = Math.min(360, spanX);
  spanY = Math.min(180, spanY);
  const project = ([lon, lat]) => [
    ((lon - centerLon) / spanX) * width + width / 2,
    ((centerLat - lat) / spanY) * height + height / 2,
  ];
  const paths = [];
  for (const f of land?.features || []) {
    const polygons =
      f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
    for (const polygon of polygons) {
      paths.push(
        polygon
          .map(
            (ring) =>
              ring
                .map((coord, i) => {
                  const [x, y] = project(coord);
                  return `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
                })
                .join('') + 'Z',
          )
          .join(''),
      );
    }
  }
  return {
    paths,
    points: valid.map((p, i) => ({ ...p, index: i + 1, xy: project([p.longitude, p.latitude]) })),
    bounds: [
      centerLon - spanX / 2,
      centerLat - spanY / 2,
      centerLon + spanX / 2,
      centerLat + spanY / 2,
    ],
  };
}
export function mapSvg(points, land, connect = false) {
  const g = mapGeometry(points, land);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480"><defs><clipPath id="bounds"><rect width="800" height="480"/></clipPath></defs><rect width="800" height="480" fill="#e7edf0"/><g clip-path="url(#bounds)">${g.paths.map((d) => `<path d="${d}" fill="#f4f1e6" stroke="#c8c6b9" stroke-width="1"/>`).join('')}${Array.from({ length: 7 }, (_, i) => `<path d="M${i * 133.33},0V480 M0,${i * 80}H800" stroke="#8d9d9a" opacity=".2"/>`).join('')}${connect ? `<path d="${g.points.map((p, i) => `${i ? 'L' : 'M'}${p.xy.join(',')}`).join('')}" fill="none" stroke="#9f6941" stroke-width="2" stroke-dasharray="6 4"/>` : ''}${g.points.map((p) => `<circle cx="${p.xy[0]}" cy="${p.xy[1]}" r="12" fill="#385a4c" stroke="#fff" stroke-width="2"/><text x="${p.xy[0]}" y="${p.xy[1] + 4}" text-anchor="middle" font-size="12" font-family="sans-serif" fill="white">${p.index}</text>`).join('')}</g><text x="12" y="465" font-family="sans-serif" font-size="10" fill="#54675e">WGS84 · Natural Earth / Public Domain</text></svg>`;
}
