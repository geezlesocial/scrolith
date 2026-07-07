const { app, BrowserWindow, Menu, shell, session, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const APP_NAME = 'Scrolith';
const APP_ID = 'com.scrolith.desktop';
const PROD_URL = process.env.SCROLITH_DESKTOP_URL || 'https://scrolith.com';
const DEFAULT_UPDATE_URL = 'https://downloads.scrolith.com/desktop/win';
const WINDOW_STATE_FILE = 'window-state.json';
const DEFAULT_WIDTH = 1440;
const DEFAULT_HEIGHT = 960;
const MIN_WIDTH = 1180;
const MIN_HEIGHT = 760;
const UPDATE_CHECK_DELAY_MS = 12_000;

let mainWindow = null;
let lastUpdateState = 'idle';
let updaterConfigured = false;

const allowedHosts = new Set(['scrolith.com', 'www.scrolith.com', 'api.scrolith.com']);

const getUserDataFile = (name) => path.join(app.getPath('userData'), name);

const readWindowState = () => {
  try {
    const raw = fs.readFileSync(getUserDataFile(WINDOW_STATE_FILE), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
};

const persistWindowState = (window) => {
  if (!window || window.isDestroyed()) return;
  const bounds = window.getBounds();
  const state = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    maximized: window.isMaximized()
  };

  try {
    fs.writeFileSync(getUserDataFile(WINDOW_STATE_FILE), JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // Ignore state persistence failures.
  }
};

const isTrustedUrl = (rawUrl) => {
  try {
    const parsed = new URL(rawUrl);
    return allowedHosts.has(parsed.hostname);
  } catch {
    return false;
  }
};

const buildWindowOptions = () => {
  const state = readWindowState();

  return {
    width: Number.isFinite(state.width) ? state.width : DEFAULT_WIDTH,
    height: Number.isFinite(state.height) ? state.height : DEFAULT_HEIGHT,
    x: Number.isFinite(state.x) ? state.x : undefined,
    y: Number.isFinite(state.y) ? state.y : undefined,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    backgroundColor: '#0b1220',
    title: APP_NAME,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
      devTools: !app.isPackaged,
      autoplayPolicy: 'no-user-gesture-required'
    }
  };
};

const buildMenu = () => {
  const template = [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates',
          click: () => {
            void checkForDesktopUpdates({ interactive: true });
          }
        },
        { type: 'separator' },
        {
          label: 'Open Scrolith in Browser',
          click: () => shell.openExternal(PROD_URL)
        }
      ]
    }
  ];

  if (!app.isPackaged) {
    template[2].submenu.push({ type: 'separator' }, { role: 'toggleDevTools' });
  }

  return Menu.buildFromTemplate(template);
};

const getDesktopUpdateUrl = () =>
  process.env.SCROLITH_DESKTOP_UPDATE_URL || DEFAULT_UPDATE_URL;

const canUseAutoUpdate = () => {
  if (!app.isPackaged) return false;
  if (process.env.SCROLITH_DISABLE_AUTO_UPDATE === '1') return false;
  return true;
};

const configureDesktopUpdater = () => {
  if (!canUseAutoUpdate()) return false;
  if (updaterConfigured) return true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.disableWebInstaller = false;
  autoUpdater.allowDowngrade = false;

  const feedUrl = getDesktopUpdateUrl();
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: feedUrl,
    channel: 'latest'
  });

  autoUpdater.on('checking-for-update', () => {
    lastUpdateState = 'checking';
  });

  autoUpdater.on('update-available', (info) => {
    lastUpdateState = `available:${info?.version || 'unknown'}`;
  });

  autoUpdater.on('update-not-available', () => {
    lastUpdateState = 'not-available';
  });

  autoUpdater.on('error', async (error) => {
    lastUpdateState = 'error';
    if (process.env.SCROLITH_DEBUG_DESKTOP === '1') {
      const message = error instanceof Error ? error.message : String(error);
      await dialog.showMessageBox({
        type: 'warning',
        title: `${APP_NAME} updates`,
        message: 'Scrolith could not check for desktop updates.',
        detail: `${message}\n\nFeed: ${feedUrl}`
      });
    }
  });

  autoUpdater.on('update-downloaded', async (info) => {
    lastUpdateState = `downloaded:${info?.version || 'unknown'}`;
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Install and Restart', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: `${APP_NAME} update ready`,
      message: `Scrolith ${info?.version || 'update'} is ready to install.`,
      detail: 'Restart now to apply the desktop update.'
    });

    if (response === 0) {
      setImmediate(() => autoUpdater.quitAndInstall());
    }
  });

  updaterConfigured = true;
  return true;
};

const checkForDesktopUpdates = async ({ interactive = false } = {}) => {
  if (!configureDesktopUpdater()) {
    if (interactive) {
      await dialog.showMessageBox({
        type: 'info',
        title: `${APP_NAME} updates`,
        message: 'Desktop updates are not enabled for this build.',
        detail:
          'Enable packaged distribution with Scrolith-controlled update hosting to check for updates.'
      });
    }
    return;
  }

  try {
    await autoUpdater.checkForUpdates();
    if (interactive && lastUpdateState === 'not-available') {
      await dialog.showMessageBox({
        type: 'info',
        title: `${APP_NAME} updates`,
        message: 'You are already on the latest Scrolith desktop version.'
      });
    }
  } catch (error) {
    if (!interactive) return;
    const message = error instanceof Error ? error.message : String(error);
    await dialog.showMessageBox({
      type: 'warning',
      title: `${APP_NAME} updates`,
      message: 'Scrolith could not complete the update check.',
      detail: message
    });
  }
};

const applySessionGuards = () => {
  const ses = session.defaultSession;

  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    const origin = webContents.getURL();
    if (!isTrustedUrl(origin)) {
      callback(false);
      return;
    }

    const allowed = new Set([
      'notifications',
      'fullscreen',
      'clipboard-sanitized-write',
      'media',
      'geolocation'
    ]);
    callback(allowed.has(permission));
  });

  ses.setPermissionCheckHandler((webContents, permission) => {
    const origin = webContents.getURL();
    if (!isTrustedUrl(origin)) return false;
    const allowed = new Set([
      'notifications',
      'fullscreen',
      'clipboard-sanitized-write',
      'media',
      'geolocation'
    ]);
    return allowed.has(permission);
  });
};

const createMainWindow = async () => {
  mainWindow = new BrowserWindow(buildWindowOptions());

  if (readWindowState().maximized) {
    mainWindow.maximize();
  }

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return;
    mainWindow.show();
  });

  mainWindow.on('resize', () => persistWindowState(mainWindow));
  mainWindow.on('move', () => persistWindowState(mainWindow));
  mainWindow.on('close', () => persistWindowState(mainWindow));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedUrl(url)) {
      return { action: 'allow' };
    }

    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isTrustedUrl(url)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });

  mainWindow.webContents.on('render-process-gone', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    await mainWindow.loadURL(PROD_URL);
  });

  await mainWindow.loadURL(PROD_URL, {
    userAgent: `${app.userAgentFallback} ScrolithDesktop/${app.getVersion()}`
  });
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);

app.whenReady().then(async () => {
  Menu.setApplicationMenu(buildMenu());
  applySessionGuards();
  await createMainWindow();
  if (canUseAutoUpdate()) {
    setTimeout(() => {
      void checkForDesktopUpdates();
    }, UPDATE_CHECK_DELAY_MS);
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
