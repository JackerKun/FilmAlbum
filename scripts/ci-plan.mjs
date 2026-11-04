import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function desktopCIPlan({ platform = 'all', arch = 'all', ref = '', version }) {
  if (!['all', 'mac', 'win'].includes(platform)) throw Error('Invalid platform: ' + platform);
  if (!['all', 'arm64', 'x64'].includes(arch)) throw Error('Invalid architecture: ' + arch);
  if (ref.startsWith('refs/tags/') && ref !== 'refs/tags/v' + version)
    throw Error('Tag must match package.json: v' + version);
  const rows = [
    { os: 'macos-15', platform: 'mac', arch: 'arm64' },
    { os: 'macos-15-intel', platform: 'mac', arch: 'x64' },
    { os: 'windows-2025', platform: 'win', arch: 'x64' },
    { os: 'windows-11-arm', platform: 'win', arch: 'arm64' },
  ];
  return {
    include: rows.filter(
      (row) =>
        (platform === 'all' || row.platform === platform) && (arch === 'all' || row.arch === arch),
    ),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const matrix = desktopCIPlan({
    platform: process.env.BUILD_PLATFORM || 'all',
    arch: process.env.BUILD_ARCH || 'all',
    ref: process.env.GITHUB_REF || '',
    version,
  });
  const json = JSON.stringify(matrix);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'matrix=' + json + '\n');
  console.log(json);
}
