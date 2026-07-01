const { ipcMain, shell } = require('electron');
const fs = require('fs');
const db = require('./database');

function registerDuplicateHandlers(getGlobalPaths, emitAppUpdates) {
  ipcMain.handle('get-duplicates', async () => {
    return new Promise((resolve) => {
      db.all('SELECT * FROM screenshots WHERE is_duplicate = 1', async (err, dupRows) => {
        if (err || !dupRows || dupRows.length === 0) return resolve([]);
        const originalIds = [...new Set(dupRows.map(d => d.duplicate_of))];
        db.all(`SELECT * FROM screenshots WHERE id IN (${originalIds.join(',')})`, (err, origRows) => {
          const originalsMap = {};
          if (origRows) origRows.forEach(o => originalsMap[o.id] = o);
          const groups = {};
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
        resolve({ count: rows.length, sizeMB: (totalSize / (1024 * 1024)).toFixed(1) });
      });
    });
  });

  ipcMain.handle('delete-duplicate', async (event, id) => {
    const { organizedPath } = getGlobalPaths();
    return new Promise((resolve) => {
      db.get('SELECT filename, organized_path, original_path FROM screenshots WHERE id = ?', [id], (err, row) => {
        if (row && row.organized_path) {
          const targetPath = row.organized_path;
          if (organizedPath && targetPath.startsWith(organizedPath) && fs.existsSync(targetPath)) {
            try { fs.unlinkSync(targetPath); } catch (e) {}
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
}

module.exports = { registerDuplicateHandlers };
