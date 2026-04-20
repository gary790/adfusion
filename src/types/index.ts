// ============================================
// AD FUSION v2.0 - Core Type Definitions
// World-class Meta Ad Optimizer
// ============================================

// ---- User & Auth Types ----
export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  avatar_url?: string;
  role: UserRole;
  is_active: boolean;
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export type UserRole = 'owner' | 'admin' | 'manager' | 'analyst' | 'viewer';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  plan: SubscriptionPlan;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  settings: WorkspaceSettings;
  created_at: Date;
  updated_at: Date;
}

export interface WorkspaceSettings {
  timezone: string;
  currency: string;
  default_optimization_goal: OptimizationGoal;
  notification_channels: NotificationChannel[];
  auto_optimization_enabled: boolean;
  daily_budget_limit?: number;
  // v2.0 settings
  proactive_ai_enabled?: boolean;
  auto_apply_recommendations?: boolean;
  andromeda_mode?: boolean;
}

export type SubscriptionPlan = 'free' | 'starter' | 'professional' | 'enterprise';

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: UserRole;
  invited_by: string;
  joined_at: Date;
}

// ---- Meta Ad Account Types ----
export interface AdAccount {
  id: string;
  workspace_id: string;
  meta_account_id: string;
  name: string;
  currency: string;
  timezone: string;
  access_token_encrypted: string;
  token_expires_at?: Date;
  account_status: MetaAccountStatus;
  spend_cap?: number;
  amount_spent: number;
  balance: number;
  last_synced_at?: Date;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export type MetaAccountStatus = 'active' | 'disabled' | 'unsettled' | 'pending_review' | 'in_grace_period' | 'temporarily_unavailable' | 'pending_closure' | 'closed';

// ---- Campaign Types ----
export interface Campaign {
  id: string;
  workspace_id: string;
  ad_account_id: string;
  meta_campaign_id: string;
  name: string;
  status: CampaignStatus;
  objective: CampaignObjective;
  buying_type: BuyingType;
  budget_type: BudgetType;
  daily_budget?: number;
  lifetime_budget?: number;
  bid_strategy: BidStrategy;
  special_ad_categories: string[];
  start_time?: Date;
  stop_time?: Date;
  // Andromeda-era fields
  is_advantage_plus?: boolean;
  advantage_plus_type?: 'shopping' | 'leads' | 'app';
  value_rules?: ValueRule[];
  opportunity_score?: number;
  creative_count?: number;
  created_at: Date;
  updated_at: Date;
  last_synced_at?: Date;
}

export interface ValueRule {
  id: string;
  name: string;
  rule_type: 'high_value_customer' | 'new_customer' | 'lapsed_customer';
  bid_adjustment: number; // 0.2 to 10.0 (20% to 1000%)
  audience_id?: string;
  is_active: boolean;
}

export type CampaignStatus = 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
export type CampaignObjective = 'OUTCOME_AWARENESS' | 'OUTCOME_TRAFFIC' | 'OUTCOME_ENGAGEMENT' | 'OUTCOME_LEADS' | 'OUTCOME_APP_PROMOTION' | 'OUTCOME_SALES';
export type BuyingType = 'AUCTION' | 'RESERVED';
export type BudgetType = 'daily' | 'lifetime';
export type BidStrategy = 'LOWEST_COST_WITHOUT_CAP' | 'LOWEST_COST_WITH_BID_CAP' | 'COST_CAP' | 'LOWEST_COST_WITH_MIN_ROAS';

// ---- Ad Set Types ----
export interface AdSet {
  id: string;
  workspace_id: string;
  campaign_id: string;
  meta_adset_id: string;
  name: string;
  status: CampaignStatus;
  daily_budget?: number;
  lifetime_budget?: number;
  bid_amount?: number;
  billing_event: BillingEvent;
  optimization_goal: OptimizationGoal;
  targeting: TargetingSpec;
  placements: PlacementSpec;
  schedule: ScheduleSpec;
  promoted_object?: PromotedObject;
  // Andromeda Advantage features
  advantage_targeting?: boolean;
  advantage_placements?: boolean;
  advantage_creative?: boolean;
  created_at: Date;
  updated_at: Date;
  last_synced_at?: Date;
}

export type BillingEvent = 'IMPRESSIONS' | 'LINK_CLICKS' | 'APP_INSTALLS' | 'PAGE_LIKES' | 'POST_ENGAGEMENT' | 'VIDEO_VIEWS' | 'THRUPLAY';
export type OptimizationGoal = 'LINK_CLICKS' | 'IMPRESSIONS' | 'REACH' | 'LANDING_PAGE_VIEWS' | 'OFFSITE_CONVERSIONS' | 'VALUE' | 'LEAD_GENERATION' | 'APP_INSTALLS' | 'VIDEO_VIEWS' | 'THRUPLAY' | 'ENGAGED_USERS';

export interface TargetingSpec {
  age_min?: number;
  age_max?: number;
  genders?: number[];
  geo_locations?: {
    countries?: string[];
    regions?: Array<{ key: string; name: string }>;
    cities?: Array<{ key: string; name: string; radius?: number }>;
    zips?: Array<{ key: string }>;
  };
  interests?: Array<{ id: string; name: string }>;
  behaviors?: Array<{ id: string; name: string }>;
  custom_audiences?: Array<{ id: string; name: string }>;
  excluded_custom_audiences?: Array<{ id: string; name: string }>;
  lookalike_audiences?: Array<{ id: string; name: string }>;
  locales?: number[];
  publisher_platforms?: string[];
  facebook_positions?: string[];
  instagram_positions?: string[];
  device_platforms?: string[];
  flexible_spec?: Array<Record<string, unknown>>;
  exclusions?: Record<string, unknown>;
}

export interface PlacementSpec {
  automatic: boolean;
  platforms?: ('facebook' | 'instagram' | 'messenger' | 'audience_network')[];
  positions?: string[];
  device_types?: ('mobile' | 'desktop')[];
}

export interface ScheduleSpec {
  start_time: string;
  end_time?: string;
  dayparting?: Array<{
    days: number[];
    start_hour: number;
    end_hour: number;
    timezone_type: string;
  }>;
}

export interface PromotedObject {
  pixel_id?: string;
  custom_event_type?: string;
  page_id?: string;
  application_id?: string;
  object_store_url?: string;
  product_catalog_id?: string;
  product_set_id?: string;
}

// ---- Ad Types ----
export interface Ad {
  id: string;
  workspace_id: string;
  adset_id: string;
  meta_ad_id: string;
  name: string;
  status: CampaignStatus;
  creative: AdCreative;
  tracking_specs?: Record<string, unknown>;
  creative_asset_id?: string;
  ad_format?: AdFormat;
  created_at: Date;
  updated_at: Date;
  last_synced_at?: Date;
}

export type AdFormat = 'image' | 'video' | 'carousel' | 'collection' | 'instant_experience' | 'dynamic';

export interface AdCreative {
  id?: string;
  meta_creative_id?: string;
  name: string;
  title?: string;
  body?: string;
  description?: string;
  call_to_action_type?: CallToAction;
  link_url?: string;
  image_url?: string;
  image_hash?: string;
  video_id?: string;
  thumbnail_url?: string;
  carousel_cards?: CarouselCard[];
  url_tags?: string;
  object_story_spec?: Record<string, unknown>;
}

export type CallToAction = 'LEARN_MORE' | 'SHOP_NOW' | 'SIGN_UP' | 'BOOK_NOW' | 'DOWNLOAD' | 'GET_OFFER' | 'GET_QUOTE' | 'CONTACT_US' | 'APPLY_NOW' | 'SUBSCRIBE' | 'WATCH_MORE' | 'SEE_MENU' | 'ORDER_NOW' | 'BUY_NOW' | 'GET_DIRECTIONS' | 'SEND_MESSAGE' | 'CALL_NOW' | 'REQUEST_TIME' | 'SAVE' | 'OPEN_LINK' | 'NO_BUTTON';

export interface CarouselCard {
  name: string;
  title: string;
  body: string;
  link_url: string;
  image_url?: string;
  image_hash?: string;
  video_id?: string;
  call_to_action_type: CallToAction;
}

// ---- Metrics & Insights Types ----
export interface AdInsight {
  id: string;
  workspace_id: string;
  ad_account_id: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  level: InsightLevel;
  date_start: Date;
  date_stop: Date;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  unique_clicks: number;
  ctr: number;
  unique_ctr: number;
  cpc: number;
  cpm: number;
  cpp: number;
  spend: number;
  actions?: ActionMetric[];
  conversions?: ActionMetric[];
  cost_per_action_type?: ActionMetric[];
  purchase_roas?: ActionMetric[];
  video_views?: number;
  video_p25_watched?: number;
  video_p50_watched?: number;
  video_p75_watched?: number;
  video_p100_watched?: number;
  link_clicks?: number;
  landing_page_views?: number;
  outbound_clicks?: number;
  social_impressions?: number;
  social_clicks?: number;
  quality_score_organic?: number;
  quality_score_ectr?: number;
  quality_score_ecvr?: number;
  // Andromeda-era
  engaged_view_conversions?: ActionMetric[];
  inline_link_clicks?: number;
  cost_per_inline_link_click?: number;
  created_at: Date;
}

export type InsightLevel = 'account' | 'campaign' | 'adset' | 'ad';

export interface ActionMetric {
  action_type: string;
  value: number;
  '1d_click'?: number;
  '7d_click'?: number;
  '28d_click'?: number;
  '1d_view'?: number;
  '7d_view'?: number;
}

export interface PerformanceSummary {
  total_spend: number;
  total_impressions: number;
  total_reach: number;
  total_clicks: number;
  total_conversions: number;
  total_revenue: number;
  avg_ctr: number;
  avg_cpc: number;
  avg_cpm: number;
  avg_roas: number;
  avg_frequency: number;
  cost_per_conversion: number;
  conversion_rate: number;
}

// ---- Creative Intelligence Types ----
export interface CreativeAsset {
  id: string;
  workspace_id: string;
  ad_account_id?: string;
  meta_creative_id?: string;
  name: string;
  asset_type: CreativeAssetType;
  format?: CreativeFormat;
  elements: CreativeElements;
  thumbnail_url?: string;
  source_url?: string;
  linked_ad_ids: string[];
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  avg_ctr: number;
  avg_cpc: number;
  avg_roas: number;
  fatigue_score: number;
  fatigue_status: FatigueStatus;
  days_active: number;
  first_served_at?: Date;
  is_winner: boolean;
  winner_category?: WinnerCategory;
  created_at: Date;
  updated_at: Date;
}

export type CreativeAssetType = 'image' | 'video' | 'carousel' | 'ugc' | 'dynamic' | 'collection' | 'instant_experience';
export type CreativeFormat = 'static' | 'video' | 'gif' | 'carousel' | 'slideshow' | 'stories' | 'reels';
export type FatigueStatus = 'healthy' | 'early_warning' | 'fatigued' | 'critical';
export type WinnerCategory = 'top_ctr' | 'top_roas' | 'top_conversions' | 'top_engagement';

export interface CreativeElements {
  headline_style?: string;
  cta_type?: string;
  color_palette?: string[];
  has_faces?: boolean;
  has_text_overlay?: boolean;
  visual_complexity?: 'low' | 'medium' | 'high';
  brand_elements?: string[];
  copy_length?: 'short' | 'medium' | 'long';
  emotion_tone?: string;
  hooks_used?: string[];
}

export interface CreativePerformancePoint {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  roas: number;
  thumb_stop_ratio?: number;
  hook_rate?: number;
  hold_rate?: number;
}

export interface CreativeDiversityReport {
  total_creatives: number;
  active_creatives: number;
  format_breakdown: Record<string, number>;
  healthy_count: number;
  fatigued_count: number;
  critical_count: number;
  diversity_score: number; // 0-100
  recommendations: string[];
}

// ---- CAPI / Server-Side Tracking Types ----
export interface CAPIConfiguration {
  id: string;
  workspace_id: string;
  ad_account_id: string;
  pixel_id: string;
  access_token_encrypted: string;
  dataset_id?: string;
  is_active: boolean;
  dedup_window_seconds: number;
  event_mapping: Record<string, boolean>;
  events_sent_today: number;
  events_deduped_today: number;
  last_event_at?: Date;
  last_error?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CAPIEvent {
  id: string;
  workspace_id: string;
  pixel_id: string;
  event_name: CAPIEventName;
  event_id: string;
  event_time: Date;
  event_source_url?: string;
  user_data: CAPIUserData;
  custom_data: CAPICustomData;
  action_source: CAPIActionSource;
  processing_status: 'pending' | 'sent' | 'failed' | 'deduped';
  meta_response?: Record<string, unknown>;
  sent_at?: Date;
  error_message?: string;
  created_at: Date;
}

export type CAPIEventName = 'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase' | 'Lead' | 'CompleteRegistration' | 'Search' | 'AddPaymentInfo' | 'AddToWishlist' | 'Contact' | 'CustomizeProduct' | 'Donate' | 'FindLocation' | 'Schedule' | 'StartTrial' | 'SubmitApplication' | 'Subscribe';

export type CAPIActionSource = 'website' | 'app' | 'phone_call' | 'chat' | 'physical_store' | 'system_generated' | 'other';

export interface CAPIUserData {
  em?: string;   // hashed email
  ph?: string;   // hashed phone
  fn?: string;   // hashed first name
  ln?: string;   // hashed last name
  ct?: string;   // hashed city
  st?: string;   // hashed state
  zp?: string;   // hashed zip
  country?: string;
  external_id?: string;
  client_ip_address?: string;
  client_user_agent?: string;
  fbc?: string;  // Facebook click ID
  fbp?: string;  // Facebook browser ID
}

export interface CAPICustomData {
  currency?: string;
  value?: number;
  content_name?: string;
  content_ids?: string[];
  content_type?: string;
  order_id?: string;
  num_items?: number;
  search_string?: string;
}

// ---- A/B Testing Types ----
export interface ABTest {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  test_type: ABTestType;
  status: ABTestStatus;
  hypothesis?: string;
  primary_metric: string;
  secondary_metrics: string[];
  confidence_level: number;
  minimum_sample_size: number;
  minimum_conversions: number;
  variants: ABTestVariant[];
  winner_variant_id?: string;
  statistical_significance?: number;
  p_value?: number;
  lift_percentage?: number;
  results: Record<string, ABVariantResult>;
  started_at?: Date;
  ended_at?: Date;
  auto_end_on_significance: boolean;
  max_duration_days: number;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export type ABTestType = 'creative' | 'audience' | 'copy' | 'placement' | 'bidding' | 'landing_page' | 'budget';
export type ABTestStatus = 'draft' | 'running' | 'paused' | 'completed' | 'archived';

export interface ABTestVariant {
  id: string;
  name: string;
  entity_type: string;
  entity_id: string;
  meta_id?: string;
  traffic_split: number;
  is_control: boolean;
}

export interface ABVariantResult {
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  spend: number;
  roas: number;
  cpa: number;
  cpc: number;
  cpm: number;
}

export interface StatisticalTestResult {
  is_significant: boolean;
  p_value: number;
  confidence: number;
  z_score: number;
  lift_percentage: number;
  sample_size_sufficient: boolean;
  winner_variant_id?: string;
  recommendation: string;
}

// ---- Competitor Intelligence Types ----
export interface CompetitorProfile {
  id: string;
  workspace_id: string;
  name: string;
  meta_page_id?: string;
  meta_page_name?: string;
  website_url?: string;
  industry?: string;
  notes?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CompetitorAd {
  id: string;
  workspace_id: string;
  competitor_id: string;
  meta_ad_library_id?: string;
  ad_text?: string;
  headline?: string;
  description?: string;
  call_to_action?: string;
  creative_type?: string;
  creative_url?: string;
  landing_page_url?: string;
  platforms: string[];
  start_date?: Date;
  end_date?: Date;
  is_active: boolean;
  estimated_spend_range?: string;
  ai_analysis?: CompetitorAdAnalysis;
  created_at: Date;
  updated_at: Date;
}

export interface CompetitorAdAnalysis {
  hooks: string[];
  frameworks: string[];
  tone: string;
  strengths: string[];
  weaknesses: string[];
  angles: string[];
  estimated_ctr_range?: string;
  actionable_insights: string[];
}

// ---- Cross-Channel Attribution Types ----
export interface AttributionChannel {
  id: string;
  workspace_id: string;
  channel_name: string;
  channel_type: ChannelType;
  api_credentials_encrypted?: string;
  import_config: Record<string, unknown>;
  is_active: boolean;
  last_imported_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export type ChannelType = 'paid' | 'organic' | 'direct' | 'email' | 'referral' | 'social';

export interface AttributionData {
  id: string;
  workspace_id: string;
  channel_id: string;
  date: Date;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  assisted_conversions: number;
  roas: number;
  cpa: number;
  campaign_name?: string;
  campaign_id?: string;
  metadata?: Record<string, unknown>;
}

export interface BlendedMetrics {
  id: string;
  workspace_id: string;
  date: Date;
  total_spend: number;
  total_revenue: number;
  total_orders: number;
  total_new_customers: number;
  mer: number;           // Marketing Efficiency Ratio
  blended_roas: number;
  blended_cac: number;   // Customer Acquisition Cost
  blended_cpa: number;
  channel_breakdown: Record<string, {
    spend: number;
    revenue: number;
    roas: number;
    conversions: number;
  }>;
}

export interface AttributionReport {
  workspace_id: string;
  date_range: { from: string; to: string };
  blended: {
    total_spend: number;
    total_revenue: number;
    mer: number;
    blended_roas: number;
    blended_cac: number;
  };
  channels: Array<{
    name: string;
    type: ChannelType;
    spend: number;
    revenue: number;
    roas: number;
    conversions: number;
    share_of_spend: number;
    share_of_revenue: number;
  }>;
  trend: Array<{
    date: string;
    total_spend: number;
    total_revenue: number;
    mer: number;
  }>;
}

// ---- Proactive AI Audit Types ----
export interface AIAuditRun {
  id: string;
  workspace_id: string;
  run_type: 'scheduled' | 'manual' | 'triggered';
  status: 'running' | 'completed' | 'failed';
  entities_scanned: number;
  issues_found: number;
  recommendations_generated: number;
  auto_applied_count: number;
  health_score: number;
  findings: AuditFinding[];
  recommendations: AIRecommendation[];
  started_at: Date;
  completed_at?: Date;
  processing_time_ms?: number;
}

export interface AuditFinding {
  category: string;
  severity: 'critical' | 'warning' | 'info' | 'success';
  entity_type?: string;
  entity_id?: string;
  entity_name?: string;
  message: string;
  metric_name?: string;
  current_value?: number;
  benchmark_value?: number;
  trend?: 'improving' | 'declining' | 'stable';
}

export interface AIRecommendation {
  id: string;
  workspace_id: string;
  audit_run_id?: string;
  category: RecommendationCategory;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  rationale?: string;
  action_type?: string;
  action_params?: Record<string, unknown>;
  target_entity_type?: string;
  target_entity_id?: string;
  estimated_impact?: {
    metric: string;
    current_value: number;
    predicted_value: number;
    confidence: number;
  };
  status: 'pending' | 'accepted' | 'applied' | 'dismissed' | 'expired';
  applied_at?: Date;
  applied_by?: string;
  dismissed_reason?: string;
  auto_applicable: boolean;
  auto_apply_approved: boolean;
  created_at: Date;
  expires_at: Date;
}

export type RecommendationCategory =
  | 'creative_refresh' | 'creative_diversity'
  | 'budget_shift' | 'budget_increase' | 'budget_decrease'
  | 'audience_expansion' | 'audience_exclusion'
  | 'pause_underperformer' | 'scale_winner'
  | 'structure_change' | 'consolidate_campaigns'
  | 'andromeda_optimization' | 'advantage_plus_migration'
  | 'capi_setup' | 'signal_improvement'
  | 'ab_test_suggestion' | 'creative_fatigue_alert';

// ---- Automation Rule Types ----
export interface AutomationRule {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  scope: RuleScope;
  scope_ids?: string[];
  conditions: RuleCondition[];
  condition_logic: 'AND' | 'OR';
  actions: RuleAction[];
  schedule: RuleSchedule;
  lookback_window: number;
  cooldown_period: number;
  last_triggered_at?: Date;
  trigger_count: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export type RuleScope = 'campaign' | 'adset' | 'ad';

export interface RuleCondition {
  metric: string;
  operator: ConditionOperator;
  value: number;
  time_range?: string;
}

export type ConditionOperator = 'greater_than' | 'less_than' | 'equal_to' | 'greater_than_or_equal' | 'less_than_or_equal' | 'between' | 'not_between';

export interface RuleAction {
  type: ActionType;
  params: Record<string, unknown>;
}

export type ActionType = 'pause' | 'activate' | 'increase_budget' | 'decrease_budget' | 'set_budget' | 'increase_bid' | 'decrease_bid' | 'set_bid' | 'send_notification' | 'duplicate' | 'move_budget';

export interface RuleSchedule {
  frequency: 'continuous' | 'hourly' | 'every_6_hours' | 'every_12_hours' | 'daily' | 'weekly';
  time_of_day?: string;
  days_of_week?: number[];
}

export interface RuleExecution {
  id: string;
  rule_id: string;
  workspace_id: string;
  triggered_at: Date;
  conditions_met: Record<string, unknown>;
  actions_taken: Record<string, unknown>;
  affected_entities: string[];
  status: 'success' | 'failed' | 'partial';
  error_message?: string;
}

// ---- AI Types ----
export interface AIAnalysis {
  id: string;
  workspace_id: string;
  analysis_type: AnalysisType;
  target_id: string;
  target_type: 'campaign' | 'adset' | 'ad' | 'account';
  input_data: Record<string, unknown>;
  analysis_result: AnalysisResult;
  confidence_score: number;
  created_at: Date;
}

export type AnalysisType = 'performance_diagnosis' | 'creative_fatigue' | 'audience_saturation' | 'budget_optimization' | 'copy_generation' | 'headline_generation' | 'audience_recommendation' | 'bid_optimization' | 'scaling_readiness' | 'competitor_analysis' | 'creative_intelligence' | 'andromeda_audit' | 'proactive_audit' | 'cross_channel_analysis';

export interface AnalysisResult {
  summary: string;
  findings: Finding[];
  recommendations: Recommendation[];
  predicted_impact?: PredictedImpact;
}

export interface Finding {
  category: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  metric_name?: string;
  current_value?: number;
  benchmark_value?: number;
  trend?: 'improving' | 'declining' | 'stable';
}

export interface Recommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  action_type?: ActionType;
  action_params?: Record<string, unknown>;
  estimated_impact: string;
  confidence: number;
  auto_applicable: boolean;
}

export interface PredictedImpact {
  metric: string;
  current_value: number;
  predicted_value: number;
  change_percentage: number;
  confidence_interval: [number, number];
  timeframe_days: number;
}

// ---- AI Copy Generation Types ----
export interface CopyGenerationRequest {
  product_name: string;
  product_description: string;
  target_audience: string;
  tone: CopyTone;
  objective: CampaignObjective;
  frameworks?: CopyFramework[];
  existing_copy?: string;
  competitor_examples?: string[];
  brand_guidelines?: string;
  key_benefits?: string[];
  pain_points?: string[];
  call_to_action?: CallToAction;
  character_limit?: number;
  variations_count?: number;
}

export type CopyTone = 'professional' | 'casual' | 'urgent' | 'emotional' | 'humorous' | 'authoritative' | 'inspirational' | 'conversational' | 'provocative';

export type CopyFramework = 'AIDA' | 'PAS' | 'BAB' | 'FAB' | 'PASTOR' | 'QUEST' | 'STAR' | '4Ps' | 'PPPP';

export interface GeneratedCopy {
  id: string;
  headline: string;
  primary_text: string;
  description?: string;
  call_to_action: string;
  framework_used: CopyFramework;
  hooks: string[];
  score: number;
  reasoning: string;
}

// ---- Webhook Types ----
export interface MetaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    time: number;
    changes: Array<{
      field: string;
      value: Record<string, unknown>;
    }>;
  }>;
}

// ---- Notification Types ----
export type NotificationChannel = 'email' | 'slack' | 'webhook' | 'in_app';

export interface Notification {
  id: string;
  workspace_id: string;
  user_id?: string;
  channel: NotificationChannel;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  is_read: boolean;
  created_at: Date;
}

export type NotificationType = 'rule_triggered' | 'budget_alert' | 'performance_alert' | 'creative_fatigue' | 'token_expiring' | 'sync_error' | 'ai_recommendation' | 'system' | 'audit_complete' | 'ab_test_winner' | 'capi_error' | 'competitor_alert';

// ---- API Response Types ----
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: PaginationMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface PaginatedRequest {
  page?: number;
  per_page?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  search?: string;
}

// ---- Dashboard Types ----
export interface DashboardData {
  summary: PerformanceSummary;
  spend_trend: TimeSeriesData[];
  top_campaigns: CampaignPerformance[];
  top_ads: AdPerformance[];
  ai_recommendations: AIRecommendation[];
  active_rules: AutomationRule[];
  recent_notifications: Notification[];
  funnel_breakdown: FunnelData;
  // v2.0 dashboard additions
  health_score?: number;
  creative_diversity?: CreativeDiversityReport;
  blended_metrics?: BlendedMetrics;
  pending_recommendations?: number;
  active_ab_tests?: number;
}

export interface TimeSeriesData {
  date: string;
  value: number;
  label?: string;
}

export interface CampaignPerformance extends PerformanceSummary {
  campaign_id: string;
  campaign_name: string;
  status: CampaignStatus;
  objective: CampaignObjective;
}

export interface AdPerformance extends PerformanceSummary {
  ad_id: string;
  ad_name: string;
  creative_thumbnail?: string;
  status: CampaignStatus;
}

export interface FunnelData {
  awareness: { impressions: number; reach: number; spend: number };
  consideration: { clicks: number; landing_page_views: number; video_views: number; spend: number };
  conversion: { conversions: number; purchases: number; leads: number; revenue: number; spend: number };
}

// ---- Feature Flag Types ----
export interface FeatureFlag {
  feature_name: string;
  is_enabled: boolean;
  config?: Record<string, unknown>;
}
