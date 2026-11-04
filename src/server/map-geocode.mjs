import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
// Only explicit user searches/reverse lookups, serialized and cached. No autocomplete or bulk geocoding.
export class PlaceSearch {
  constructor(
    home,
    {
      fetcher = fetch,
      base = process.env.FILMALBUM_GEOCODER_URL || 'https://photon.komoot.io',
    } = {},
  ) {
    this.home = home;
    this.fetcher = fetcher;
    this.base = base.replace(/\/$/, '');
    this.tail = Promise.resolve();
    this.last = 0;
  }
  query(input) {
    const p = {};
    let stateHint = '';
    if (input.reverse) {
      const lat = Number(input.lat),
        lon = Number(input.lon);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat) > 90 ||
        Math.abs(lon) > 180
      )
        throw Object.assign(Error('坐标范围不正确'), { status: 400 });
      Object.assign(p, { lat, lon, limit: 1 });
    } else {
      const q = String(input.q || '').trim();
      if (q.length < 2 || q.length > 200)
        throw Object.assign(Error('请输入 2–200 个字符的地名'), { status: 400 });
      stateHint = q.match(/^(.*?(?:省|自治区))/)?.[1] || '';
      let term = stateHint ? q.slice(stateHint.length) : q;
      const county = term.match(/([^省市区县]{1,18}(?:自治县|县|区|旗))$/)?.[1];
      if (county) term = county;
      Object.assign(p, { q: term || q, limit: 8 });
      if (input.country && /^[a-z]{2}$/i.test(input.country))
        p.countrycode = input.country.toUpperCase();
    }
    const endpoint = input.reverse ? '/reverse' : '/api';
    const url = this.base + endpoint + '?' + new URLSearchParams(p),
      key = createHash('sha256')
        .update(url + '|' + stateHint)
        .digest('hex'),
      path = join(this.home, 'place-cache', key + '.json');
    const operation = this.tail
      .catch(() => {})
      .then(async () => {
        try {
          const cached = JSON.parse(await readFile(path, 'utf8'));
          if (Date.now() - cached.time < 30 * 86400000) return cached.result;
        } catch {}
        const delay = 1100 - (Date.now() - this.last);
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        this.last = Date.now();
        let response;
        try {
          response = await this.fetcher(url, {
            signal: AbortSignal.timeout(12000),
            headers: {
              'User-Agent': 'FilmAlbum/2.2 local-personal-photo-archive',
              Accept: 'application/json',
            },
          });
        } catch {
          throw Object.assign(Error('地名服务暂不可达；可直接缩放地图落点，或输入经纬度。'), {
            status: 503,
          });
        }
        if (!response.ok)
          throw Object.assign(Error('地名服务暂不可用，请稍后重试'), { status: 503 });
        const raw = await response.json();
        const result = (raw.features || [])
          .slice(0, 8)
          .filter(
            (f) =>
              f.geometry?.type === 'Point' &&
              (!stateHint || String(f.properties?.state || '').includes(stateHint)),
          )
          .map((f) => {
            const a = f.properties || {},
              [longitude, latitude] = f.geometry.coordinates;
            return {
              name: a.name || a.street || '',
              label: [a.name, a.street, a.district, a.county, a.city, a.state, a.country]
                .filter((s, i, all) => s && all.indexOf(s) === i)
                .join(' · '),
              latitude,
              longitude,
              country: a.countrycode,
              county:
                a.county ||
                ((a.type === 'district' || a.type === 'county') && /[县区旗]$/.test(a.name || '')
                  ? a.name
                  : ''),
              district: a.district || '',
              city: a.city || '',
              state: a.state || '',
              extent: a.extent || null,
            };
          });
        await mkdir(join(this.home, 'place-cache'), { recursive: true });
        await writeFile(path, JSON.stringify({ time: Date.now(), result }));
        return result;
      });
    this.tail = operation;
    return operation;
  }
}
