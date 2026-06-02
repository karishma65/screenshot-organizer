const bridge = require('./pythonBridge');

async function classifyImage(imagePath) {
  try {
    const results = await bridge.request('visual', { path: imagePath });
    return results || [];
  } catch (e) {
    console.error('Visual Analyzer CLIP Error:', e);
    return [];
  }
}

module.exports = { classifyImage };
