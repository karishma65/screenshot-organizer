const Tesseract = require('tesseract.js');

let worker = null;

async function getWorker() {
  if (worker) return worker;
  
  worker = await Tesseract.createWorker('eng', 1, {
    // logger: m => console.log(m.status, Math.round(m.progress * 100) + '%'),
    cacheMethod: 'readOnly',
  });
  
  return worker;
}

async function extractText(imagePath) {
  try {
    const activeWorker = await getWorker();
    const { data: { text } } = await activeWorker.recognize(imagePath);
    return text;
  } catch (error) {
    console.error('OCR Error:', error);
    // If worker crashes, reset it
    if (worker) {
      await worker.terminate();
      worker = null;
    }
    return '';
  }
}

// Optional: clean up worker when app is closing
async function terminateWorker() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}

module.exports = { extractText, terminateWorker };
