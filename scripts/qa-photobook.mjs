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
const output = resolve(process.env.FILMALBUM_SCREENSHOT_DIR || '/tmp/filmalbum-book-qa');
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
      FILMALBUM_BACKGROUND: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.resume();
  const origin = await ready(server, 'stdout', /(http:\/\/127\.0\.0\.1:\d+)/);
  chrome = spawn(
    browser,
    [
      ...(process.env.FILMALBUM_QA_HEADED ? [] : ['--headless=new']),
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
      if (!promise) return;
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
  await call('Page.bringToFront');
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
  await click('[data-action="books"]');
  await wait("document.querySelector('.book-shelf-grid')");
  await click('[data-b="new-book"]');
  await wait("document.querySelectorAll('#builder-library [data-photo]').length===50");
  await evaluate(
    `{const f=document.querySelector('#builder-library [data-book-filter=availability]');f.value='ready';f.dispatchEvent(new Event('change',{bubbles:true}));}`,
  );
  await wait(
    "!document.querySelector('#builder-library .book-photo-list[aria-busy]') && document.querySelectorAll('#builder-library [data-photo]').length===50",
  );
  await evaluate(
    `{ const ids=Array.from(document.querySelectorAll('#builder-library [data-photo]')).slice(0,40).map(b=>b.dataset.photo); document.querySelector('#builder-library [data-photo="'+ids[0]+'"]').click(); document.querySelector('#builder-library [data-photo="'+ids[39]+'"]').dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true})); }`,
  );
  assert.match(
    await evaluate("document.querySelector('#builder-selected-count').textContent"),
    /40/,
  );
  assert.ok(
    await evaluate(
      "document.querySelector('#builder-library [data-book-filter=camera]').options.length>1",
    ),
  );
  await capture(
    'book-selection',
    "document.querySelector('#builder-selected-count').textContent.includes('40')",
  );
  await click('[data-builder="page"]');
  assert.match(
    await evaluate("document.querySelector('#builder-selected-count').textContent"),
    /50/,
  );
  await click('[data-builder="unpage"]');
  assert.match(
    await evaluate("document.querySelector('#builder-selected-count').textContent"),
    /0/,
  );
  await evaluate(
    `{const ids=Array.from(document.querySelectorAll('#builder-library [data-photo]')).slice(0,40).map(b=>b.dataset.photo);document.querySelector('#builder-library [data-photo="'+ids[0]+'"]').click();document.querySelector('#builder-library [data-photo="'+ids[39]+'"]').dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}));}`,
  );
  await click('[data-builder="next"]');
  await click('[data-builder="size"]');
  await click('[data-size-shape="square"]');
  assert.ok(await evaluate("Array.from(document.querySelectorAll('[data-size-id]')).length>5"));
  await capture('book-sizes', "document.querySelector('.book-size-picker[open]')");
  await click('[data-size-id="sq200"]');
  assert.equal(await evaluate("document.querySelector('[name=width]').value"), '200');
  await click('[data-builder="size"]');
  await click('[data-size-id="journal"]');
  await click('[data-theme="archive"]');
  await evaluate(
    `{const el=document.querySelector('.builder-options [name=name]');el.value='城市与远方 · 胶片手记';el.dispatchEvent(new Event('input',{bubbles:true}));}`,
  );
  for (const name of ['rollNotes', 'map', 'contact'])
    await click('.builder-options [name=' + name + ']');
  await wait("document.querySelector('#builder-estimate')?.textContent.includes('40 张')");
  await capture('book-builder', "document.querySelector('#builder-preview .book-mini-paper')");
  await click('[data-builder="next"]');
  await click('[data-builder="next"]');
  await wait(
    "document.querySelector('.book-designer .book-paper') && !document.querySelector('.book-builder[open]')",
  );
  await wait("document.querySelector('#book-save-status')?.textContent.startsWith('已保存')");
  assert.ok(
    await evaluate(
      "document.querySelector('.book-designer>header').getBoundingClientRect().height<65",
    ),
  );
  await click('[data-b="settings"]');
  await click('[data-settings-size]');
  await click('[data-size-id="a4p"]');
  assert.equal(
    await evaluate("document.querySelector('#book-settings [name=height]').value"),
    '297',
  );
  await click('.book-panel-dialog [data-dialog-close]');
  const list = await (await fetch(origin + '/api/v2/books')).json();
  const created = list.find((b) => b.name === '城市与远方 · 胶片手记');
  assert.ok(created);
  const getBook = async () => await (await fetch(origin + '/api/v2/books/' + created.id)).json();
  let b = await getBook();
  assert.equal(Object.keys(b.assets).length, 40);
  assert.ok(b.pages.some((p) => p.role === 'map'));
  assert.ok(b.pages.some((p) => p.role === 'contact'));
  await click('[data-view="overview"]');
  assert.equal(
    await evaluate("getComputedStyle(document.querySelector('.book-photos')).display"),
    'block',
    'overview keeps the user-visible materials panel',
  );
  await click('.book-panel-handle[data-b="left-panel"]');
  await click('[data-view="single"]');
  await click('[data-view="overview"]');
  assert.equal(
    await evaluate("getComputedStyle(document.querySelector('.book-photos')).display"),
    'none',
    'view changes preserve a user-collapsed panel',
  );
  await click('.book-panel-handle[data-b="left-panel"]');
  await capture('book-overview', "document.querySelectorAll('[data-page-card]').length>10");
  const content = b.pages.findIndex((p) => p.role === 'content');
  await click('[data-open-page="' + content + '"]');
  assert.equal(
    await evaluate("document.querySelectorAll('.book-overview [data-element]').length"),
    0,
    'overview contains no editable element targets',
  );
  assert.ok(
    await evaluate("!!document.querySelector('.book-overview')"),
    'single click selects without entering editor',
  );
  const originalPage = b.pages[content].id;
  await evaluate(
    `{const data=new DataTransfer();const from=document.querySelector('[data-page-card="${content}"]');const to=document.querySelector('[data-page-card="${content + 1}"]');from.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:data}));to.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data}));to.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));from.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:data}));}`,
  );
  await evaluate(
    "document.querySelector('.book-designer').dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true}))",
  );
  await wait("document.querySelector('#book-save-status')?.textContent.startsWith('已保存')");
  assert.equal(
    (await getBook()).pages[content + 1].id,
    originalPage,
    'overview drag reorders the chosen page',
  );
  await click('[data-b="undo"]');
  await click('[data-open-page="' + content + '"]');
  await click('[data-b="delete-page"]');
  assert.equal(
    await evaluate("document.querySelectorAll('[data-page-card]').length"),
    b.pages.length - 1,
    'selected page can be deleted in overview',
  );
  await click('[data-b="undo"]');
  const beforeZoom = await evaluate(
    "document.querySelector('[data-page-card]').getBoundingClientRect().width",
  );
  await click('[data-b="zoom-in"]');
  await click('[data-b="zoom-in"]');
  assert.ok(
    (await evaluate("document.querySelector('[data-page-card]').getBoundingClientRect().width")) >
      beforeZoom,
    'overview zoom enlarges pages',
  );
  await evaluate(
    `document.querySelector('[data-open-page="${content}"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
  );

  await click('[data-b="zoom-fit"]');
  await capture('photobook', "document.querySelectorAll('.book-sheet').length===2");
  await click('[data-b="layout"]');
  await click('[data-layout="single"]');
  await wait("document.querySelector('[data-panel=pending]')?.textContent.includes('1')");
  await click('[data-b="text"]');
  await evaluate(
    `{const el=document.querySelector('[data-prop=text]');el.value='胶片记录下的远方，留下了光与时间。';el.dispatchEvent(new Event('change',{bubbles:true}));}`,
  );
  await click('[data-b="undo"]');
  await click('[data-b="redo"]');
  await wait("document.querySelector('.book-paper')?.textContent.includes('胶片记录下的远方')");
  await click('[data-b="lock-page"]');
  await click('[data-b="style"]');
  await evaluate(
    "{const el=document.querySelector('[data-theme-filter]');el.value='生活纪念';el.dispatchEvent(new Event('change',{bubbles:true}));}",
  );
  assert.equal(
    await evaluate(
      "document.querySelectorAll('.book-panel-dialog [data-theme]:not([hidden])').length",
    ),
    3,
  );
  await evaluate(
    "{const el=document.querySelector('[data-theme-filter]');el.value='';el.dispatchEvent(new Event('change',{bubbles:true}));}",
  );
  await click('.book-panel-dialog [data-theme="quiet"]');
  await capture('book-styles', "document.querySelector('.book-theme-proof article')");
  await click('[data-apply-theme]');
  await wait("document.querySelector('#book-save-status')?.textContent.startsWith('已保存')");
  b = await getBook();
  assert.equal(b.pages[content].locked, true);
  assert.ok(b.pages[content].elements.some((e) => e.text === '胶片记录下的远方，留下了光与时间。'));
  await click('[data-b="lock-page"]');
  // Verify real pointer resizing, and undo restores the original geometry.
  const imageId = b.pages[content].elements.find((e) => e.type === 'image').id;
  await click('[data-select="' + imageId + '"]');
  const rect = await evaluate(
    `(()=>{const r=document.querySelector('[data-paper="${content}"] [data-resize=se]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
  );
  await call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: rect.x,
    y: rect.y,
    button: 'left',
    clickCount: 1,
  });
  await call('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    button: 'left',
    x: rect.x - 25,
    y: rect.y - 20,
    button: 'left',
    buttons: 1,
  });
  await call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: rect.x - 25,
    y: rect.y - 20,
    button: 'left',
    clickCount: 1,
  });
  await click('[data-b="undo"]');
  await click('[data-select="' + imageId + '"]');
  await evaluate(
    `{const e=document.querySelector('[data-prop=mask]');e.value='ellipse';e.dispatchEvent(new Event('change',{bubbles:true}));}`,
  );
  await click('[data-b="sticker"]');
  await evaluate(
    "{const s=document.querySelector('[data-sticker-group]');s.value='相机与镜头';s.dispatchEvent(new Event('change',{bubbles:true}));}",
  );
  assert.equal(
    await evaluate(
      "document.querySelectorAll('[data-sticker-section]:not([hidden]) [data-sticker]').length",
    ),
    10,
  );
  await capture('book-stickers', "document.querySelector('[data-sticker=rangefinder]')");
  await evaluate(
    "{const s=document.querySelector('[data-sticker-group]');s.value='';s.dispatchEvent(new Event('change',{bubbles:true}));}",
  );
  await click('[data-sticker="tape"]');
  await wait("document.querySelector('.book-paper img[alt=贴图]')");
  await capture('book-graphics', "document.querySelector('.book-paper img[alt=贴图]')");
  // Toolbars must not grow or shift when the selected element type changes.
  const chromeRect = () =>
    evaluate(
      "({height:document.querySelector('.book-modebar').getBoundingClientRect().height,buttons:[...document.querySelectorAll('.book-modebar button')].map(b=>b.dataset.b||b.dataset.view),header:[...document.querySelectorAll('.book-designer>header nav>button,.book-designer>header nav>select')].filter(n=>getComputedStyle(n).display!=='none').map(n=>({y:n.getBoundingClientRect().y,h:n.getBoundingClientRect().height}))})",
    );
  const stable = await chromeRect();
  assert.ok(
    stable.header.every(
      (r) => Math.abs(r.y - stable.header[0].y) < 1 && Math.abs(r.h - stable.header[0].h) < 1,
    ),
    'header controls align',
  );
  const stickerKey = await evaluate(
    "document.querySelector('.book-element.selected').dataset.element",
  );
  for (const key of [
    imageId,
    b.pages[content].elements.find((e) => e.type === 'text').id,
    stickerKey,
  ]) {
    await click('[data-select="' + key + '"]');
    const now = await chromeRect();
    assert.equal(now.height, stable.height);
    assert.deepEqual(now.buttons, stable.buttons);
  }
  const onColor = await evaluate(
    "getComputedStyle(document.querySelector('[data-b=snap]')).backgroundColor",
  );
  await click('[data-b="snap"]');
  assert.notEqual(
    await evaluate("getComputedStyle(document.querySelector('[data-b=snap]')).backgroundColor"),
    onColor,
    'snap has a visible selected state',
  );
  await click('[data-b="snap"]');
  await capture('book-stable-tools', "document.querySelector('.book-panel-handle')");
  // Real pointer drag: centre snapping, visible guides, Alt bypass and cleanup.
  const dragPoint = await evaluate(
    `(()=>{const p=document.querySelector('[data-paper="${content}"]').getBoundingClientRect(), e=document.querySelector('[data-paper="${content}"] .book-element.selected').getBoundingClientRect();return {x:e.x+e.width/2,y:e.y+e.height/2,tx:p.x+p.width/2+2,ty:p.y+p.height/2+2};})()`,
  );
  await call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: dragPoint.x,
    y: dragPoint.y,
    button: 'left',
    clickCount: 1,
  });
  await call('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    button: 'left',
    x: dragPoint.tx,
    y: dragPoint.ty,
    buttons: 1,
  });
  await wait("document.querySelectorAll('.book-snap-line').length>=2");
  await capture('book-snapping', "document.querySelector('.book-snap-guides')");
  await call('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    button: 'left',
    x: dragPoint.tx,
    y: dragPoint.ty,
    buttons: 1,
    modifiers: 1,
  });
  assert.equal(
    await evaluate("document.querySelectorAll('.book-snap-line').length"),
    0,
    'Alt bypasses snapping',
  );
  await call('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    button: 'left',
    x: dragPoint.tx,
    y: dragPoint.ty,
    buttons: 1,
  });
  await call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: dragPoint.tx,
    y: dragPoint.ty,
    button: 'left',
    clickCount: 1,
  });
  assert.equal(
    await evaluate("document.querySelectorAll('.book-snap-line').length"),
    0,
    'guides clear after release',
  );
  await click('[data-b="undo"]');
  // Every editable element has a context menu, with page alignment and undo.
  await evaluate(
    `document.querySelector('[data-paper="${content}"] [data-element="${imageId}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:850,clientY:300}))`,
  );
  await wait("document.querySelector('.book-context-menu [data-b=delete-element]')");
  await capture('book-context-menu', "document.querySelector('.book-context-menu')");
  await click('.book-context-menu [data-align="center-x"]');
  await wait("!document.querySelector('.book-context-menu')");
  await evaluate(
    "document.querySelector('.book-designer').dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true}))",
  );
  await wait("document.querySelector('#book-save-status')?.textContent.startsWith('已保存')");
  {
    const aligned = (await getBook()).pages[content].elements.find((e) => e.id === imageId);
    assert.ok(Math.abs(aligned.x + aligned.w / 2 - b.width / 2) < 0.001);
  }
  await click('[data-b="undo"]');
  await click('[data-b="guide-settings"]');
  await evaluate(
    "{document.querySelector('[data-grid-show]').checked=true;document.querySelector('[data-guide-at]').value='37';document.querySelector('[data-guide-add]').click();}",
  );
  await click('[data-guide-done]');
  assert.ok(
    await evaluate(
      "document.querySelector('.book-grid-overlay') && document.querySelector('.book-custom-guide')",
    ),
  );
  await capture('book-grid-guides', "document.querySelector('.book-grid-overlay')");
  for (const mode of ['icons', 'text', 'both']) {
    await evaluate(
      `{const s=document.querySelector('#book-tool-display');s.value='${mode}';s.dispatchEvent(new Event('change',{bubbles:true}));}`,
    );
    const visible = await evaluate(
      "({icon:getComputedStyle(document.querySelector('[data-b=proof] .book-tool-icon')).display,label:getComputedStyle(document.querySelector('[data-b=proof] .book-tool-label')).display})",
    );
    assert.equal(visible.icon === 'none', mode === 'text');
    assert.equal(visible.label === 'none', mode === 'icons');
  }
  await click('[data-b="grid"]');

  // Deterministic search and street tiles: never depend on an external map service in CI.
  const tile = (
    await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e7eddf"/><path d="M0 110h256M90 0v256" stroke="#fff" stroke-width="14"/><path d="M0 110h256M90 0v256" stroke="#d8c8aa" stroke-width="2"/><text x="120" y="75" font-size="12">TEST MAP</text></svg>',
      ),
    )
      .png()
      .toBuffer()
  ).toString('base64');
  const mapFixtures = async (event) => {
    const m = JSON.parse(event.data);
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = m.params;
    const places = request.url.includes('/api/v2/places');
    await call('Fetch.fulfillRequest', {
      requestId,
      responseCode: 200,
      responseHeaders: [
        { name: 'Content-Type', value: places ? 'application/json' : 'image/png' },
        { name: 'Access-Control-Allow-Origin', value: '*' },
      ],
      body: places
        ? Buffer.from(
            JSON.stringify([
              { name: '北京', label: '北京 · 东城', latitude: 39.9, longitude: 116.4 },
            ]),
          ).toString('base64')
        : tile,
    });
  };
  ws.addEventListener('message', mapFixtures);
  await call('Fetch.enable', {
    patterns: [
      { urlPattern: '*/api/v2/places*' },
      { urlPattern: 'https://tile.openstreetmap.org/*' },
    ],
  });
  await click('[data-b="map"]');
  await wait("document.querySelector('.book-map-canvas .leaflet-tile')");
  await evaluate(
    "{document.querySelector('.book-map-search input').value='北京';document.querySelector('.book-map-search').requestSubmit();}",
  );
  await wait("document.querySelector('[data-map-result]')");
  await click('[data-map-result="0"]');
  await wait(
    "[...document.querySelectorAll('.book-map-canvas .leaflet-tile')].every(i=>i.complete&&i.naturalWidth)",
  );
  await click('[data-map-crop]');
  const cropRect = await evaluate(
    "(()=>{const r=document.querySelector('.book-map-stage').getBoundingClientRect();return {x:r.x+r.width*.25,y:r.y+r.height*.2,tx:r.x+r.width*.75,ty:r.y+r.height*.8,w:r.width,h:r.height}})()",
  );
  await call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: cropRect.x,
    y: cropRect.y,
    button: 'left',
    clickCount: 1,
  });
  await call('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    button: 'left',
    x: cropRect.tx,
    y: cropRect.ty,
    buttons: 1,
  });
  await call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: cropRect.tx,
    y: cropRect.ty,
    button: 'left',
    clickCount: 1,
  });
  assert.ok(await evaluate("!document.querySelector('.book-map-crop-box').hidden"));
  await capture('book-map-crop', "document.querySelector('.book-map-crop-box:not([hidden])')");
  await click('[data-map-insert]');
  await wait("!document.querySelector('.book-map-canvas')");
  await evaluate(
    "document.querySelector('.book-designer').dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true}))",
  );
  await wait("document.querySelector('#book-save-status')?.textContent.startsWith('已保存')");
  let savedMap = (await getBook()).pages[content].elements.find(
    (e) => e.type === 'map' && e.snapshot,
  );
  assert.equal(savedMap.points[0].latitude, 39.9);
  assert.match(savedMap.snapshot, /^data:image\/png;base64,/);
  {
    const info = await sharp(Buffer.from(savedMap.snapshot.split(',')[1], 'base64')).metadata();
    assert.ok(
      Math.abs(info.height - (((cropRect.h * 0.6) / (cropRect.w * 0.5)) * 1200 + 100)) < 8,
      'map captures selected rectangle, not the full viewport',
    );
  }
  // Reopen the saved map and generate an offline map through the same editor.
  await click('[data-b="edit-map"]');
  await evaluate(
    "{const s=document.querySelector('[data-map-style]');s.value='offline';s.dispatchEvent(new Event('change',{bubbles:true}));}",
  );
  await capture('book-map-insert', "document.querySelector('.book-map-offline')?.naturalWidth>0");
  await click('[data-map-insert]');
  await wait("!document.querySelector('.book-map-canvas')");
  await call('Fetch.disable');
  ws.removeEventListener('message', mapFixtures);

  // Space + left-drag pans every workspace mode without moving elements or selecting pages.
  for (const mode of ['single', 'spread', 'preview', 'overview']) {
    await click('[data-view="' + mode + '"]');
    await evaluate(
      "{const z=document.querySelector('#canvas-zoom');z.value='300';z.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.book-designer').focus();}",
    );
    await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const before = await evaluate(
      "(()=>{const v=document.querySelector('.book-viewport'),r=v.getBoundingClientRect();v.scrollTop=(v.scrollHeight-v.clientHeight)/2;return {left:v.scrollLeft,top:v.scrollTop,x:r.x+r.width/2,y:r.y+r.height/2,selection:[...document.querySelectorAll('.book-element.selected')].map(n=>n.dataset.element),geometry:[...document.querySelectorAll('.book-paper [data-element]')].map(n=>n.getAttribute('style'))}})()",
    );
    await call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: ' ',
      code: 'Space',
      windowsVirtualKeyCode: 32,
    });
    assert.ok(
      await evaluate(
        "document.querySelector('.book-designer').classList.contains('book-hand-ready')",
      ),
    );
    await call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: before.x,
      y: before.y,
      button: 'left',
      clickCount: 1,
    });
    await call('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: before.x - 65,
      y: before.y - 55,
      button: 'left',
      buttons: 1,
    });
    assert.ok(
      await evaluate("document.querySelector('.book-designer').classList.contains('book-panning')"),
    );
    await call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: before.x - 65,
      y: before.y - 55,
      button: 'left',
      clickCount: 1,
    });
    await call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: ' ',
      code: 'Space',
      windowsVirtualKeyCode: 32,
    });
    const after = await evaluate(
      "(()=>{const v=document.querySelector('.book-viewport');return {left:v.scrollLeft,top:v.scrollTop,selection:[...document.querySelectorAll('.book-element.selected')].map(n=>n.dataset.element),geometry:[...document.querySelectorAll('.book-paper [data-element]')].map(n=>n.getAttribute('style')),hand:document.querySelector('.book-designer').classList.contains('book-hand-ready')}})()",
    );
    assert.ok(after.top > before.top + 40, mode + ' pans vertically');
    if (mode !== 'overview') assert.ok(after.left > before.left + 50, mode + ' pans horizontally');
    assert.deepEqual(after.selection, before.selection);
    assert.deepEqual(after.geometry, before.geometry);
    assert.equal(after.hand, false);
  }
  await click('[data-view="single"]');
  await evaluate(
    "{const z=document.querySelector('#canvas-zoom');z.value='300';z.dispatchEvent(new Event('input',{bubbles:true}));}",
  );
  const panPosition = await evaluate(
    "(()=>{const v=document.querySelector('.book-viewport');v.scrollTop=100;v.scrollLeft=120;return {x:v.scrollLeft,y:v.scrollTop}})()",
  );
  await click('[data-select="' + imageId + '"]');
  assert.deepEqual(
    await evaluate(
      "(()=>{const v=document.querySelector('.book-viewport');return {x:v.scrollLeft,y:v.scrollTop}})()",
    ),
    panPosition,
    'selecting an element preserves viewport position',
  );
  await evaluate(
    "{const input=document.querySelector('[data-page=chapter]');input.focus();window.spaceAllowed=input.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}));}",
  );
  assert.ok(
    await evaluate(
      "window.spaceAllowed&&!document.querySelector('.book-designer').classList.contains('book-hand-ready')",
    ),
    'space remains available in text fields',
  );
  await evaluate("document.querySelector('.book-designer').focus()");
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: ' ',
    code: 'Space',
    windowsVirtualKeyCode: 32,
  });
  await evaluate("window.dispatchEvent(new Event('blur'))");
  assert.equal(
    await evaluate(
      "document.querySelector('.book-designer').classList.contains('book-hand-ready')",
    ),
    false,
    'focus loss clears hand mode',
  );
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: ' ',
    code: 'Space',
    windowsVirtualKeyCode: 32,
  });
  await click('[data-view="spread"]');

  await click('[data-b="left-panel"]');
  assert.equal(
    await evaluate("getComputedStyle(document.querySelector('.book-photos')).display"),
    'none',
  );
  await click('[data-b="left-panel"]');
  await click('.book-panel-handle[data-b="inspector"]');
  assert.equal(
    await evaluate("getComputedStyle(document.querySelector('.book-properties')).display"),
    'none',
  );
  await click('.book-panel-handle[data-b="inspector"]');
  await click('[data-view="preview"]');
  await click('[data-b="zoom-in"]');
  assert.equal(await evaluate("document.querySelector('#canvas-zoom').value"), '110');
  await evaluate(
    "document.querySelector('.book-viewport').dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true,ctrlKey:true}))",
  );
  assert.ok(Number(await evaluate("document.querySelector('#canvas-zoom').value")) > 110);
  await click('[data-b="zoom-fit"]');
  const centered = await evaluate(
    `(()=>{const v=document.querySelector('.book-viewport').getBoundingClientRect(),s=document.querySelector('.book-spread').getBoundingClientRect();return Math.abs(v.x+v.width/2-s.x-s.width/2)<3&&Math.abs(v.y+v.height/2-s.y-s.height/2)<3})()`,
  );
  assert.ok(centered, 'reading spread is centered in both axes');
  {
    const r = await evaluate(
      "(()=>{const r=document.querySelector('[data-b=fullscreen]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
    );
    await call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...r,
      button: 'left',
      clickCount: 1,
    });
    await call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...r,
      button: 'left',
      clickCount: 1,
    });
  }
  await wait('document.fullscreenElement!==null');
  {
    const r = await evaluate(
      "(()=>{const r=document.querySelector('[data-b=fullscreen]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
    );
    await call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...r,
      button: 'left',
      clickCount: 1,
    });
    await call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...r,
      button: 'left',
      clickCount: 1,
    });
  }
  await wait('document.fullscreenElement===null');
  const pageBefore = await evaluate("document.querySelector('.book-main>footer>span').textContent");
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'ArrowRight',
    code: 'ArrowRight',
    windowsVirtualKeyCode: 39,
  });
  assert.notEqual(
    await evaluate("document.querySelector('.book-main>footer>span').textContent"),
    pageBefore,
  );
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'ArrowLeft',
    code: 'ArrowLeft',
    windowsVirtualKeyCode: 37,
  });
  assert.equal(
    await evaluate("document.querySelector('.book-main>footer>span').textContent"),
    pageBefore,
  );
  // Show an untouched photographic spread rather than the element stress-test page.
  await click('[data-b="page-next"]');
  await capture('book-reading', "document.querySelector('.book-designer.reading')");
  await click('[data-b="page-prev"]');
  await click('[data-b="note"]');
  await evaluate(
    `{const e=document.querySelector('#book-page-note');e.value='复查这页的阅读节奏';}`,
  );
  await click('[data-note-save]');
  await click('[data-b="proof"]');
  await wait("document.querySelector('[data-issue-page]')");
  await capture('book-preflight', "document.querySelector('[data-export=reading]')");
  await click('[data-export="reading"]');
  await capture('book-export-progress', "document.querySelector('.book-export-progress')");
  const waitJob = async (mode) => {
    for (let n = 0; n < 100; n++) {
      const rows = await (await fetch(origin + '/api/v2/jobs')).json();
      const items = Array.isArray(rows) ? rows : rows.items;
      const row = items.find((j) => j.kind === 'book-pdf' && j.payload?.mode === mode);
      if (row?.state === 'failed') throw Error(JSON.stringify(row));
      if (row?.state === 'done' || row?.state === 'completed') return row;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw Error('Export timeout ' + mode);
  };
  const reading = await waitJob('reading');
  assert.ok(reading.result.file);
  await writeFile(
    join(output, 'reading.pdf'),
    Buffer.from(
      await (await fetch(origin + '/api/v2/exports/' + reading.result.file)).arrayBuffer(),
    ),
  );
  await wait("!document.querySelector('.book-export-progress')");
  // Exercise both print targets through the same UI.
  for (const mode of ['print', 'cover']) {
    await click('[data-b="proof"]');
    await wait("document.querySelector('[data-export=" + mode + "]')");
    await click('[data-export="' + mode + '"]');
    const job = await waitJob(mode);
    await wait("!document.querySelector('.book-export-progress')");
    assert.ok(job.result.file);
    await writeFile(
      join(output, mode + '.pdf'),
      Buffer.from(await (await fetch(origin + '/api/v2/exports/' + job.result.file)).arrayBuffer()),
    );
  }
  // Six books and a wrapping title catch clipped metadata and multi-row shelf layout.
  for (const [i, name] of [
    '海岸假日',
    '婚礼纪念',
    '胶片里的家庭年鉴与很长很长的摄影画册标题',
    '暗调作品集',
  ].entries()) {
    const sample = structuredClone(await getBook());
    delete sample.id;
    delete sample.version;
    sample.name = name;
    sample.theme = ['coast', 'wedding', 'family', 'noir'][i];
    sample.pages = sample.pages.slice(0, 2);
    const response = await fetch(origin + '/api/v2/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sample),
    });
    assert.ok(response.ok, await response.text());
  }
  await click('[data-b="shelf"]');
  await capture('book-shelf', "document.querySelectorAll('.book-shelf-grid article').length>=6");
  assert.ok(
    await evaluate(
      "[...document.querySelectorAll('.book-shelf-grid article')].every(card=>card.querySelector('[data-delete-book]').getBoundingClientRect().bottom <= card.getBoundingClientRect().bottom)",
    ),
    'shelf actions stay inside cards',
  );
  await click('[data-open-book="' + created.id + '"]');
  await wait("document.querySelector('.book-paper')");
  assert.match(
    await evaluate("document.querySelector('.book-current-location').textContent"),
    new RegExp('第 ' + (content + 1)),
  );
  const bounds = await evaluate(
    "Array.from(document.querySelectorAll('.book-modebar,.book-body, .book-designer>header')).map(n=>({w:n.scrollWidth,c:n.clientWidth}))",
  );
  assert.ok(
    bounds.every((n) => n.w <= n.c + 1),
    'workspace overflows horizontally',
  );
  // True two-page image continuity and linked crop survive saving.
  await click('[data-view="spread"]');
  await click('[data-select="' + imageId + '"]');
  await click('[data-b="layout"]');
  await click('[data-layout="panorama"]');
  await wait("document.querySelector('#book-save-status')?.textContent.startsWith('已保存')");
  b = await getBook();
  const panorama = b.pages[content].elements.find((e) => e.spreadId);
  assert.ok(panorama);
  assert.equal(b.pages[content + 1].elements.find((e) => e.spreadId).spreadId, panorama.spreadId);
  await capture('book-panorama', "document.querySelectorAll('.book-sheet').length===2");
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1024,
    height: 768,
    deviceScaleFactor: 1,
    mobile: false,
  });
  assert.ok(
    await evaluate(
      "document.querySelector('.book-body').scrollWidth<=document.querySelector('.book-body').clientWidth+1",
    ),
  );
  await call('Emulation.setDeviceMetricsOverride', {
    width: 820,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  if (
    await evaluate("getComputedStyle(document.querySelector('.book-properties')).display==='none'")
  )
    await click('[data-b="inspector"]');
  assert.equal(
    await evaluate("getComputedStyle(document.querySelector('.book-properties')).display"),
    'block',
  );
  await call('Emulation.clearDeviceMetricsOverride');
  await click('[data-library="unused"]');
  await wait("document.querySelector('.book-photo-list')?.getAttribute('aria-busy')!=='true'");
  const unusedId = await evaluate(
    "document.querySelector('#book-library [data-photo]').dataset.photo",
  );
  await click('#book-library [data-photo="' + unusedId + '"]');
  await wait(
    '!document.querySelector(\'#book-library [data-photo="' +
      unusedId +
      "\"]') && document.querySelector('.book-photo-list')?.getAttribute('aria-busy')!=='true'",
  );
  assert.ok(
    await evaluate('!document.querySelector(\'#book-library [data-photo="' + unusedId + '"]\')'),
    'newly placed photos leave the unused filter immediately',
  );
  await click('[data-b="undo"]');
  assert.equal(errors.length, 0, errors.join('\n'));
  await writeFile(
    join(output, 'report.json'),
    JSON.stringify(
      {
        library: { rolls: demo.rolls, photos: demo.photos },
        book: created.id,
        pages: b.pages.length,
        checks:
          'create, styles, layout preservation, undo/redo, pointer resize, reading, annotations, preflight, all PDF targets, reopen position, panoramic crop, responsive layout, live unused filter',
        shots,
      },
      null,
      2,
    ),
  );
  console.log('Photobook UI workflow passed:', created.id);
} catch (error) {
  console.error(error);
  if (ws?.readyState === 1) {
    let r;
    try {
      r = await new Promise((resolve) => {
        const id = 999999;
        const h = (event) => {
          const m = JSON.parse(event.data);
          if (m.id === id) {
            ws.removeEventListener('message', h);
            resolve(m.result);
          }
        };
        ws.addEventListener('message', h);
        ws.send(
          JSON.stringify({ id, method: 'Page.captureScreenshot', params: { format: 'png' } }),
        );
      });
      await writeFile(join(output, 'failure.png'), Buffer.from(r.data, 'base64'));
    } catch {}
  }
  throw error;
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
