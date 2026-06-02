const PLATFORM_CONFIG = {
  // AI CHATS
  CHATGPT: { type: 'AI_CHAT', threshold: 4, keywords: { 'gpt-4o': 4, 'gpt-4': 4, 'openai': 4, 'chatgpt': 3, 'canvas': 3, 'projects': 2, 'new chat': 2 } },
  GEMINI: { type: 'AI_CHAT', threshold: 4, keywords: { 'gemini': 4, 'google ai': 4, 'google.com/gemini': 5, 'pro 1.5': 3, 'advanced': 2 } },
  CLAUDE: { type: 'AI_CHAT', threshold: 4, keywords: { 'claude': 5, 'anthropic': 5, 'artifact': 3, 'claude 3': 3 } },
  COPILOT: { type: 'AI_CHAT', threshold: 4, keywords: { 'copilot': 4, 'microsoft copilot': 5, 'm365': 3 } },
  PERPLEXITY: { type: 'AI_CHAT', threshold: 4, keywords: { 'perplexity': 5, 'ask anything': 3, 'sources': 2, 'pro search': 3 } },

  // COMMUNICATION
  WHATSAPP: { type: 'COMMUNICATION', threshold: 4, keywords: { 'whatsapp': 5, 'chats': 2, 'status': 2, 'web.whatsapp': 5, 'calls': 2 } },
  TELEGRAM: { type: 'COMMUNICATION', threshold: 4, keywords: { 'telegram': 5, 'saved messages': 4, 'bots': 2, 'channel': 1 } },
  DISCORD: { type: 'COMMUNICATION', threshold: 4, keywords: { 'discord': 5, 'server': 2, 'channel': 2, 'nitro': 3, 'direct message': 2 } },
  GMAIL: { type: 'COMMUNICATION', threshold: 4, keywords: { 'gmail': 5, 'inbox': 2, 'compose': 3, 'sent': 1 } },

  // SOCIAL MEDIA
  INSTAGRAM: { type: 'SOCIAL_MEDIA', threshold: 4, keywords: { 'instagram': 5, 'reels': 4, 'followers': 3, 'following': 3, 'meta': 2, 'explore': 2 } },
  FACEBOOK: { type: 'SOCIAL_MEDIA', threshold: 4, keywords: { 'facebook': 5, 'friends': 3, 'memories': 3, 'timeline': 2, 'meta': 2 } },
  REDDIT: { type: 'SOCIAL_MEDIA', threshold: 4, keywords: { 'reddit': 5, 'subreddit': 4, 'upvote': 3, 'downvote': 3, 'r/': 2 } },
  LINKEDIN: { type: 'SOCIAL_MEDIA', threshold: 4, keywords: { 'linkedin': 5, 'connections': 3, 'jobs': 3, 'premium': 3, 'repost': 2 } },

  // ENTERTAINMENT
  YOUTUBE: { type: 'ENTERTAINMENT', threshold: 4, keywords: { 'youtube': 5, 'subscribe': 4, 'shorts': 3, 'library': 2, 'remix': 2, 'studio': 2 } },
  NETFLIX: { type: 'ENTERTAINMENT', threshold: 4, keywords: { 'netflix': 5, 'episodes': 4, 'watch now': 3, 'trailer': 2, 'series': 2 } },
  PRIME_VIDEO: { type: 'ENTERTAINMENT', threshold: 4, keywords: { 'prime video': 5, 'amazon prime': 4, 'watchlist': 3, 'imdb': 2 } },
  HOTSTAR: { type: 'ENTERTAINMENT', threshold: 3, keywords: { 'hotstar': 5, 'disney+': 4, 'sports': 2, 'live': 1 } },
  MX_PLAYER: { type: 'ENTERTAINMENT', threshold: 3, keywords: { 'mx player': 5, 'local': 1, 'downloader': 2, 'stream': 1 } },

  // SHOPPING
  AMAZON: { type: 'SHOPPING', threshold: 4, keywords: { 'amazon': 4, 'add to cart': 4, 'buy now': 4, 'prime': 2, 'orders': 2 } },
  FLIPKART: { type: 'SHOPPING', threshold: 4, keywords: { 'flipkart': 5, 'order': 3, 'delivery': 3, 'supercoins': 4 } },
  MEESHO: { type: 'SHOPPING', threshold: 3, keywords: { 'meesho': 5, 'margin': 3, 'product': 1, 'reseller': 3 } },

  // FINANCE
  GPAY: { type: 'FINANCE', threshold: 3, keywords: { 'gpay': 5, 'google pay': 5, 'transaction id': 4, 'bill': 1 } },
  PHONEPE: { type: 'FINANCE', threshold: 3, keywords: { 'phonepe': 5, 'insurance': 2, 'recharge': 3, 'history': 1 } },
  PAYTM: { type: 'FINANCE', threshold: 3, keywords: { 'paytm': 5, 'upi': 3, 'wallet': 3, 'payment successful': 5 } },

  // DEVELOPER
  GITHUB: { type: 'DEVELOPER', threshold: 4, keywords: { 'github': 5, 'repository': 4, 'pull request': 4, 'branch': 3, 'star': 2, 'issue': 2 } },
  FIREBASE: { type: 'DEVELOPER', threshold: 4, keywords: { 'firebase': 5, 'console': 2, 'database': 2, 'hosting': 3 } },
  VSCODE: { type: 'DEVELOPER', threshold: 4, keywords: { 'vscode': 4, 'extension': 3, 'terminal': 2, 'select folder': 2 } },
  ANDROID_STUDIO: { type: 'DEVELOPER', threshold: 4, keywords: { 'android studio': 5, 'emulator': 4, 'gradle': 4, 'layout': 1 } },
  ECLIPSE: { type: 'DEVELOPER', threshold: 3, keywords: { 'eclipse ide': 5, 'workspace': 2, 'maven': 3, 'junit': 3 } }
};

function detectPlatform(text, layout) {
  const lowerText = text.toLowerCase();
  const results = [];

  for (const [platform, config] of Object.entries(PLATFORM_CONFIG)) {
    let score = 0;
    
    // Heuristic: Explicit platform name match in layout-aware hotspots
    // But for now, just sum keyword scores
    for (const [keyword, weight] of Object.entries(config.keywords)) {
      if (lowerText.includes(keyword)) {
        score += weight;
      }
    }

    if (score >= config.threshold) {
      // Normalize confidence to 0.0 - 1.0 (clamped at 0.95 for UI alone)
      const confidence = Math.min(score / (config.threshold * 2), 0.95);
      results.push({ platform, confidence, digital_type: config.type, score });
    }
  }

  // Pick highest scoring platform
  if (results.length > 0) {
    const best = results.sort((a, b) => b.score - a.score)[0];
    return {
      platform: best.platform,
      confidence: best.confidence,
      digital_type: best.digital_type
    };
  }

  return { platform: 'UNKNOWN', confidence: 0, digital_type: 'NONE' };
}

module.exports = { detectPlatform };
