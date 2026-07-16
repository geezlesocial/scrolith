const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('scrolithDesktop', {
  platform: process.platform,
  shell: 'desktop',
  version: process.env.npm_package_version || '1.1.14'
});
