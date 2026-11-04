const { readFile, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { createHash } = require('node:crypto');

module.exports = async function publishDraft({ github, context, core, root = process.cwd() }) {
  const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const tag = 'v' + version;
  if (context.ref !== 'refs/tags/' + tag)
    throw Error('Release tag must match package.json: ' + tag);
  const dir = join(root, '.build', 'release'),
    expected = new Set(),
    checks = [];
  // Every architecture must have a complete, verified native build before a draft
  // release is created. A partial matrix or failed GUI smoke test cannot publish.
  for (const target of ['mac-arm64', 'mac-x64', 'win-arm64', 'win-x64']) {
    const manifestName = 'build-manifest-' + target + '.json',
      smokeName = 'smoke-report-' + target + '.json';
    const manifest = JSON.parse(await readFile(join(dir, manifestName), 'utf8'));
    const [platform, arch] = target.split('-');
    if (manifest.version !== version || manifest.platform !== platform || manifest.arch !== arch)
      throw Error('Invalid manifest: ' + target);
    const smoke = JSON.parse(await readFile(join(dir, smokeName), 'utf8'));
    if (
      !smoke.ok ||
      !smoke.rendererPreview ||
      !smoke.nativeSave ||
      !smoke.originalSaved ||
      !smoke.pdfSaved ||
      smoke.version !== version ||
      smoke.arch !== arch ||
      smoke.hostArch !== arch ||
      smoke.host !== (platform === 'mac' ? 'darwin' : 'win32')
    )
      throw Error('Native app smoke test did not pass: ' + target);
    const formats = platform === 'mac' ? ['dmg', 'zip'] : ['exe', 'zip'];
    if (
      !Array.isArray(manifest.artifacts) ||
      !formats.every((ext) => manifest.artifacts.some((a) => a.file.endsWith('.' + ext)))
    )
      throw Error('Missing package formats: ' + target);
    for (const artifact of manifest.artifacts) {
      if (
        !/^FilmAlbum-[\w.-]+\.(?:dmg|zip|exe)$/.test(artifact.file) ||
        expected.has(artifact.file)
      )
        throw Error('Invalid or duplicate release asset');
      const data = await readFile(join(dir, artifact.file)),
        hash = createHash('sha256').update(data).digest('hex');
      if (hash !== artifact.sha256) throw Error('Release checksum mismatch: ' + artifact.file);
      expected.add(artifact.file);
      checks.push(hash + '  ' + artifact.file);
    }
    expected.add(manifestName);
    expected.add(smokeName);
  }
  await writeFile(join(dir, 'SHA256SUMS'), checks.sort().join('\n') + '\n');
  expected.add('SHA256SUMS');
  const notes = await readFile(join(root, 'docs', 'RELEASE-NOTES.md'), 'utf8');
  const releases = await github.paginate(github.rest.repos.listReleases, {
    ...context.repo,
    per_page: 100,
  });
  let release = releases.find((item) => item.tag_name === tag);
  if (release && !release.draft)
    throw Error(
      'Release is already published. Use a new version/tag; published assets are not replaced.',
    );
  if (!release)
    ({ data: release } = await github.rest.repos.createRelease({
      ...context.repo,
      tag_name: tag,
      target_commitish: context.sha,
      name: 'Film Album ' + version,
      draft: true,
      prerelease: version.includes('-'),
      body: notes,
    }));
  const existing = await github.paginate(github.rest.repos.listReleaseAssets, {
    ...context.repo,
    release_id: release.id,
    per_page: 100,
  });
  for (const name of [...expected].sort()) {
    const previous = existing.find((asset) => asset.name === name);
    if (previous)
      await github.rest.repos.deleteReleaseAsset({ ...context.repo, asset_id: previous.id });
    const data = await readFile(join(dir, name));
    await github.rest.repos.uploadReleaseAsset({
      ...context.repo,
      release_id: release.id,
      name,
      data,
      headers: {
        'content-type': name.endsWith('.json')
          ? 'application/json'
          : name.endsWith('.zip')
            ? 'application/zip'
            : 'application/octet-stream',
        'content-length': data.length,
      },
    });
  }
  core.notice('Draft release ready: ' + release.html_url);
  await core.summary
    .addHeading('Draft release ready')
    .addLink('Review and publish ' + tag, release.html_url)
    .addRaw(
      '\nAll four native builds and application smoke tests passed. The release remains a draft.\n',
    )
    .write();
  return release;
};
