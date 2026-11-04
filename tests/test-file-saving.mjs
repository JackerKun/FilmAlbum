import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFileService, downloadURL } from '../desktop/file-service.mjs';
import { attachmentHeader, attachmentFileName, safeFileName } from '../src/shared/file-names.mjs';

test('download filenames keep Unicode and extensions while removing paths and control characters', () => {
  const longName = safeFileName('胶片😀'.repeat(100) + '.pdf');
  assert.ok(Buffer.byteLength(longName) <= 180);
  assert.ok(longName.endsWith('.pdf'));
  assert.doesNotThrow(() => attachmentHeader(longName));
  const name = '上海 暮色 01.JPG';
  assert.equal(attachmentFileName(attachmentHeader(name), 'fallback'), name);
  assert.equal(safeFileName('../../escape.pdf'), 'escape.pdf');
  assert.equal(safeFileName('CON.pdf'), '_CON.pdf');
  assert.doesNotMatch(attachmentHeader('file\r\nX-Evil: yes.pdf'), /[\r\n]/);
});
test('desktop save accepts only current-library files and rejects external, credentialed and server URLs', () => {
  const origin = 'http://127.0.0.1:1234';
  assert.match(downloadURL(origin, '/api/v2/media/photo-1'), /download=1/);
  for (const url of [
    'https://example.com/api/v2/media/a',
    'http://user@127.0.0.1:1234/api/v2/media/a',
    '/api/v2/settings',
    '/api/v2/media/a/../../../etc/passwd',
    'file:///etc/passwd',
  ])
    assert.throws(() => downloadURL(origin, url));
});
test('desktop save streams authenticated bytes atomically, reports cancellation, and preserves existing files on failure', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'filmalbum-save-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bytes = Buffer.from('%PDF-1.7\nfixture'),
    token = 'test-secret';
  let fail = false,
    headCount = 0,
    getCount = 0;
  const server = createServer((request, response) => {
    assert.equal(request.headers['x-filmalbum-token'], token);
    if (request.method === 'HEAD') {
      headCount++;
      response.writeHead(200, {
        'Content-Disposition': attachmentHeader('摄影画册.pdf'),
        'Content-Length': bytes.length,
      });
      response.end();
      return;
    }
    getCount++;
    if (fail) {
      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'fixture unavailable' }));
      return;
    }
    response.writeHead(200, { 'Content-Length': bytes.length });
    response.end(bytes);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const origin = 'http://127.0.0.1:' + server.address().port,
    target = join(dir, '摄影画册.pdf');
  let cancel = false;
  const service = createFileService({
    getOrigin: () => origin,
    getToken: () => token,
    chooseDestination: async (filename) => {
      assert.equal(filename, '摄影画册.pdf');
      return cancel ? null : target;
    },
  });
  assert.equal((await service.saveFile({ url: '/api/v2/exports/example.pdf' })).status, 'saved');
  assert.deepEqual(await readFile(target), bytes);
  assert.equal(service.canReveal(target), true);
  assert.equal(service.canReveal(join(dir, 'unrelated')), false);
  cancel = true;
  assert.equal(
    (await service.saveFile({ url: '/api/v2/exports/example.pdf' })).status,
    'cancelled',
  );
  assert.equal(getCount, 1);
  cancel = false;
  fail = true;
  await assert.rejects(
    service.saveFile({ url: '/api/v2/exports/example.pdf' }),
    /fixture unavailable/,
  );
  assert.deepEqual(await readFile(target), bytes);
  assert.deepEqual(await readdir(dir), ['摄影画册.pdf']);
  assert.equal(headCount, 3);
});
