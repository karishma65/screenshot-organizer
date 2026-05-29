const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const { processScreenshot } = require('./pipeline');

let totalFiles = 0;
let processedCount = 0;
let progressInterval = null;

/**
 * Sends progress updates to the renderer.
 */
function sendProgress(mainWindow) {
  if (!mainWindow) return;
  mainWindow.webContents.send('scan-progress', {
    total: totalFiles,
    processed: processedCount,
  });
}

const WATCH_PATH = 'C:\\Users\\A.KARISHMA\\Pictures\\Screenshots';

/**
 * Initial Scan: Processes all existing screenshots in the directory
 */
async function initialScan(mainWindow) {
  console.log('Core: Starting initial bulk scan...');
  
  // Wait 1 second to ensure DB tables are ready
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  try {
    const files = fs.readdirSync(WATCH_PATH);
    const imageFiles = files.filter(file => 
      ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(file).toLowerCase())
    );

    totalFiles = imageFiles.length;
    processedCount = 0;
    console.log(`Core: Found ${totalFiles} existing screenshots to check.`);
    
    db.log('Bulk Scan Started', `Scanning ${totalFiles} existing files`, 'info');

    // Send initial progress (0%)
    sendProgress(mainWindow);

    let batchCounter = 0;

    for (const file of imageFiles) {
      const filePath = path.join(WATCH_PATH, file);
      await processScreenshot(filePath, mainWindow);
      processedCount++;
      batchCounter++;
      
      sendProgress(mainWindow);
      
      // 1. Tiny pause between every file (Fast)
      await new Promise(resolve => setTimeout(resolve, 200));

      // 2. LARGE COOLING BREAK every 30 files (Heavy Duty Protection)
      if (batchCounter >= 30) {
        console.log('Core: Batch complete. Taking a 5-second cooling break...');
        db.log('Cooling Break', 'Allowing laptop to stabilize before next batch.', 'info');
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        batchCounter = 0; // Reset batch
      }
    }

    console.log('Core: Initial scan complete.');
    db.run('INSERT INTO activity_logs (action, details, status) VALUES (?, ?, ?)', 
      ['Bulk Scan Finished', 'All existing files processed', 'success']);

  } catch (error) {
    console.error('Core: Initial scan error:', error);
  }
}

/**
 * Continuous Watcher: Monitors for future screenshot additions
 */
function startWatcher(mainWindow) {
  // 1. Kick off the initial scan immediately
  initialScan(mainWindow);

  // 2. Start the continuous watcher for new files
  const watcher = chokidar.watch(WATCH_PATH, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true, // Crucial: initialScan() handles the existing files
  });

  // Debounce rapid file events (max 1 per 200ms)
  const debouncedAdd = debounce((filePath) => {
    console.log(`Watcher: New screenshot detected: ${filePath}`);
    db.run('INSERT INTO activity_logs (action, details, status) VALUES (?, ?, ?)', 
      ['New screenshot detected', `File: ${path.basename(filePath)}`, 'info']);

    if (mainWindow) {
      mainWindow.webContents.send('fromMain', {
        type: 'NEW_SCREENSHOT',
        payload: { path: filePath, filename: path.basename(filePath) }
      });
    }
    processScreenshot(filePath, mainWindow);
  }, 200);

  watcher.on('add', debouncedAdd);

  return watcher;
}

/** Simple debounce utility */
function debounce(fn, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}

module.exports = { startWatcher };
