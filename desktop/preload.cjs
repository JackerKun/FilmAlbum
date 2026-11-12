const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld(
  'filmAlbumDesktop',
  Object.freeze({
    saveFile: (request) =>
      ipcRenderer.invoke('filmalbum:save-file', { url: request?.url, filename: request?.filename }),
    revealFile: (path) => ipcRenderer.invoke('filmalbum:reveal-file', path),
    chooseDirectory: () => ipcRenderer.invoke('filmalbum:choose-directory'),
    checkForUpdate: () => ipcRenderer.invoke('filmalbum:check-for-update'),
  }),
);
