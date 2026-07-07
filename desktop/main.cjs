const { app, BrowserWindow, Menu, shell, session } = require('electron');
const fs = require('fs');
const path = require('path');

const APP_NAME = 'Scrolith';
const APP_ID = 'com.scrolith.desktop';
const PROD_URL = process.env.SCROLITH_DESKTOP_URL || 'https://scrolith.com';
const WINDOW_STATE_FILE = 'window-state.json';
const DEFAULT_WIDTH = 1440;
const DEFAULT_HEIGHT = 960;
const MIN_WIDTH = 1180;
const MIN_HEIGHT = 760;

let mainWindow = null;

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
