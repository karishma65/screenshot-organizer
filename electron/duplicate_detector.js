const fs = require('fs');
const crypto = require('crypto');

// Basic content hash as a fallback for exact duplicates
function getFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

// Perceptual hashing would require more logic. 
// For now, we'll use exact hash and similarity can be added later with a library. 
module.exports = { getFileHash };
