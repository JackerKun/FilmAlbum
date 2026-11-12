import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, stat, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
let building;
export function nativeCapabilities() {
  const portable = process.platform !== 'darwin' || process.env.FILMALBUM_ENGINE === 'portable';
  return {
    provider: portable ? 'portable' : 'macos',
    metadata: true,
    preview: true,
    pdf: true,
    qr: true,
    ocr: true,
    classify: !portable,
    heic: !portable,
  };
}
export async function native(root, mode, ...args) {
  if (
    mode === 'bookpdf' ||
    process.platform !== 'darwin' ||
    process.env.FILMALBUM_ENGINE === 'portable'
  )
    return (await import('./portable-native.mjs')).portableNative(root, mode, ...args);
  if (process.env.FILMALBUM_NATIVE_BINARY) {
    const { stdout } = await exec(
      process.env.FILMALBUM_NATIVE_BINARY,
      [mode, ...args.map(String)],
      { timeout: 120000, maxBuffer: 8 * 1024 * 1024 },
    );
    return JSON.parse(stdout || '{}');
  }
  const dir = join(root, 'runtime'),
    binary = join(dir, 'filmalbum-native'),
    source = fileURLToPath(new URL('../../native/Native.swift', import.meta.url));
  await mkdir(dir, { recursive: true });
  const [src, bin] = await Promise.all([stat(source), stat(binary).catch(() => null)]);
  if (!bin || bin.mtimeMs < src.mtimeMs) {
    building ||= (async () => {
      const temp = binary + '.' + randomUUID();
      await exec(
        '/usr/bin/xcrun',
        ['swiftc', '-O', '-module-cache-path', join(dir, 'module-cache'), source, '-o', temp],
        { timeout: 180000, maxBuffer: 8 * 1024 * 1024 },
      );
      await rename(temp, binary);
    })().finally(() => (building = null));
    await building;
  }
  const { stdout } = await exec(binary, [mode, ...args.map(String)], {
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return JSON.parse(stdout || '{}');
}
