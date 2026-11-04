import { spawn } from 'node:child_process';
import {
  readdir,
  readFile,
  writeFile,
  mkdir,
  copyFile,
  cp,
  rm,
  stat,
  chmod,
} from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url)),
  args = process.argv.slice(2),
  help = args.includes('--help') || args.includes('-h');
if (help) {
  console.log(`Film Album desktop builder

./build.sh [all|mac|win|host] [--arch all|arm64|x64|host] [--dir] [--skip-tests] [--signed] [--installer] [--plan]

Defaults: all platforms, both architectures. macOS targets require a macOS host.
macOS output: DMG + ZIP. Windows: ZIP on any host, plus NSIS installer on Windows.
--installer explicitly requests NSIS; use a Windows runner for it.
--dir creates unpacked apps. --signed requires your certificates. --plan changes no files.
Windows without Git Bash: ./build.ps1 win --arch x64
Outputs: dist/<version>/<platform>-<architecture>/`);
  process.exit(0);
}
let target = 'all',
  targetSet = false,
  archArg = 'all';
const flags = new Set(['--dir', '--skip-tests', '--signed', '--installer', '--plan']);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--arch') {
    archArg = args[++i];
    if (!['all', 'host', 'arm64', 'x64'].includes(archArg))
      throw Error('--arch must be all, host, arm64 or x64');
  } else if (['all', 'mac', 'win', 'host'].includes(arg) && !targetSet) {
    target = arg;
    targetSet = true;
  } else if (!flags.has(arg)) throw Error('Unknown build argument: ' + arg);
}
const arches = archArg === 'all' ? ['arm64', 'x64'] : [archArg === 'host' ? process.arch : archArg],
  platforms =
    target === 'all'
      ? ['mac', 'win']
      : target === 'host'
        ? [process.platform === 'darwin' ? 'mac' : 'win']
        : [target];
if (args.includes('--plan')) {
  console.log(
    JSON.stringify(
      platforms.flatMap((platform) =>
        arches.map((arch) => ({
          platform,
          arch,
          formats: args.includes('--dir')
            ? ['directory']
            : platform === 'mac'
              ? ['dmg', 'zip']
              : process.platform === 'win32'
                ? ['nsis', 'zip']
                : ['zip'],
          requiresMacHost: platform === 'mac',
          signed: args.includes('--signed'),
        })),
      ),
      null,
      2,
    ),
  );
  process.exit(0);
}
if (platforms.includes('mac') && process.platform !== 'darwin')
  throw Error(
    'macOS DMG / signing must run on macOS. Use the included native CI matrix, or build.sh win on this machine.',
  );
if (args.includes('--installer') && process.platform !== 'win32')
  throw Error(
    '--installer requires the Windows runner. Cross-platform Windows ZIP output does not require Wine.',
  );
const { build, Platform, Arch } = await import('electron-builder');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm',
  pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')),
  signed = args.includes('--signed'),
  dirOnly = args.includes('--dir');
function run(command, argv, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, argv, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32' && command.endsWith('.cmd'),
      ...options,
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolveRun() : reject(Error(`${command} exited ${code}`)),
    );
  });
}
await run(process.execPath, [join(root, 'scripts', 'make-icons.mjs')]);
await run(process.execPath, [join(root, 'scripts', 'prepare-assets.mjs')]);
if (!args.includes('--skip-tests')) {
  await run(npm, ['run', 'check']);
  await run(npm, ['test']);
}
const runtimeFiles = JSON.parse(
  await readFile(join(root, 'packaging', 'runtime-files.json'), 'utf8'),
);
for (const platform of platforms)
  for (const arch of arches) {
    const os = platform === 'mac' ? 'darwin' : 'win32',
      stage = join(root, '.build', 'staging', platform + '-' + arch),
      out = join(root, 'dist', pkg.version, platform + '-' + arch);
    await mkdir(dirname(stage), { recursive: true });
    await rm(stage, { recursive: true, force: true });
    await mkdir(stage);
    console.log(`\nBuilding Film Album ${pkg.version}: ${platform} ${arch}`);
    for (const name of runtimeFiles) {
      const from = join(root, name),
        to = join(stage, name);
      await mkdir(dirname(to), { recursive: true });
      await cp(from, to, { recursive: true });
    }
    await cp(join(root, 'desktop'), join(stage, 'desktop'), { recursive: true });
    await cp(join(root, 'assets'), join(stage, 'assets'), {
      recursive: true,
      filter: (path) => !path.endsWith('logo-source.png'),
    });
    const runtimePackage = { ...pkg, scripts: {} };
    delete runtimePackage.build;
    await writeFile(join(stage, 'package.json'), JSON.stringify(runtimePackage, null, 2));
    await copyFile(join(root, 'package-lock.json'), join(stage, 'package-lock.json'));
    await run(
      npm,
      [
        'ci',
        '--omit=dev',
        '--ignore-scripts',
        '--include=optional',
        '--no-audit',
        '--no-fund',
        '--os=' + os,
        '--cpu=' + arch,
      ],
      { cwd: stage },
    );
    const bindingDir = join(stage, 'node_modules', '@img', `sharp-${os}-${arch}`, 'lib');
    if (
      !(await readdir(bindingDir).then(
        (files) =>
          files.some((file) => file.startsWith(`sharp-${os}-${arch}`) && file.endsWith('.node')),
        () => false,
      ))
    )
      throw Error(
        'Missing target Sharp binding: ' +
          bindingDir +
          '; rebuild the lockfile from a clean dependency tree.',
      );
    const extraResources = [];
    if (platform === 'mac') {
      const nativeDir = join(root, '.build', 'native', arch);
      await mkdir(nativeDir, { recursive: true });
      const binary = join(nativeDir, 'filmalbum-native');
      await run('/usr/bin/xcrun', [
        'swiftc',
        '-O',
        '-target',
        arch === 'arm64' ? 'arm64-apple-macosx13.0' : 'x86_64-apple-macosx13.0',
        '-module-cache-path',
        join(nativeDir, 'module-cache'),
        join(root, 'native', 'Native.swift'),
        '-o',
        binary,
      ]);
      await chmod(binary, 0o755);
      extraResources.push({ from: binary, to: 'native/filmalbum-native' });
    }
    const targetNames = dirOnly
      ? ['dir']
      : platform === 'mac'
        ? ['dmg', 'zip']
        : process.platform === 'win32'
          ? ['nsis', 'zip']
          : ['zip'];
    const config = {
      appId: 'com.filmalbum.studio',
      productName: 'Film Album',
      electronVersion: pkg.devDependencies.electron,
      directories: { app: stage, output: out, buildResources: join(root, 'packaging') },
      files: ['**/*', '!package-lock.json'],
      asar: false,
      npmRebuild: false,
      nodeGypRebuild: false,
      allowMissingDependencies: false,
      forceCodeSigning: signed,
      publish: null,
      artifactName: 'FilmAlbum-${version}-${os}-${arch}.${ext}',
      extraResources,
      mac: {
        category: 'public.app-category.photography',
        icon: join(root, 'assets/icons/icon.icns'),
        minimumSystemVersion: '13.0',
        hardenedRuntime: signed,
        ...(!signed ? { identity: '-', notarize: false } : {}),
      },
      win: {
        icon: join(root, 'assets/icons/icon.ico'),
        signExecutable: signed,
        signAndEditExecutable: true,
        requestedExecutionLevel: 'asInvoker',
      },
      nsis: {
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        deleteAppDataOnUninstall: false,
        artifactName: 'FilmAlbum-${version}-windows-${arch}-setup.exe',
      },
      dmg: {
        backgroundColor: '#eeeee8',
        title: 'Film Album ' + pkg.version,
        window: { width: 540, height: 360 },
        contents: [
          { x: 145, y: 165 },
          { x: 395, y: 165, type: 'link', path: '/Applications' },
        ],
      },
    };
    const results = await build({
      projectDir: root,
      targets: (platform === 'mac' ? Platform.MAC : Platform.WINDOWS).createTarget(
        targetNames,
        Arch[arch],
      ),
      config,
    });
    const artifacts = [];
    for (const path of results) {
      if (
        !(await stat(path).then(
          (s) => s.isFile(),
          () => false,
        ))
      )
        continue;
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(path)) hash.update(chunk);
      artifacts.push({ file: basename(path), sha256: hash.digest('hex') });
    }
    await mkdir(out, { recursive: true });
    await writeFile(
      join(out, 'build-manifest.json'),
      JSON.stringify(
        { version: pkg.version, platform, arch, signed, host: process.platform, artifacts },
        null,
        2,
      ) + '\n',
    );
    await writeFile(
      join(out, 'SHA256SUMS'),
      artifacts.map((a) => `${a.sha256}  ${a.file}`).join('\n') + '\n',
    );
    console.log('Output:', out);
  }
