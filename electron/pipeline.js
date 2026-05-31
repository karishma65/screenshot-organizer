const { extractText } = require('./ocr_analyzer');
const { detectPlatform } = require('./ui_analyzer');
const { classifyImage } = require('./visual_analyzer');
const { analyzeLayout } = require('./layout_analyzer');
const imghash = require('imghash');
const db = require('./database');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// 7. PREVENT DUPLICATE WATCHER TRIGGERS
const processingQueue = new Set();

async function getSemanticGroup(text) {
  return new Promise((resolve) => {
    try {
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      const pythonProcess = spawn(pythonCmd, [
        path.join(__dirname, '../python/analyzer.py'), 
        'analyze_semantic',
        text
      ]);

      let output = '';
      pythonProcess.stdout.on('data', (data) => { output += data.toString(); });

      pythonProcess.on('close', (code) => {
        if (code !== 0 || !output.trim()) {
          resolve('UNCATEGORIZED');
          return;
        }
        try {
          const result = JSON.parse(output);
          resolve(result.study_group.toUpperCase() || 'UNCATEGORIZED');
        } catch (e) {
          resolve('UNCATEGORIZED');
        }
      });
    } catch (e) {
      resolve('UNCATEGORIZED');
    }
  });
}

function calculateConfidence(text, platform, layout, studyGroup) {
  let score = 0;
  
  // Weights:
  // Platform Detection: 0.4
  // Semantic Match: 0.3
  // OCR Quality: 0.2
  // Layout Match: 0.1

  if (platform !== 'UNKNOWN') score += 0.4;
  if (studyGroup !== 'NONE' && studyGroup !== 'UNCATEGORIZED') score += 0.3;
  if (text.length > 50) score += 0.2;
  if (layout !== 'UNKNOWN_LAYOUT' && layout !== 'DOCUMENT_LAYOUT') score += 0.1;

  return Math.min(score, 1.0);
}

async function processScreenshot(filePath, mainWindow, organizedRoot) {
  if (!organizedRoot) return;
  if (processingQueue.has(filePath)) return;
  processingQueue.add(filePath);

  let currentId = null;
  let errorMessage = '';

  try {
    const fileName = path.basename(filePath);
    
    await new Promise((resolve) => {
      db.run('INSERT OR IGNORE INTO screenshots (original_path, filename, processing_status) VALUES (?, ?, ?)', 
        [filePath, fileName, 'processing'], function(err) {
          currentId = this.lastID;
          resolve();
        }
      );
    });

    db.log('ANALYSIS_START', `Processing: ${fileName}`, 'info');

    // 0. pHash & DUPLICATE DETECTION
    let phash = 'ERROR';
    try {
      phash = await imghash.hash(filePath);
    } catch (e) {
      console.warn('pHash Failed');
    }
    
    const existing = await new Promise(resolve => {
      db.get('SELECT id, original_hash FROM screenshots WHERE (original_hash = ? OR original_path = ?) AND id != ? AND processing_status = "completed"', 
        [phash, filePath, currentId], (err, row) => resolve(row));
    });

    if (existing) {
      db.run('UPDATE screenshots SET is_duplicate = 1, duplicate_of = ?, similarity_score = 100, processing_status = "completed", main_category = "DUPLICATES" WHERE id = ?', 
        [existing.id, currentId]);
      db.log('DUPLICATE_DETECTED', `${fileName} is a duplicate of ${existing.id}`, 'warning');
      processingQueue.delete(filePath);
      return;
    }

    // 1. OCR
    let text = '';
    try {
        text = await extractText(filePath);
    } catch (e) {
        errorMessage += `OCR Failed; `;
    }

    // 2. Layout Analysis (New)
    let layout = 'UNKNOWN_LAYOUT';
    try {
      layout = await analyzeLayout(filePath);
    } catch (e) {
      errorMessage += `Layout AI Failed; `;
    }

    // 3. Platform Detection
    let platform = 'UNKNOWN';
    try {
        platform = detectPlatform(text, layout).toUpperCase();
    } catch (e) {
        platform = 'UNKNOWN';
    }

    // 4. Visual AI
    let visualTags = [];
    try {
        visualTags = await classifyImage(filePath);
    } catch (e) {
        errorMessage += `Visual AI Failed; `;
    }

    // 5. Semantic Analysis
    let studyGroup = 'NONE';
    try {
        if (text.length > 30) {
          studyGroup = await getSemanticGroup(text);
        }
    } catch (e) {
        studyGroup = 'UNCATEGORIZED';
    }

    // 6. Confidence Engine
    const confidenceScore = calculateConfidence(text, platform, layout, studyGroup);

    // 7. Category Mapping (Strict Allowed Categories)
    let mainCategory = 'UNCATEGORIZED';
    
    // Priority Logic
    if (['CHATGPT', 'GEMINI', 'CLAUDE', 'ANTIGRAVITY'].includes(platform)) {
      mainCategory = 'AI CHATS';
    } else if (['WHATSAPP', 'TELEGRAM', 'DISCORD', 'SLACK'].includes(platform) || layout === 'CHAT_LAYOUT') {
      mainCategory = 'COMMUNICATION';
    } else if (['AMAZON', 'FLIPKART'].includes(platform)) {
      mainCategory = 'SHOPPING';
    } else if (['PAYTM', 'UPI', 'WALLET'].includes(platform) || text.toLowerCase().includes('payment')) {
      mainCategory = 'FINANCE';
    } else if (['NETFLIX', 'YOUTUBE'].includes(platform)) {
      mainCategory = 'ENTERTAINMENT';
    } else if (['INSTAGRAM', 'FACEBOOK', 'LINKEDIN'].includes(platform)) {
      mainCategory = 'SOCIAL MEDIA';
    } else if (studyGroup !== 'NONE' && studyGroup !== 'UNCATEGORIZED') {
      mainCategory = 'STUDY';
    } else if (text.length > 200 || layout === 'DOCUMENT_LAYOUT') {
      mainCategory = 'DOCUMENTS';
    }

    // THRESHOLD CHECK: Force to UNCATEGORIZED if confidence is low
    if (confidenceScore < 0.40) {
      mainCategory = 'UNCATEGORIZED';
    }

    // 8. PHYSICAL ORGANIZATION
    let organizedDir = path.join(organizedRoot, mainCategory);
    if (mainCategory === 'STUDY' && studyGroup !== 'NONE' && studyGroup !== 'UNCATEGORIZED') {
      organizedDir = path.join(organizedDir, studyGroup);
    }

    if (!fs.existsSync(organizedDir)) {
      fs.mkdirSync(organizedDir, { recursive: true });
    }
    
    const destPath = path.join(organizedDir, fileName);
    fs.copyFileSync(filePath, destPath);

    // 9. DB SAVE
    db.run(`
      UPDATE screenshots SET 
        original_path = ?, organized_path = ?, filename = ?, ocr_text = ?, 
        main_category = ?, platform = ?, content_types = ?, 
        original_hash = ?, study_group_name = ?, tags = ?,
        processing_status = 'completed', confidence_score = ?, error_message = ?
      WHERE id = ?
    `, [
      filePath, destPath, fileName, text,
      mainCategory, platform, JSON.stringify(visualTags),
      phash, studyGroup, layout,
      confidenceScore, errorMessage || null,
      currentId
    ], (err) => {
      const { ipcMain } = require('electron');
      ipcMain.emit('force-stats-update');
    });

    db.log('CATEGORIZED', `${fileName} → ${mainCategory} (${Math.round(confidenceScore * 100)}% conf)`, 'success');

  } catch (error) {
    console.error('Pipeline Crash:', error);
    if (currentId) {
      db.run('UPDATE screenshots SET processing_status = "failed", error_message = ? WHERE id = ?', [error.message, currentId]);
    }
  } finally {
    processingQueue.delete(filePath);
    if (mainWindow) {
      mainWindow.webContents.send('scan-progress', { processed: 1 });
    }
  }
}

module.exports = { processScreenshot };
