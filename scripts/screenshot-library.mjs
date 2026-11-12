import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { Catalog, uid } from '../src/server/catalog.mjs';
import { bookStore } from '../src/server/books.mjs';

const scenes = [
  ['上海暮色', '上海 · 外滩', 31.2397, 121.4907, 'pro400h', 'SHANGHAI'],
  ['京都散步', '京都 · 东山', 35.0026, 135.7785, 'portra400', 'KYOTO'],
  ['东京雨夜', '东京 · 新宿', 35.6938, 139.7035, 'cinestill800t', 'TOKYO'],
  ['胡同晨骑', '北京 · 东城', 39.9375, 116.3964, 'hp5', 'BEIJING'],
  ['天山湖面', '新疆 · 博尔塔拉', 44.573, 81.177, 'ektar100', 'TIANSHAN'],
  ['戈壁余晖', '甘肃 · 敦煌', 40.089, 94.669, 'gold200', 'DUNHUANG'],
  ['林间雾气', '四川 · 雅安', 30.039, 103.001, 'trix400', 'YAAAN'],
  ['黑沙海岸', '冰岛 · 维克', 63.403, -19.044, 'hp5', 'VIK'],
  ['有轨电车', '里斯本 · 阿尔法玛', 38.711, -9.128, 'gold200', 'LISBON'],
  ['街角石阶', '纽约 · 曼哈顿', 40.753, -73.982, 'trix400', 'NEWYORK'],
  ['渡轮慢行', '香港 · 维多利亚港', 22.295, 114.165, 'portra160', 'HONGKONG'],
  ['巴黎来信', '巴黎 · 左岸', 48.852, 2.338, 'portra400', 'PARIS'],
  ['春花近景', '云南 · 昆明', 25.044, 102.7, 'ektar100', 'KUNMING'],
  ['西湖轻雾', '杭州 · 西湖', 30.241, 120.14, 'pro400h', 'HANGZHOU'],
  ['站台旧事', '重庆 · 渝中', 29.547, 106.558, 'ultramax400', 'CHONGQING'],
  ['潮汐线', '福建 · 霞浦', 26.893, 120.087, 'hp5', 'XIAPU'],
];

export async function createScreenshotLibrary(home, sources) {
  const destination = join(home, 'library'),
    previews = join(destination, 'previews');
  await mkdir(join(destination, 'media'), { recursive: true });
  await mkdir(previews);
  const catalog = new Catalog(destination);
  try {
    catalog.setMeta('libraryName', 'FILM ATLAS · 演示资料库');
    catalog.setMeta('demo', true);
    const source = join(sources, 'demo-contact-sheet.webp'),
      { width, height } = await sharp(source).metadata();
    const assets = await Promise.all(
      [...scenes, null].map(async (_, index) => {
        const image =
          index === scenes.length
            ? sharp(join(sources, 'demo-kyoto.webp'))
            : sharp(source).extract({
                left: Math.round(((index % 4) * width) / 4) + 2,
                top: Math.round((Math.floor(index / 4) * height) / 4) + 2,
                width: Math.floor(width / 4) - 4,
                height: Math.floor(height / 4) - 4,
              });
        const { data, info } = await image
            .jpeg({ quality: 91 })
            .toBuffer({ resolveWithObject: true }),
          path = 'media/demo-' + index + '.jpg';
        await writeFile(join(destination, path), data);
        const id = catalog.addMedia({
          path,
          mime: 'image/jpeg',
          size: data.length,
          hash: createHash('sha256').update(data).digest('hex'),
        });
        await sharp(data)
          .resize({ width: 1600, withoutEnlargement: true })
          .jpeg({ quality: 90 })
          .toFile(join(previews, id + '-1600.jpg'));
        return {
          id,
          width: info.width,
          height: info.height,
        };
      }),
    );
    const rolls = [],
      covers = [];
    for (let i = 0; i < 72; i++) {
      const scene = i % scenes.length,
        [title, location, latitude, longitude, stock, prefix] = scenes[scene],
        year = 2018 + Math.floor(i / 9),
        date = `${year}-${String((i % 9) + 1).padStart(2, '0')}-${12 + (i % 12)}`,
        mediumFormat = i % 3 === 2,
        roll = catalog.createRoll({
          name: i < scenes.length ? title : `${title} · ${String(i + 1).padStart(2, '0')}`,
          date,
          createdAt: Date.parse(date),
          stock,
          format: mediumFormat ? '120 · 6×6' : '135',
          camera: mediumFormat ? 'Hasselblad 500 C/M' : i % 2 ? 'Leica M6' : 'Nikon FM2',
          lens: mediumFormat ? 'Planar 80mm f/2.8' : '35mm f/2',
          status: ['scanned', 'archived', 'developed'][i % 3],
          location,
          ...(i % 13 !== 12 && { latitude, longitude }),
          physical: {
            cabinet: 'A',
            box: `BOX ${Math.floor(i / 9) + 1}`,
            album: 'ARCHIVE',
            page: '01',
            pocket: '01–06',
          },
          tags: [i % 2 ? '街拍' : '旅行'],
        });
      rolls.push(roll);
      const frameCount = mediumFormat ? 12 : 24;
      for (let frame = 0; frame < frameCount; frame++) {
        const assetIndex =
            scene === 1 && (frame === 0 || frame === 4)
              ? scenes.length
              : (scene + frame * 7) % scenes.length,
          asset = assets[assetIndex],
          exif = { width: asset.width, height: asset.height, model: 'EPSON Perfection V600', date };
        const photo = catalog.addPhoto(roll.id, asset.id, {
          name: `${prefix}_${String(frame + 1).padStart(3, '0')}.JPG`,
          exif,
        });
        catalog.patch(
          'photos',
          photo.id,
          {
            rating: frame === 0 ? 5 : frame % 5,
            color: ['', 'red', 'yellow', 'green', 'blue'][frame % 5],
            tags: [i % 2 ? '街拍' : '旅行', frame % 2 ? '光影' : '城市'],
            rejected: frame === frameCount - 1,
          },
          photo.version,
        );
        if (!frame) covers.push(photo);
        if (frame === 4) {
          const alternate = assets[(scene + 1) % scenes.length];
          catalog.addPhoto(
            roll.id,
            alternate.id,
            {
              name: '二次扫描',
              kind: 'rescan',
              exif: { ...exif, width: alternate.width, height: alternate.height },
            },
            photo.id,
          );
        }
      }
    }
    const project = catalog.createList('projects', {
      name: '01 · 城市与远方',
      description: '从街巷到海岸的胶片旅行',
      chapters: ['街巷', '远方'],
    });
    const projectPhotos = covers.slice(0, 16).map((photo) => photo.id);
    catalog.membership('projects', project.id, projectPhotos);
    catalog.organize(project.id, projectPhotos.slice(0, 8), { stage: 'final', chapter: '街巷' });
    catalog.organize(project.id, projectPhotos.slice(8), { stage: 'candidate', chapter: '远方' });
    const selected = catalog.createList('collections', { name: '周末散步', kind: 'manual' });
    catalog.membership('collections', selected.id, projectPhotos);
    catalog.createList('collections', { name: '五星作品', kind: 'smart', rules: { rating: '5' } });
    const external = join(home, 'external');
    await mkdir(external);
    const storage = catalog.registerStorage({ name: '演示外置盘', root: external });
    const offline = catalog.addMedia({
      storage_id: storage.id,
      path: 'offline.jpg',
      mime: 'image/jpeg',
      size: 1024,
    });
    const missing = catalog.addMedia({ path: 'media/missing.jpg', mime: 'image/jpeg', size: 1024 });
    catalog.db
      .prepare('UPDATE storages SET root=? WHERE id=?')
      .run(join(home, 'unplugged'), storage.id);
    catalog.db.prepare("UPDATE media SET availability='offline' WHERE id=?").run(offline);
    catalog.db.prepare("UPDATE media SET availability='missing' WHERE id=?").run(missing);
    catalog.addPhoto(rolls[0].id, offline, { name: '离线案例 · 预览已缓存.JPG' });
    catalog.addPhoto(rolls[0].id, missing, { name: '断链案例 · 原片不存在.JPG' });
    await sharp(join(destination, 'media/demo-0.jpg'))
      .jpeg()
      .toFile(join(previews, offline + '-640.jpg'));
    const book = bookStore(catalog).save({
      name: 'Field Notes · 城市与远方',
      width: 210,
      height: 297,
      bleed: 3,
      safe: 10,
      pages: [1, 0, 3, 5, 7, 10].map((scene, index) => ({
        id: uid(),
        background: '#f6f1e6',
        elements: [
          {
            id: uid(),
            type: 'image',
            photoId: covers[scene].id,
            mediaId: covers[scene].mediaId,
            x: 12,
            y: 12,
            w: 186,
            h: 196,
            fit: 'cover',
            cropX: 0.5,
            cropY: 0.5,
          },
          {
            id: uid(),
            type: 'text',
            x: 14,
            y: 225,
            w: 182,
            h: 50,
            text: `FIELD NOTES / 0${index + 1}\n${scenes[scene][0]}`,
            fontSize: 20,
            color: '#25382e',
          },
        ],
      })),
    });
    const stats = catalog.stats();
    return {
      destination,
      rolls: stats.rolls,
      photos: stats.photos,
      sourceImages: assets.length,
      roll135: rolls[1],
      roll120: rolls[2],
      archiveRoll: rolls[65],
      mapRoll: rolls[0],
      projectId: project.id,
      bookId: book.id,
    };
  } finally {
    catalog.close();
  }
}
