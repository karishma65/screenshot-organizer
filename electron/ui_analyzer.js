// ui_analyzer.js — COMPLETE REWRITE (v3)
//platform rule based 

const PLATFORM_CONFIG = {

  // ── AI CHATS ─────────────────────────────────────────────────────────────
  CHATGPT: {
    type: 'AI_CHAT', threshold: 4,
    keywords: {
      'chatgpt': 5, 'openai': 4, 'gpt-4o': 4, 'gpt-4': 4,
      'gpt-3.5': 4, 'canvas': 3, 'new chat': 2, 'projects': 2
    }
  },
  GEMINI: {
    type: 'AI_CHAT', threshold: 5,   // Raised: 'gemini' alone should not win on diagrams
    keywords: {
      'gemini': 5, 'google ai': 4, 'google.com/gemini': 5,
      'gemini pro': 5, 'gemini ultra': 5, 'gemini 1.5': 5,
      // FIX: 'advanced' and 'pro 1.5' removed — too generic, fires on activity diagrams
    }
  },
  CLAUDE: {
    type: 'AI_CHAT', threshold: 4,
    keywords: {
      'claude': 5, 'anthropic': 5, 'claude.ai': 5,
      'claude 3': 4, 'artifact': 3
    }
  },
  COPILOT: {
    type: 'AI_CHAT', threshold: 5,   // Raised: 'copilot' appears in VS Code too
    keywords: {
      'microsoft copilot': 5, 'copilot.microsoft.com': 5,
      'm365 copilot': 5,
      // FIX: bare 'copilot' removed — fires on VS Code GitHub Copilot plugin text
    }
  },
  PERPLEXITY: {
    type: 'AI_CHAT', threshold: 4,
    keywords: {
      'perplexity': 5, 'perplexity.ai': 5,
      'ask anything': 3, 'pro search': 3
      // 'sources' removed — too generic
    }
  },

  // ── COMMUNICATION ────────────────────────────────────────────────────────
  WHATSAPP: {
    type: 'COMMUNICATION', threshold: 4,
    keywords: {
      'whatsapp': 5, 'web.whatsapp': 5,
      'end-to-end encrypted': 5, 'disappearing messages': 4,
      'type a message': 4, 'starred messages': 3, 'group info': 3,
      'mute notifications': 3, 'view contact': 3, 'voice call': 2,
      'last seen': 3, 'chats': 2, 'status': 1, 'calls': 1, 'online': 1
    },
    exclusions: ['telegram', 'discord']
  },
  TELEGRAM: {
    type: 'COMMUNICATION', threshold: 4,
    keywords: {
      'telegram': 5, 'saved messages': 4, 't.me': 4,
      'telegram premium': 4, 'supergroup': 3, 'bots': 2
    }
  },
  DISCORD: {
    type: 'COMMUNICATION', threshold: 4,
    keywords: {
      'discord': 5, 'discord.com': 5, 'nitro': 3,
      'direct message': 2, '#general': 3, 'voice channel': 3,
      'server settings': 3, 'add a server': 4, 'boost': 2
    }
  },
  GMAIL: {
    type: 'COMMUNICATION', threshold: 4,
    keywords: {
      'gmail': 5, 'mail.google.com': 5,
      'compose': 3, 'inbox': 2, 'drafts': 2, 'spam': 2, 'unread': 2
    }
  },

  // ── SOCIAL MEDIA ─────────────────────────────────────────────────────────
  INSTAGRAM: {
    type: 'SOCIAL_MEDIA',
    threshold: 3,
    keywords: {
      'instagram': 5, 'instagram.com': 5,
      'reels': 3, 'followers': 3, 'following': 2,
      'story': 2, 'reel': 2, 'dm': 2, 'like': 1,
      'share to story': 4, 'add to story': 4,
      'suggested for you': 3, 'tagged posts': 3, 'close friends': 3,
      'direct': 2, 'explore': 1,
      // UI SIGNALS (LOWER TEXT)
      'seen by': 4, 'requests': 3, 'follow': 2, 'messages': 2,
      'heart icon': 4, 'comment icon': 4, 'share icon': 4, 'save icon': 4,
      'repost icon': 4, 'seen minutes ago': 5, 'seen hours ago': 5
    },
    exclusions: ['twitter', 'reddit', 'telegram']
  },
  FACEBOOK: {
    type: 'SOCIAL_MEDIA', threshold: 4,
    keywords: {
      'facebook': 5, 'facebook.com': 5,
      "what's on your mind": 5, 'news feed': 4, 'marketplace': 3,
      'memories': 3, 'timeline': 2, 'friends': 2
    }
  },
  REDDIT: {
    type: 'SOCIAL_MEDIA', threshold: 4,
    keywords: {
      'reddit': 5, 'reddit.com': 5,
      'subreddit': 4, 'upvote': 3, 'downvote': 3, 'r/': 2,
      'karma': 3, 'flair': 3, 'award': 2
    }
  },
  LINKEDIN: {
    type: 'SOCIAL_MEDIA', threshold: 4,
    keywords: {
      'linkedin': 5, 'linkedin.com': 5,
      'connections': 3, 'hiring': 3, 'repost': 2,
      'premium': 2, 'connect': 2, 'jobs': 2
    }
  },
  PINTEREST: {
    type: 'SOCIAL_MEDIA', threshold: 3,
    keywords: { 'pinterest': 5, 'pin it': 4, 'save pin': 4, 'board': 2 }
  },

  // ── ENTERTAINMENT ────────────────────────────────────────────────────────
  YOUTUBE: {
    type: 'ENTERTAINMENT', threshold: 4,
    keywords: {
      'youtube': 5, 'youtube.com': 5,
      'subscribe': 3, 'shorts': 3, 'subscriptions': 3,
      'watch later': 3, 'youtube studio': 4, 'dislike': 2
    }
  },
  NETFLIX: {
    type: 'ENTERTAINMENT', threshold: 4,
    keywords: {
      'netflix': 5, 'netflix.com': 5,
      'new & popular': 4, 'my list': 3, 'trending now': 3,
      'episodes': 3, 'watch now': 3
    }
  },
  PRIME_VIDEO: {
    type: 'ENTERTAINMENT', threshold: 4,
    keywords: {
      'prime video': 5, 'primevideo.com': 5,
      'amazon prime': 4, 'x-ray': 3, 'watchlist': 3, 'imdb': 2
    }
  },
  HOTSTAR: {
    type: 'ENTERTAINMENT', threshold: 3,
    keywords: {
      'hotstar': 5, 'hotstar.com': 5,
      'disney+': 4, 'live sports': 3, 'watch free': 2, 'episodes': 2
    }
  },
  JIOCINEMA: {
    type: 'ENTERTAINMENT', threshold: 3,
    keywords: { 'jiocinema': 5, 'jiocinema.com': 5, 'watch free': 2, 'episodes': 2, 'jio original': 4 }
  },
  MX_PLAYER: {
    type: 'ENTERTAINMENT', threshold: 3,
    keywords: { 'mx player': 5, 'mxplayer': 5, 'mx original': 4 }
  },

  // ── SHOPPING ─────────────────────────────────────────────────────────────
  AMAZON: {
    type: 'SHOPPING', threshold: 5,
    keywords: {
      'amazon.in': 5, 'amazon.com': 5, 'amazon': 3,
      'fulfilled by amazon': 5, 'lightning deal': 4,
      'subscribe & save': 4, 'compare with similar': 4,
      'prime delivery': 4, 'add to cart': 2, 'buy now': 2
    },
    exclusions: ['flipkart.com', 'meesho.com', 'myntra.com']
  },
  FLIPKART: {
    type: 'SHOPPING', threshold: 5,
    keywords: {
      'flipkart': 5, 'flipkart.com': 5,
      'supercoins': 5, 'flipkart plus': 5,
      'open box delivery': 4, 'no cost emi': 3,
      'assured': 3, 'wishlist': 2
    },
    exclusions: ['amazon.com', 'amazon.in', 'meesho.com']
  },
  MEESHO: {
    type: 'SHOPPING', threshold: 3,
    keywords: {
      'meesho': 5, 'meesho.com': 5,
      'reseller': 4, 'margin': 4, 'share & earn': 5,
      'supplier': 3, 'free delivery above': 3, 'catalog': 2
    },
    exclusions: ['flipkart.com', 'amazon.in', 'amazon.com', 'myntra.com']
  },
  MYNTRA: {
    type: 'SHOPPING', threshold: 4,
    keywords: {
      'myntra': 5, 'myntra.com': 5,
      'myntra insider': 5, 'insiders': 4, 'flat off': 2, 'wishlist': 2
    }
  },

  // ── FINANCE ──────────────────────────────────────────────────────────────
  GPAY: {
    type: 'FINANCE', threshold: 4,
    keywords: {
      'gpay': 5, 'google pay': 5, 'pay.google.com': 5,
      'money sent': 4, 'payment received': 4,
      'transaction id': 4, 'upi id': 3, 'google pay balance': 5
    }
  },
  PHONEPE: {
    type: 'FINANCE', threshold: 4,
    keywords: {
      'phonepe': 5, 'phonepe.com': 5,
      'phonepe pulse': 4, 'fastag': 3, 'switch app': 3,
      'recharge': 2, 'insurance': 1
    }
  },
  PAYTM: {
    type: 'FINANCE', threshold: 5,   // Raised: too many false positives from search results
    keywords: {
      'paytm': 5, 'paytm.com': 5, 'paytm mall': 5,
      'paytm wallet': 5, 'paytm postpaid': 5,
      'payment successful': 3
      // FIX: 'upi', 'wallet', 'cashback' removed — too generic
    }
  },

  // ── SEARCH / BROWSER ─────────────────────────────────────────────────────
  GOOGLE_SEARCH: {
    type: 'DIGITAL', threshold: 3,
    keywords: {
      'google.com/search': 5, 'google search': 5,
      'did you mean': 4, 'safesearch': 4, 'search results': 3,
      'all results': 3, 'tools': 1, 'settings': 1
    }
  },

  // ── DEVELOPER ────────────────────────────────────────────────────────────
  GITHUB: {
    type: 'DEVELOPER', threshold: 4,
    keywords: {
      'github': 5, 'github.com': 5,
      'pull request': 4, 'repository': 3, 'branch': 2,
      'commit': 2, 'merge': 2, 'fork': 2,
      'star': 1, 'issue': 1, 'actions': 1
    }
  },
  FIREBASE: {
    type: 'DEVELOPER', threshold: 4,
    keywords: {
      'firebase': 5, 'firebase.google.com': 5,
      'firestore': 4, 'realtime database': 4,
      'cloud functions': 3, 'authentication': 2, 'hosting': 2
    }
  },
  VSCODE: {
    type: 'DEVELOPER', threshold: 4,
    keywords: {
      'visual studio code': 5, 'code.visualstudio.com': 5, 'vscode': 4,
      'source control': 4, 'go to file': 4, 'command palette': 4,
      'run and debug': 4, 'extensions marketplace': 5,
      'open folder': 2, 'select folder': 3, 'terminal': 2,
      'explorer': 2, 'problems': 1, 'output': 1,
      'prettier': 2, 'eslint': 2, '.vscode': 4
    },
    exclusions: ['eclipse ide', 'intellij idea', 'android studio', 'pycharm']
  },
  ANDROID_STUDIO: {
    type: 'DEVELOPER', threshold: 4,
    keywords: {
      'android studio': 5, 'logcat': 5, 'avd manager': 5,
      'gradle': 4, 'emulator': 4, 'build variants': 4,
      'layout editor': 3, 'run app': 2
    }
  },
  INTELLIJ: {
    type: 'DEVELOPER', threshold: 4,
    keywords: {
      'intellij idea': 5, 'intellij': 4, 'jetbrains': 4,
      'project structure': 3, 'run configuration': 3,
      'refactor': 2, 'inspections': 3
    }
  },
  ECLIPSE: {
    type: 'DEVELOPER', threshold: 5,   // High threshold — needs specific Eclipse terms
    keywords: {
      'eclipse ide': 5, 'eclipse.org': 5,
      'package explorer': 4, 'build path': 4, 'run as java': 5,
      'junit': 3, 'maven': 2, 'workspace': 1
    },
    exclusions: ['visual studio code', 'vscode', 'android studio', 'intellij']
  }
};

// ── HELPERS ───────────────────────────────────────────────────────────────

/**
 * Word-boundary aware keyword match.
 * - Phrases / URLs use plain substring match (specific enough).
 * - Single words use \b boundaries to prevent 'discord' matching 'discordant'.
 */
function matchesKeyword(text, keyword) {
  if (keyword.includes(' ') || keyword.includes('.') || keyword.includes('/') || keyword.includes('#')) {
    return text.includes(keyword);
  }
  try {
    const re = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    return re.test(text);
  } catch {
    return text.includes(keyword);
  }
}

/**
 * Returns true if the OCR text looks like a browser search results page.
 * Used to suppress FINANCE platforms on Google Search pages that contain
 * payment brand names in the search results snippets.
 */
function isBrowserSearchContext(text) {
  return (
    text.includes('google.com/search') ||
    text.includes('bing.com/search') ||
    text.includes('search results') ||
    text.includes('did you mean') ||
    text.includes('safesearch') ||
    text.includes('duckduckgo')
  );
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────

function detectPlatform(text, layout) {
  const lowerText = text.toLowerCase();
  const results = [];
  const browserCtx = isBrowserSearchContext(lowerText);

  for (const [platformName, config] of Object.entries(PLATFORM_CONFIG)) {
    // Skip finance platforms entirely when in a browser search context
    if (browserCtx && config.type === 'FINANCE') continue;

    let score = 0;

    for (const [keyword, weight] of Object.entries(config.keywords)) {
      if (matchesKeyword(lowerText, keyword)) score += weight;
    }

    // Exclusion: heavy penalty if a competing brand's identifier is present
    if (config.exclusions) {
      for (const excl of config.exclusions) {
        if (lowerText.includes(excl)) {
          score *= 0.3;
          break;
        }
      }
    }

    if (score >= config.threshold) {
      const confidence = Math.min(score / (config.threshold * 2), 0.95);
      results.push({ platform: platformName, confidence, digital_type: config.type, score });
    }
  }

  if (results.length === 0) {
    return { platform: 'UNKNOWN', confidence: 0, digital_type: 'NONE' };
  }

  // Highest score wins; ties broken by threshold (more specific platform preferred)
  results.sort((a, b) => b.score - a.score || b.confidence - a.confidence);
  const best = results[0];

  return {
    platform: best.platform,
    confidence: best.confidence,
    digital_type: best.digital_type
  };
}

module.exports = { detectPlatform };