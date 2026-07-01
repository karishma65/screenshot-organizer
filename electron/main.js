// main.js - Core Entry Point
const { app, BrowserWindow, ipcMain, protocol, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const { startWatcher, initialScan } = require('./watcher');
const db = require('./database');
const bridge = require('./pythonBridge');

// Modular APIs
const { registerStatsHandlers, emitAppUpdates } = require('./stats_api');
const { registerSearchHandlers } = require('./search_api');
const { registerDuplicateHandlers } = require('./duplicate_api');

let mainWindow = null;
let WATCH_PATH = '';
let ORGANIZED_ROOT = '';
let isSystemConfigured = false;
let isFoldersAccessible = false;

// Global Context Accessors for modules
const getGlobalPaths = () => ({ watchPath: WATCH_PATH, organizedPath: ORGANIZED_ROOT });
const triggerUpdates = () => emitAppUpdates(mainWindow);

async function initializePaths() {
  console.log('SYSTEM: Initializing paths...');
  return new Promise((resolve) => {
    db.serialize(() => {
      // 1. Load Paths
      db.all("SELECT key, value FROM settings WHERE key IN ('watch_path', 'organized_path')", (err, rows) => {
        if (!err && rows) {
          const settingsMap = {};
          rows.forEach(r => settingsMap[r.key] = r.value);
          WATCH_PATH = settingsMap.watch_path || '';
          ORGANIZED_ROOT = settingsMap.organized_path || '';
        }
        isSystemConfigured = !!(WATCH_PATH && ORGANIZED_ROOT);
        isFoldersAccessible = isSystemConfigured ? (fs.existsSync(WATCH_PATH) && fs.existsSync(ORGANIZED_ROOT)) : false;

        // 2. Initialize Default Thresholds if missing
        const defaults = [
          ['reuse_threshold', '0.62'],
          ['create_threshold', '0.62'],
          ['face_similarity_threshold', '0.4'],
          ['visual_similarity_threshold', '0.3'],
          ['face_quality_threshold', '0.1'],
          ['watcher_debounce_ms', '200'],
          ['watcher_cooling_ms', '5000']
        ];
        defaults.forEach(([key, val]) => {
          db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [key, val]);
        });
        
        resolve();
      });
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 850,
    backgroundColor: '#16171d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    }
  });

  if (isDev) mainWindow.loadURL('http://localhost:5173');
  else mainWindow.loadFile(path.join(__dirname, '../renderer/dist/index.html'));

  return mainWindow;
}

app.whenReady().then(async () => {
  protocol.registerFileProtocol('screenshot', (request, callback) => {
    const url = request.url.replace('screenshot://', '');
    try { return callback(decodeURIComponent(url)); } catch (error) { console.error(error); }
  });

  createWindow();
  await initializePaths();

  // Register All Module Handlers
  registerStatsHandlers();
  registerSearchHandlers(getGlobalPaths);
  registerDuplicateHandlers(getGlobalPaths, triggerUpdates);

  if (mainWindow && isSystemConfigured && isFoldersAccessible) {
    startWatcher(mainWindow, WATCH_PATH, ORGANIZED_ROOT);
  }
});

// Utility Handlers
ipcMain.on('force-stats-update', triggerUpdates);

ipcMain.handle('get-category-details', async (event, category) => {
  return new Promise((resolve) => {
    const isStudy = category === 'STUDY';
    const groupField = isStudy ? 'study_group_name' : 'platform';
    db.all(`SELECT ${groupField} as name, COUNT(*) as count FROM screenshots WHERE main_category = ? AND ${groupField} IS NOT NULL AND ${groupField} != 'NONE' GROUP BY ${groupField} ORDER BY count DESC`, [category], (err, clusters) => {
      db.all(`SELECT * FROM screenshots WHERE main_category = ? ORDER BY created_at DESC LIMIT 20`, [category], (err, recent) => {
        resolve({ clusters: clusters || [], recent: recent || [] });
      });
    });
  });
});

ipcMain.on('open-folder', (e, p) => { if (p && fs.existsSync(p)) shell.openPath(p); });
ipcMain.handle('reveal-screenshot', async (e, p) => {
  if (p && fs.existsSync(p)) { shell.showItemInFolder(p); return true; }
  return false;
});
ipcMain.handle('get-app-paths', async () => ({ watchPath: WATCH_PATH, organizedPath: ORGANIZED_ROOT }));
ipcMain.handle('get-system-status', async () => ({ configured: isSystemConfigured, accessible: isFoldersAccessible, watchPath: WATCH_PATH, organizedPath: ORGANIZED_ROOT }));

ipcMain.handle('set-app-paths', async (event, { watchPath, organizedPath }) => {
  return new Promise((resolve) => {
    db.serialize(async () => {
      if (watchPath) { db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('watch_path', ?)", [watchPath]); WATCH_PATH = watchPath; }
      if (organizedPath) { db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('organized_path', ?)", [organizedPath]); ORGANIZED_ROOT = organizedPath; }
      isSystemConfigured = !!(WATCH_PATH && ORGANIZED_ROOT);
      isFoldersAccessible = isSystemConfigured ? (fs.existsSync(WATCH_PATH) && fs.existsSync(ORGANIZED_ROOT)) : false;
      if (isSystemConfigured && isFoldersAccessible) {
        db.log('SETTINGS_UPDATED', 'Folder paths updated and validated.', 'info');
        startWatcher(mainWindow, WATCH_PATH, ORGANIZED_ROOT);
      }
      resolve({ success: true, accessible: isFoldersAccessible });
    });
  });
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'png', 'gif', 'webp', 'jpeg'] }
    ]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('get-platforms', async () => {
  return new Promise((resolve) => {
    db.all('SELECT DISTINCT platform FROM screenshots WHERE platform IS NOT NULL AND platform != "UNKNOWN" ORDER BY platform', (err, rows) => {
      resolve((rows || []).map(r => r.platform));
    });
  });
});

let rebuildState = { active: false, phase: '', filesProcessed: 0, totalFiles: 0 };
ipcMain.handle('get-rebuild-status', async () => rebuildState);

ipcMain.handle('rebuild-library', async () => {
  rebuildState = { active: true, phase: 'Clearing old data', filesProcessed: 0, totalFiles: 0 };
  if (mainWindow) mainWindow.webContents.send('rebuild-progress', rebuildState);
  try {
    if (ORGANIZED_ROOT) {
      try { await fs.promises.access(ORGANIZED_ROOT); await fs.promises.rm(ORGANIZED_ROOT, { recursive: true, force: true }); } catch (e) {}
    }
    await fs.promises.mkdir(ORGANIZED_ROOT, { recursive: true });
  } catch (e) { console.error('Rebuild Reset Error:', e); }

  rebuildState.phase = 'Database reset';
  if (mainWindow) mainWindow.webContents.send('rebuild-progress', rebuildState);

  return new Promise((resolve) => {
    db.serialize(() => {
      db.run('DELETE FROM screenshots');
      db.run('DELETE FROM study_groups');
      db.run('DELETE FROM activity_logs');
      db.log('LIBRARY_RESET', 'Database cleared for re-scan.', 'info');
      bridge.request('rebuild_reset').catch(err => console.error('FAISS Reset Error:', err));
      rebuildState.phase = 'Scanning files';
      if (mainWindow) mainWindow.webContents.send('rebuild-progress', rebuildState);
      setTimeout(() => { if (mainWindow) initialScan(mainWindow, WATCH_PATH, ORGANIZED_ROOT, true); }, 1000);
      resolve({ success: true });
    });
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
