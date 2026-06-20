const bridge = require('./pythonBridge');
//clip  Contrastive Language–Image Pre-training openai  in analyzer.py
async function classifyImage(imagePath) {
  try {
    const results = await bridge.request('visual', { image_path: imagePath });
    return results || [];
  } catch (e) {
    console.error('Visual Analyzer CLIP Error:', e);
    return [];
  }
}

module.exports = { classifyImage };
