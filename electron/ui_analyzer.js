// UI Analyzer logic to detect platforms based on OCR text and UI structural hints
const PLATFORMS = {
  INSTAGRAM: ['instagram', 'reels', 'explore', 'direct message'],
  WHATSAPP: ['whatsapp', 'chats', 'status', 'calls'],
  YOUTUBE: ['youtube', 'subscribe', 'shorts', 'library'],
  CHATGPT: ['chatgpt', 'openai', 'gpt-4', 'new chat'],
  GEMINI: ['gemini', 'google ai', 'bard'],
  CLAUDE: ['claude', 'anthropic'],
  AMAZON: ['amazon', 'add to cart', 'buy now', 'prime'],
  DISCORD: ['discord', 'server', 'channel', '#'],
  ANTIGRAVITY: ['antigravity', 'coding assistant']
};

function detectPlatform(text) {
  const lowerText = text.toLowerCase();
  for (const [platform, keywords] of Object.entries(PLATFORMS)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return platform;
    }
  }
  return 'Unknown';
}

module.exports = { detectPlatform };
