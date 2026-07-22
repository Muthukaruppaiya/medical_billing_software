// Electron main process for Pharmacy Billing.
// In the packaged app the API runs in-process via dynamic import (reliable with
// asar + native sqlite). In development it can still use a utility process.
const { app, BrowserWindow, shell, dialog, Menu, utilityProcess } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');

const isPackaged = app.isPackaged;

// Packaged desktop builds always use a fixed port so inherited shell env
// (PHARMACY_PORT/PORT) cannot make the UI probe the wrong address.
const PORT = isPackaged
  ? 41730
  : (Number(process.env.PHARMACY_PORT || process.env.PORT) || 41730);
const SERVER_URL = `http://127.0.0.1:${PORT}`;

const userDataDir = app.getPath('userData');
const dbPath = path.join(userDataDir, 'database.sqlite');
const localBackupDir = path.join(userDataDir, 'backups');

let mainWindow = null;
let serverProcess = null;
let quitting = false;
let healthTimer = null;
let startupDialogShown = false;
let restartAttempted = false;
let serverStartedInProcess = false;

function showStartupError(title, message) {
  if (startupDialogShown || quitting) return;
  startupDialogShown = true;
  dialog.showErrorBox(title, message);
}

function resolveServerEntry() {
  // Always resolve from this file so asar / unpacked layouts both work.
  return path.join(__dirname, '..', 'server', 'server.js');
}

function resolveUiDistPath() {
  return path.join(app.getAppPath(), 'dist');
}

function buildServerEnv({ runAsNode = false } = {}) {
  const env = {
    ...process.env,
    PORT: String(PORT),
    PHARMACY_PORT: String(PORT),
    DATABASE_PATH: dbPath,
    BACKUP_LOCAL_DIR: localBackupDir,
    UPLOAD_DIR: path.join(userDataDir, 'uploads'),
    UI_DIST_PATH: resolveUiDistPath(),
    BACKUP_STARTUP_DELAY_MS: '60000',
  };
  if (runAsNode) {
    env.ELECTRON_RUN_AS_NODE = '1';
  } else {
    delete env.ELECTRON_RUN_AS_NODE;
  }
  return env;
}

function applyServerEnv(env) {
  for (const [key, value] of Object.entries(env)) {
    if (value == null) delete process.env[key];
    else process.env[key] = String(value);
  }
}

function attachServerLogging(child) {
  if (child.stdout) {
    child.stdout.on('data', chunk => {
      const text = String(chunk).trim();
      if (text) console.log(`[server] ${text}`);
    });
  }
  if (child.stderr) {
    child.stderr.on('data', chunk => {
      const text = String(chunk).trim();
      if (text) console.error(`[server] ${text}`);
    });
  }
}

function onServerExit(code, signal) {
  console.error(`Server process exited (code=${code}, signal=${signal})`);
  serverProcess = null;
  if (quitting || serverStartedInProcess) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (!restartAttempted) {
    restartAttempted = true;
    setTimeout(async () => {
      if (quitting) return;
      try {
        await startServerProcess();
        await waitForServer(20000);
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
      } catch (err) {
        console.error('Failed to restart server:', err);
        showStartupError(
          'Service stopped',
          `The Pharmacy Billing service stopped and could not restart.\n\n${err.message}`
        );
      }
    }, 1500);
  }
}

async function startServerInProcess() {
  if (serverStartedInProcess) return;
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(localBackupDir, { recursive: true });
  } catch (err) {
    console.error('Failed preparing data directories:', err);
  }

  const entry = resolveServerEntry();
  if (!fs.existsSync(entry)) {
    throw new Error(`Server file was not found:\n${entry}\n\nReinstall Pharmacy Billing.`);
  }

  applyServerEnv(buildServerEnv({ runAsNode: false }));
  console.log('[main] Starting API in-process from', entry);
  console.log('[main] UI dist:', process.env.UI_DIST_PATH);
  console.log('[main] Database:', process.env.DATABASE_PATH);

  try {
    await import(pathToFileURL(entry).href);
  } catch (err) {
    const logPath = path.join(userDataDir, 'startup-error.log');
    const details = `${new Date().toISOString()}\nentry=${entry}\n${err && err.stack ? err.stack : err}\n`;
    try { fs.writeFileSync(logPath, details, 'utf8'); } catch (_) { /* ignore */ }
    console.error('[main] Failed to import server:', err);
    throw err;
  }
  serverStartedInProcess = true;
  serverProcess = {
    inProcess: true,
    kill() {
      // Express keeps listening until the app quits.
    },
  };
}

async function startServerProcess() {
  if (serverProcess || serverStartedInProcess) return;

  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(localBackupDir, { recursive: true });
  } catch (err) {
    console.error('Failed preparing data directories:', err);
  }

  // Packaged builds: in-process is the reliable path (asar + sqlite native).
  if (isPackaged) {
    await startServerInProcess();
    return;
  }

  const entry = resolveServerEntry();
  if (!fs.existsSync(entry)) {
    throw new Error(`Server file was not found:\n${entry}`);
  }

  const env = buildServerEnv({ runAsNode: false });
  const cwd = path.dirname(entry);

  if (typeof utilityProcess?.fork === 'function') {
    const child = utilityProcess.fork(entry, [], {
      env,
      cwd,
      stdio: 'pipe',
      serviceName: 'pharmacy-server',
    });
    serverProcess = child;
    attachServerLogging(child);
    child.on('exit', code => onServerExit(code, null));
    return;
  }

  const child = spawn(process.execPath, [entry], {
    env: buildServerEnv({ runAsNode: true }),
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  serverProcess = child;
  attachServerLogging(child);
  child.on('error', err => {
    console.error('Failed to spawn server process:', err);
    serverProcess = null;
    showStartupError(
      'Startup error',
      `Could not start the Pharmacy Billing service.\n\n${err.message}`
    );
  });
  child.on('exit', (code, signal) => onServerExit(code, signal));
}

function stopServerProcess() {
  if (!serverProcess || serverProcess.inProcess) {
    serverProcess = null;
    return;
  }
  const child = serverProcess;
  serverProcess = null;
  try {
    if (typeof child.kill === 'function') child.kill();
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    }
  } catch (err) {
    console.error('Failed stopping server process:', err);
  }
}

function waitForServer(timeoutMs = 60000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (quitting) {
        reject(new Error('App is quitting.'));
        return;
      }
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
    req.on('error', () => {});
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.startsWith(SERVER_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer gone:', details);
    if (!quitting && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.reload();
    }
  });

  mainWindow.loadURL(SERVER_URL);
}

async function bootstrap() {
  try {
    await startServerProcess();
    await waitForServer();
  } catch (err) {
    showStartupError(
      'Startup error',
      `The Pharmacy Billing service failed to start.\n\n${err.message}\n\n` +
        'Close any old Pharmacy Billing window, then reinstall PharmacyBilling-Setup-2.0.2 and open it from the Start Menu.'
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
    try {
      fs.writeFileSync(
        path.join(userDataDir, 'main-boot.log'),
        [
          new Date().toISOString(),
          `isPackaged=${isPackaged}`,
          `exe=${app.getPath('exe')}`,
          `appPath=${app.getAppPath()}`,
          `serverEntry=${resolveServerEntry()}`,
          `serverExists=${fs.existsSync(resolveServerEntry())}`,
          `port=${PORT}`,
          `uiDist=${resolveUiDistPath()}`,
          `uiDistExists=${fs.existsSync(resolveUiDistPath())}`,
        ].join('\n'),
        'utf8'
      );
    } catch (err) {
      console.error('boot log failed', err);
    }

    if (isPackaged) {
      try {
        const exePath = app.getPath('exe');
        if (fs.existsSync(exePath)) {
          app.setLoginItemSettings({
            openAtLogin: true,
            path: exePath,
          });
        }
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
