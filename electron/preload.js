// Electron preload —— 用 contextBridge 安全暴露主进程能力
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('huepick', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  generateCard: (payload) => ipcRenderer.invoke('generate-card', payload),
  openFile: (p) => ipcRenderer.invoke('open-file', p),
  showInFolder: (p) => ipcRenderer.invoke('show-in-folder', p),
  copyText: (t) => ipcRenderer.invoke('copy-text', t),

  /** File → 本地真实路径（Electron 官方 API，跨平台可靠） */
  getPathForFile: (file) => {
    try { return webUtils.getPathForFile(file); } catch (e) { return null; }
  },

  /** 本地路径 → 可加载的 file:// URL（主进程用 URL 类生成最稳） */
  pathToUrl: (p) => ipcRenderer.invoke('path-to-url', p),
});
