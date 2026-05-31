const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../data/metadata.db');

if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('DB: Connection error:', err.message);
  else {
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA synchronous = NORMAL');
    db.run('PRAGMA busy_timeout = 5000');
  }
});

// We wrap everything in serialize to ensure tables are created BEFORE any other commands
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT,
      details TEXT,
      status TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS study_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      last_processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS screenshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_path TEXT UNIQUE,
      organized_path TEXT,
      filename TEXT,
      ocr_text TEXT,
      main_category TEXT,
      platform TEXT,
      content_types TEXT,
      tags TEXT,
      confidence REAL DEFAULT 0,
      confidence_score REAL DEFAULT 0,
      original_hash TEXT,
      study_group_name TEXT,
      is_duplicate INTEGER DEFAULT 0,
      duplicate_of INTEGER,
      similarity_score REAL DEFAULT 0,
      processing_status TEXT DEFAULT 'queued',
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // We do not insert defaults here anymore to prevent race conditions with main.js
  // Defaults are handled in main.js initializePaths() if missing from DB
});

// Helper for safe logging
db.log = (action, details, status) => {
  db.run('INSERT INTO activity_logs (action, details, status) VALUES (?, ?, ?)', [action, details, status], (err) => {
     if (err) {
       console.warn('DB Log skip (too early):', action);
     } else {
       // Trigger UI update
       const { ipcMain } = require('electron');
       ipcMain.emit('force-stats-update');
     }
  });
};

module.exports = db;
