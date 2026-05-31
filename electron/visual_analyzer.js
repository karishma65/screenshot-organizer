const tf = require('@tensorflow/tfjs');
const mobilenet = require('@tensorflow-models/mobilenet');
const Jimp = require('jimp');
const fs = require('fs');

let model = null;

async function loadModel() {
  if (model) return model;
  
  console.log('AI Engine: Warming up Visual Brain (MobileNet)...');
  await tf.ready();
  
  // We use version 1 with alpha 0.25 to keep it fast for your laptop
  model = await mobilenet.load({ 
    version: 1, 
    alpha: 0.25 
  }); 
  console.log('AI Engine: Visual Brain Online.');
  return model;
}

async function classifyImage(imagePath) {
  try {
    const activeModel = await loadModel();
    
    // 1. Decode REAL screenshot image using Jimp
    const image = await Jimp.read(imagePath);
    
    // 2. Resize to 224x224 (required by MobileNet)
    image.cover(224, 224);
    
    // 3. Convert actual pixels to float32 tensor
    const { data, width, height } = image.bitmap;
    const buffer = new Float32Array(width * height * 3);
    
    // Jimp stores pixels as RGBA. MobileNet wants RGB.
    let j = 0;
    for (let i = 0; i < data.length; i += 4) {
      buffer[j] = data[i];       // R
      buffer[j + 1] = data[i + 1]; // G
      buffer[j + 2] = data[i + 2]; // B
      j += 3;
    }

    const imageTensor = tf.tensor3d(buffer, [224, 224, 3]);

    // 4. Feed screenshot tensor into MobileNet
    const predictions = await activeModel.classify(imageTensor);
    
    // Cleanup tensors for memory safety
    imageTensor.dispose();

    // 5. Generate useful tags by mapping MobileNet objects to Screenshot types
    let tags = [];
    predictions.forEach(p => {
      const label = p.className.toLowerCase();
      
      // Mapping logic:
      if (label.includes('comic') || label.includes('cartoon') || label.includes('envelope')) tags.push('meme');
      if (label.includes('web site') || label.includes('page') || label.includes('screen')) tags.push('document');
      if (label.includes('menu') || label.includes('list')) tags.push('receipt');
      if (label.includes('monitor') || label.includes('keyboard') || label.includes('laptop')) tags.push('photo');
      if (label.includes('map') || label.includes('diagram')) tags.push('diagram');
    });

    return tags;
  } catch (error) {
    // 6. Visual analyzer must fail safely
    console.error('Visual Analyzer Safety Gap:', error.message);
    return [];
  }
}

module.exports = { classifyImage };
