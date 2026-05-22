const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectOutputDirectory: () => ipcRenderer.invoke('select-output-directory'),
  scanDirectory: (dir) => ipcRenderer.invoke('scan-directory', dir),
  getVideoInfo: (filePath) => ipcRenderer.invoke('get-video-info', filePath),
  findNearestIframe: (filePath, time, direction) =>
    ipcRenderer.invoke('find-nearest-iframe', filePath, time, direction),
  exportClips: (clips, outputDir) => ipcRenderer.invoke('export-clips', clips, outputDir),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  onExportProgress: (cb) => ipcRenderer.on('export-progress', (e, data) => cb(data)),
  removeExportProgress: () => ipcRenderer.removeAllListeners('export-progress')
});
