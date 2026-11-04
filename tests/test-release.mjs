import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { desktopCIPlan } from '../scripts/ci-plan.mjs';
import { collectDesktop } from '../scripts/collect-desktop.mjs';
import publishDraft from '../scripts/publish-draft.cjs';

const hash = (data) => createHash('sha256').update(data).digest('hex');
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'filmalbum-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '3.0.0' }));
  return root;
}

test('CI matrix selects native runners and rejects mismatched tags and unknown targets', () => {
  const all = desktopCIPlan({ version: '3.0.0', ref: 'refs/tags/v3.0.0' }).include;
  assert.equal(all.length, 4);
  assert.equal(all.find((r) => r.platform === 'mac' && r.arch === 'x64').os, 'macos-15-intel');
  assert.equal(all.find((r) => r.platform === 'win' && r.arch === 'arm64').os, 'windows-11-arm');
  assert.deepEqual(desktopCIPlan({ version: '3.0.0', platform: 'win', arch: 'x64' }).include, [
    { os: 'windows-2025', platform: 'win', arch: 'x64' },
  ]);
  assert.throws(
    () => desktopCIPlan({ version: '3.0.0', ref: 'refs/tags/v2.0.0' }),
    /Tag must match/,
  );
  assert.throws(() => desktopCIPlan({ version: '3.0.0', platform: 'linux' }), /Invalid platform/);
});

async function packageFixture(root) {
  const base = join(root, 'dist/3.0.0/win-x64');
  await mkdir(join(base, 'win-unpacked'), { recursive: true });
  const file = 'FilmAlbum-3.0.0-windows-x64-setup.exe',
    data = Buffer.from('installer fixture');
  await writeFile(join(base, file), data);
  await writeFile(join(base, 'win-unpacked/Film Album.exe'), 'must not upload');
  await writeFile(join(base, file + '.blockmap'), 'update metadata');
  const manifest = {
    version: '3.0.0',
    platform: 'win',
    arch: 'x64',
    artifacts: [
      { file, sha256: hash(data) },
      { file: file + '.blockmap', sha256: hash('update metadata') },
    ],
  };
  await writeFile(join(base, 'build-manifest.json'), JSON.stringify(manifest));
  return { base, file, manifest };
}

test('collector verifies declared files and excludes unpacked EXEs and stale output', async (t) => {
  const root = await fixture(t),
    { file } = await packageFixture(root),
    out = join(root, '.build/artifacts/win-x64');
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'old-installer.exe'), 'stale');
  await collectDesktop(root, 'win', 'x64');
  const files = await readdir(out);
  assert.ok(files.includes(file));
  assert.ok(!files.includes('old-installer.exe'));
  assert.ok(!files.includes('Film Album.exe'));
  assert.equal(files.length, 3);
  assert.ok(!files.some((name) => name.endsWith('.blockmap')));
  assert.equal(
    JSON.parse(await readFile(join(out, 'build-manifest-win-x64.json'), 'utf8')).artifacts.length,
    1,
  );
  assert.match(
    await readFile(join(out, 'SHA256SUMS-win-x64.txt'), 'utf8'),
    /FilmAlbum-3.0.0-windows-x64-setup.exe/,
  );
});

test('collector rejects tampering and unsafe paths before creating output', async (t) => {
  const root = await fixture(t),
    { base, file, manifest } = await packageFixture(root);
  await writeFile(join(base, file), 'changed');
  await assert.rejects(collectDesktop(root, 'win', 'x64'), /checksum mismatch/);
  manifest.artifacts[0].file = '../secret.exe';
  await writeFile(join(base, 'build-manifest.json'), JSON.stringify(manifest));
  await assert.rejects(collectDesktop(root, 'win', 'x64'), /Unsafe/);
  assert.equal(
    await stat(join(root, '.build/artifacts/win-x64')).then(
      () => true,
      () => false,
    ),
    false,
  );
});

async function releaseFixture(root) {
  const dir = join(root, '.build/release');
  await mkdir(dir, { recursive: true });
  await mkdir(join(root, 'docs'));
  await writeFile(join(root, 'docs/RELEASE-NOTES.md'), 'Preview release notes');
  for (const row of desktopCIPlan({ version: '3.0.0' }).include) {
    const { platform, arch } = row,
      target = platform + '-' + arch;
    const names =
      platform === 'mac'
        ? [`FilmAlbum-3.0.0-mac-${arch}.dmg`, `FilmAlbum-3.0.0-mac-${arch}.zip`]
        : [`FilmAlbum-3.0.0-windows-${arch}-setup.exe`, `FilmAlbum-3.0.0-win-${arch}.zip`];
    const artifacts = [];
    for (const file of names) {
      const data = Buffer.from(file);
      await writeFile(join(dir, file), data);
      artifacts.push({ file, sha256: hash(data) });
    }
    await writeFile(
      join(dir, 'build-manifest-' + target + '.json'),
      JSON.stringify({ version: '3.0.0', platform, arch, artifacts }),
    );
    await writeFile(
      join(dir, 'smoke-report-' + target + '.json'),
      JSON.stringify({
        ok: true,
        version: '3.0.0',
        host: platform === 'mac' ? 'darwin' : 'win32',
        arch,
        hostArch: arch,
        rendererPreview: true,
        nativeSave: true,
        originalSaved: true,
        pdfSaved: true,
      }),
    );
  }
  return dir;
}
function apiFixture(existing = []) {
  const calls = [];
  const repos = {
    listReleases: 'releases',
    listReleaseAssets: 'assets',
    createRelease: async (args) => {
      calls.push(['create', args]);
      return { data: { id: 123, html_url: 'https://example.invalid/draft', draft: true } };
    },
    uploadReleaseAsset: async (args) => {
      calls.push(['upload', args]);
      return { data: {} };
    },
    deleteReleaseAsset: async (args) => {
      calls.push(['delete', args]);
    },
  };
  const github = {
    rest: { repos },
    paginate: async (route) => (route === 'releases' ? existing : []),
  };
  const context = {
    repo: { owner: 'fixture', repo: 'FilmAlbum' },
    ref: 'refs/tags/v3.0.0',
    sha: 'fixture-commit',
  };
  const summary = {
    addHeading() {
      return this;
    },
    addLink() {
      return this;
    },
    addRaw() {
      return this;
    },
    async write() {},
  };
  return { github, context, core: { notice() {}, summary }, calls };
}

test('release preparation creates a draft with eight verified packages and checksums', async (t) => {
  const root = await fixture(t),
    dir = await releaseFixture(root),
    api = apiFixture();
  await publishDraft({ ...api, root });
  assert.equal(api.calls[0][0], 'create');
  assert.equal(api.calls[0][1].draft, true);
  assert.equal(api.calls[0][1].tag_name, 'v3.0.0');
  assert.equal(api.calls.filter((c) => c[0] === 'upload').length, 17);
  assert.equal((await readFile(join(dir, 'SHA256SUMS'), 'utf8')).trim().split('\n').length, 8);
});

test('failed or emulated app checks block all release API writes', async (t) => {
  const root = await fixture(t),
    dir = await releaseFixture(root),
    api = apiFixture();
  const path = join(dir, 'smoke-report-win-arm64.json'),
    report = JSON.parse(await readFile(path, 'utf8'));
  report.hostArch = 'x64';
  await writeFile(path, JSON.stringify(report));
  await assert.rejects(publishDraft({ ...api, root }), /Native app smoke test/);
  assert.equal(api.calls.length, 0);
});

test('release preparation refuses already published releases without changing assets', async (t) => {
  const root = await fixture(t);
  await releaseFixture(root);
  const api = apiFixture([{ id: 77, tag_name: 'v3.0.0', draft: false }]);
  await assert.rejects(publishDraft({ ...api, root }), /already published/);
  assert.equal(api.calls.length, 0);
});

test('release upload rejects mismatched tags and altered binaries before any API writes', async (t) => {
  const root = await fixture(t),
    dir = await releaseFixture(root),
    api = apiFixture();
  await assert.rejects(
    publishDraft({ ...api, root, context: { ...api.context, ref: 'refs/tags/v3.1.0' } }),
    /tag must match/,
  );
  await writeFile(join(dir, 'FilmAlbum-3.0.0-mac-arm64.dmg'), 'tampered');
  await assert.rejects(publishDraft({ ...api, root }), /checksum mismatch/);
  assert.equal(api.calls.length, 0);
});
