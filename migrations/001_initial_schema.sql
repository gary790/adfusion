-- ============================================
-- AD FUSION - Complete PostgreSQL Schema
-- Multi-tenant SaaS: User → Workspace → Ad Accounts → Campaigns → Ads
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- USERS
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  role VARCHAR(20) DEFAULT 'owner' CHECK (role IN ('owner','admin','manager','analyst','viewer')),
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  google_id VARCHAR(255) UNIQUE,
  meta_user_id VARCHAR(255),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);

-- ============================================
-- WORKSPACES (Multi-tenant root)
-- ============================================
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan VARCHAR(20) DEFAULT 'free' CHECK (plan IN ('free','starter','professional','enterprise')),
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  settings JSONB DEFAULT '{
    "timezone": "UTC",
    "currency": "USD",
    "default_optimization_goal": "LINK_CLICKS",
    "notification_channels": ["in_app"],
    "auto_optimization_enabled": false,
    "daily_budget_limit": null
  }'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_workspaces_owner ON workspaces(owner_id);
CREATE INDEX idx_workspaces_slug ON workspaces(slug);

-- ============================================
-- WORKSPACE MEMBERS
-- ============================================
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'viewer' CHECK (role IN ('owner','admin','manager','analyst','viewer')),
  invited_by UUID REFERENCES users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);
CREATE INDEX idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);

-- ============================================
-- AD ACCOUNTS (Meta / Facebook)
-- ============================================
CREATE TABLE IF NOT EXISTS ad_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  meta_account_id VARCHAR(50) NOT NULL, -- act_XXXXXXXX
  name VARCHAR(255) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  timezone VARCHAR(100) DEFAULT 'UTC',
  access_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  account_status VARCHAR(30) DEFAULT 'active',
  spend_cap DECIMAL(15,2),
  amount_spent DECIMAL(15,2) DEFAULT 0,
  balance DECIMAL(15,2) DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, meta_account_id)
);
CREATE INDEX idx_ad_accounts_workspace ON ad_accounts(workspace_id);
CREATE INDEX idx_ad_accounts_meta_id ON ad_accounts(meta_account_id);

-- ============================================
-- CAMPAIGNS
-- ============================================
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ad_account_id UUID NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  meta_campaign_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'PAUSED' CHECK (status IN ('ACTIVE','PAUSED','DELETED','ARCHIVED')),
  objective VARCHAR(50),
  buying_type VARCHAR(20) DEFAULT 'AUCTION',
  budget_type VARCHAR(20) DEFAULT 'daily',
  daily_budget DECIMAL(15,2),
  lifetime_budget DECIMAL(15,2),
  bid_strategy VARCHAR(50) DEFAULT 'LOWEST_COST_WITHOUT_CAP',
  special_ad_categories JSONB DEFAULT '[]'::jsonb,
  start_time TIMESTAMPTZ,
  stop_time TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, meta_campaign_id)
);
CREATE INDEX idx_campaigns_workspace ON campaigns(workspace_id);
CREATE INDEX idx_campaigns_account ON campaigns(ad_account_id);
CREATE INDEX idx_campaigns_meta_id ON campaigns(meta_campaign_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);

-- ============================================
-- AD SETS
-- ============================================
CREATE TABLE IF NOT EXISTS adsets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  meta_adset_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'PAUSED' CHECK (status IN ('ACTIVE','PAUSED','DELETED','ARCHIVED')),
  daily_budget DECIMAL(15,2),
  lifetime_budget DECIMAL(15,2),
  bid_amount DECIMAL(15,2),
  billing_event VARCHAR(30) DEFAULT 'IMPRESSIONS',
  optimization_goal VARCHAR(30) DEFAULT 'LINK_CLICKS',
  targeting JSONB DEFAULT '{}'::jsonb,
  placements JSONB DEFAULT '{"automatic": true}'::jsonb,
  schedule JSONB DEFAULT '{}'::jsonb,
  promoted_object JSONB,
  learning_stage VARCHAR(30),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, meta_adset_id)
);
CREATE INDEX idx_adsets_workspace ON adsets(workspace_id);
CREATE INDEX idx_adsets_campaign ON adsets(campaign_id);
CREATE INDEX idx_adsets_meta_id ON adsets(meta_adset_id);
CREATE INDEX idx_adsets_status ON adsets(status);

-- ============================================
-- ADS
-- ============================================
CREATE TABLE IF NOT EXISTS ads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  adset_id UUID NOT NULL REFERENCES adsets(id) ON DELETE CASCADE,
  meta_ad_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'PAUSED' CHECK (status IN ('ACTIVE','PAUSED','DELETED','ARCHIVED')),
  creative JSONB DEFAULT '{}'::jsonb,
  tracking_specs JSONB,
  preview_url TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, meta_ad_id)
);
CREATE INDEX idx_ads_workspace ON ads(workspace_id);
CREATE INDEX idx_ads_adset ON ads(adset_id);
CREATE INDEX idx_ads_meta_id ON ads(meta_ad_id);
CREATE INDEX idx_ads_status ON ads(status);

-- ============================================
-- AD INSIGHTS (Performance Metrics Time-Series)
-- ============================================
CREATE TABLE IF NOT EXISTS ad_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ad_account_id UUID NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  adset_id UUID REFERENCES adsets(id) ON DELETE SET NULL,
  ad_id UUID REFERENCES ads(id) ON DELETE SET NULL,
  level VARCHAR(20) NOT NULL DEFAULT 'ad' CHECK (level IN ('account','campaign','adset','ad')),
  date_start DATE NOT NULL,
  date_stop DATE NOT NULL,
  -- Core metrics
  impressions BIGINT DEFAULT 0,
  reach BIGINT DEFAULT 0,
  frequency DECIMAL(10,4) DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  unique_clicks BIGINT DEFAULT 0,
  ctr DECIMAL(10,6) DEFAULT 0,
  unique_ctr DECIMAL(10,6) DEFAULT 0,
  cpc DECIMAL(15,4) DEFAULT 0,
  cpm DECIMAL(15,4) DEFAULT 0,
  cpp DECIMAL(15,4) DEFAULT 0,
  spend DECIMAL(15,4) DEFAULT 0,
  -- Action metrics (stored as JSONB for flexibility)
  actions JSONB DEFAULT '[]'::jsonb,
  conversions JSONB DEFAULT '[]'::jsonb,
  cost_per_action_type JSONB DEFAULT '[]'::jsonb,
  purchase_roas JSONB DEFAULT '[]'::jsonb,
  -- Video metrics
  video_views BIGINT DEFAULT 0,
  video_p25_watched BIGINT DEFAULT 0,
  video_p50_watched BIGINT DEFAULT 0,
  video_p75_watched BIGINT DEFAULT 0,
  video_p100_watched BIGINT DEFAULT 0,
  -- Engagement metrics
  link_clicks BIGINT DEFAULT 0,
  landing_page_views BIGINT DEFAULT 0,
  outbound_clicks BIGINT DEFAULT 0,
  social_impressions BIGINT DEFAULT 0,
  social_clicks BIGINT DEFAULT 0,
  -- Quality metrics
  quality_score_organic DECIMAL(5,2),
  quality_score_ectr DECIMAL(5,2),
  quality_score_ecvr DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Prevent duplicate insight entries
  UNIQUE(workspace_id, ad_account_id, campaign_id, adset_id, ad_id, level, date_start)
);
CREATE INDEX idx_insights_workspace ON ad_insights(workspace_id);
CREATE INDEX idx_insights_account ON ad_insights(ad_account_id);
CREATE INDEX idx_insights_campaign ON ad_insights(campaign_id);
CREATE INDEX idx_insights_adset ON ad_insights(adset_id);
CREATE INDEX idx_insights_ad ON ad_insights(ad_id);
CREATE INDEX idx_insights_date ON ad_insights(date_start, date_stop);
CREATE INDEX idx_insights_workspace_date ON ad_insights(workspace_id, date_start DESC);

-- ============================================
-- AUTOMATION RULES
-- ============================================
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('campaign','adset','ad')),
  scope_ids JSONB DEFAULT '[]'::jsonb, -- specific entity IDs, empty = all
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  condition_logic VARCHAR(5) DEFAULT 'AND' CHECK (condition_logic IN ('AND','OR')),
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  schedule JSONB DEFAULT '{"frequency": "hourly"}'::jsonb,
  lookback_window INT DEFAULT 24, -- hours
  cooldown_period INT DEFAULT 6, -- hours
  last_triggered_at TIMESTAMPTZ,
  trigger_count INT DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_rules_workspace ON automation_rules(workspace_id);
CREATE INDEX idx_rules_active ON automation_rules(is_active, workspace_id);

-- ============================================
-- RULE EXECUTIONS (Audit Log)
-- ============================================
CREATE TABLE IF NOT EXISTS rule_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  conditions_met JSONB DEFAULT '{}'::jsonb,
  actions_taken JSONB DEFAULT '{}'::jsonb,
  affected_entities JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success','failed','partial','skipped')),
  error_message TEXT,
  execution_time_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_rule_exec_rule ON rule_executions(rule_id);
CREATE INDEX idx_rule_exec_workspace ON rule_executions(workspace_id);
CREATE INDEX idx_rule_exec_date ON rule_executions(triggered_at DESC);

-- ============================================
-- AI ANALYSES
-- ============================================
CREATE TABLE IF NOT EXISTS ai_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  analysis_type VARCHAR(50) NOT NULL,
  target_id VARCHAR(255) NOT NULL,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('campaign','adset','ad','account')),
  input_data JSONB DEFAULT '{}'::jsonb,
  analysis_result JSONB DEFAULT '{}'::jsonb,
  confidence_score DECIMAL(5,4) DEFAULT 0,
  model_used VARCHAR(50) DEFAULT 'gpt-4o',
  tokens_used INT DEFAULT 0,
  processing_time_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ai_analyses_workspace ON ai_analyses(workspace_id);
CREATE INDEX idx_ai_analyses_target ON ai_analyses(target_id, target_type);
CREATE INDEX idx_ai_analyses_type ON ai_analyses(analysis_type);

-- ============================================
-- AI GENERATED COPY
-- ============================================
CREATE TABLE IF NOT EXISTS ai_generated_copy (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  request_params JSONB NOT NULL,
  headline TEXT,
  primary_text TEXT,
  description TEXT,
  call_to_action VARCHAR(50),
  framework_used VARCHAR(20),
  hooks JSONB DEFAULT '[]'::jsonb,
  score DECIMAL(5,2) DEFAULT 0,
  reasoning TEXT,
  is_applied BOOLEAN DEFAULT false,
  applied_to_ad_id UUID REFERENCES ads(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ai_copy_workspace ON ai_generated_copy(workspace_id);

-- ============================================
-- NOTIFICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  channel VARCHAR(20) DEFAULT 'in_app' CHECK (channel IN ('email','slack','webhook','in_app')),
  type VARCHAR(30) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notifications_workspace ON notifications(workspace_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_date ON notifications(created_at DESC);

-- ============================================
-- AUDIT LOG
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(255),
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_workspace ON audit_log(workspace_id, created_at DESC);
CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);

-- ============================================
-- SYNC JOBS (Track sync history)
-- ============================================
CREATE TABLE IF NOT EXISTS sync_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ad_account_id UUID NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  sync_type VARCHAR(20) DEFAULT 'incremental' CHECK (sync_type IN ('full','incremental')),
  status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  stats JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_sync_jobs_workspace ON sync_jobs(workspace_id);
CREATE INDEX idx_sync_jobs_account ON sync_jobs(ad_account_id);

-- ============================================
-- REFRESH TOKENS
-- ============================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  is_revoked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- ============================================
-- API USAGE TRACKING (For billing)
-- ============================================
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  usage_type VARCHAR(30) NOT NULL, -- 'ai_request', 'meta_api_call', 'sync'
  count INT DEFAULT 1,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, usage_type, period_start)
);
CREATE INDEX idx_api_usage_workspace ON api_usage(workspace_id, period_start);

-- ============================================
-- Function: auto-update updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ad_accounts_updated_at BEFORE UPDATE ON ad_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_adsets_updated_at BEFORE UPDATE ON adsets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ads_updated_at BEFORE UPDATE ON ads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_automation_rules_updated_at BEFORE UPDATE ON automation_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
