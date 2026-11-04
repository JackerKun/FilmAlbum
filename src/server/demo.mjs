import { Catalog, uid, json } from './catalog.mjs';
import { bookStore } from './books.mjs';
import { native } from './native.mjs';
import { mkdir, writeFile, readFile, stat, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
export async function seedDemo(home, progress = () => {}) {
  const root = join(home, 'demo-libraries', uid());
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, 'DEMO-LIBRARY.json'),
    json({
      demo: true,
      createdAt: Date.now(),
      description: 'Synthetic development fixtures; no personal photographs',
    }),
  );
  const c = new Catalog(root);
  try {
    c.setMeta('libraryName', 'FILM ATLAS · 演示资料库');
    const cities = [
      ['东京雨夜', 35.68, 139.76, 'cinestill800t'],
      ['京都散步', 35.01, 135.76, 'portra400'],
      ['巴黎来信', 48.86, 2.35, 'gold200'],
      ['冰岛旷野', 64.15, -21.94, 'ektar100'],
      ['纽约街头', 40.71, -74.01, 'trix400'],
      ['上海暮色', 31.23, 121.47, 'pro400h'],
      ['伦敦手记', 51.51, -0.13, 'hp5'],
      ['沙漠日落', 31.63, -7.98, 'portra160'],
    ];
    const assets = [];
    for (let i = 0; i < 12; i++) {
      const id = uid(),
        path = 'media/' + id + '.bin';
      await native(home, 'demo', join(root, path), i);
      const bytes = await readFile(join(root, path));
      c.addMedia({
        id,
        path,
        mime: 'image/png',
        size: bytes.length,
        hash: createHash('sha256').update(bytes).digest('hex'),
      });
      assets.push(id);
      progress(i + 1, 20, '生成演示影像');
    }
    const photos = [];
    for (let i = 0; i < cities.length; i++) {
      const [name, latitude, longitude, stock] = cities[i],
        r = c.transaction(() =>
          c.createRoll({
            name,
            stock,
            status: ['shooting', 'exposed', 'developing', 'developed', 'scanned', 'archived'][
              i % 6
            ],
            format: i % 3 === 0 ? '120 · 6×7' : '135',
            date: `${2020 + (i % 6)}-${String(i + 1).padStart(2, '0')}-12`,
            camera: i % 2 ? 'Leica M6' : 'Mamiya 7',
            location: name.slice(0, 2),
            latitude,
            longitude,
            physical: {
              cabinet: 'A',
              box: 'BOX ' + (i + 1),
              album: 'ARCHIVE',
              page: '01',
              pocket: '01–06',
            },
            notes: '演示数据 / Synthetic fixture',
          }),
        );
      for (let f = 0; f < 12; f++) {
        const p = c.addPhoto(r.id, assets[(i + f) % assets.length], {
          name: `${name} / ${String(f + 1).padStart(2, '0')}.png`,
          exif: { width: 3000, height: 2000, model: 'DEMO CAMERA', date: r.date },
        });
        c.patch(
          'photos',
          p.id,
          {
            rating: f % 6,
            color: ['', 'red', 'yellow', 'green', 'blue', 'purple'][f % 6],
            tags: [i % 2 ? '街拍' : '旅行', f % 2 ? '夜景' : '风景'],
            rejected: f === 11,
          },
          p.version,
        );
        photos.push(p);
        if (f === 2)
          c.addPhoto(
            r.id,
            assets[(i + f + 1) % assets.length],
            { name: '自扫 TIFF 对照 · 演示', kind: 'rescan', exif: { width: 3000, height: 2000 } },
            p.id,
          );
      }
      progress(13 + i, 20, '建立胶卷、地图和版本');
    }
    const col = c.createList('collections', { name: '旅行精选', kind: 'manual' });
    c.membership(
      'collections',
      col.id,
      photos.slice(0, 10).map((p) => p.id),
    );
    c.createList('collections', { name: '五星作品', kind: 'smart', rules: { rating: '5' } });
    const project = c.createList('projects', {
      name: 'Across the world · 世界漫游',
      chapters: ['城市', '旷野'],
    });
    c.membership(
      'projects',
      project.id,
      photos.slice(0, 12).map((p) => p.id),
    );
    c.organize(
      project.id,
      photos.slice(0, 6).map((p) => p.id),
      { stage: 'final', chapter: '城市' },
    );
    const duplicate = uid(),
      original = await readFile(join(root, 'media', assets[0] + '.bin'));
    await copyFile(
      join(root, 'media', assets[0] + '.bin'),
      join(root, 'media', duplicate + '.bin'),
    );
    c.addMedia({
      id: duplicate,
      path: 'media/' + duplicate + '.bin',
      mime: 'image/png',
      size: original.length,
      hash: createHash('sha256').update(original).digest('hex'),
    });
    c.addPhoto(
      photos[0].roll_id,
      duplicate,
      { name: '哈希完全相同的副本 · 演示', kind: 'export', exif: { width: 3000, height: 2000 } },
      photos[0].id,
    );
    const trash = c.addPhoto(photos[0].roll_id, assets[1], { name: '回收站恢复案例.png' });
    c.patch('photos', trash.id, { deleted_at: Date.now() }, trash.version);
    const missing = uid();
    c.addMedia({ id: missing, path: 'media/' + missing + '.bin', mime: 'image/png', size: 1024 });
    const roll = c.query({ limit: 1 }, 'rolls').items[0];
    c.addPhoto(roll.id, missing, { name: '断链案例 · 原片不存在.png' });
    c.db.prepare("UPDATE media SET availability='missing' WHERE id=?").run(missing);
    await writeFile(
      join(root, 'media', 'demo-orphan.bin'),
      'DEMO unreferenced file; safe to inspect',
    );
    const offline = join(home, 'demo-volumes', uid());
    await mkdir(offline, { recursive: true });
    const storage = c.registerStorage({ name: '演示离线盘', root: offline });
    const offlineId = c.addMedia({
      storage_id: storage.id,
      path: 'offline.png',
      mime: 'image/png',
      size: 1024,
    });
    c.addPhoto(roll.id, offlineId, {
      name: '离线案例 · 缓存仍可看.png',
      exif: { width: 3000, height: 2000 },
    });
    await mkdir(join(root, 'previews'), { recursive: true });
    await native(
      home,
      'preview',
      join(root, 'media', assets[0] + '.bin'),
      join(root, 'previews', offlineId + '-640.jpg'),
      640,
    );
    c.db.prepare('UPDATE storages SET root=? WHERE id=?').run(offline + '-unplugged', storage.id);
    c.db.prepare("UPDATE media SET availability='offline' WHERE id=?").run(offlineId);
    const pages = Array.from({ length: 6 }, (_, i) => ({
      id: uid(),
      background: i % 2 ? '#f6f0e5' : '#ffffff',
      elements: [
        {
          id: uid(),
          type: 'image',
          photoId: photos[i].id,
          mediaId: photos[i].mediaId,
          x: 12,
          y: 12,
          w: 186,
          h: 200,
          fit: 'cover',
          cropX: 0.5,
          cropY: 0.5,
        },
        {
          id: uid(),
          type: 'text',
          x: 14,
          y: 230,
          w: 182,
          h: 42,
          text: `FIELD NOTES / 0${i + 1}\n${cities[i][0]} · 演示摄影画册`,
          fontSize: 20,
          color: '#25382e',
        },
      ],
    }));
    const book = bookStore(c).save({
      name: 'Field Notes · 世界摄影手记',
      width: 210,
      height: 297,
      bleed: 3,
      safe: 10,
      pages,
    });
    c.setMeta('demo', true);
    return { destination: root, rolls: 8, photos: 98, bookId: book.id, demo: true };
  } finally {
    c.close();
  }
}
