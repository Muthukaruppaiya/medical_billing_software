// Electron main process for Pharmacy Billing.
// Spawns Express + SQLite as a separate Node child process so heavy DB/backup
// work never freezes the desktop UI (fields stay enterable).
const { app, BrowserWindow, shell, dialog, Menu } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

const isPackaged = app.isPackaged;

// Fixed local port for the bundled server. API calls in the UI are relative,
// so the exact port only needs to be free on the machine.
const PORT = Number(process.env.PHARMACY_PORT) || 41730;
const SERVER_URL = `http://localhost:${PORT}`;

// Store the database and local backups in a per-user writable location.
// When installed, the app's own resources are read-only, so we must not write there.
const userDataDir = app.getPath('userData');
const dbPath = path.join(userDataDir, 'database.sqlite');
const localBackupDir = path.join(userDataDir, 'backups');

let mainWindow = null;
let serverProcess = null;
let quitting = false;
let healthTimer = null;

function resolveServerEntry() {
  // In packaging, app.asar contains server/server.js; sqlite3 .node is unpacked.
  return path.join(__dirname, '..', 'server', 'server.js');
}

function startServerProcess() {
  if (serverProcess) return;

  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(localBackupDir, { recursive: true });
  } catch (err) {
    console.error('Failed preparing data directories:', err);
  }

  const entry = resolveServerEntry();
  const env = {
    ...process.env,
    // Run Electron binary as plain Node so the Express server is isolated
    // from the UI main process (prevents freezes on large DB backups).
    ELECTRON_RUN_AS_NODE: '1',
    PORT: String(PORT),
    DATABASE_PATH: dbPath,
    BACKUP_LOCAL_DIR: localBackupDir,
    UPLOAD_DIR: path.join(userDataDir, 'uploads'),
    // Delay first backup so login/startup feels snappy.
    BACKUP_STARTUP_DELAY_MS: '60000',
  };

  serverProcess = spawn(process.execPath, [entry], {
    env,
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  serverProcess.stdout.on('data', chunk => {
    const text = String(chunk).trim();
    if (text) console.log(`[server] ${text}`);
  });
  serverProcess.stderr.on('data', chunk => {
    const text = String(chunk).trim();
    if (text) console.error(`[server] ${text}`);
  });

  serverProcess.on('exit', (code, signal) => {
    console.error(`Server process exited (code=${code}, signal=${signal})`);
    serverProcess = null;
    if (!quitting && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        'Service stopped',
        'The Pharmacy Billing service stopped unexpectedly.\n\nThe window will reload once it restarts.'
      );
      // Attempt one automatic restart.
      setTimeout(() => {
        if (quitting) return;
        try {
          startServerProcess();
          waitForServer(20000)
            .then(() => {
              if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
            })
            .catch(() => {});
        } catch (err) {
          console.error('Failed to restart server:', err);
        }
      }, 1500);
    }
  });
}

function stopServerProcess() {
  if (!serverProcess) return;
  const child = serverProcess;
  serverProcess = null;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      child.kill('SIGTERM');
    }
  } catch (err) {
    console.error('Failed stopping server process:', err);
  }
}

function waitForServer(timeoutMs = 45000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(`${SERVER_URL}/api/company`, res => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else if (Date.now() - started > timeoutMs) {
          reject(new Error('Server did not become healthy in time.'));
        } else {
          setTimeout(attempt, 400);
        }
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error('Server did not start in time.'));
        } else {
          setTimeout(attempt, 400);
        }
      });
      req.setTimeout(2000, () => {
        req.destroy();
      });
    };
    attempt();
  });
}

function startHealthMonitor() {
  if (healthTimer) clearInterval(healthTimer);
  healthTimer = setInterval(() => {
    if (quitting || !mainWindow || mainWindow.isDestroyed()) return;
    const req = http.get(`${SERVER_URL}/api/company`, res => {
      res.resume();
    });
    req.on('error', () => {
      // Child exit handler already restarts; this just keeps a light probe.
    });
    req.setTimeout(2500, () => req.destroy());
  }, 20000);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#0f172a',
    title: 'Pharmacy Billing',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Open external links (http/https) in the default browser instead of the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.startsWith(SERVER_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Recover from blank/hung renderer pages without killing the whole app.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer gone:', details);
    if (!quitting && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.reload();
    }
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.warn('Window became unresponsive — offering reload');
  });

  mainWindow.loadURL(SERVER_URL);
}

async function bootstrap() {
  try {
    startServerProcess();
    await waitForServer();
  } catch (err) {
    dialog.showErrorBox(
      'Startup error',
      `The Pharmacy Billing service failed to start.\n\n${err.message}`
    );
    app.quit();
    return;
  }
  createWindow();
  startHealthMonitor();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    if (isPackaged) {
      try {
        app.setLoginItemSettings({ openAtLogin: true });
      } catch (err) {
        console.error('Failed to set login item:', err);
      }
    }

    Menu.setApplicationMenu(null);
    bootstrap();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', () => {
    quitting = true;
    if (healthTimer) clearInterval(healthTimer);
    stopServerProcess();
  });

  app.on('window-all-closed', () => {
    quitting = true;
    if (healthTimer) clearInterval(healthTimer);
    stopServerProcess();
    app.quit();
  });
}
