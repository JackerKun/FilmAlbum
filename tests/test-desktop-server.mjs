import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test(
  'desktop loopback service requires its session token and still rejects foreign write origins',
  { timeout: 30000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'film-desktop-auth-')),
      token = 'b'.repeat(64),
      child = spawn(process.execPath, ['src/server/server.mjs'], {
        cwd: new URL('../', import.meta.url),
        env: {
          ...process.env,
          PORT: '0',
          FILMALBUM_DATA_DIR: dir,
          FILMALBUM_DESKTOP_TOKEN: token,
          FILMALBUM_BACKGROUND: '0',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    t.after(async () => {
      child.kill();
      if (child.exitCode === null) await new Promise((r) => child.once('exit', r));
      await rm(dir, { recursive: true, force: true });
    });
    const url = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', (data) => {
        output += data;
        const m = /FilmAlbum: (http:\/\/127\.0\.0\.1:\d+)/.exec(output);
        if (m) resolve(m[1]);
      });
      child.once('exit', (code) => reject(Error('Server exited ' + code)));
    });
    assert.equal((await fetch(url + '/api/v2/bootstrap')).status, 403);
    assert.equal((await fetch(url + '/')).status, 403);
    const headers = { 'X-FilmAlbum-Token': token },
      response = await fetch(url + '/', { headers });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /frame-src 'none'/);
    assert.equal((await fetch(url + '/api/v2/bootstrap', { headers })).status, 200);
    assert.equal(
      (
        await fetch(url + '/api/v2/rolls', {
          method: 'POST',
          headers: {
            ...headers,
            origin: 'https://example.invalid',
            'Content-Type': 'application/json',
          },
          body: '{}',
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(url + '/assets/fonts/NotoSansSC-Regular.otf', { headers })).status,
      403,
    );
  },
);
