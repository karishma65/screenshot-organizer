const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const bridge = require('./pythonBridge');

const { collectResults } = require('./result_collector');

async function fuseHybridResults(searchRes, thresholds) {
  let vResults = [];
  if (searchRes.visual && searchRes.visual.indices.length > 0) {
    const indices = searchRes.visual.indices;
    const placeholders = indices.map(() => '?').join(',');
    vResults = await new Promise(res => {
      db.all(`SELECT *, 'VISUAL' as retrieval_type FROM screenshots WHERE id IN (${placeholders})`, indices, (err, rows) => {
        if (err || !rows) return res([]);
        const sm = {};
        searchRes.visual.indices.forEach((sid, i) => { if (sid !== -1 && (!sm[sid] || searchRes.visual.scores[i] > sm[sid])) sm[sid] = searchRes.visual.scores[i]; });
        res(rows.map(r => ({ ...r, similarity_score: sm[r.id] })).filter(r => r.similarity_score >= thresholds.visual));
      });
    });
  }

  let fResults = [];
  if (searchRes.faces && searchRes.faces.length > 0) {
    for (const set of searchRes.faces) {
      if (set.indices.length > 0) {
        const placeholders = set.indices.map(() => '?').join(',');
        const matches = await new Promise(res => {
          db.all(`SELECT DISTINCT s.*, f.id as face_table_id, 'FACE' as retrieval_type FROM screenshots s JOIN faces f ON s.id = f.screenshot_id WHERE f.id IN (${placeholders})`, set.indices, (err, rows) => {
            if (err || !rows) return res([]);
            const fm = {};
            set.indices.forEach((fid, i) => { if (fid !== -1 && (!fm[fid] || set.scores[i] > fm[fid])) fm[fid] = set.scores[i]; });
            res(rows.map(r => ({ ...r, similarity_score: fm[r.face_table_id] })).filter(r => r.similarity_score >= thresholds.face));
          });
        });
        fResults.push(...matches);
      }
    }
  }

  const seen = new Set(), combined = [];
  [...fResults, ...vResults].sort((a,b) => b.similarity_score - a.similarity_score).forEach(r => {
    if (!seen.has(r.id)) { combined.push(r); seen.add(r.id); }
  });
  return combined;
}

function registerSearchHandlers(getGlobalPaths) {
  ipcMain.handle('search-screenshots', async (event, { searchTerm, category, platform, type }) => {
    return new Promise(async (resolve) => {
      if (type === 'semantic' && searchTerm && searchTerm.length > 2) {
        try {
          await bridge.boot();
          const searchRes = await bridge.request('retrieval_search', { type: 'text', query: searchTerm });
          if (!searchRes || !searchRes.faiss_indices) return resolve([]);
          const indices = [...new Set(searchRes.faiss_indices.filter(i => i !== -1))];
          if (indices.length === 0) return resolve([]);

          const placeholders = indices.map(() => '?').join(',');
          db.all(`SELECT * FROM screenshots WHERE id IN (${placeholders})`, indices, (err, rows) => {
            if (err) return resolve([]);
            const sortedRows = indices.map(id => rows.find(row => row.id === id)).filter(Boolean);
            resolve(sortedRows);
          });
        } catch (e) { resolve([]); }
        return;
      }

      let sql = 'SELECT id, filename, organized_path, original_path, main_category, platform, created_at FROM screenshots WHERE 1=1';
      let params = [];
      if (searchTerm && searchTerm.trim() !== '') {
        const normalizedSearch = searchTerm.trim().replace(/\s+/g, ' ');
        sql += " AND (REPLACE(REPLACE(ocr_text, x'0A', ' '), x'09', ' ') LIKE ? OR REPLACE(REPLACE(ocr_full, x'0A', ' '), x'09', ' ') LIKE ? OR filename LIKE ?)";
        const likeParam = `%${normalizedSearch}%`;
        params.push(likeParam, likeParam, `%${searchTerm}%`);
      }
      if (category && category !== 'All') {
        sql += ' AND main_category = ?';
        params.push(category.toUpperCase());
      }
      if (platform && platform !== 'All') {
        sql += ' AND platform = ?';
        params.push(platform.toUpperCase());
      }
      sql += ' ORDER BY created_at DESC LIMIT 100';
      db.all(sql, params, (err, rows) => {
        if (err) resolve([]);
        else resolve(rows || []);
      });
    });
  });

  ipcMain.handle('universal-search', async (event, { type, query, imagePath }) => {
    const { organizedPath } = getGlobalPaths();
    return new Promise(async (resolve) => {
      try {
        if (!type || (type === 'text' && (!query || !query.trim())) || (type === 'image' && !imagePath)) {
          return resolve({ results: [], copiedCount: 0, message: 'Please provide a search query or image.' });
        }
        await bridge.boot();
        const thresholds = await new Promise(res => {
          db.all("SELECT key, value FROM settings WHERE key IN ('face_similarity_threshold', 'visual_similarity_threshold')", (err, rows) => {
            const t = { face: 0.4, visual: 0.3 };
            if (rows) rows.forEach(row => {
              if (row.key === 'face_similarity_threshold') t.face = parseFloat(row.value);
              if (row.key === 'visual_similarity_threshold') t.visual = parseFloat(row.value);
            });
            res(t);
          });
        });

        if (type === 'text') {
          const lowerQuery = query.trim().toLowerCase();
          const idPatterns = [
            /^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/,
            /^[0-9]{3}-[0-9]{3}-[0-9]{3}$/,
            /^meeting-[a-z0-9]+$/,
            /^room-[a-z0-9]+$/,
            /^conference-[a-z0-9]+$/
          ];
          const isMeetingID = idPatterns.some(p => p.test(lowerQuery));
          
          let exactMatches = await new Promise(res => {
            const normalizedQuery = query.trim().replace(/\s+/g, ' ');
            db.all("SELECT *, 'EXACT_OCR' as retrieval_type, 1.0 as similarity_score FROM screenshots WHERE meeting_ids LIKE ? OR REPLACE(REPLACE(ocr_full, x'0A', ' '), x'09', ' ') LIKE ? OR REPLACE(REPLACE(ocr_text, x'0A', ' '), x'09', ' ') LIKE ?", [`%${lowerQuery}%`, `%${normalizedQuery}%`, `%${normalizedQuery}%`], (err, rows) => res(rows || []));
          });

          if (isMeetingID) {
            if (exactMatches.length > 0) {
              const folderName = `Meeting_${lowerQuery.replace(/[^a-z0-9]/gi, '_')}`;
              const copied = await collectResults(folderName, exactMatches.map(r => r.organized_path || r.original_path), organizedPath);
              return resolve({ results: exactMatches, copiedCount: copied });
            }
            return resolve({ results: [], copiedCount: 0 });
          }

          let fuzzyMatches = [], semanticMatches = [];
          if (lowerQuery.length > 2) {
            fuzzyMatches = await new Promise(res => {
               const xIds = exactMatches.length ? exactMatches.map(r=>r.id).join(',') : '0';
               const normalizedQuery = query.trim().replace(/\s+/g, ' ');
               db.all(`SELECT *, 'KEYWORD' as retrieval_type, 0.85 as similarity_score FROM screenshots WHERE (REPLACE(REPLACE(ocr_text, x'0A', ' '), x'09', ' ') LIKE ? OR REPLACE(REPLACE(ocr_full, x'0A', ' '), x'09', ' ') LIKE ?) AND id NOT IN (${xIds})`, [`%${normalizedQuery}%`, `%${normalizedQuery}%`], (err, rows) => res(rows || []));
            });

            const searchRes = await bridge.request('retrieval_search', { type: 'text', query: lowerQuery });
            if (searchRes && searchRes.faiss_indices) {
              const indices = [...new Set(searchRes.faiss_indices.filter(i => i !== -1))];
              if (indices.length > 0) {
                const placeholders = indices.map(() => '?').join(',');
                semanticMatches = await new Promise(res => {
                  db.all(`SELECT *, 'SEMANTIC' as retrieval_type FROM screenshots WHERE id IN (${placeholders})`, indices, (err, rows) => {
                    if (err || !rows) return res([]);
                    const scoreMap = {};
                    searchRes.faiss_indices.forEach((sid, i) => {
                        if (sid !== -1 && (!scoreMap[sid] || searchRes.scores[i] > scoreMap[sid])) scoreMap[sid] = searchRes.scores[i];
                    });
                    res(rows.map(r => ({ ...r, similarity_score: scoreMap[r.id] || 0.5 })).filter(r => r.similarity_score >= thresholds.visual));
                  });
                });
              }
            }
          }

          const seenIds = new Set(exactMatches.map(r => r.id));
          const combined = [...exactMatches];
          [...fuzzyMatches, ...semanticMatches].forEach(r => {
            if (!seenIds.has(r.id)) { combined.push(r); seenIds.add(r.id); }
          });
          combined.sort((a, b) => b.similarity_score - a.similarity_score);
          
          const folderName = `TextSearch_${lowerQuery.substring(0, 20).replace(/[^a-z0-9]/gi, '_')}`;
          const copyCount = await collectResults(folderName, combined.map(r => r.organized_path || r.original_path), organizedPath);
          resolve({ results: combined.slice(0, 100), copiedCount: copyCount });

        } else if (type === 'image') {
          const searchRes = await bridge.request('retrieval_search', { type: 'image', query_image_path: imagePath });
          console.log(`[DEBUG][PYTHON RESPONSE]\nsearch_type: ${searchRes?.search_type}\nvisual indices: ${searchRes?.visual?.indices}\nvisual scores: ${searchRes?.visual?.scores}\nnumber of face groups: ${searchRes?.faces?.length || 0}`);
          if (searchRes?.faces) {
            searchRes.faces.forEach((g, i) => {
              console.log(`Face Group ${i}: indices=[${g.indices}], scores=[${g.scores}]`);
            });
          }

          if (!searchRes || searchRes.search_type !== 'hybrid_image') return resolve({ results: [], copiedCount: 0 });
          const fused = await fuseHybridResults(searchRes, thresholds);
          console.log(`[DEBUG] Final fused result count: ${fused.length}`);
          const copyCount = await collectResults(`ImageSearch_${Date.now()}`, fused.map(r => r.organized_path || r.original_path), organizedPath);
          resolve({ results: fused, copiedCount: copyCount });
        }
      } catch (e) { resolve({ results: [], copiedCount: 0 }); }
    });
  });

  ipcMain.handle('find-similar', async (event, id) => {
    return new Promise(async (resolve) => {
      try {
        db.get('SELECT original_path, organized_path FROM screenshots WHERE id = ?', [id], async (err, row) => {
          if (err || !row) return resolve([]);
          const imgPath = row.organized_path || row.original_path;
          await bridge.boot();
          const searchRes = await bridge.request('retrieval_search', { type: 'image', query_image_path: imgPath });
          if (!searchRes || searchRes.search_type !== 'hybrid_image') return resolve([]);
          const thresholds = await new Promise(res => {
            db.all("SELECT key, value FROM settings WHERE key IN ('face_similarity_threshold', 'visual_similarity_threshold')", (err, rows) => {
              const t = { face: 0.4, visual: 0.3 };
              if (rows) rows.forEach(row => {
                if (row.key === 'face_similarity_threshold') t.face = parseFloat(row.value);
                if (row.key === 'visual_similarity_threshold') t.visual = parseFloat(row.value);
              });
              res(t);
            });
          });
          const fused = await fuseHybridResults(searchRes, thresholds);
          resolve(fused.filter(r => r.id !== id));
        });
      } catch (e) { resolve([]); }
    });
  });
}

module.exports = { registerSearchHandlers };
