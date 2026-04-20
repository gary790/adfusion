-- ============================================
-- AD FUSION v2.0 - World-Class Upgrade Migration
-- Creative Intelligence, CAPI, A/B Testing, Competitor Intel,
-- Cross-Channel Attribution, Proactive AI, Andromeda-era updates
-- ============================================

-- ============================================
-- CREATIVE INTELLIGENCE
-- ============================================

-- Creative assets library with element-level tagging
CREATE TABLE IF NOT EXISTS creative_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ad_account_id UUID REFERENCES ad_accounts(id) ON DELETE SET NULL,
  meta_creative_id VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  asset_type VARCHAR(20) NOT NULL CHECK (asset_type IN ('image','video','carousel','ugc','dynamic','collection','instant_experience')),
  format VARCHAR(20) CHECK (format IN ('static','video','gif','carousel','slideshow','stories','reels')),
  -- Element tags (AI-detected)
  elements JSONB DEFAULT '{}'::jsonb, -- {headline_style, cta_type, color_palette, has_faces, has_text_overlay, visual_complexity, brand_elements}
  thumbnail_url TEXT,
  source_url TEXT,
  -- Performance linkage
  linked_ad_ids JSONB DEFAULT '[]'::jsonb,
  total_spend DECIMAL(15,2) DEFAULT 0,
  total_impressions BIGINT DEFAULT 0,
  total_clicks BIGINT DEFAULT 0,
  total_conversions INT DEFAULT 0,
  avg_ctr DECIMAL(10,6) DEFAULT 0,
  avg_cpc DECIMAL(15,4) DEFAULT 0,
  avg_roas DECIMAL(10,4) DEFAULT 0,
  -- Fatigue tracking
  fatigue_score DECIMAL(5,2) DEFAULT 0, -- 0-100
  fatigue_status VARCHAR(20) DEFAULT 'healthy' CHECK (fatigue_status IN ('healthy','early_warning','fatigued','critical')),
  days_active INT DEFAULT 0,
  first_served_at TIMESTAMPTZ,
  -- Winner status
  is_winner BOOLEAN DEFAULT false,
  winner_category VARCHAR(50), -- 'top_ctr', 'top_roas', 'top_conversions', 'top_engagement'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_creative_assets_workspace ON creative_assets(workspace_id);
CREATE INDEX idx_creative_assets_type ON creative_assets(asset_type);
CREATE INDEX idx_creative_assets_fatigue ON creative_assets(fatigue_status);
CREATE INDEX idx_creative_assets_winner ON creative_assets(workspace_id, is_winner) WHERE is_winner = true;

-- Creative performance time-series (daily snapshots)
CREATE TABLE IF NOT EXISTS creative_performance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creative_asset_id UUID NOT NULL REFERENCES creative_assets(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  spend DECIMAL(15,4) DEFAULT 0,
  conversions INT DEFAULT 0,
  ctr DECIMAL(10,6) DEFAULT 0,
  cpc DECIMAL(15,4) DEFAULT 0,
  cpm DECIMAL(15,4) DEFAULT 0,
  frequency DECIMAL(10,4) DEFAULT 0,
  roas DECIMAL(10,4) DEFAULT 0,
  thumb_stop_ratio DECIMAL(10,6) DEFAULT 0, -- video: 3s view / impression
  hook_rate DECIMAL(10,6) DEFAULT 0,       -- video: p25 / impression
  hold_rate DECIMAL(10,6) DEFAULT 0,       -- video: p75 / p25
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(creative_asset_id, date)
);
CREATE INDEX idx_creative_perf_asset ON creative_performance(creative_asset_id, date DESC);
CREATE INDEX idx_creative_perf_workspace ON creative_performance(workspace_id, date DESC);

-- ============================================
-- META CONVERSIONS API (CAPI) / SERVER-SIDE TRACKING
-- ============================================
CREATE TABLE IF NOT EXISTS capi_configurations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ad_account_id UUID NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  pixel_id VARCHAR(50) NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  dataset_id VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  -- Deduplication settings
  dedup_window_seconds INT DEFAULT 300, -- 5 minutes
  -- Event mapping
  event_mapping JSONB DEFAULT '{
    "PageView": true,
    "ViewContent": true,
    "AddToCart": true,
    "InitiateCheckout": true,
    "Purchase": true,
    "Lead": true,
    "CompleteRegistration": true
  }'::jsonb,
  -- Stats
  events_sent_today INT DEFAULT 0,
  events_deduped_today INT DEFAULT 0,
  last_event_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, pixel_id)
);
CREATE INDEX idx_capi_config_workspace ON capi_configurations(workspace_id);

CREATE TABLE IF NOT EXISTS capi_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  pixel_id VARCHAR(50) NOT NULL,
  event_name VARCHAR(50) NOT NULL,
  event_id VARCHAR(100) NOT NULL, -- for deduplication
  event_time TIMESTAMPTZ NOT NULL,
  event_source_url TEXT,
  -- User data (hashed for privacy)
  user_data JSONB DEFAULT '{}'::jsonb, -- {em, ph, fn, ln, ct, st, zp, country, external_id, client_ip_address, client_user_agent, fbc, fbp}
  -- Custom data
  custom_data JSONB DEFAULT '{}'::jsonb, -- {currency, value, content_name, content_ids, content_type, order_id}
  -- Processing
  action_source VARCHAR(20) DEFAULT 'website' CHECK (action_source IN ('website','app','phone_call','chat','physical_store','system_generated','other')),
  processing_status VARCHAR(20) DEFAULT 'pending' CHECK (processing_status IN ('pending','sent','failed','deduped')),
  meta_response JSONB,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_capi_events_workspace ON capi_events(workspace_id, event_time DESC);
CREATE INDEX idx_capi_events_dedup ON capi_events(pixel_id, event_id, event_time);
CREATE INDEX idx_capi_events_status ON capi_events(processing_status) WHERE processing_status = 'pending';

-- ============================================
-- A/B TESTING FRAMEWORK
-- ============================================
CREATE TABLE IF NOT EXISTS ab_tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  test_type VARCHAR(30) NOT NULL CHECK (test_type IN ('creative','audience','copy','placement','bidding','landing_page','budget')),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','running','paused','completed','archived')),
  -- Test configuration
  hypothesis TEXT,
  primary_metric VARCHAR(30) NOT NULL DEFAULT 'ctr', -- metric to determine winner
  secondary_metrics JSONB DEFAULT '["cpc","cpm","roas","cpa"]'::jsonb,
  confidence_level DECIMAL(5,4) DEFAULT 0.95, -- 95% significance
  minimum_sample_size INT DEFAULT 1000, -- minimum impressions per variant
  minimum_conversions INT DEFAULT 30,   -- minimum conversions per variant
  -- Variants
  variants JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{id, name, entity_type, entity_id, meta_id, traffic_split, is_control}]
  -- Results
  winner_variant_id VARCHAR(100),
  statistical_significance DECIMAL(5,4),
  p_value DECIMAL(10,8),
  lift_percentage DECIMAL(10,4),
  results JSONB DEFAULT '{}'::jsonb, -- {variant_id: {impressions, clicks, ctr, conversions, spend, roas, ...}}
  -- Timeline
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  auto_end_on_significance BOOLEAN DEFAULT true,
  max_duration_days INT DEFAULT 14,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ab_tests_workspace ON ab_tests(workspace_id);
CREATE INDEX idx_ab_tests_status ON ab_tests(status) WHERE status = 'running';

-- ============================================
-- COMPETITOR AD INTELLIGENCE
-- ============================================
CREATE TABLE IF NOT EXISTS competitor_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  meta_page_id VARCHAR(50),
  meta_page_name VARCHAR(255),
  website_url TEXT,
  industry VARCHAR(100),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_competitor_workspace ON competitor_profiles(workspace_id);

CREATE TABLE IF NOT EXISTS competitor_ads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  competitor_id UUID NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,
  meta_ad_library_id VARCHAR(100),
  -- Ad details from Meta Ad Library
  ad_text TEXT,
  headline TEXT,
  description TEXT,
  call_to_action VARCHAR(50),
  creative_type VARCHAR(20), -- image, video, carousel
  creative_url TEXT,
  landing_page_url TEXT,
  -- Metadata
  platforms JSONB DEFAULT '["facebook"]'::jsonb,
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  estimated_spend_range VARCHAR(50), -- e.g., "$1K-$5K"
  -- AI analysis
  ai_analysis JSONB DEFAULT '{}'::jsonb, -- {hooks, frameworks, tone, strengths, weaknesses, angles}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_competitor_ads_competitor ON competitor_ads(competitor_id);
CREATE INDEX idx_competitor_ads_workspace ON competitor_ads(workspace_id);
CREATE INDEX idx_competitor_ads_active ON competitor_ads(is_active) WHERE is_active = true;

-- ============================================
-- CROSS-CHANNEL ATTRIBUTION
-- ============================================
CREATE TABLE IF NOT EXISTS attribution_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_name VARCHAR(50) NOT NULL, -- 'meta', 'google', 'tiktok', 'email', 'organic', 'direct'
  channel_type VARCHAR(20) NOT NULL CHECK (channel_type IN ('paid','organic','direct','email','referral','social')),
  -- API connection (for imports)
  api_credentials_encrypted TEXT,
  import_config JSONB DEFAULT '{}'::jsonb, -- channel-specific config (Google Ads account ID, etc.)
  is_active BOOLEAN DEFAULT true,
  last_imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, channel_name)
);
CREATE INDEX idx_attribution_channels_workspace ON attribution_channels(workspace_id);

CREATE TABLE IF NOT EXISTS attribution_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES attribution_channels(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  -- Spend & revenue
  spend DECIMAL(15,4) DEFAULT 0,
  revenue DECIMAL(15,4) DEFAULT 0,
  -- Traffic metrics
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  -- Conversion metrics
  conversions INT DEFAULT 0,
  assisted_conversions INT DEFAULT 0,
  -- Calculated
  roas DECIMAL(10,4) DEFAULT 0,
  cpa DECIMAL(15,4) DEFAULT 0,
  -- Source breakdown
  campaign_name VARCHAR(255),
  campaign_id VARCHAR(100),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, channel_id, date, campaign_id)
);
CREATE INDEX idx_attribution_data_workspace ON attribution_data(workspace_id, date DESC);
CREATE INDEX idx_attribution_data_channel ON attribution_data(channel_id, date DESC);

-- Blended metrics (daily roll-up)
CREATE TABLE IF NOT EXISTS blended_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  -- Totals across all channels
  total_spend DECIMAL(15,4) DEFAULT 0,
  total_revenue DECIMAL(15,4) DEFAULT 0,
  total_orders INT DEFAULT 0,
  total_new_customers INT DEFAULT 0,
  -- Blended KPIs
  mer DECIMAL(10,4) DEFAULT 0, -- Marketing Efficiency Ratio (revenue / spend)
  blended_roas DECIMAL(10,4) DEFAULT 0,
  blended_cac DECIMAL(15,4) DEFAULT 0, -- Customer Acquisition Cost
  blended_cpa DECIMAL(15,4) DEFAULT 0,
  -- Channel breakdown
  channel_breakdown JSONB DEFAULT '{}'::jsonb, -- {meta: {spend, revenue, roas}, google: {...}, ...}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, date)
);
CREATE INDEX idx_blended_metrics_workspace ON blended_metrics(workspace_id, date DESC);

-- ============================================
-- PROACTIVE AI AUDIT
-- ============================================
CREATE TABLE IF NOT EXISTS ai_audit_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_type VARCHAR(20) DEFAULT 'scheduled' CHECK (run_type IN ('scheduled','manual','triggered')),
  status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  -- Scope
  entities_scanned INT DEFAULT 0,
  issues_found INT DEFAULT 0,
  recommendations_generated INT DEFAULT 0,
  auto_applied_count INT DEFAULT 0,
  -- Results summary
  health_score DECIMAL(5,2) DEFAULT 0, -- Overall account health 0-100
  findings JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  processing_time_ms INT
);
CREATE INDEX idx_ai_audit_workspace ON ai_audit_runs(workspace_id, started_at DESC);

CREATE TABLE IF NOT EXISTS ai_recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  audit_run_id UUID REFERENCES ai_audit_runs(id) ON DELETE SET NULL,
  -- Recommendation details
  category VARCHAR(50) NOT NULL, -- 'creative_refresh', 'budget_shift', 'audience_expansion', 'pause_underperformer', 'scale_winner', 'structure_change', 'andromeda_optimization'
  priority VARCHAR(10) NOT NULL CHECK (priority IN ('critical','high','medium','low')),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  rationale TEXT, -- data-driven justification
  -- Action
  action_type VARCHAR(50),
  action_params JSONB DEFAULT '{}'::jsonb,
  target_entity_type VARCHAR(20),
  target_entity_id VARCHAR(255),
  -- Impact estimation
  estimated_impact JSONB DEFAULT '{}'::jsonb, -- {metric, current_value, predicted_value, confidence}
  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','accepted','applied','dismissed','expired')),
  applied_at TIMESTAMPTZ,
  applied_by UUID REFERENCES users(id),
  dismissed_reason TEXT,
  -- Auto-apply eligibility
  auto_applicable BOOLEAN DEFAULT false,
  auto_apply_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);
CREATE INDEX idx_ai_recommendations_workspace ON ai_recommendations(workspace_id, created_at DESC);
CREATE INDEX idx_ai_recommendations_status ON ai_recommendations(status) WHERE status = 'pending';
CREATE INDEX idx_ai_recommendations_category ON ai_recommendations(category);

-- ============================================
-- ADVANTAGE+ / ANDROMEDA TRACKING
-- ============================================
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS is_advantage_plus BOOLEAN DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS advantage_plus_type VARCHAR(30); -- 'shopping', 'leads', 'app'
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS value_rules JSONB DEFAULT '[]'::jsonb;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS opportunity_score DECIMAL(5,2);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS creative_count INT DEFAULT 0; -- track ads per campaign for Andromeda guidance

ALTER TABLE adsets ADD COLUMN IF NOT EXISTS advantage_targeting BOOLEAN DEFAULT false;
ALTER TABLE adsets ADD COLUMN IF NOT EXISTS advantage_placements BOOLEAN DEFAULT false;
ALTER TABLE adsets ADD COLUMN IF NOT EXISTS advantage_creative BOOLEAN DEFAULT false;

ALTER TABLE ads ADD COLUMN IF NOT EXISTS creative_asset_id UUID REFERENCES creative_assets(id) ON DELETE SET NULL;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS ad_format VARCHAR(30); -- 'image','video','carousel','collection','instant_experience','dynamic'

-- Add engaged-view attribution columns to insights
ALTER TABLE ad_insights ADD COLUMN IF NOT EXISTS engaged_view_conversions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE ad_insights ADD COLUMN IF NOT EXISTS inline_link_clicks BIGINT DEFAULT 0;
ALTER TABLE ad_insights ADD COLUMN IF NOT EXISTS cost_per_inline_link_click DECIMAL(15,4) DEFAULT 0;

-- ============================================
-- FEATURE FLAGS
-- ============================================
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  feature_name VARCHAR(100) NOT NULL,
  is_enabled BOOLEAN DEFAULT false,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, feature_name)
);
CREATE INDEX idx_feature_flags_workspace ON feature_flags(workspace_id);

-- ============================================
-- APPLY TRIGGERS
-- ============================================
CREATE TRIGGER update_creative_assets_updated_at BEFORE UPDATE ON creative_assets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_capi_configs_updated_at BEFORE UPDATE ON capi_configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ab_tests_updated_at BEFORE UPDATE ON ab_tests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_competitor_profiles_updated_at BEFORE UPDATE ON competitor_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_competitor_ads_updated_at BEFORE UPDATE ON competitor_ads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_attribution_channels_updated_at BEFORE UPDATE ON attribution_channels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_feature_flags_updated_at BEFORE UPDATE ON feature_flags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
