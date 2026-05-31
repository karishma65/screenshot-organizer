const PLATFORMS = {
  INSTAGRAM: ['instagram', 'reels', 'explore', 'direct message'],
  WHATSAPP: ['whatsapp', 'chats', 'status', 'calls'],
  YOUTUBE: ['youtube', 'subscribe', 'shorts', 'library'],
  CHATGPT: ['chatgpt', 'openai', 'gpt-4', 'new chat'],
  GEMINI: ['gemini', 'google ai', 'bard'],
  CLAUDE: ['claude', 'anthropic'],
  AMAZON: ['amazon', 'add to cart', 'buy now', 'prime'],
  FLIPKART: ['flipkart', 'order', 'delivery'],
  DISCORD: ['discord', 'server', 'channel', '#'],
  TELEGRAM: ['telegram', 'saved messages'],
  ANTIGRAVITY: ['antigravity', 'coding assistant'],
  PAYTM: ['paytm', 'upi', 'wallet', 'payment successful'],
  NETFLIX: ['netflix', 'watch now', 'episodes']
};

function detectPlatform(text, layout) {
  const lowerText = text.toLowerCase();
  
  // Use layout hints for common platforms
  if (layout === 'CHAT_LAYOUT') {
    if (lowerText.includes('whatsapp')) return 'WHATSAPP';
    if (lowerText.includes('instagram')) return 'INSTAGRAM';
    if (lowerText.includes('telegram')) return 'TELEGRAM';
  }

  for (const [platform, keywords] of Object.entries(PLATFORMS)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return platform;
    }
  }
  return 'UNKNOWN';
}

module.exports = { detectPlatform };
