const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const { startWatcher } = require('./watcher');
const db = require('./database');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 850,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hidden',
    backgroundColor: '#16171d',
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    // win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../renderer/dist/index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  const win = createWindow();
  startWatcher(win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// IPC Handler for DB Stats
ipcMain.handle('get-stats', async () => {
  return new Promise((resolve) => {
    db.all('SELECT main_category, COUNT(*) as count FROM screenshots GROUP BY main_category', (err, rows) => {
      const breakdown = {};
      let total = 0;
      let categorized = 0;
      let duplicates = 0;

      if (rows) {
        rows.forEach(row => {
          breakdown[row.main_category] = row.count;
          total += row.count;
          if (row.main_category !== 'Uncategorized') categorized += row.count;
          if (row.main_category === 'Duplicates') duplicates = row.count;
        });
      }

      resolve({
        total,
        categorized,
        uncategorized: breakdown['Uncategorized'] || 0,
        duplicates,
        breakdown
      });
    });
  });
});

ipcMain.handle('get-logs', async () => {
  return new Promise((resolve) => {
    db.all('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 20', (err, rows) => {
      resolve(rows || []);
    });
  });
});

// Rebuild Library Logic
ipcMain.handle('rebuild-library', async () => {
  console.log('Core: Starting Library Rebuild...');
  
  // 1. Close Database connection (optional but safer)
  // 2. Delete OrganizedScreenshots folder
  const organizedPath = path.join(__dirname, '../OrganizedScreenshots');
  if (fs.existsSync(organizedPath)) {
    fs.rmSync(organizedPath, { recursive: true, force: true });
    fs.mkdirSync(organizedPath, { recursive: true });
  }

  // 3. Clear Database tables (don't delete the file, just the data)
  return new Promise((resolve) => {
    db.serialize(() => {
      db.run('DELETE FROM screenshots');
      db.run('DELETE FROM activity_logs');
      db.run('DELETE FROM study_groups');
      db.run('INSERT INTO activity_logs (action, details, status) VALUES (?, ?, ?)', 
        ['Library Reset', 'System re-indexed for full scan.', 'info']);
      resolve({ success: true });
    });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
