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
      original_hash TEXT,
      sha256 TEXT,
      main_category TEXT,
      subcategory TEXT,
      platform TEXT,
      study_group_name TEXT,
      study_cluster TEXT,
      document_type TEXT,
      layout_type TEXT,
      is_code INTEGER DEFAULT 0,
      code_language TEXT,
      editor TEXT,
      content_types TEXT,
      tags TEXT,
      ui_confidence REAL DEFAULT 0,
      semantic_confidence REAL DEFAULT 0,
      visual_confidence REAL DEFAULT 0,
      layout_confidence REAL DEFAULT 0,
      final_confidence REAL DEFAULT 0,
      text_embedding BLOB,
      is_duplicate INTEGER DEFAULT 0,
      duplicate_of INTEGER,
      similarity_score REAL DEFAULT 0,
      processing_status TEXT DEFAULT 'queued',
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Indexes for Performance (10,000+ screenshots)
  db.run('CREATE INDEX IF NOT EXISTS idx_screenshots_hash ON screenshots(original_hash)');
  db.run('CREATE INDEX IF NOT EXISTS idx_screenshots_sha256 ON screenshots(sha256)');
  db.run('CREATE INDEX IF NOT EXISTS idx_screenshots_category ON screenshots(main_category)');
  db.run('CREATE INDEX IF NOT EXISTS idx_screenshots_status ON screenshots(processing_status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_screenshots_filename ON screenshots(filename)');

  // Migration: Add columns if they don't exist
  // We only add columns that were added AFTER the very first version
  const schemaUpdates = [
    { name: 'sha256', type: 'TEXT' },
    { name: 'subcategory', type: 'TEXT' },
    { name: 'platform', type: 'TEXT' },
    { name: 'study_group_name', type: 'TEXT' },
    { name: 'study_cluster', type: 'TEXT' },
    { name: 'document_type', type: 'TEXT' },
    { name: 'layout_type', type: 'TEXT' },
    { name: 'is_code', type: 'INTEGER DEFAULT 0' },
    { name: 'code_language', type: 'TEXT' },
    { name: 'editor', type: 'TEXT' },
    { name: 'content_types', type: 'TEXT' },
    { name: 'ui_confidence', type: 'REAL DEFAULT 0' },
    { name: 'semantic_confidence', type: 'REAL DEFAULT 0' },
    { name: 'visual_confidence', type: 'REAL DEFAULT 0' },
    { name: 'layout_confidence', type: 'REAL DEFAULT 0' },
    { name: 'final_confidence', type: 'REAL DEFAULT 0' },
    { name: 'text_embedding', type: 'BLOB' }
  ];

  schemaUpdates.forEach(col => {
    db.run(`ALTER TABLE screenshots ADD COLUMN ${col.name} ${col.type}`, (err) => {
      // It's expected to fail if the column already exists
    });
  });

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
