// ============================================
// AD FUSION v2.0 - Application Configuration
// World-class Meta Ad Optimizer with Andromeda-era intelligence
// ============================================
import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',

  database: {
    url: process.env.DATABASE_URL || 'postgresql://adfusion:adfusion_secret@localhost:5432/adfusion',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'adfusion',
    user: process.env.DB_USER || 'adfusion',
    password: process.env.DB_PASSWORD || 'adfusion_secret',
    ssl: process.env.DB_SSL === 'true',
    poolMin: parseInt(process.env.DB_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.DB_POOL_MAX || '20', 10),
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    secret: requireEnv('JWT_SECRET', 'dev-jwt-secret-change-in-production'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  session: {
    secret: requireEnv('SESSION_SECRET', 'dev-session-secret-change-in-production'),
  },

  meta: {
    appId: process.env.META_APP_ID || '',
    appSecret: process.env.META_APP_SECRET || '',
    apiVersion: process.env.META_API_VERSION || 'v21.0',
    graphApiBase: process.env.META_GRAPH_API_BASE || 'https://graph.facebook.com',
    redirectUri: process.env.META_REDIRECT_URI || 'http://localhost:3000/api/auth/meta/callback',
    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || '',
    adLibraryApiBase: 'https://graph.facebook.com',
    scopes: [
      'ads_management',
      'ads_read',
      'business_management',
      'pages_show_list',
      'pages_read_engagement',
      'leads_retrieval',
    ],
    // Rate limits per Meta API documentation
    rateLimits: {
      callsPerHour: 200,
      callsPerDay: 4800,
      batchRequestsMax: 50,
    },
    // Insights metrics we always request (v21.0 + Andromeda-era fields)
    defaultInsightFields: [
      'impressions', 'reach', 'frequency', 'clicks', 'unique_clicks',
      'ctr', 'unique_ctr', 'cpc', 'cpm', 'cpp', 'spend',
      'actions', 'conversions', 'cost_per_action_type',
      'purchase_roas', 'video_p25_watched_actions',
      'video_p50_watched_actions', 'video_p75_watched_actions',
      'video_p100_watched_actions', 'outbound_clicks',
      'landing_page_views', 'quality_score_organic',
      'quality_score_ectr', 'quality_score_ecvr',
      // New Andromeda-era fields
      'inline_link_clicks', 'cost_per_inline_link_click',
      'inline_link_click_ctr', 'cost_per_unique_click',
      'video_avg_time_watched_actions', 'video_play_actions',
    ],
    // Conversions API config
    capi: {
      batchSize: 1000,
      batchIntervalMs: 5000,
      deduplicationWindowSeconds: 300,
      maxRetries: 3,
    },
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '4096', 10),
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    plans: {
      free: { price_id: '', limits: { ad_accounts: 1, campaigns: 5, ai_requests: 10, rules: 3, ab_tests: 1, competitors: 2 } },
      starter: { price_id: 'price_starter', limits: { ad_accounts: 3, campaigns: 25, ai_requests: 100, rules: 10, ab_tests: 5, competitors: 5 } },
      professional: { price_id: 'price_professional', limits: { ad_accounts: 10, campaigns: 100, ai_requests: 500, rules: 50, ab_tests: 20, competitors: 20 } },
      enterprise: { price_id: 'price_enterprise', limits: { ad_accounts: -1, campaigns: -1, ai_requests: -1, rules: -1, ab_tests: -1, competitors: -1 } },
    },
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY || 'default-32-byte-key-change-prod!',
    iv: process.env.ENCRYPTION_IV || 'default16byteiv!',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'debug',
    format: process.env.LOG_FORMAT || 'combined',
  },

  gcp: {
    projectId: process.env.GCP_PROJECT_ID || '',
    region: process.env.GCP_REGION || 'us-central1',
  },

  // Google Ads integration (for cross-channel attribution)
  googleAds: {
    clientId: process.env.GOOGLE_ADS_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || '',
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN || '',
  },

  // ============================================
  // ANDROMEDA-ERA OPTIMIZATION THRESHOLDS
  // Updated for 2025-2026 Meta algorithm changes
  // ============================================
  optimization: {
    creativeFatigue: {
      maxFrequency: 3.0,
      ctrDropThreshold: 0.20, // 20% CTR drop signals fatigue
      minImpressions: 1000,
      decayCurve: {
        static: 10, // days before typical fatigue
        video: 14,
        ugc: 18,
        carousel: 12,
        reels: 16,
        collection: 11,
      },
      // Andromeda-era: with 10-50 diverse ads per set, individual ad fatigue matters less
      // but creative diversity health matters more
      diversityTarget: {
        minAdsPerAdSet: 10,    // Andromeda prefers 10-50 diverse ads
        idealAdsPerAdSet: 25,  // Sweet spot for Andromeda ad matching
        maxAdsPerAdSet: 50,
        formatMixTarget: {     // Target % mix per ad set
          static: 0.35,        // 35% static images (drive 60-70% conversions)
          video: 0.25,         // 25% video (short raw + polished)
          ugc: 0.20,           // 20% UGC
          carousel: 0.15,      // 15% carousel
          other: 0.05,         // 5% other formats
        },
      },
    },
    learningPhase: {
      minOptimizationEvents: 50,
      maxDays: 7,
      budgetChangeThreshold: 0.20, // >20% budget change resets learning
      // Andromeda update: adding new ads often does NOT restart learning anymore
      addingAdRestartsLearning: false,
      // Minimum evaluation window before making changes
      minEvaluationDays: 7,  // Allow >= 7 days before changing campaigns
    },
    scaling: {
      maxBudgetIncrease: 0.20, // Never increase more than 20% at once
      minDataDays: 3,
      minConversions: 10,
      roasFloor: 1.5,
      // Andromeda: evaluate at ad-set level, not individual ad level
      evaluationLevel: 'adset' as const,
    },
    diagnostics: {
      cpmSpikeThreshold: 0.30, // 30% CPM increase
      ctrFloor: 0.008, // 0.8% CTR minimum
      conversionRateFloor: 0.01, // 1% conversion rate minimum
      // New Andromeda-era diagnostics
      breakdownEffectWarning: true, // Warn about individual ad CPA being misleading
      frequencyCapWarning: 2.5,    // Warn when frequency approaches this
    },
    // Andromeda-specific
    andromeda: {
      enabled: true,
      // Advantage+ defaults
      advantagePlusDefault: true,        // Default new campaigns to Advantage+
      broadTargetingPreferred: true,     // Prefer broad targeting with Andromeda
      // Value Rules
      valueRulesEnabled: true,
      maxValueRuleAdjustment: 10.0,      // Max 1000% bid adjustment (Meta allows 20-1000%)
      minValueRuleDataDays: 14,          // Need 14 days data before applying
      // Structure guidance
      consolidateStructure: true,         // Recommend consolidating campaigns
      maxCampaignsPerObjective: 3,        // Don't fragment into too many campaigns
    },
    // Cross-channel attribution settings
    attribution: {
      defaultModel: 'last_click' as const,
      models: ['last_click', 'first_click', 'linear', 'time_decay', 'position_based'] as const,
      engagedViewWindow: 5,               // 5-second engaged view attribution (new in 2025)
      clickWindow: 7,                      // 7-day click attribution
      viewWindow: 1,                       // 1-day view attribution
    },
    // A/B Testing defaults
    abTesting: {
      defaultConfidence: 0.95,
      minSampleSize: 1000,
      minConversions: 30,
      maxDurationDays: 14,
      autoEndOnSignificance: true,
    },
  },

  // Feature flags (defaults, overridden per-workspace in DB)
  features: {
    creativeIntelligence: true,
    capiIntegration: true,
    andromedaAwareness: true,
    proactiveAiAudit: true,
    crossChannelAttribution: true,
    abTesting: true,
    competitorIntelligence: true,
    autoApplyRecommendations: false, // Off by default, opt-in
  },
} as const;

export default config;
export type Config = typeof config;
