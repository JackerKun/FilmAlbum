import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, stat, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Catalog } from '../src/server/catalog.mjs';
const targetArch = process.argv[2] || process.arch;
if (!['arm64', 'x64'].includes(targetArch)) throw Error('Expected arm64 or x64');
const root = fileURLToPath(new URL('../', import.meta.url)),
  version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version,
  platform = process.platform === 'darwin' ? 'mac' : 'win',
  base = join(root, 'dist', version, platform + '-' + targetArch),
  folder =
    process.platform === 'darwin'
      ? targetArch === 'arm64'
        ? 'mac-arm64'
        : 'mac'
      : targetArch === 'arm64'
        ? 'win-arm64-unpacked'
        : 'win-unpacked',
  appRoot = join(base, folder),
  executable =
    process.platform === 'darwin'
      ? join(appRoot, 'Film Album.app', 'Contents', 'MacOS', 'Film Album')
      : join(appRoot, 'Film Album.exe');
await stat(executable);
const userData = await mkdtemp(join(tmpdir(), 'filmalbum-app-smoke-')),
  library = join(userData, 'library');
await mkdir(join(library, 'media'), { recursive: true });
const catalog = new Catalog(library),
  roll = catalog.createRoll({ name: 'Desktop smoke fixture', date: '2026-11-03' }),
  media = catalog.addMedia({ path: 'media/smoke.bin', mime: 'image/png' });
await copyFile(join(root, 'assets/icons/icon-256.png'), join(library, 'media', 'smoke.bin'));
catalog.addPhoto(roll.id, media, { name: 'Smoke image', exif: { width: 256, height: 256 } });
catalog.close();
const report = join(userData, 'report.json'),
  preview = join(library, 'previews', media + '-640.jpg'),
  screenshot = join(userData, 'screenshot.png');
let output = '';
const child = spawn(executable, [], {
  env: {
    ...process.env,
    FILMALBUM_DESKTOP_DATA_DIR: userData,
    FILMALBUM_DESKTOP_SMOKE: '1',
    FILMALBUM_SMOKE_REPORT: report,
    FILMALBUM_SMOKE_MEDIA: media,
    FILMALBUM_SMOKE_PREVIEW: preview,
    FILMALBUM_SMOKE_SCREENSHOT: screenshot,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (d) => (output = (output + d).slice(-12000)));
child.stderr.on('data', (d) => (output = (output + d).slice(-12000)));
try {
  await new Promise((resolveExit, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(Error('Packaged application smoke test timed out\n' + output));
    }, 180000);
    child.once('error', (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      code === 0 ? resolveExit() : reject(Error('Application exited ' + code + '\n' + output));
    });
  });
  const result = JSON.parse(await readFile(report, 'utf8'));
  if (!result.ok) throw Error('App did not report success');
  if (!result.nativeSave || !result.originalSaved || !result.pdfSaved)
    throw Error('Native desktop save bridge did not pass');
  const savedOriginal = await readFile(join(userData, 'smoke-downloads', result.originalName));
  if (!savedOriginal.equals(await readFile(join(library, 'media', 'smoke.bin'))))
    throw Error('Saved original bytes differ');
  const savedPDF = await readFile(join(userData, 'smoke-downloads', result.pdfName));
  if (savedPDF.subarray(0, 4).toString() !== '%PDF')
    throw Error('Native PDF save did not create a PDF');
  if (
    !(await stat(preview).then(
      (s) => s.size > 0,
      () => false,
    ))
  )
    throw Error(
      'Renderer did not generate the fixture thumbnail; inspect ' +
        join(userData, 'logs', 'desktop.log'),
    );
  await copyFile(screenshot, join(base, 'smoke-screenshot.png'));
  await writeFile(
    join(base, 'smoke-report.json'),
    JSON.stringify(
      {
        ...result,
        rendererPreview: true,
        host: process.platform,
        arch: targetArch,
        hostArch: process.arch,
      },
      null,
      2,
    ) + '\n',
  );
  console.log('Packaged app + SQLite + renderer + native original/PDF save: PASS');
  await rm(userData, { recursive: true, force: true });
} catch (error) {
  const failure = {
    ok: false,
    version,
    host: process.platform,
    arch: targetArch,
    hostArch: process.arch,
    error: error.message,
  };
  await writeFile(join(base, 'smoke-report.json'), JSON.stringify(failure, null, 2) + '\n');
  await copyFile(join(userData, 'logs', 'desktop.log'), join(base, 'smoke-desktop.log')).catch(
    () => {},
  );
  await copyFile(screenshot, join(base, 'smoke-screenshot.png')).catch(() => {});
  console.error(error.message);
  console.error('Retained test data:', userData);
  process.exitCode = 1;
}
