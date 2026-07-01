const fs = require('fs');
const path = require('path');

/**
 * Organizes search results into a specific folder within SearchResults.
 * @param {string} folderName - The name of the collection (e.g., 'Sony', 'Face_Person_1')
 * @param {string[]} paths - Array of absolute paths to screenshots
 * @param {string} root - The root folder for organized screenshots
 */
async function collectResults(folderName, paths, root) {
  if (!root || !paths || !paths.length) return 0;
  
  // Sanitize folder name for safety
  const safeFolderName = folderName.replace(/[^a-z0-9_\-\s]/gi, '_').trim() || 'Unlabeled_Results';
  
  // Use 'SearchResults' (restore original name)
  const targetDir = path.join(root, 'SearchResults', safeFolderName);
  
  try {
    await fs.promises.mkdir(targetDir, { recursive: true });
  } catch (e) {
    if (e.code !== 'EEXIST') {
      console.error(`Collector: Failed to create directory ${targetDir}:`, e);
      return 0;
    }
  }

  let count = 0;
  // Use Promise.all for faster parallel copying
  await Promise.all(paths.map(async (p) => {
    try {
      if (fs.existsSync(p)) {
        const baseName = path.basename(p);
        let dest = path.join(targetDir, baseName);
        
        // Final collision check within the search results folder
        let counter = 1;
        while (fs.existsSync(dest)) {
          const ext = path.extname(baseName);
          const name = path.basename(baseName, ext);
          dest = path.join(targetDir, `${name}_v${counter}${ext}`);
          counter++;
        }

        await fs.promises.copyFile(p, dest);
        count++;
      }
    } catch (e) {
      console.error(`Collector: Copy failed for ${p}:`, e.message);
    }
  }));
  
  if (count > 0) {
    console.log(`Collector: Successfully collected ${count} items into ${targetDir}`);
  }
  
  return count;
}

module.exports = { collectResults };
