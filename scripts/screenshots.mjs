// Capture the real UI in an isolated documentation library.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const root =
  process.env.FILMALBUM_SCREENSHOT_ROOT || fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.env.FILMALBUM_SCREENSHOT_DIR || join(root, 'docs/screenshots'));
const { default: sharp } = await import(
  pathToFileURL(createRequire(join(root, 'package.json')).resolve('sharp'))
);
const { createScreenshotLibrary } = await import(
  pathToFileURL(join(root, 'scripts/screenshot-library.mjs'))
);
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
const browser =
  process.env.FILMALBUM_SCREENSHOT_BROWSER ||
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : process.platform === 'win32'
      ? join(
          process.env.PROGRAMFILES || 'C:\\Program Files',
          'Google/Chrome/Application/chrome.exe',
        )
      : '/usr/bin/google-chrome');
await stat(browser);
const base = await mkdtemp(join(tmpdir(), 'filmalbum-readme-'));
process.env.FILMALBUM_ENGINE = 'portable';
let server, chrome, ws;
const shots = [],
  errors = [];
function ready(child, stream, pattern) {
  return new Promise((resolveReady, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(Error('Startup timeout: ' + output.slice(-1200))), 20000);
    child[stream].on('data', (data) => {
      output += data;
      const match = pattern.exec(output);
      if (match) {
        clearTimeout(timer);
        resolveReady(match[1]);
      }
    });
    child.once('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(Error('Startup exit ' + code));
    });
  });
}
try {
  await mkdir(output, { recursive: true });
  const demo = await createScreenshotLibrary(base, join(root, 'docs/screenshots'));
  console.log('Screenshot library:', demo.rolls, 'rolls,', demo.photos, 'frames');
  server = spawn(process.execPath, ['src/server/server.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: '0',
      FILMALBUM_DATA_DIR: demo.destination,
      FILMALBUM_BACKGROUND: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.resume();
  const origin = await ready(server, 'stdout', /(http:\/\/127\.0\.0\.1:\d+)/);
  chrome = spawn(
    browser,
    [
      '--headless=new',
      '--no-first-run',
      '--disable-gpu',
      '--remote-debugging-port=0',
      '--user-data-dir=' + join(base, 'browser'),
      '--window-size=1600,1050',
      '--force-device-scale-factor=1',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const debug = await ready(chrome, 'stderr', /DevTools listening on (ws:\/\/[^\s]+)/);
  const endpoint = new URL(debug);
  const target = await (
    await fetch('http://' + endpoint.host + '/json/new?about:blank', {
      method: 'PUT',
    })
  ).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let sequence = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const promise = pending.get(message.id);
      pending.delete(message.id);
      message.error
        ? promise.reject(Error(message.error.message))
        : promise.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown')
      errors.push(message.params.exceptionDetails.text);
  };
  const call = (method, params = {}) =>
    new Promise((resolveCall, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve: resolveCall, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  await call('Page.enable');
  await call('Runtime.enable');
  async function evaluate(expression) {
    for (let n = 0; ; n++) {
      try {
        const result = await call('Runtime.evaluate', {
          expression,
          awaitPromise: true,
          returnByValue: true,
        });
        if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
      } catch (error) {
        if (n >= 12 || !error.message.includes('context')) throw error;
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }
  const wait = (condition) =>
    evaluate(
      `new Promise((resolve,reject)=>{let n=0;const poll=()=>{if(${condition})resolve(true);else if(n++>400)reject(Error('UI timeout: '+${JSON.stringify(condition)}));else setTimeout(poll,50)};poll();})`,
    );
  const click = (selector) =>
    evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  async function navigate(workspace, roll) {
    await call('Page.navigate', {
      url: origin + '/?workspace=' + workspace + (roll ? '&roll=' + encodeURIComponent(roll) : ''),
    });
    await wait(
      `document.querySelector('#library-counts')?.textContent.includes(${JSON.stringify(demo.photos.toLocaleString('en-US'))})`,
    );
    await wait("!document.querySelector('#view-content .empty')?.textContent.includes('正在')");
  }
  async function capture(name, required) {
    const height = name.startsWith('film-') ? 740 : 1050;
    await call('Emulation.setDeviceMetricsOverride', {
      width: 1600,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    if (required) await wait(required);
    await evaluate(
      `(async()=>{await document.fonts.ready;const visible=Array.from(document.images).filter(i=>{const r=i.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth});await Promise.all(visible.map(i=>i.decode().catch(()=>{})));await new Promise(r=>setTimeout(r,650));})()`,
    );
    const check = await evaluate(
      `({title:document.querySelector('#workspace-header h1')?.textContent,broken:Array.from(document.images).filter(i=>{const r=i.getBoundingClientRect();return r.width>0&&r.height>0&&r.top<innerHeight&&r.bottom>0&&r.left<innerWidth&&r.right>0&&!i.closest('[hidden]')&&!i.naturalWidth}).map(i=>i.getAttribute('src')),demo:document.querySelector('#library-title')?.textContent})`,
    );
    // Map tiles are checked separately; disconnected fixture originals can be intentionally unavailable.
    check.broken = check.broken.filter(
      (url) => !url.includes('/media/') && !url.includes('/preview/') && !url.includes('tile'),
    );
    assert.equal(check.broken.length, 0, name + ': broken static imagery');
    assert.match(check.demo, /演示资料库/);
    const screenshot = await call('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    const bytes = await sharp(Buffer.from(screenshot.data, 'base64'))
      .webp({ quality: 88, effort: 6 })
      .toBuffer();
    await writeFile(join(output, name + '.webp'), bytes);
    shots.push({ name, width: 1600, height, bytes: bytes.length, ...check });
    console.log('Captured', name, bytes.length);
    await call('Emulation.clearDeviceMetricsOverride');
  }
  await navigate('archive');
  await wait("document.querySelectorAll('.roll-card').length===50");
  await click(`.roll-card[data-record="${demo.archiveRoll.id}"]`);
  await capture('archive', "document.querySelector('#inspector .leaflet-tile-loaded')");
  await click('[data-action="new-roll"]');
  await capture(
    'new-roll',
    "document.querySelector('#editor[open] .stock-choice') && document.querySelector('#editor .leaflet-tile-loaded')",
  );
  await click('#editor-footer [data-action="close-editor"]');
  await click('[data-action="view"][data-value="film"]');
  await capture(
    'archive-film',
    "document.querySelectorAll('.archive-film-list .pull-studio').length >= 2 && document.querySelector('.archive-film-list .pull-frame img')?.naturalWidth > 0",
  );
  await click('[data-action="view"][data-value="timeline"]');
  await capture(
    'timeline',
    "document.querySelector('.chronicle') || document.querySelector('.timeline') || document.querySelector('[data-action=timeline-jump]')",
  );
  for (const [name, roll] of [
    ['film-135', demo.roll135],
    ['film-120', demo.roll120],
  ]) {
    await navigate('lighttable', roll.id);
    await click('[data-action="view"][data-value="film"]');
    await wait("document.querySelector('[data-pull=full]')");
    await click('[data-pull=full]');
    await evaluate(
      "if (!document.body.classList.contains('inspector-hidden')) document.querySelector('[data-action=inspector]').click()",
    );
    await capture(name, "document.querySelector('.pull-frame img')?.naturalWidth>0");
  }
  await navigate('lighttable', demo.roll135.id);
  await click('[data-action="view"][data-value="grid"]');
  await wait("document.querySelector('.photo-card')");
  await evaluate(
    "document.querySelectorAll('.photo-card')[4].dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))",
  );
  await wait("document.querySelector('#reviewer')?.open");
  await click('[data-action="review-info"]');
  await capture(
    'lighttable',
    "document.querySelector('#review-grid img:not([hidden])')?.naturalWidth > 0 && document.querySelector('#review-details .leaflet-tile-loaded')",
  );
  await navigate('projects');
  await wait("document.querySelector('.project-card')");
  await click(`.project-card[data-value="${demo.projectId}"]`);
  await capture('projects', "document.querySelectorAll('.photo-card').length===16");
  await navigate('archive');
  await evaluate(
    `(() => {
      const search = document.querySelector('#query-input');
      search.value = ${JSON.stringify(demo.mapRoll.name)};
      search.dispatchEvent(new Event('input', { bubbles: true }));
    })()`,
  );
  const rollCard = `.roll-card[data-record="${demo.mapRoll.id}"]`;
  await wait(`document.querySelector(${JSON.stringify(rollCard)})`);
  await click(rollCard);
  await click('#inspector [data-action="map-selected"]');
  await wait("document.querySelector('#atlas-roll-preview')?.textContent.includes('上海暮色')");
  await click('#atlas-home');
  await capture(
    'map',
    "document.querySelector('#atlas-detailed-map .leaflet-tile-loaded') && document.querySelector('#atlas-roll-preview')?.hidden === false",
  );
  await click('[data-action="map-place"]');
  await wait("document.querySelectorAll('[data-map-roll-id]').length===24");
  await evaluate("document.querySelector('.map-picker-advanced').open=true");
  await capture(
    'map-roll-picker',
    `document.querySelector('[data-picker-count]')?.textContent.includes('${demo.rolls}')`,
  );
  await navigate('archive');
  await click('[data-action="books"]');
  await wait("document.querySelector('[data-open-book]')");
  await click(`[data-open-book="${demo.bookId}"]`);
  await wait(
    "document.querySelector('.book-designer')?.open && document.querySelector('.book-paper img')?.naturalWidth>0",
  );
  await evaluate(
    "const id=document.querySelector('.book-element img').closest('[data-element]').dataset.element;Array.from(document.querySelectorAll('[data-select]')).find(b=>b.dataset.select===id).click()",
  );
  await capture('photobook', "document.querySelector('.book-element.selected')");
  await navigate('storage');
  await capture('library', "document.querySelector('.section-card')");
  assert.equal(errors.length, 0, 'Uncaught renderer errors: ' + errors.join(', '));
  await writeFile(
    join(output, 'capture-report.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        version,
        source: 'createScreenshotLibrary',
        synthetic: true,
        library: { rolls: demo.rolls, frames: demo.photos, sourceImages: demo.sourceImages },
        shots,
      },
      null,
      2,
    ) + '\n',
  );
  console.log('Finished:', shots.length, 'screenshots');
} finally {
  ws?.close();
  const stop = async (child) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const done = new Promise((r) => child.once('exit', r));
    child.kill();
    await Promise.race([done, new Promise((r) => setTimeout(r, 3000))]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  };
  await stop(chrome);
  await stop(server);
  await rm(base, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
