const { spawn } = require('child_process');
const path = require('path');

async function analyzeLayout(imagePath) {
  return new Promise((resolve) => {
    try {
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      const pythonProcess = spawn(pythonCmd, [
        path.join(__dirname, '../python/analyzer.py'),
        'analyze_layout',
        imagePath
      ]);

      let output = '';
      pythonProcess.stdout.on('data', (data) => { output += data.toString(); });
      
      pythonProcess.on('close', (code) => {
        if (code !== 0 || !output.trim()) {
          resolve('UNKNOWN_LAYOUT');
          return;
        }
        try {
          const result = JSON.parse(output);
          resolve(result.layout || 'UNKNOWN_LAYOUT');
        } catch (e) {
          resolve('UNKNOWN_LAYOUT');
        }
      });
    } catch (e) {
      resolve('UNKNOWN_LAYOUT');
    }
  });
}

module.exports = { analyzeLayout };
