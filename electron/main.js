//. It manages application startup, window creation, IPC communication, search APIs, 
// duplicate management, settings, rebuild operations, dashboard updates, and watcher initialization.
const { app, BrowserWindow, ipcMain, protocol, shell, dialog } = require('electron');   // instead of getting whole electron modules we are destructuring  so we dont need to do electron.app 
// path,fs,os are modules
// require() used to import modules 
const path = require('path');  //path handle 
const fs = require('fs');   // file system 
const os = require('os');   // os utilities 
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const { startWatcher, initialScan } = require('./watcher');
const db = require('./database');
const { spawn } = require('child_process');

let mainWindow = null;
let WATCH_PATH = '';
let ORGANIZED_ROOT = '';
let isSystemConfigured = false;
let isFoldersAccessible = false;

//** Centralized Path Manager
async function initializePaths() {
  console.log('SYSTEM: Initializing paths...');
  return new Promise((resolve) => {
    db.all("SELECT key, value FROM settings WHERE key IN ('watch_path', 'organized_path')", (err, rows) => {
      if (err) {
        console.warn('SYSTEM: Settings table check failed (likely first run).');
        isSystemConfigured = false;
        isFoldersAccessible = false;
        resolve();
        return;
      }

      const settings = {};
      if (rows) rows.forEach(row => settings[row.key] = row.value);

      WATCH_PATH = settings.watch_path || '';
      ORGANIZED_ROOT = settings.organized_path || '';

      isSystemConfigured = !!(WATCH_PATH && ORGANIZED_ROOT);

      if (isSystemConfigured) {
        isFoldersAccessible = fs.existsSync(WATCH_PATH) && fs.existsSync(ORGANIZED_ROOT);
      } else {
        isFoldersAccessible = false;
      }

      console.log('SYSTEM STATUS:', {
        configured: isSystemConfigured,
        accessible: isFoldersAccessible,
        watchPath: WATCH_PATH,
        organizedPath: ORGANIZED_ROOT
      });

      resolve();
    });
  });
}


//**creating the Electron desktop window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    // titleBarStyle: 'hidden',
    backgroundColor: '#16171d',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // Correct production path logic
    const indexPath = path.join(__dirname, '../renderer/dist/index.html');
    mainWindow.loadFile(indexPath);
  }

  return mainWindow;
}

//**app startup func
app.whenReady().then(async () => {
  // Register screenshot:// protocol for local images custom url 
  protocol.registerFileProtocol('screenshot', (request, callback) => {
    const url = request.url.replace('screenshot://', '');
    try {
      return callback(decodeURIComponent(url));
    } catch (error) {
      console.error(error);
    }
  });

  createWindow();

  // Initialize paths AFTER window is created to avoid blocking IPC registration
  await initializePaths();

  if (mainWindow) {
    if (isSystemConfigured && isFoldersAccessible) {
      startWatcher(mainWindow, WATCH_PATH, ORGANIZED_ROOT);
    } else {
      console.log('System: Startup in setup mode.');
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

//**dashboard refresh function be to fe 
// Helper to broadcast real-time updates to all windows
async function emitAppUpdates() {
  if (!mainWindow) return;

  // 1. Fetch Comprehensive Health Stats
  const stats = await new Promise((resolve) => {
    db.get(`
      SELECT 
        (SELECT COUNT(*) FROM screenshots) as total,
        (SELECT COUNT(*) FROM screenshots WHERE processing_status = 'completed') as categorized,
        (SELECT COUNT(*) FROM screenshots WHERE main_category = 'UNCATEGORIZED') as uncategorized,
        (SELECT COUNT(*) FROM screenshots WHERE is_duplicate = 1) as duplicates,
        (SELECT COUNT(*) FROM screenshots WHERE processing_status = 'queued') as queueCount,
        (SELECT COUNT(*) FROM screenshots WHERE processing_status = 'processing') as processingCount,
        (SELECT COUNT(*) FROM screenshots WHERE processing_status = 'failed') as failedCount
    `, (err, row) => resolve(row || {}));
  });

  const lastProcessed = await new Promise(resolve => {
    db.get('SELECT filename, created_at FROM screenshots WHERE processing_status = "completed" ORDER BY created_at DESC LIMIT 1', (err, row) => resolve(row));
  });
  //Count screenshots per category
  db.all('SELECT main_category, COUNT(*) as count FROM screenshots GROUP BY main_category', (err, rows) => {
    const breakdown = {};
    if (rows) rows.forEach(row => breakdown[row.main_category] = row.count);
    //Send Stats To React
    mainWindow.webContents.send('stats-updated', { ...stats, lastProcessed, breakdown });
  });

  // 2. Fetch Latest Logs to display 
  db.all('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 20', (err, rows) => {
    if (rows) {
      mainWindow.webContents.send('log-updated', rows);
    }
  });
}

// Internal signal to broadcast
ipcMain.on('force-stats-update', () => {
  emitAppUpdates();
});

// IPC Handler for DB Stats (Direct Request) fe to be
console.log('IPC REGISTERED: get-stats');
ipcMain.handle('get-stats', async () => {
  return new Promise((resolve) => {
    db.get(`
      SELECT 
        (SELECT COUNT(*) FROM screenshots) as total,
        (SELECT COUNT(*) FROM screenshots WHERE processing_status = 'completed') as categorized,
        (SELECT COUNT(*) FROM screenshots WHERE main_category = 'UNCATEGORIZED') as uncategorized,
        (SELECT COUNT(*) FROM screenshots WHERE is_duplicate = 1) as duplicates,
        (SELECT COUNT(*) FROM screenshots WHERE processing_status = 'queued') as queueCount,
        (SELECT COUNT(*) FROM screenshots WHERE processing_status = 'processing') as processingCount,
        (SELECT COUNT(*) FROM screenshots WHERE processing_status = 'failed') as failedCount
    `, (err, stats) => {
      if (err) {
        console.error('IPC ERROR: get-stats failed', err);
        resolve(null);
        return;
      }
      db.all('SELECT main_category, COUNT(*) as count FROM screenshots GROUP BY main_category', (err, rows) => {
        const breakdown = {};
        if (rows) rows.forEach(row => breakdown[row.main_category] = row.count);

        db.get('SELECT filename, created_at FROM screenshots WHERE processing_status = "completed" ORDER BY created_at DESC LIMIT 1', (err, lastProcessed) => {
          resolve({ ...stats, breakdown, lastProcessed });
        });
      });
    });
  });
});

console.log('IPC REGISTERED: get-logs');
ipcMain.handle('get-logs', async () => {
  return new Promise((resolve) => {
    db.all('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 20', (err, rows) => {
      if (err) {
        console.error('IPC ERROR: get-logs failed', err);
        resolve([]);
        return;
      }
      resolve(rows || []);
    });
  });
});

//**Search screenshots with keyword or semantic mode
console.log('IPC REGISTERED: search-screenshots');
ipcMain.handle('search-screenshots', async (event, { searchTerm, category, platform, type }) => {
  return new Promise(async (resolve) => {
    if (type === 'semantic' && searchTerm && searchTerm.length > 2) {
      // SEMANTIC SEARCH mode
      try {
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        const pythonProcess = spawn(pythonCmd, [
          path.join(__dirname, '../python/analyzer.py'),
          'semantic_search',
          searchTerm
        ]);

        let output = '';
        pythonProcess.stdout.on('data', (data) => { output += data.toString(); });

        pythonProcess.on('close', (code) => {
          if (code !== 0 || !output.trim()) {
            resolve([]);
            return;
          }
          try {
            const semanticResults = JSON.parse(output);
            if (!semanticResults || semanticResults.length === 0) {
              resolve([]);
              return;
            }

            // Fetch the actual screenshot records for these IDs, preserving the semantic order
            const ids = semanticResults.map(r => r.id);
            const placeholders = ids.map(() => '?').join(',');

            db.all(`SELECT * FROM screenshots WHERE id IN (${placeholders})`, ids, (err, rows) => {
              if (err) {
                console.error('Semantic Search DB error:', err);
                resolve([]);
                return;
              }
              // Sort results according to the order returned by Python
              const sortedRows = ids.map(id => rows.find(row => row.id === id)).filter(Boolean);
              resolve(sortedRows);
            });
          } catch (e) {
            console.error('Failed to parse semantic search output:', e);
            resolve([]);
          }
        });
      } catch (e) {
        console.error('Semantic Search startup error:', e);
        resolve([]);
      }
      return;
    }

    // Standard KEYWORD SEARCH mode
    let sql = 'SELECT id, filename, organized_path, original_path, main_category, platform, created_at FROM screenshots WHERE 1=1';
    let params = [];

    if (searchTerm && searchTerm.trim() !== '') {
      sql += ' AND (ocr_text LIKE ? OR filename LIKE ?)';
      const likeParam = `%${searchTerm}%`;
      params.push(likeParam, likeParam);
    }

    if (category && category !== 'All') {
      sql += ' AND main_category = ?';
      params.push(category.toUpperCase());
    }

    if (platform && platform !== 'All') {
      sql += ' AND platform = ?';
      params.push(platform.toUpperCase());
    }

    sql += ' ORDER BY created_at DESC LIMIT 100';

    db.all(sql, params, (err, rows) => {
      if (err) resolve([]);
      else resolve(rows || []);
    });
  });
});

//** Category Details API (For Exploratory Navigation)
ipcMain.handle('get-category-details', async (event, category) => {
  return new Promise((resolve) => {
    const isStudy = category === 'STUDY';
    const groupField = isStudy ? 'study_group_name' : 'platform';

    db.all(`
      SELECT ${groupField} as name, COUNT(*) as count 
      FROM screenshots 
      WHERE main_category = ? AND ${groupField} IS NOT NULL AND ${groupField} != 'NONE'
      GROUP BY ${groupField}
      ORDER BY count DESC
    `, [category], (err, clusters) => {
      db.all(`
        SELECT * FROM screenshots 
        WHERE main_category = ? 
        ORDER BY created_at DESC LIMIT 20
      `, [category], (err, recent) => {
        resolve({ clusters: clusters || [], recent: recent || [] });
      });
    });
  });
});

//**Real Duplicate Management API
console.log('IPC REGISTERED: get-duplicates');
ipcMain.handle('get-duplicates', async () => {
  return new Promise((resolve) => {
    // 1. Get all duplicates
    db.all('SELECT * FROM screenshots WHERE is_duplicate = 1', async (err, dupRows) => {
      if (err) {
        console.error('IPC ERROR: get-duplicates failed', err);
        resolve([]);
        return;
      }
      if (!dupRows || dupRows.length === 0) return resolve([]);

      // 2. Map duplicates to their originals
      const groups = {};
      const originalIds = [...new Set(dupRows.map(d => d.duplicate_of))];

      // 3. Fetch originals metadata
      db.all(`SELECT * FROM screenshots WHERE id IN (${originalIds.join(',')})`, (err, origRows) => {
        const originalsMap = {};
        if (origRows) origRows.forEach(o => originalsMap[o.id] = o);

        dupRows.forEach(dup => {
          const origId = dup.duplicate_of;
          if (!groups[origId]) {
            groups[origId] = {
              original: originalsMap[origId] || { filename: 'Unknown Original', organized_path: '' },
              duplicates: []
            };
          }
          groups[origId].duplicates.push(dup);
        });

        resolve(Object.values(groups));
      });
    });
  });
});

ipcMain.handle('get-duplicate-stats', async () => {
  return new Promise((resolve) => {
    db.all('SELECT organized_path, original_path FROM screenshots WHERE is_duplicate = 1', (err, rows) => {
      if (err || !rows) return resolve({ count: 0, sizeMB: 0 });

      let totalSize = 0;
      rows.forEach(row => {
        const filePath = row.organized_path || row.original_path;
        if (filePath && fs.existsSync(filePath)) {
          totalSize += fs.statSync(filePath).size;
        }
      });

      resolve({
        count: rows.length,
        sizeMB: (totalSize / (1024 * 1024)).toFixed(1)
      });
    });
  });
});

ipcMain.handle('delete-duplicate', async (event, id) => {
  return new Promise((resolve) => {
    // Fix: Select filename, organized_path, and original_path to ensure logs are correct
    db.get('SELECT filename, organized_path, original_path FROM screenshots WHERE id = ?', [id], (err, row) => {
      if (row && row.organized_path) {
        const targetPath = row.organized_path;

        // HARDENED SAFETY CHECK: Use CANONICAL path validation against CONFIGURED root
        if (ORGANIZED_ROOT && targetPath.startsWith(ORGANIZED_ROOT) && fs.existsSync(targetPath)) {
          try {
            fs.unlinkSync(targetPath);
          } catch (e) {
            console.error('Duplicate Delete Error:', e.message);
          }
        } else {
          db.log('DELETE_ABORTED', `Path protection triggered for ${row.filename || 'Unknown File'}`, 'warning');
        }
      }

      db.run('DELETE FROM screenshots WHERE id = ?', [id], (err) => {
        emitAppUpdates();
        resolve(true);
      });
    });
  });
});

ipcMain.handle('keep-both-duplicate', async (event, id) => {
  return new Promise((resolve) => {
    db.run('UPDATE screenshots SET is_duplicate = 0 WHERE id = ?', [id], (err) => {
      emitAppUpdates();
      resolve(true);
    });
  });
});

ipcMain.on('open-folder', (event, folderPath) => {
  if (folderPath && fs.existsSync(folderPath)) {
    shell.openPath(folderPath);
  }
});

// Reveal a specific file in its containing folder
ipcMain.handle('reveal-screenshot', async (event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
});

// Get dynamic app paths to remove machine-specific hardcoding
ipcMain.handle('get-app-paths', async () => {
  return {
    watchPath: WATCH_PATH,
    organizedPath: ORGANIZED_ROOT
  };
});

// Startup Validation API
ipcMain.handle('get-system-status', async () => {
  return {
    configured: isSystemConfigured,
    accessible: isFoldersAccessible,
    watchPath: WATCH_PATH,
    organizedPath: ORGANIZED_ROOT
  };
});

// Update app paths from Settings
ipcMain.handle('set-app-paths', async (event, { watchPath, organizedPath }) => {
  return new Promise((resolve) => {
    db.serialize(async () => {
      if (watchPath) {
        db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('watch_path', ?)", [watchPath]);
        WATCH_PATH = watchPath;
      }
      if (organizedPath) {
        db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('organized_path', ?)", [organizedPath]);
        ORGANIZED_ROOT = organizedPath;
      }

      // Re-validate system status
      isSystemConfigured = !!(WATCH_PATH && ORGANIZED_ROOT);
      isFoldersAccessible = isSystemConfigured ? (fs.existsSync(WATCH_PATH) && fs.existsSync(ORGANIZED_ROOT)) : false;

      if (isSystemConfigured && isFoldersAccessible) {
        db.log('SETTINGS_UPDATED', 'Folder paths updated and validated.', 'info');
        startWatcher(mainWindow, WATCH_PATH, ORGANIZED_ROOT);
      } else {
        db.log('SETTINGS_INVALID', 'Updated paths are invalid or missing.', 'warning');
      }

      resolve({ success: true, accessible: isFoldersAccessible });
    });
  });
});

// Select folder via native dialog
console.log('IPC REGISTERED: select-folder');
ipcMain.handle('select-folder', async () => {
  console.log('IPC INVOKED: select-folder');
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) {
    console.log('Select Folder cancelled by user');
    return null;
  }
  console.log('Selected path:', result.filePaths[0]);
  return result.filePaths[0];
});

// Get distinct platforms from db for search filtering
ipcMain.handle('get-platforms', async () => {
  return new Promise((resolve) => {
    db.all('SELECT DISTINCT platform FROM screenshots WHERE platform IS NOT NULL AND platform != "UNKNOWN" ORDER BY platform', (err, rows) => {
      if (err || !rows) return resolve([]);
      resolve(rows.map(r => r.platform));
    });
  });
});

// Rebuild Library Logic
// Track rebuild state for live progress
let rebuildState = { active: false, phase: '', filesProcessed: 0, totalFiles: 0 };

ipcMain.handle('get-rebuild-status', async () => {
  return rebuildState;
});

ipcMain.handle('rebuild-library', async () => {
  console.log('Core: Starting Library Rebuild API...');

  rebuildState = { active: true, phase: 'Clearing old data', filesProcessed: 0, totalFiles: 0 };
  if (mainWindow) mainWindow.webContents.send('rebuild-progress', rebuildState);

  // 1. Delete Organized folder (Configured location only)
  try {
    if (ORGANIZED_ROOT && fs.existsSync(ORGANIZED_ROOT)) {
      fs.rmSync(ORGANIZED_ROOT, { recursive: true, force: true });
    }
    fs.mkdirSync(ORGANIZED_ROOT, { recursive: true });
  } catch (e) {
    console.error('Rebuild: Folder reset failed', e.message);
  }

  rebuildState.phase = 'Database reset';
  if (mainWindow) mainWindow.webContents.send('rebuild-progress', rebuildState);

  // 2. Clear Database safely
  return new Promise((resolve) => {
    db.serialize(() => {
      db.run('DELETE FROM screenshots');
      db.run('DELETE FROM study_groups');
      db.run('DELETE FROM activity_logs');
      db.log('LIBRARY_RESET', 'Database cleared for re-scan.', 'info');

      rebuildState.phase = 'Scanning files';
      if (mainWindow) mainWindow.webContents.send('rebuild-progress', rebuildState);

      // 3. Automatically trigger a fresh scan
      // We use a small timeout to let the DB settle
      setTimeout(() => {
        if (mainWindow) {
          initialScan(mainWindow, WATCH_PATH, ORGANIZED_ROOT, true);
        }
      }, 1000);

      resolve({ success: true });
    });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
