const { extractText } = require('./ocr_analyzer');
const { detectPlatform } = require('./ui_analyzer');
const { classifyImage } = require('./visual_analyzer');
const { analyzeLayout } = require('./layout_analyzer');
const imghash = require('imghash');
const db = require('./database');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bridge = require('./pythonBridge');

function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

const processingQueue = new Set();

async function getSemanticGroup(text) {
  try {
    // Correcting db access: db is the instance exported from database.js
    const rows = await new Promise((resolve, reject) => {
      db.all("SELECT study_group_name, ocr_text FROM screenshots WHERE main_category = 'STUDY' AND study_group_name != 'NONE' LIMIT 100", (err, rows) => {
        if (err) resolve([]); // Fallback to empty if table doesn't exist yet
        else resolve(rows || []);
      });
    });
    
    if (rows.length === 0) return 'NONE';

    const clusters = rows.map(r => [r.study_group_name, r.ocr_text]);
    const result = await bridge.request('semantic', { text, clusters });
    return result || 'NONE';
  } catch (e) {
    console.error('Semantic Analysis Bridge Error (Recovering...):', e);
    return 'NONE'; // CRITICAL FALLBACK: Do not stop processing
  }
}

async function processScreenshot(filePath, mainWindow, organizedRoot) {
  if (!organizedRoot) return;
  if (processingQueue.has(filePath)) return;
  processingQueue.add(filePath);

  let currentId = null;
  let errorMessage = '';

  try {
    const fileName = path.basename(filePath);
    
    // Ensure bridge is booted
    await bridge.boot();

    await new Promise((resolve) => {
      db.run('INSERT OR IGNORE INTO screenshots (original_path, filename, processing_status) VALUES (?, ?, ?)', 
        [filePath, fileName, 'processing'], function(err) {
          currentId = this.lastID;
          resolve();
        }
      );
    });

    db.log('ANALYSIS_START', `Processing: ${fileName}`, 'info');

    // 0. DUPLICATE DETECTION (Two-Step)
    let sha256 = '';
    let phash = '';
    let duplicateType = 'UNIQUE';
    let duplicateOf = null;
    let similarity = 0;
    let cachedOcr = null;

    try {
      // Step 1: SHA256 (Exact)
      sha256 = await getFileHash(filePath);
      const exactMatch = await new Promise(resolve => {
        db.get('SELECT id, ocr_text FROM screenshots WHERE sha256 = ? AND id != ? AND processing_status = "completed" LIMIT 1', [sha256, currentId], (err, row) => resolve(row));
      });

      if (exactMatch) {
        duplicateType = 'EXACT_DUPLICATE';
        duplicateOf = exactMatch.id;
        similarity = 1.0;
        cachedOcr = exactMatch.ocr_text;
      } else {
        // Step 2: pHash (Near)
        phash = await imghash.hash(filePath);
        const nearMatch = await new Promise(resolve => {
          db.get('SELECT id, ocr_text FROM screenshots WHERE original_hash = ? AND id != ? AND processing_status = "completed" LIMIT 1', [phash, currentId], (err, row) => resolve(row));
        });

        if (nearMatch) {
          duplicateType = 'NEAR_DUPLICATE';
          duplicateOf = nearMatch.id;
          similarity = 0.95; 
          cachedOcr = nearMatch.ocr_text;
        }
      }
    } catch (e) {
      console.warn('Hash Calculation Failed', e);
    }

    if (duplicateOf) {
      db.run(`
        UPDATE screenshots SET 
          is_duplicate = 1, 
          duplicate_of = ?, 
          similarity_score = ?, 
          sha256 = ?, 
          original_hash = ?,
          ocr_text = ?,
          main_category = 'DUPLICATES',
          processing_status = 'completed' 
        WHERE id = ?
      `, [duplicateOf, similarity, sha256, phash, cachedOcr, currentId]);

      db.log('DUPLICATE_DETECTED', `${fileName} is ${duplicateType} of ${duplicateOf} (OCR Reused)`, 'warning');
      processingQueue.delete(filePath);
      return;
    }

    // 1. OCR (REDUCE WORK: Check if we have exact copy in the past regardless of duplicate status)
    let text = cachedOcr;
    if (!text) {
      try {
          text = await extractText(filePath);
      } catch (e) {
          errorMessage += `OCR Failed; `;
          text = '';
      }
    }

    // 2. Layout Analysis (Fast Density-based)
    let layout = 'UNKNOWN_LAYOUT';
    let layoutConfidence = 0;
    try {
      const layoutResult = await analyzeLayout(filePath);
      layout = layoutResult.layout;
      layoutConfidence = layoutResult.confidence;
    } catch (e) {
      errorMessage += `Layout AI Failed; `;
    }

    // 3. Platform Detection (ENHANCED)
    let platform = 'UNKNOWN';
    let uiConfidence = 0;
    let digitalType = 'NONE';
    try {
        const detection = detectPlatform(text, layout);
        platform = detection.platform.toUpperCase();
        uiConfidence = detection.confidence;
        digitalType = detection.digital_type;
    } catch (e) {
        console.error('Platform Detection Failed:', e);
    }

    // 4. Visual AI (CLIP)
    let visualResults = [];
    let visualLabels = [];
    let visualConfidence = 0;
    try {
        visualResults = await classifyImage(filePath);
        visualLabels = visualResults.map(r => r.label);
        // Take highest confidence from results if available
        if (visualResults.length > 0) {
            visualConfidence = visualResults[0].confidence;
        }
    } catch (e) {
        errorMessage += `Visual AI Failed; `;
    }

    // 5. Semantic Analysis (Educational Candidate Filter)
    let studyGroup = 'NONE';
    let semanticConfidence = 0;
    
    // Skip Study clustering for non-educational domains
    const nonStudyDomains = ['AI_CHAT', 'COMMUNICATION', 'SOCIAL_MEDIA', 'ENTERTAINMENT', 'SHOPPING', 'FINANCE'];
    const isEducationalCandidate = !nonStudyDomains.includes(digitalType) && text.length > 50;

    try {
        if (isEducationalCandidate) {
          studyGroup = await getSemanticGroup(text);
          semanticConfidence = (studyGroup !== 'NONE' && studyGroup !== 'UNCATEGORIZED') ? 0.85 : 0;
        }
    } catch (e) {
        studyGroup = 'NONE';
    }

    // 6. Visual & Layout Confidence (Refined)
    // layoutConfidence is now captured from analyzeLayout above.

    // 7. FINAL CONFIDENCE AGGREGATION
    // Priority Weights: UI(0.4) > Semantic(0.3) > Documents/OCR(0.2) > Visual/Layout(0.1)
    const ocrConfidence = Math.min(text.length / 500, 1.0) * 0.2;
    const finalConfidence = (uiConfidence * 0.4) + (semanticConfidence * 0.3) + ocrConfidence + (visualConfidence * 0.05) + (layoutConfidence * 0.05);

    // 8. CATEGORY DECISION ENGINE (Strict Precedence Order)
    let mainCategory = 'UNCATEGORIZED';
    let subcategory = 'NONE';
    
    // 1. SHOPPING (High Priority)
    if (digitalType === 'SHOPPING' && uiConfidence > 0.4) {
      mainCategory = 'SHOPPING';
    } 
    // 2. FINANCE (High Priority)
    else if (digitalType === 'FINANCE' && uiConfidence > 0.4) {
      mainCategory = 'FINANCE';
    }
    // 3. DIGITAL (AI, Social, Comm, Ent) - Platform Overrides Layout
    else if (digitalType !== 'NONE') {
      mainCategory = 'DIGITAL';
      subcategory = digitalType;
    }
    // 4. DOCUMENTS (Before Study)
    else if (layout === 'DOCUMENT_LAYOUT' || text.length > 350 || visualLabels.includes('document')) {
      mainCategory = 'DOCUMENTS';
    }
    // 5. STUDY
    else if (studyGroup !== 'NONE' && studyGroup !== 'UNCATEGORIZED' && semanticConfidence > 0.5) {
      mainCategory = 'STUDY';
    }
    // 6. PERSONAL
    else if (visualLabels.includes('human_photo') || visualLabels.includes('animal_photo')) {
      mainCategory = 'PERSONAL';
    }

    // THRESHOLD SAFETY: Fallback if everything is weak
    if (finalConfidence < 0.25 && mainCategory !== 'DUPLICATES') {
      mainCategory = 'UNCATEGORIZED';
      subcategory = 'NONE';
    }

    // 9. METADATA UPDATES
    const ui_conf = uiConfidence;
    const semantic_conf = semanticConfidence;
    const layout_conf = layoutConfidence;
    const visual_conf = visualConfidence;
    const final_conf = finalConfidence;

    // 8. PHYSICAL ORGANIZATION (Strict Folder Rules)
    let organizedDir = path.join(organizedRoot, mainCategory);
    
    // Dynamic Sub-folders ONLY for STUDY
    if (mainCategory === 'STUDY' && studyGroup !== 'NONE' && studyGroup !== 'UNCATEGORIZED') {
      organizedDir = path.join(organizedDir, studyGroup);
    }

      if (!fs.existsSync(organizedDir)) {
        fs.mkdirSync(organizedDir, { recursive: true });
      }
      
      const destPath = path.join(organizedDir, fileName);
      fs.copyFileSync(filePath, destPath);
      db.log('PHYSICAL_MOVE', `${fileName} moved to ${mainCategory}`, 'success');

      // 10. Generate and Cache Semantic Embedding
    let embeddingBlob = null;
    try {
      if (text && text.length > 10) {
        const embedding = await bridge.request('embedding', { text: text.substring(0, 1000) });
        if (embedding) {
          embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);
        }
      }
    } catch (e) {
      console.error('Embedding Generation Failed:', e);
    }

    // 11. DB SAVE (Full Metadata + Cache)
    db.run(`
      UPDATE screenshots SET 
        original_path = ?, organized_path = ?, filename = ?, ocr_text = ?, 
        main_category = ?, subcategory = ?, platform = ?, 
        study_group_name = ?, layout_type = ?, content_types = ?, 
        original_hash = ?, ui_confidence = ?, semantic_confidence = ?,
        visual_confidence = ?, layout_confidence = ?, final_confidence = ?,
        text_embedding = ?,
        processing_status = 'completed', error_message = ?
      WHERE id = ?
    `, [
      filePath, destPath, fileName, text,
      mainCategory, subcategory, platform,
      studyGroup, layout, JSON.stringify(visualLabels),
      phash, ui_conf, semantic_conf,
      visual_conf, layout_conf, final_conf,
      embeddingBlob,
      errorMessage || null,
      currentId
    ], (err) => {
      if (err) db.log('DB_ERROR', `Failed to update ${fileName}: ${err.message}`, 'error');
      const { ipcMain } = require('electron');
      ipcMain.emit('force-stats-update');
    });

    db.log('CATEGORIZED', `${fileName} → ${mainCategory} (${Math.round(finalConfidence * 100)}% conf)`, 'success');

  } catch (error) {
    console.error('Pipeline Crash:', error);
    db.log('PIPELINE_CRASH', `Fatal error on ${path.basename(filePath)}: ${error.message}`, 'error');
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
