const { contextBridge, ipcRenderer, shell } = require('electron');
const path = require('path');

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
  openFolder: (folderPath) => shell.openPath(folderPath),
  getOrganizedPath: () => 'D:\\vit\\Screenshot organizer_new\\OrganizedScreenshots',
  getStats: () => ipcRenderer.invoke('get-stats'),
  getLogs: () => ipcRenderer.invoke('get-logs'),
  rebuildLibrary: () => ipcRenderer.invoke('rebuild-library'),
});
