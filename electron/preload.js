// Electron preload —— 用 contextBridge 安全暴露主进程能力
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('huepick', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  generateCard: (payload) => ipcRenderer.invoke('generate-card', payload),
  openFile: (p) => ipcRenderer.invoke('open-file', p),
  showInFolder: (p) => ipcRenderer.invoke('show-in-folder', p),
  copyText: (t) => ipcRenderer.invoke('copy-text', t),
});
