const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  shell,
  session,
  net,
  utilityProcess,
  ipcMain,
} = require('electron');
const { join, resolve } = require('node:path');
const {
  mkdirSync,
  appendFileSync,
  existsSync,
  statSync,
  renameSync,
  writeFileSync,
} = require('node:fs');
const { randomBytes } = require('node:crypto');
const { checkForUpdate, releasesUrl } = require('./update-check.cjs');
app.setName('Film Album');
// Isolated smoke-test profiles and normal library sessions need separate locks.
const userData = process.env.FILMALBUM_DESKTOP_DATA_DIR
  ? resolve(process.env.FILMALBUM_DESKTOP_DATA_DIR)
  : app.getPath('userData');
app.setPath('userData', userData);
app.setPath('sessionData', join(userData, 'session'));
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let window,
    backend,
    fileService,
    origin = '',
    token = '',
    readyPromise,
    pendingUpdateCheck,
    manualUpdateOpen = false,
    quittingRequested = false,
    quitAllowed = false,
    stopping = false;
  const root = resolve(__dirname, '..'),
    data = join(userData, 'library'),
    log = join(userData, 'logs', 'desktop.log');
  mkdirSync(join(userData, 'logs'), { recursive: true });
  function logMessage(text) {
    try {
      if (existsSync(log) && statSync(log).size > 5 * 1024 * 1024)
        renameSync(log, log + '.previous');
      appendFileSync(log, new Date().toISOString() + ' ' + String(text) + '\n');
    } catch {}
  }
  function allowedExternal(url) {
    try {
      return ['http:', 'https:'].includes(new URL(url).protocol);
    } catch {
      return false;
    }
  }
  async function call(path, body) {
    await readyPromise;
    const response = await fetch(origin + '/api/v2' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'X-FilmAlbum-Token': token, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || '操作失败');
    return result;
  }
  function trustedSender(event) {
    return (
      window &&
      !window.isDestroyed() &&
      event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame &&
      origin &&
      new URL(event.senderFrame.url).origin === origin
    );
  }
  async function installFileBridge() {
    const { createFileService } = await import('./file-service.mjs');
    fileService = createFileService({
      getOrigin: () => origin,
      getToken: () => token,
      chooseDestination: async (filename) => {
        if (process.env.FILMALBUM_DESKTOP_SMOKE === '1') {
          const dir = join(userData, 'smoke-downloads');
          mkdirSync(dir, { recursive: true });
          return join(dir, filename);
        }
        const result = await dialog.showSaveDialog(window, {
          title: '保存文件',
          defaultPath: join(app.getPath('downloads'), filename),
          properties: ['createDirectory', 'showOverwriteConfirmation'],
        });
        return result.canceled ? null : result.filePath;
      },
    });
    ipcMain.handle('filmalbum:save-file', async (event, request) => {
      if (!trustedSender(event)) throw Error('无效的文件保存来源');
      try {
        return await fileService.saveFile(request);
      } catch (error) {
        logMessage('Save failed: ' + error.message);
        return { status: 'error', message: error.message };
      }
    });
    ipcMain.handle('filmalbum:reveal-file', (event, path) => {
      if (!trustedSender(event) || !fileService.canReveal(path))
        throw Error('只能显示本次已保存的文件');
      shell.showItemInFolder(path);
      return true;
    });
    ipcMain.handle('filmalbum:choose-directory', async (event) => {
      if (!trustedSender(event)) throw Error('无效的目录选择来源');
      const result = await dialog.showOpenDialog(window, {
        title: '选择原片所在文件夹',
        properties: ['openDirectory'],
      });
      return result.canceled ? null : result.filePaths[0];
    });
  }
  async function openLibrary() {
    try {
      const choice = await dialog.showOpenDialog(window, {
        title: '打开 Film Album 资料库',
        properties: ['openDirectory'],
      });
      if (choice.canceled) return;
      await call('/switch', { root: choice.filePaths[0] });
      await window.loadURL(origin);
    } catch (error) {
      dialog.showErrorBox('无法打开资料库', error.message);
    }
  }
  async function revealLibrary() {
    try {
      const boot = await call('/bootstrap');
      shell.showItemInFolder(join(boot.root, 'catalog.sqlite'));
    } catch (error) {
      dialog.showErrorBox('无法打开文件夹', error.message);
    }
  }
  function requestUpdateCheck() {
    pendingUpdateCheck ??= checkForUpdate(app.getVersion(), (url, options) =>
      net.fetch(url, options),
    ).finally(() => {
      pendingUpdateCheck = null;
    });
    return pendingUpdateCheck;
  }
  function openReleasePage(url = releasesUrl) {
    return shell.openExternal(url).catch((error) => {
      dialog.showErrorBox('无法打开 GitHub 发布页', error.message);
    });
  }
  async function showUpdateCheck() {
    if (manualUpdateOpen) return;
    manualUpdateOpen = true;
    try {
      const update = await requestUpdateCheck();
      const available = update.status === 'available';
      const options = {
        type: update.status === 'unavailable' ? 'warning' : 'info',
        title: '检查更新',
        message: {
          available: `发现新版本 v${update.version}`,
          current: '当前已是最新正式版本',
          unavailable: '暂时无法检查更新',
        }[update.status],
        detail: `当前版本 v${app.getVersion()}`,
        buttons: available ? ['去下载', '关闭'] : ['关闭'],
        defaultId: available ? 1 : 0,
        cancelId: available ? 1 : 0,
      };
      const { response } = await (window
        ? dialog.showMessageBox(window, options)
        : dialog.showMessageBox(options));
      if (available && response === 0) await openReleasePage(update.url);
    } finally {
      manualUpdateOpen = false;
    }
  }
  function menu() {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        ...(process.platform === 'darwin'
          ? [
              {
                label: app.name,
                submenu: [
                  { role: 'about' },
                  { type: 'separator' },
                  { role: 'hide' },
                  { role: 'hideOthers' },
                  { role: 'unhide' },
                  { type: 'separator' },
                  { role: 'quit' },
                ],
              },
            ]
          : []),
        {
          label: '文件 / File',
          submenu: [
            {
              label: '打开资料库… / Open library…',
              accelerator: 'CmdOrCtrl+O',
              click: openLibrary,
            },
            { label: '在文件管理器中显示资料库', click: revealLibrary },
            { label: '打开日志文件夹', click: () => shell.showItemInFolder(log) },
            { type: 'separator' },
            process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
          ],
        },
        {
          label: '编辑 / Edit',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' },
          ],
        },
        {
          label: '视图 / View',
          submenu: [
            { role: 'reload' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { role: 'togglefullscreen' },
            ...(process.argv.includes('--dev') ? [{ role: 'toggleDevTools' }] : []),
          ],
        },
        { role: 'windowMenu' },
        {
          label: '帮助 / Help',
          submenu: [
            { label: '检查更新… / Check for Updates…', click: showUpdateCheck },
            { label: '打开 GitHub 发布页 / GitHub Releases', click: () => openReleasePage() },
            { type: 'separator' },
            {
              label: '关于 Film Album',
              click: () =>
                dialog.showMessageBox(window, {
                  type: 'info',
                  title: 'Film Album',
                  message: 'Film Album ' + app.getVersion(),
                  detail:
                    '本地胶片档案与画册工作台\n原片保存在你的设备。\n' +
                    (process.platform === 'darwin'
                      ? 'macOS 原生影像引擎'
                      : '跨平台影像 / 中文 OCR 引擎'),
                }),
            },
          ],
        },
      ]),
    );
  }
  async function startBackend() {
    token = randomBytes(32).toString('hex');
    const nativeBinary = app.isPackaged
      ? join(process.resourcesPath, 'native', 'filmalbum-native')
      : process.env.FILMALBUM_NATIVE_BINARY;
    const env = {
      ...process.env,
      PORT: '0',
      FILMALBUM_DATA_DIR: data,
      FILMALBUM_DESKTOP_TOKEN: token,
      FILMALBUM_ASSET_DIR: join(root, 'assets'),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    if (process.platform === 'darwin' && nativeBinary && existsSync(nativeBinary))
      env.FILMALBUM_NATIVE_BINARY = nativeBinary;
    else if (app.isPackaged) env.FILMALBUM_ENGINE = 'portable';
    readyPromise = new Promise((resolveReady, reject) => {
      const timeout = setTimeout(() => reject(Error('本地服务启动超时，请查看日志文件。')), 60000);
      backend = utilityProcess.fork(join(root, 'desktop', 'backend.cjs'), [], {
        cwd: root,
        env,
        stdio: 'pipe',
        serviceName: 'Film Album Library',
      });
      backend.stdout?.on('data', (data) => logMessage(data));
      backend.stderr?.on('data', (data) => logMessage(data));
      backend.once('exit', (code) => {
        clearTimeout(timeout);
        if (!origin) reject(Error('本地服务退出，代码 ' + code));
        else if (!stopping) {
          dialog.showErrorBox('Film Album 服务已停止', '请重新打开应用。日志：' + log);
          app.quit();
        }
      });
      backend.on('message', (message) => {
        if (
          message?.type === 'ready' &&
          Number.isInteger(message.port) &&
          message.port > 0 &&
          message.port <= 65535
        ) {
          clearTimeout(timeout);
          origin = 'http://127.0.0.1:' + message.port;
          resolveReady();
        }
      });
    });
    await readyPromise;
    const ses = session.fromPartition('persist:filmalbum');
    ses.webRequest.onBeforeSendHeaders({ urls: [origin + '/*'] }, (details, callback) =>
      callback({ requestHeaders: { ...details.requestHeaders, 'X-FilmAlbum-Token': token } }),
    );
    ses.setPermissionRequestHandler((contents, permission, callback) =>
      callback(
        contents.getURL().startsWith(origin + '/') &&
          ['clipboard-sanitized-write', 'fullscreen'].includes(permission),
      ),
    );
    ses.on('will-download', (event, item) => {
      item.setSaveDialogOptions({
        title: '保存导出文件',
        defaultPath: join(app.getPath('downloads'), item.getFilename()),
        properties: ['showOverwriteConfirmation'],
      });
    });
  }
  async function createWindow() {
    window = new BrowserWindow({
      width: 1440,
      height: 960,
      minWidth: 900,
      minHeight: 620,
      show: false,
      title: 'Film Album',
      backgroundColor: '#eeeee8',
      icon: join(root, 'assets', 'icons', 'icon-256.png'),
      webPreferences: {
        partition: 'persist:filmalbum',
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        spellcheck: false,
        preload: join(__dirname, 'preload.cjs'),
      },
    });
    window.once('ready-to-show', () => window?.show());
    window.on('closed', () => {
      window = null;
      if (quittingRequested) shutdownAndQuit();
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (allowedExternal(url) && new URL(url).origin !== origin) shell.openExternal(url);
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, url) => {
      if (!origin || new URL(url).origin !== origin) {
        event.preventDefault();
        if (allowedExternal(url)) shell.openExternal(url);
      }
    });
    window.webContents.on('will-attach-webview', (event) => event.preventDefault());
    window.webContents.on('will-prevent-unload', (event) => {
      const answer = dialog.showMessageBoxSync(window, {
        type: 'question',
        title: '画册尚有未保存的修改',
        message: '返回编辑并保存，还是放弃未保存的修改？',
        buttons: ['继续编辑', '放弃修改并关闭'],
        defaultId: 0,
        cancelId: 0,
      });
      if (answer === 1) event.preventDefault();
      else quittingRequested = false;
    });
    if (!origin) {
      await window.loadFile(join(__dirname, 'loading.html'));
      await startBackend();
    }
    await window.loadURL(origin);
    if (process.env.FILMALBUM_DESKTOP_SMOKE === '1') {
      const bootstrap = await call('/bootstrap'),
        preview = process.env.FILMALBUM_SMOKE_PREVIEW;
      if (preview) {
        const deadline = Date.now() + 45000;
        while (!existsSync(preview) || statSync(preview).size === 0) {
          if (Date.now() > deadline) throw Error('Renderer thumbnail did not become ready');
          await new Promise((resolveWait) => setTimeout(resolveWait, 200));
        }
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
      if (process.env.FILMALBUM_SMOKE_SCREENSHOT)
        writeFileSync(
          process.env.FILMALBUM_SMOKE_SCREENSHOT,
          (await window.webContents.capturePage()).toPNG(),
        );
      let fileChecks = {};
      if (process.env.FILMALBUM_SMOKE_MEDIA) {
        const mediaId = process.env.FILMALBUM_SMOKE_MEDIA;
        const saveInRenderer = (payload) =>
          window.webContents.executeJavaScript(
            'window.filmAlbumDesktop.saveFile(' + JSON.stringify(payload) + ')',
          );
        const original = await saveInRenderer({
          url:
            '/api/v2/media/' +
            encodeURIComponent(mediaId) +
            '?name=' +
            encodeURIComponent('桌面原片.png'),
          filename: '桌面原片.png',
        });
        if (original.status !== 'saved')
          throw Error('Native original save failed: ' + JSON.stringify(original));
        const photos = await call(
            '/photos?filter=' + encodeURIComponent(JSON.stringify({ limit: 1 })),
          ),
          photo = photos.items[0];
        const book = await call('/books', {
          name: '桌面保存验证',
          width: 148,
          height: 210,
          bleed: 3,
          safe: 8,
          pages: [
            {
              background: '#ffffff',
              elements: [
                {
                  id: 'smoke-photo',
                  type: 'image',
                  photoId: photo.id,
                  x: 8,
                  y: 8,
                  w: 132,
                  h: 132,
                  fit: 'contain',
                },
              ],
            },
          ],
        });
        const queued = await call('/jobs', {
          kind: 'book-pdf',
          bookId: book.id,
          label: 'Desktop PDF save check',
        });
        let exported;
        const deadline = Date.now() + 60000;
        while (Date.now() < deadline) {
          const current = await call('/jobs/' + queued.id);
          if (current.state === 'failed') throw Error(current.error);
          if (current.state === 'completed') {
            exported = current.result;
            break;
          }
          await new Promise((r) => setTimeout(r, 200));
        }
        if (!exported) throw Error('PDF export smoke test timed out');
        const pdf = await saveInRenderer({
          url: '/api/v2/exports/' + exported.file,
          filename: exported.filename,
        });
        if (pdf.status !== 'saved') throw Error('Native PDF save failed: ' + JSON.stringify(pdf));
        fileChecks = {
          nativeSave: true,
          originalSaved: true,
          pdfSaved: true,
          originalName: original.filename,
          pdfName: pdf.filename,
        };
      }
      logMessage(
        'SMOKE_OK ' +
          JSON.stringify({
            version: app.getVersion(),
            rolls: bootstrap.stats?.rolls,
            capabilities: bootstrap.capabilities,
          }),
      );
      if (process.env.FILMALBUM_SMOKE_REPORT)
        writeFileSync(
          process.env.FILMALBUM_SMOKE_REPORT,
          JSON.stringify({
            ok: true,
            version: app.getVersion(),
            data,
            capabilities: bootstrap.capabilities,
            ...fileChecks,
          }),
        );
      app.quit();
    }
  }
  async function shutdownAndQuit() {
    if (stopping) return;
    stopping = true;
    try {
      if (backend?.pid)
        await new Promise((resolveStop) => {
          const timeout = setTimeout(() => {
            backend?.kill();
            resolveStop();
          }, 8000);
          backend.once('exit', () => {
            clearTimeout(timeout);
            resolveStop();
          });
          backend.postMessage({ op: 'shutdown' });
        });
    } finally {
      quitAllowed = true;
      app.quit();
    }
  }
  app.on('before-quit', (event) => {
    if (quitAllowed) return;
    event.preventDefault();
    quittingRequested = true;
    if (window && !window.isDestroyed()) window.close();
    else shutdownAndQuit();
  });
  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    } else createWindow().catch(showStartupError);
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (!window) createWindow().catch(showStartupError);
  });
  function showStartupError(error) {
    logMessage(error.stack || error.message);
    dialog.showErrorBox('Film Album 无法启动', error.message + '\n日志：' + log);
    quittingRequested = true;
    if (window) window.destroy();
    else shutdownAndQuit();
  }
  app
    .whenReady()
    .then(async () => {
      const updateCheck = process.env.FILMALBUM_DESKTOP_SMOKE === '1' ? null : requestUpdateCheck();
      ipcMain.handle('filmalbum:check-for-update', async (event) => {
        if (!trustedSender(event)) return null;
        const update = await updateCheck;
        return update?.status === 'available' ? update : null;
      });
      await installFileBridge();
      app.setAppUserModelId('com.filmalbum.studio');
      menu();
      return createWindow();
    })
    .catch(showStartupError);
}
