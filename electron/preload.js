const { contextBridge, ipcRenderer, shell } = require('electron');
//lets the UI call backend functions that eventually trigger classification. security

console.log('PRELOAD LOADED');

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, data) => {
    let validChannels = ['toMain'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, func) => {
    let validChannels = ['fromMain'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  on: (channel, callback) => {
    const subscription = (event, ...args) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
  getSystemInfo: () => process.versions,
  getAppPaths: () => ipcRenderer.invoke('get-app-paths'),
  getSystemStatus: () => ipcRenderer.invoke('get-system-status'),
  setAppPaths: (paths) => ipcRenderer.invoke('set-app-paths', paths),
  selectFolder: () => {
    console.log('Preload: Invoking select-folder IPC');
    return ipcRenderer.invoke('select-folder');
  },
  selectImage: () => ipcRenderer.invoke('select-image'),
  getStats: () => ipcRenderer.invoke('get-stats'),
  getLogs: () => ipcRenderer.invoke('get-logs'),
  getDuplicates: () => ipcRenderer.invoke('get-duplicates'),
  getDuplicateStats: () => ipcRenderer.invoke('get-duplicate-stats'),
  deleteDuplicate: (id) => ipcRenderer.invoke('delete-duplicate', id),
  keepBothDuplicate: (id) => ipcRenderer.invoke('keep-both-duplicate', id),
  searchScreenshots: (query) => ipcRenderer.invoke('search-screenshots', query),
  getCategoryDetails: (category) => ipcRenderer.invoke('get-category-details', category),
  revealScreenshot: (filePath) => ipcRenderer.invoke('reveal-screenshot', filePath),
  getPlatforms: () => ipcRenderer.invoke('get-platforms'),
  getRebuildStatus: () => ipcRenderer.invoke('get-rebuild-status'),
  rebuildLibrary: () => ipcRenderer.invoke('rebuild-library'),
  universalSearch: (params) => ipcRenderer.invoke('universal-search', params),
  findSimilar: (id) => ipcRenderer.invoke('find-similar', id),
  openFolder: (path) => ipcRenderer.send('open-folder', path),
});

console.log('ELECTRON API EXPOSED');
