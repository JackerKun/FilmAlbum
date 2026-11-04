// Synthetic metadata benchmark. It creates and removes its own isolated catalog.
import { Catalog } from '../src/server/catalog.mjs';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
const existing = process.env.FILMALBUM_BENCH_ROOT;
const root = existing || mkdtempSync(join(tmpdir(), 'filmalbum-benchmark-')),
  c = new Catalog(root),
  started = performance.now();
try {
  if (!existing) {
    const photo = c.db.prepare(
        'INSERT INTO photos(id,roll_id,position,frameNo,name,date,primary_version,created_at,updated_at,data) VALUES(?,?,?,?,?,?,?,?,?,\'{"tags":["街拍"]}\')',
      ),
      version = c.db.prepare(
        "INSERT INTO versions(id,photo_id,media_id,name,created_at,data) VALUES(?,?,?,?,?,'{}')",
      ),
      term = c.db.prepare('INSERT OR IGNORE INTO photo_terms VALUES(?,?)');
    const media = c.addMedia({ path: 'media/synthetic.bin', size: 24000000, mime: 'image/tiff' });
    c.transaction(() => {
      for (let n = 0; n < 10000; n++) {
        const roll = c.createRoll(
          {
            id: 'r' + n,
            name: '东京散步 ' + n,
            camera: n % 2 ? 'Leica M6' : 'Nikon F3',
            date: `${2000 + (n % 26)}-10-01`,
            location: '东京',
          },
          false,
        );
        for (let f = 0; f < 36; f++) {
          const id = 'r' + n + ':' + f,
            v = 'v' + n + '-' + f;
          photo.run(id, roll.id, f, String(f + 1), '街景 ' + f, roll.date, v, 1, 1);
          version.run(v, id, media, '扫描', 1);
          term.run('街拍', id);
          term.run('street', id);
        }
      }
    });
  }
  const constructionMs = existing ? null : Math.round(performance.now() - started),
    results = {};
  for (const [label, fn] of Object.entries({
    rolls: () => c.query({ limit: 80 }, 'rolls'),
    photos: () => c.query({ limit: 80 }),
    search: () => c.query({ query: '东京 M6 street', limit: 80 }),
    page1000: () => c.query({ page: 1000, limit: 80 }),
    stats: () => c.stats(),
  })) {
    console.error('Benchmark:', label);
    const times = [];
    let result;
    for (let i = 0; i < 5; i++) {
      const at = performance.now();
      result = fn();
      times.push(performance.now() - at);
    }
    results[label] = {
      medianMs: Number(times.sort((a, b) => a - b)[2].toFixed(2)),
      returned: result.items?.length,
      total: result.total,
    };
  }
  c.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  console.log(
    JSON.stringify(
      {
        rolls: 10000,
        photos: 360000,
        constructionMs,
        dbMB: Number((statSync(join(root, 'catalog.sqlite')).size / 1048576).toFixed(1)),
        rssMB: Math.round(process.memoryUsage().rss / 1048576),
        results,
      },
      null,
      2,
    ),
  );
} finally {
  c.close();
  if (!existing) rmSync(root, { recursive: true, force: true });
}
