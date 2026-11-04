import { readFile, mkdir, copyFile, writeFile, stat, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

// Only top-level files declared by the builder are distributable. In particular,
// never glob **/*.exe, which also matches executable files inside win-unpacked.
export async function collectDesktop(root, platform, arch) {
  if (!['mac', 'win'].includes(platform) || !['arm64', 'x64'].includes(arch))
    throw Error('Expected mac|win and arm64|x64');
  const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const target = platform + '-' + arch,
    base = join(root, 'dist', version, target),
    out = join(root, '.build', 'artifacts', target);
  const manifest = JSON.parse(await readFile(join(base, 'build-manifest.json'), 'utf8'));
  if (manifest.version !== version || manifest.platform !== platform || manifest.arch !== arch)
    throw Error('Manifest target/version mismatch');
  if (!Array.isArray(manifest.artifacts) || !manifest.artifacts.length)
    throw Error('No packaged artifacts');
  const names = new Set(),
    verified = [];
  for (const artifact of manifest.artifacts) {
    const name = artifact.file;
    if (
      typeof name !== 'string' ||
      basename(name) !== name ||
      /[\\/]/.test(name) ||
      !/^FilmAlbum-[\w.-]+\.(?:dmg|zip|exe)(?:\.blockmap)?$/.test(name) ||
      names.has(name)
    )
      throw Error('Unsafe or duplicate artifact name: ' + name);
    names.add(name);
    if (
      !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
      (await sha256(join(base, name))) !== artifact.sha256
    )
      throw Error('Artifact checksum mismatch: ' + name);
    // electron-builder also declares update blockmaps. This application has no
    // auto-updater, so distribute installers/archives and retain their checksums.
    if (!name.endsWith('.blockmap')) verified.push(artifact);
  }
  if (!verified.length) throw Error('No distributable packages');
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const artifact of verified)
    await copyFile(join(base, artifact.file), join(out, artifact.file));
  await writeFile(
    join(out, 'build-manifest-' + target + '.json'),
    JSON.stringify({ ...manifest, artifacts: verified }, null, 2) + '\n',
  );
  await writeFile(
    join(out, 'SHA256SUMS-' + target + '.txt'),
    verified.map((a) => a.sha256 + '  ' + a.file).join('\n') + '\n',
  );
  for (const [source, destination] of [
    ['smoke-report.json', 'smoke-report-' + target + '.json'],
    ['smoke-screenshot.png', 'smoke-screenshot-' + target + '.png'],
    ['smoke-desktop.log', 'smoke-desktop-' + target + '.log'],
  ]) {
    if (
      await stat(join(base, source)).then(
        (s) => s.isFile(),
        () => false,
      )
    )
      await copyFile(join(base, source), join(out, destination));
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(
    await collectDesktop(fileURLToPath(new URL('../', import.meta.url)), ...process.argv.slice(2)),
  );
