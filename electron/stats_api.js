const { ipcMain } = require('electron');
const db = require('./database');

async function emitAppUpdates(mainWindow) {
  if (!mainWindow) return;

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

  db.all('SELECT main_category, COUNT(*) as count FROM screenshots GROUP BY main_category', (err, rows) => {
    const breakdown = {};
    if (rows) rows.forEach(row => breakdown[row.main_category] = row.count);
    mainWindow.webContents.send('stats-updated', { ...stats, lastProcessed, breakdown });
  });

  db.all('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 20', (err, rows) => {
    if (rows) {
      mainWindow.webContents.send('log-updated', rows || []);
    }
  });
}

function registerStatsHandlers() {
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
        if (err) return resolve(null);
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

  ipcMain.handle('get-logs', async () => {
    return new Promise((resolve) => {
      db.all('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 20', (err, rows) => {
        if (err) return resolve([]);
        resolve(rows || []);
      });
    });
  });
}

module.exports = { registerStatsHandlers, emitAppUpdates };
