//final classification decision scoring done here

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
    const rows = await new Promise((resolve, reject) => {
      db.all("SELECT study_group_name, ocr_text FROM screenshots WHERE main_category = 'STUDY' AND study_group_name != 'NONE' LIMIT 100", (err, rows) => {
        if (err) resolve([]);
        else resolve(rows || []);
      });
    });

    if (rows.length === 0) return 'NONE';

    const clusters = rows.map(r => [r.study_group_name, r.ocr_text]);
    const result = await bridge.request('semantic', { text, clusters });
    return result || 'NONE';
  } catch (e) {
    console.error('Semantic Analysis Bridge Error (Recovering...):', e);
    return 'NONE';
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

    await bridge.boot();

    try {
      const insertedId = await new Promise((resolve, reject) => {
        db.run('INSERT OR IGNORE INTO screenshots (original_path, filename, processing_status) VALUES (?, ?, ?)',
          [filePath, fileName, 'processing'], function (err) {
            if (err) return reject(err);
            if (this.lastID !== 0) resolve(this.lastID);
            else {
              db.get('SELECT id FROM screenshots WHERE original_path = ?', [filePath], (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.id : null);
              });
            }
          }
        );
      });
      currentId = insertedId;
    } catch (e) {
      console.error('Initial DB insert failed:', e);
      throw e;
    }

    if (!currentId) {
      throw new Error(`Failed to initialize or retrieve record for ${fileName}`);
    }

    db.log('ANALYSIS_START', `Processing: ${fileName}`, 'info');

    // 0. DUPLICATE DETECTION
    let sha256 = '';
    let phash = '';
    let duplicateType = 'UNIQUE';
    let duplicateOf = null;
    let similarity = 0;
    let cachedOcr = null;

    try {
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

    // 1. OCR
    let text = cachedOcr;
    if (!text) {
      try {
        text = await extractText(filePath);
      } catch (e) {
        errorMessage += `OCR Failed; `;
        text = '';
      }
    }

    // 2. Layout Analysis
    let layout = 'UNKNOWN_LAYOUT';
    let layoutConfidence = 0;
    try {
      const layoutResult = await analyzeLayout(filePath);
      layout = layoutResult.layout;
      layoutConfidence = layoutResult.confidence;
    } catch (e) {
      errorMessage += `Layout AI Failed; `;
    }

    // 3. Platform Detection
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
      const visualResponse = await classifyImage(filePath);
      console.log('RAW classifyImage RESPONSE:', JSON.stringify(visualResponse, null, 2));

      // Safety: visual_analyzer.js returns [] on error, but bridge could return null
      visualResults = Array.isArray(visualResponse) ? visualResponse : (visualResponse?.labels || []);
      console.log('VISUAL RESULTS AFTER PARSING:', JSON.stringify(visualResults, null, 2));

      visualLabels = visualResults.map(r => r.label);
      if (visualResults.length > 0) {
        visualConfidence = visualResults[0].confidence;
      }

      console.log(`[DEBUG] Signal Chain [${fileName}] -> Labels:`, visualLabels);
    } catch (e) {
      errorMessage += `Visual AI Failed; `;
      console.error(`[DEBUG] visual_analyzer Exception:`, e);
    }

    // Helper: get confidence for a specific label (not just top-1)
    function labelConf(label) {
      if (!Array.isArray(visualResults)) return 0;
      const r = visualResults.find(x => x.label === label);
      return r ? r.confidence : 0;
    }

    // Mapped Confidences for Debugging
    const humanConf = labelConf('human_photo');
    const animalConf = labelConf('animal_photo');
    const pdfConf = labelConf('pdf_page');
    const slideConf = labelConf('presentation_slide');
    const bookConf = labelConf('book_page');
    const scannedConf = labelConf('scanned_doc');
    const certConf = labelConf('certificate');

    console.log(`[DEBUG] SIGNAL CHECK [${fileName}] -> pdf:${pdfConf.toFixed(2)}, slide:${slideConf.toFixed(2)}, book:${bookConf.toFixed(2)}, human:${humanConf.toFixed(2)}, animal:${animalConf.toFixed(2)}`);

    // 5. Advanced Retrieval Indexing (OCR, Faces, SigLIP)
    console.log(`[Retrieval] Analyzing: ${fileName}`);
    let retrievalData = null;
    let faceIdsTracked = [];
    try {
       // Fetch dynamic threshold from settings (with safe default)
       const qualityThreshold = await db.getSetting('face_quality_threshold', '0.1');

       retrievalData = await bridge.request('retrieval_analyze', { 
         image_path: filePath,
         quality_threshold: qualityThreshold
       });
       
       console.log(`[DEBUG][INDEX]\nFile: ${fileName}\nFaces detected: ${retrievalData?.faces?.length || 0}\nVisual embeddings: ${retrievalData?.visual_embedding ? 1 : 0}\nPatch embeddings: ${retrievalData?.patch_embeddings?.length || 0}\nMeeting IDs: ${retrievalData?.meeting_ids?.join(', ') || 'None'}`);

       if (retrievalData && !retrievalData.error) {
           const facePushData = [];
           if (retrievalData.faces) {
             for (const face of retrievalData.faces) {
               const faceId = await new Promise((resolve, reject) => {
                 db.run(`
                   INSERT INTO faces (screenshot_id, bbox, confidence, blur_score, face_quality_score, size_px)
                   VALUES (?, ?, ?, ?, ?, ?)
                 `, [currentId, JSON.stringify(face.bbox), face.confidence, face.blur_score, face.face_quality_score, face.size_px], 
                 function(err) { 
                   if (err) reject(err);
                   else resolve(this.lastID); 
                 });
               });
               faceIdsTracked.push(faceId);
               facePushData.push({ db_id: faceId, embedding: face.embedding });
             }
           }

           const visualEmbeddings = [retrievalData.visual_embedding, ...(retrievalData.patch_embeddings || [])];
           await bridge.request('retrieval_push_vectors', {
             screenshot_id: currentId,
             visual_embeddings: visualEmbeddings,
             faces: facePushData
           });
           
           console.log(`[DEBUG] retrieval_push_vectors success: screenshot_id=${currentId}, faces=${facePushData.length}, visual=${visualEmbeddings.length}`);
           
           if (retrievalData.full_text) {
             text = retrievalData.full_text;
           }
       } else if (retrievalData && retrievalData.error) {
           // Log but continue if non-fatal
           console.warn(`Retrieval indexing partial failure for ${fileName}: ${retrievalData.error}`);
       }
    } catch (e) {
      console.error('Retrieval Indexing Failed:', e);
      errorMessage += `Retrieval Indexing Failed; `;
    }

    // 5. Semantic Analysis
    let studyGroup = 'NONE';
    let semanticConfidence = 0;
    try {
      if (text.length > 30) {
        studyGroup = await getSemanticGroup(text);
        semanticConfidence = (studyGroup !== 'NONE' && studyGroup !== 'UNCATEGORIZED') ? 0.85 : 0;
      }
    } catch (e) {
      studyGroup = 'NONE';
    }

    // ==========================================
    // 8. GENERALIZED CATEGORY SCORING ENGINE
    // ==========================================
    const scores = {
      STUDY: 0,
      DIGITAL: 0,
      SHOPPING: 0,
      FINANCE: 0,
      PERSONAL: 0,
      DOCUMENTS: 0
    };

    // ── 8.1  UI Analyzer signals ──────────────────────────────────────────
    if (digitalType === 'SHOPPING') scores.SHOPPING += uiConfidence * 2.0;
    if (digitalType === 'FINANCE') scores.FINANCE += uiConfidence * 2.0;
    if (digitalType === 'DEVELOPER') scores.STUDY += uiConfidence * 1.5;
    if (['AI_CHAT', 'COMMUNICATION', 'SOCIAL_MEDIA', 'ENTERTAINMENT', 'DIGITAL']
      .includes(digitalType)) {
      scores.DIGITAL += uiConfidence * 1.2;
    }

    // ── 8.2  Visual AI (CLIP) signals ────────────────────────────────────

    // Photos → PERSONAL
    const personalConf = Math.max(humanConf, animalConf);
    if (personalConf > 0) scores.PERSONAL += personalConf * 4.0; // Boosted even more

    // Code editor → STUDY
    const codeConf = labelConf('code_editor');
    if (codeConf > 0) scores.STUDY += codeConf * 2.0;

    // Diagrams/graphs → STUDY
    const diagramConf = labelConf('diagram');
    const graphConf = labelConf('graph');
    if (diagramConf > 0) {
      scores.STUDY += diagramConf * 2.0;
      scores.DOCUMENTS += diagramConf * 0.2;
    }
    if (graphConf > 0) {
      scores.STUDY += graphConf * 1.8;
      scores.DOCUMENTS += graphConf * 0.2;
    }

    // Documents (PPT/PDF/Books) - REFINED SCORING
    if (pdfConf > 0) scores.DOCUMENTS += pdfConf * 2.5;
    if (slideConf > 0) scores.DOCUMENTS += slideConf * 2.5;
    if (bookConf > 0) scores.DOCUMENTS += bookConf * 1.8;
    if (scannedConf > 0) scores.DOCUMENTS += scannedConf * 1.8;
    if (certConf > 0) scores.DOCUMENTS += certConf * 1.8;

    // Chat & social app visuals
    const chatConf = labelConf('chat_app');
    const socialConf = labelConf('social_media_feed');
    if (chatConf > 0) scores.DIGITAL += chatConf * 1.5;
    if (socialConf > 0) scores.DIGITAL += socialConf * 1.3;

    // Shopping / payment app
    const shopAppConf = labelConf('shopping_app');
    const paymentAppConf = labelConf('payment_app');
    const videoConf = labelConf('video_streaming_app');
    if (shopAppConf > 0) scores.SHOPPING += shopAppConf * 1.8;
    if (paymentAppConf > 0) scores.FINANCE += paymentAppConf * 1.8;
    if (videoConf > 0) scores.DIGITAL += videoConf * 1.2;

    // Anime / movie
    const animeConf = labelConf('anime');
    const movieConf = labelConf('movie_scene');
    if (animeConf > 0) scores.DIGITAL += animeConf * 2.0;
    if (movieConf > 0) scores.DIGITAL += movieConf * 2.0;

    // ── 8.3  Layout Analyzer signals ─────────────────────────────────────
    if (layout === 'CHAT_LAYOUT') scores.DIGITAL += layoutConfidence * 1.2;
    if (layout === 'CODE_LAYOUT') scores.STUDY += layoutConfidence * 1.3;
    if (layout === 'DIAGRAM_LAYOUT') scores.STUDY += layoutConfidence * 1.5;
    if (layout === 'DOCUMENT_LAYOUT') scores.DOCUMENTS += layoutConfidence * 1.5;
    if (layout === 'PHOTO_LAYOUT') scores.PERSONAL += layoutConfidence * 1.5;

    // ── 8.4  Semantic Analyzer signal ────────────────────────────────────
    if (studyGroup !== 'NONE' && studyGroup !== 'UNCATEGORIZED') {
      scores.STUDY += semanticConfidence * 1.8;
    }

    // ── 8.5  EXCLUSION & SUPPRESSION GUARDS ──────────────────────────────────
    // 1. Interactive UI Detection: Suppress Documents if clearly a UI
    const isClearlyInteractiveUI = (
      layout === 'CHAT_LAYOUT' ||
      layout === 'CODE_LAYOUT' ||
      digitalType !== 'NONE' ||
      chatConf > 0 ||
      socialConf > 0
    );
    if (isClearlyInteractiveUI) {
      scores.DOCUMENTS *= 0.2;
    }

    // 2. PDF Context Guard: Suppress Social/Digital if strong Document signal
    if (pdfConf > 0.4 || slideConf > 0.4 || bookConf > 0.4 || scannedConf > 0.4) {
      scores.DIGITAL *= 0.1;
      scores.SHOPPING *= 0.1;
      scores.FINANCE *= 0.1;
    }

    // 3. Shopping Context Guard
    if (scores.SHOPPING > 0.5) {
      scores.DOCUMENTS *= 0.3;
    }

    // 4. Browser Context Guard
    if (platform === 'GOOGLE_SEARCH') {
      scores.FINANCE *= 0.05;
      scores.SHOPPING *= 0.2;
      scores.DIGITAL += 0.5;
    }

    // ── 8.6  Metadata generation ─────────────────────────────────────────
    let docType = 'Unknown';
    if (pdfConf > 0.15) docType = 'PDF';
    else if (slideConf > 0.15) docType = 'PPT';
    else if (bookConf > 0.15) docType = 'Book Page';
    else if (scannedConf > 0.15) docType = 'Scanned Doc';
    else if (certConf > 0.15) docType = 'Certificate';

    let isCode = codeConf > 0.15 || layout === 'CODE_LAYOUT';
    let codeLang = 'Unknown';
    let editor = 'Unknown';

    if (isCode) {
      if (text.includes('import ') || text.includes('const ') || text.includes('function ')) {
        codeLang = 'JavaScript/TypeScript';
      } else if (text.includes('def ') || (text.includes('import ') && text.includes('.py'))) {
        codeLang = 'Python';
      } else if (text.includes('public class ') || text.includes('System.out')) {
        codeLang = 'Java';
      }

      const lowerText = text.toLowerCase();
      if (lowerText.includes('vscode') || lowerText.includes('visual studio code')) editor = 'VS Code';
      else if (lowerText.includes('intellij')) editor = 'IntelliJ';
      else if (lowerText.includes('android studio')) editor = 'Android Studio';
      else if (lowerText.includes('eclipse ide')) editor = 'Eclipse';
      else if (lowerText.includes('genie')) editor = 'Genie';
    }

    // Tags
    let tags = [];
    const qrConf = labelConf('qr_code');
    if (qrConf > 0.2) tags.push('QRCode');
    if (diagramConf > 0.2 || graphConf > 0.2) tags.push('Diagram');
    if (isCode) tags.push('Code');

    // ── 8.7  FINAL DECISION ──────────────────────────────────────────────
    let mainCategory = 'UNCATEGORIZED';
    let maxScore = 0;

    for (const [cat, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        mainCategory = cat;
      }
    }

    // Threshold check: Significantly lowered to avoid Uncategorized
    if (maxScore < 0.12) {
      mainCategory = 'UNCATEGORIZED';
    }

    console.log(`[SCORING] ${fileName} -> ${mainCategory} (${maxScore.toFixed(2)})`, scores);

    const finalConfidence = Math.min(maxScore, 1.0);
    let subcategory = digitalType !== 'NONE' ? digitalType : 'NONE';

    // Entertainment subcategory for anime/movie
    if (mainCategory === 'DIGITAL' && subcategory === 'NONE') {
      if (animeConf > 0 || movieConf > 0) subcategory = 'ENTERTAINMENT';
    }

    // Log the scores
    console.log(`SCORING [${fileName}]:`, scores);
    db.log('CORE_SCORING',
      `Category: ${mainCategory} | Scores: ${JSON.stringify(scores)} | Tags: ${tags.join(',')}`,
      'info'
    );

    const ui_conf = uiConfidence;
    const semantic_conf = semanticConfidence;
    const layout_conf = layoutConfidence;
    const visual_conf = visualConfidence;
    const final_conf = finalConfidence;

    // ── 8.8  Physical organization (Collision Protected) ───────────────────
    let organizedDir = path.join(organizedRoot, mainCategory);

    if (mainCategory === 'STUDY' && studyGroup !== 'NONE' && studyGroup !== 'UNCATEGORIZED') {
      organizedDir = path.join(organizedDir, studyGroup);
    }

    try {
      await fs.promises.mkdir(organizedDir, { recursive: true });
    } catch (e) {
      console.warn('Directory Creation Failed (might exist):', e.message);
    }

    // Filename collision protection
    let finalFileName = fileName;
    let destPath = path.join(organizedDir, finalFileName);
    let counter = 1;

    while (fs.existsSync(destPath)) { // existsSync is fine for small loops but copy is heavy
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      finalFileName = `${base}_${counter}${ext}`;
      destPath = path.join(organizedDir, finalFileName);
      counter++;
    }

    await fs.promises.copyFile(filePath, destPath);
    db.log('PHYSICAL_MOVE', `${finalFileName} moved to ${mainCategory}`, 'success');

    // ── 10  Embedding ─────────────────────────────────────────────────────
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

    // ── 11  DB save (Transactional Wrap) ──────────────────────────────────
    try {
      await new Promise((resolve, reject) => {
        db.run(`
          UPDATE screenshots SET
            original_path = ?, organized_path = ?, filename = ?, ocr_text = ?,
            main_category = ?, subcategory = ?, platform = ?,
            study_group_name = ?, layout_type = ?, content_types = ?,
            document_type = ?, is_code = ?, code_language = ?, editor = ?,
            original_hash = ?, ui_confidence = ?, semantic_confidence = ?,
            visual_confidence = ?, layout_confidence = ?, final_confidence = ?,
            text_embedding = ?,
            ocr_full = ?, meeting_ids = ?,
            processing_status = 'completed', error_message = ?
          WHERE id = ?
        `, [
          filePath, destPath, finalFileName, text,
          mainCategory, subcategory, platform,
          studyGroup, layout, JSON.stringify(visualLabels),
          docType, isCode ? 1 : 0, codeLang, editor,
          phash, ui_conf, semantic_conf,
          visual_conf, layout_conf, final_conf,
          embeddingBlob,
          (retrievalData && retrievalData.full_text !== undefined && retrievalData.full_text !== null) ? retrievalData.full_text : null,
          (retrievalData && retrievalData.meeting_ids) ? JSON.stringify(retrievalData.meeting_ids) : '[]',
          errorMessage || null,
          currentId
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (saveError) {
       console.error('CORE: DB persistence failed, triggering transactional rollback.', saveError);
       // Purge FAISS vectors and delete orphaned records
       await bridge.request('retrieval_rollback', { 
         screenshot_id: currentId, 
         face_ids: faceIdsTracked || [] 
       });
       throw saveError;
    }

    // Trigger UI updates
    const { ipcMain } = require('electron');
    ipcMain.emit('force-stats-update');

    db.log('CATEGORIZED',
      `${fileName} → ${mainCategory} (${Math.round(finalConfidence * 100)}% conf)`,
      'success'
    );

  } catch (error) {
    console.error('Pipeline Crash:', error);
    db.log('PIPELINE_CRASH', `Fatal error on ${path.basename(filePath)}: ${error.message}`, 'error');
    if (currentId) {
      db.run('UPDATE screenshots SET processing_status = "failed", error_message = ? WHERE id = ?',
        [error.message, currentId]);
    }
  } finally {
    processingQueue.delete(filePath);
    if (mainWindow) {
      mainWindow.webContents.send('scan-progress', { processed: 1 });
    }
  }
}

module.exports = { processScreenshot };