// ============================================
// AD FUSION - Application Configuration
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
    // Insights metrics we always request
    defaultInsightFields: [
      'impressions', 'reach', 'frequency', 'clicks', 'unique_clicks',
      'ctr', 'unique_ctr', 'cpc', 'cpm', 'cpp', 'spend',
      'actions', 'conversions', 'cost_per_action_type',
      'purchase_roas', 'video_p25_watched_actions',
      'video_p50_watched_actions', 'video_p75_watched_actions',
      'video_p100_watched_actions', 'outbound_clicks',
      'landing_page_views', 'quality_score_organic',
      'quality_score_ectr', 'quality_score_ecvr',
    ],
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
      free: { price_id: '', limits: { ad_accounts: 1, campaigns: 5, ai_requests: 10, rules: 3 } },
      starter: { price_id: 'price_starter', limits: { ad_accounts: 3, campaigns: 25, ai_requests: 100, rules: 10 } },
      professional: { price_id: 'price_professional', limits: { ad_accounts: 10, campaigns: 100, ai_requests: 500, rules: 50 } },
      enterprise: { price_id: 'price_enterprise', limits: { ad_accounts: -1, campaigns: -1, ai_requests: -1, rules: -1 } },
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

  // Ad optimization thresholds (baked-in industry intelligence)
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
      },
    },
    learningPhase: {
      minOptimizationEvents: 50,
      maxDays: 7,
      budgetChangeThreshold: 0.20, // >20% budget change resets learning
    },
    scaling: {
      maxBudgetIncrease: 0.20, // Never increase more than 20% at once
      minDataDays: 3,
      minConversions: 10,
      roasFloor: 1.5,
    },
    diagnostics: {
      cpmSpikeThreshold: 0.30, // 30% CPM increase
      ctrFloor: 0.008, // 0.8% CTR minimum
      conversionRateFloor: 0.01, // 1% conversion rate minimum
    },
  },
} as const;

export default config;
export type Config = typeof config;
