import assert from 'node:assert/strict';
import { test } from 'node:test';
import updater from '../desktop/update-check.cjs';

const { checkForUpdate, releasesUrl } = updater;
const release = {
  tag_name: 'v3.0.10',
  draft: false,
  prerelease: false,
  html_url: 'https://example.com/untrusted-download',
};

test('looks up the latest release and links to the official page for a newer version', async () => {
  const result = await checkForUpdate('3.0.9', async (url, options) => {
    assert.equal(url, 'https://api.github.com/repos/JackerKun/FilmAlbum/releases/latest');
    assert.equal(options.credentials, 'omit');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(release);
  });
  assert.deepEqual(result, {
    status: 'available',
    version: '3.0.10',
    url: 'https://github.com/JackerKun/FilmAlbum/releases/tag/v3.0.10',
  });
  assert.equal(releasesUrl, 'https://github.com/JackerKun/FilmAlbum/releases');
  assert.deepEqual(await checkForUpdate('3.0.10-rc.1', async () => Response.json(release)), result);
});

test('reports that no newer release is available for equal or older versions', async () => {
  for (const current of ['3.0.10+local', '3.1.0']) {
    assert.deepEqual(await checkForUpdate(current, async () => Response.json(release)), {
      status: 'current',
    });
  }
});

test('ignores drafts, prereleases, and invalid tags', async () => {
  for (const candidate of [
    { ...release, draft: true },
    { ...release, prerelease: true },
    { ...release, tag_name: 'v3.0.10-rc.1' },
    { ...release, tag_name: 'latest' },
  ]) {
    assert.deepEqual(await checkForUpdate('3.0.9', async () => Response.json(candidate)), {
      status: 'unavailable',
    });
  }
});

test('distinguishes unavailable update checks from running the latest version', async () => {
  for (const fetchRelease of [
    async () => {
      throw new TypeError('Network unavailable');
    },
    async () => {
      throw new DOMException('Request timed out', 'TimeoutError');
    },
    async () => Response.json(release, { status: 429 }),
    async () => new Response('not JSON'),
  ]) {
    assert.deepEqual(await checkForUpdate('3.0.9', fetchRelease), { status: 'unavailable' });
  }
});
