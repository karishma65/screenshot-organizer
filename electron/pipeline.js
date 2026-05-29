const { extractText } = require('./ocr_analyzer');
const { detectPlatform } = require('./ui_analyzer');
const { classifyImage } = require('./visual_analyzer');
const imghash = require('imghash');
const db = require('./database');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

/**
 * 4. SEMANTIC ANALYZER (Python Bridge)
 */
async function getSemanticGroup(text) {
  return new Promise((resolve) => {
    // Try 'python' then 'py' then 'python3'
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    console.log(`Pipeline: Calling Semantic AI (${pythonCmd})...`);
    
    const pythonProcess = spawn(pythonCmd, [
      path.join(__dirname, '../python/analyzer.py'), 
      text
    ]);

    let output = '';
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0 || !output.trim()) {
        resolve('Unsorted');
        return;
      }
      try {
        const result = JSON.parse(output);
        resolve(result.study_group || 'Unsorted');
      } catch (e) {
        console.error('Semantic Parse Error:', e.message);
        resolve('Unsorted');
      }
    });
  });
}

/**
 * 6. CONFIDENCE ENGINE
 */
function calculateConfidence(results) {
  let score = 0;
  if (results.ocr) score += 0.2;
  if (results.ui !== 'UNKNOWN') score += 0.3;
  if (results.visual.length > 0) score += 0.2;
  if (results.semantic !== 'Unsorted') score += 0.3;
  return score;
}

async function processScreenshot(filePath, mainWindow) {
  try {
    console.log(`Pipeline: Processing ${path.basename(filePath)}...`);

    // 0. DUPLICATE DETECTION (pHash)
    let phash = 'error_hash';
    try {
      phash = await imghash.hash(filePath);
      console.log('Pipeline: pHash Generated.');
    } catch (e) {
      console.warn(`pHash Failed:`, e.message);
    }
    
    // Check DB for matches
    const existing = await new Promise(resolve => {
      db.get('SELECT id FROM screenshots WHERE original_hash = ? OR original_path = ?', [phash, filePath], (err, row) => resolve(row));
    });
    if (existing) {
      console.log('Pipeline: Skipping (already indexed).');
      return;
    }

    // 1. OCR ANALYZER
    console.log('Pipeline: Running OCR...');
    const text = await extractText(filePath);
    const lowerText = text.toLowerCase();

    // 2. UI ANALYZER (Platform)
    const platform = detectPlatform(text);
    console.log(`Pipeline: Platform detected -> ${platform}`);

    // 3. IMAGE CLASSIFIER (Visual Content Types)
    console.log('Pipeline: Running Visual AI...');
    let visualTags = [];
    try {
      visualTags = await classifyImage(filePath);
      console.log(`Pipeline: Visual tags -> ${visualTags.join(', ')}`);
    } catch (e) {
      console.warn(`Visual AI Failed:`, e.message);
    }

    // 4. LAYOUT ANALYZER (Simulated via text structure)
    // Identify "Code" or "Chat" layouts
    if (lowerText.includes('const ') || lowerText.includes('import ')) visualTags.push('code');
    if (lowerText.includes('message') || lowerText.includes('whatsapp')) visualTags.push('chat');

    // 5. SEMANTIC ANALYZER (Context / Study Clusters)
    let studyGroup = 'None';
    if (text.length > 50) {
      studyGroup = await getSemanticGroup(text);
    }

    // 6. CONFIDENCE ENGINE
    const confidence = calculateConfidence({ ocr: text, ui: platform, visual: visualTags, semantic: studyGroup });

    // FINAL CATEGORIZATION DECISION
    let mainCategory = 'Uncategorized';
    
    if (confidence < 0.4) {
      mainCategory = 'Uncategorized';
    } else if (studyGroup !== 'None' && (platform === 'YouTube' || platform === 'UNKNOWN')) {
      mainCategory = 'Study';
    } else if (['CHATGPT', 'GEMINI', 'CLAUDE'].includes(platform)) {
      mainCategory = 'AI Chats';
    } else if (['INSTAGRAM', 'YOUTUBE', 'FACEBOOK'].includes(platform)) {
      mainCategory = 'Social Media';
    } else if (['WHATSAPP', 'DISCORD', 'SLACK'].includes(platform)) {
      mainCategory = 'Communication';
    } else if (['AMAZON', 'FLIPKART', 'MEESHO'].includes(platform)) {
      mainCategory = 'Shopping';
    } else if (visualTags.includes('code')) {
      mainCategory = 'Study'; // Or Personal depending on context
    }

    // 7. PHYSICAL ORGANIZATION (SINGLE COPY ONLY)
    // ONLY use subfolders for intelligence-rich categories
    const subFolderCategories = ['Study', 'AI Chats', 'Social Media', 'Communication', 'Shopping'];
    let organizedRoot = path.join(__dirname, '../OrganizedScreenshots', mainCategory);
    
    if (subFolderCategories.includes(mainCategory)) {
      let subFolder = studyGroup !== 'None' ? studyGroup : platform !== 'UNKNOWN' ? platform : 'General';
      organizedRoot = path.join(organizedRoot, subFolder);
    }
    
    if (!fs.existsSync(organizedRoot)) {
      fs.mkdirSync(organizedRoot, { recursive: true });
    }
    
    const destPath = path.join(organizedRoot, path.basename(filePath));
    fs.copyFileSync(filePath, destPath);

    // 8. METADATA SAVE (Bridges ALL Tags)
    const contentTags = JSON.stringify(visualTags);
    db.run(`
      INSERT INTO screenshots (
        original_path, organized_path, filename, ocr_text, 
        main_category, platform, content_types, 
        original_hash, confidence, study_group_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      filePath, destPath, path.basename(filePath), text,
      mainCategory, platform, contentTags,
      phash, confidence, studyGroup
    ]);

    // Notify Renderer
    if (mainWindow) {
      mainWindow.webContents.send('scan-progress', { processed: 1 });
    }

  } catch (error) {
    console.error('Pipeline Error:', error);
  }
}

module.exports = { processScreenshot };
