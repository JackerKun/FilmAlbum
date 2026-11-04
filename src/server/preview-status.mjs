import { opendir } from 'node:fs/promises';
import { join } from 'node:path';

export async function previewStatus(catalog) {
  const rows = catalog.db
    .prepare(
      "SELECT DISTINCT m.id,m.availability FROM media m JOIN versions v ON v.media_id=m.id JOIN photos p ON p.primary_version=v.id JOIN rolls r ON r.id=p.roll_id WHERE p.deleted_at IS NULL AND r.deleted_at IS NULL AND m.mime NOT LIKE 'video/%'",
    )
    .all();
  const images = new Map(rows.map((row) => [row.id, row.availability])),
    cached = new Set(),
    large = new Set();
  let error;
  try {
    for await (const entry of await opendir(join(catalog.root, 'previews'))) {
      const match = /^(.+)-(640|1600)\.jpg$/.exec(entry.name);
      if (entry.isFile() && match && images.has(match[1])) {
        cached.add(match[1]);
        if (match[2] === '1600') large.add(match[1]);
      }
    }
  } catch (e) {
    if (e.code !== 'ENOENT') error = '无法读取预览缓存目录';
  }
  return {
    images: images.size,
    ready: cached.size,
    large: large.size,
    missing: images.size - cached.size,
    offlineReady: [...cached].filter((id) => ['offline', 'missing'].includes(images.get(id)))
      .length,
    ...(error ? { error } : {}),
  };
}
