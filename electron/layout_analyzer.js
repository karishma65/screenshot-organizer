const bridge = require('./pythonBridge');
//layout detection, we use OpenCV and NumPy.
async function analyzeLayout(imagePath) {
  try {
    const result = await bridge.request('layout', { image_path: imagePath });
    return result || { layout: 'UNKNOWN_LAYOUT', confidence: 0 };
  } catch (e) {
    console.error('Layout Analyzer Error:', e);
    return { layout: 'UNKNOWN_LAYOUT', confidence: 0 };
  }
}

module.exports = { analyzeLayout };
