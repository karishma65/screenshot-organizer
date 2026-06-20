//chokidar is a file-system monitoring library.
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

/**
 * Initial Scan: Processes all existing screenshots in the directory
 */
async function initialScan(mainWindow, watchPath, organizedPath, isRebuild = false) {
  if (!watchPath || !fs.existsSync(watchPath)) return;
  console.log(`Core: Starting ${isRebuild ? 'library rebuild' : 'initial bulk scan'}...`);

  // Wait 1 second to ensure DB tables are ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    const files = fs.readdirSync(watchPath);
    const imageFiles = files.filter(file =>
      ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(file).toLowerCase())
    );

    totalFiles = imageFiles.length;
    processedCount = 0;
    console.log(`Core: Found ${totalFiles} existing screenshots to check.`);

    db.log(isRebuild ? 'Library Rebuild Started' : 'Bulk Scan Started', `Scanning ${totalFiles} existing files`, 'info');

    // Update global state if it's a rebuild
    if (isRebuild && mainWindow) {
      mainWindow.webContents.send('rebuild-progress', {
        active: true,
        phase: 'Scanning files',
        filesProcessed: 0,
        totalFiles: totalFiles,
        percentage: 0
      });
    }

    // Send initial progress (0%)
    sendProgress(mainWindow);

    let batchCounter = 0;

    for (const file of imageFiles) {
      const filePath = path.join(watchPath, file);
      await processScreenshot(filePath, mainWindow, organizedPath);
      processedCount++;
      batchCounter++;

      const percentage = totalFiles > 0 ? Math.round((processedCount / totalFiles) * 100) : 0;

      if (isRebuild && mainWindow) {
        mainWindow.webContents.send('rebuild-progress', {
          active: true,
          phase: 'Processing screenshots',
          filesProcessed: processedCount,
          totalFiles: totalFiles,
          percentage: percentage
        });
      }

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
      [isRebuild ? 'Library Rebuild Finished' : 'Bulk Scan Finished', 'All existing files processed', 'success']);

    if (isRebuild && mainWindow) {
      mainWindow.webContents.send('rebuild-progress', {
        active: false,
        phase: 'Completed',
        filesProcessed: processedCount,
        totalFiles: totalFiles,
        percentage: 100
      });
    }

  } catch (error) {
    console.error('Core: Initial scan error:', error);
    if (isRebuild && mainWindow) {
      mainWindow.webContents.send('rebuild-progress', {
        active: false,
        phase: 'Failed',
        filesProcessed: processedCount,
        totalFiles: totalFiles,
        percentage: 0
      });
    }
  }
}

let activeWatcher = null;

/**
 * Continuous Watcher: Monitors for future screenshot additions
 */
function startWatcher(mainWindow, watchPath, organizedPath) {
  if (activeWatcher) {
    activeWatcher.close();
  }

  // 1. Kick off the initial scan immediately
  initialScan(mainWindow, watchPath, organizedPath);

  // 2. Start the continuous watcher for new files
  activeWatcher = chokidar.watch(watchPath, {
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
    processScreenshot(filePath, mainWindow, organizedPath);
  }, 200);

  activeWatcher.on('add', debouncedAdd);

  return activeWatcher;
}

function stopWatcher() {
  if (activeWatcher) {
    activeWatcher.close();
    activeWatcher = null;
  }
}

/** Simple debounce utility */
function debounce(fn, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}

module.exports = { startWatcher, initialScan, stopWatcher };
