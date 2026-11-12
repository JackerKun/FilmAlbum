const { gt, parse } = require('semver');

const repository = 'JackerKun/FilmAlbum';
const releasesUrl = `https://github.com/${repository}/releases`;
const unavailable = { status: 'unavailable' };

async function checkForUpdate(currentVersion, fetchRelease) {
  try {
    const current = parse(currentVersion);
    if (!current) return unavailable;

    const response = await fetchRelease(
      `https://api.github.com/repos/${repository}/releases/latest`,
      {
        headers: { Accept: 'application/vnd.github+json' },
        credentials: 'omit',
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return unavailable;

    const release = await response.json();
    const latest = parse(release?.tag_name);
    if (
      !latest ||
      release.draft !== false ||
      release.prerelease !== false ||
      latest.prerelease.length
    )
      return unavailable;
    if (!gt(latest, current)) return { status: 'current' };

    return {
      status: 'available',
      version: latest.version,
      url: `${releasesUrl}/tag/${encodeURIComponent(release.tag_name)}`,
    };
  } catch {
    return unavailable;
  }
}

module.exports = { checkForUpdate, releasesUrl };
