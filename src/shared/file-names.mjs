const extensions = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/tiff': '.tif',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/avif': '.avif',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'application/pdf': '.pdf',
};

export function safeFileName(value, fallback = 'FilmAlbum') {
  let name = String(value || '')
    .split(/[\\/]/)
    .pop()
    .replace(/[\x00-\x1f\x7f<>:"|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  const extension = /\.[a-z0-9]{2,8}$/i.exec(name)?.[0] || '';
  const stem = extension ? name.slice(0, -extension.length) : name;
  const encoder = new TextEncoder();
  let shortened = '',
    size = 0;
  for (const character of stem) {
    const bytes = encoder.encode(character).length;
    if (size + bytes > 180 - extension.length) break;
    shortened += character;
    size += bytes;
  }
  name = shortened + extension;
  return name && !/^\.+$/.test(name)
    ? /^(CON|PRN|AUX|NUL|COM\d|LPT\d)(\.|$)/i.test(name)
      ? '_' + name
      : name
    : fallback;
}
export function mediaFileName(name, mime) {
  const extension = extensions[mime] || '';
  let result = safeFileName(name, 'FilmAlbum-original');
  if (extension && !/\.[a-z0-9]{2,8}$/i.test(result)) result += extension;
  return result;
}
export function attachmentHeader(name) {
  name = safeFileName(name);
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`;
}
export function attachmentFileName(header, fallback) {
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header || '');
  if (utf8) {
    try {
      return safeFileName(decodeURIComponent(utf8[1]), fallback);
    } catch {}
  }
  const plain = /filename="([^"]+)"/i.exec(header || '');
  return safeFileName(plain?.[1], fallback);
}
