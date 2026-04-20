// ============================================
// AD FUSION - Meta Data Sync Service
// Pulls campaigns, adsets, ads, and insights from Meta API
// ============================================
import { MetaApiClient } from './client';
import { query, transaction } from '../../config/database';
import { cacheDelPattern } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { format, subDays } from 'date-fns';

export class MetaSyncService {
  private client: MetaApiClient;
  private workspaceId: string;
  private adAccountId: string;
  private metaAccountId: string;

  constructor(encryptedToken: string, workspaceId: string, adAccountId: string, metaAccountId: string) {
    this.client = new MetaApiClient(encryptedToken);
    this.workspaceId = workspaceId;
    this.adAccountId = adAccountId;
    this.metaAccountId = metaAccountId;
  }

  // Full sync: campaigns -> adsets -> ads -> insights
  async fullSync(): Promise<{ campaigns: number; adsets: number; ads: number; insights: number }> {
    logger.info('Starting full sync', { workspaceId: this.workspaceId, metaAccountId: this.metaAccountId });
    const stats = { campaigns: 0, adsets: 0, ads: 0, insights: 0 };

    try {
      // 1. Sync campaigns
      stats.campaigns = await this.syncCampaigns();

      // 2. Sync ad sets
      stats.adsets = await this.syncAdSets();

      // 3. Sync ads
      stats.ads = await this.syncAds();

      // 4. Sync insights (last 30 days)
      stats.insights = await this.syncInsights(30);

      // Update last_synced_at
      await query(
        'UPDATE ad_accounts SET last_synced_at = NOW() WHERE id = $1',
        [this.adAccountId]
      );

      // Clear cached data
      await cacheDelPattern(`workspace:${this.workspaceId}:*`);

      logger.info('Full sync completed', { workspaceId: this.workspaceId, stats });
      return stats;
    } catch (error) {
      logger.error('Full sync failed', {
        workspaceId: this.workspaceId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // Incremental sync: last 3 days of insights
  async incrementalSync(): Promise<number> {
    logger.info('Starting incremental sync', { workspaceId: this.workspaceId });
    try {
      const count = await this.syncInsights(3);
      await query(
        'UPDATE ad_accounts SET last_synced_at = NOW() WHERE id = $1',
        [this.adAccountId]
      );
      await cacheDelPattern(`workspace:${this.workspaceId}:dashboard:*`);
      return count;
    } catch (error) {
      logger.error('Incremental sync failed', { error: (error as Error).message });
      throw error;
    }
  }

  private async syncCampaigns(): Promise<number> {
    const metaCampaigns = await this.client.getCampaigns(this.metaAccountId);
    let count = 0;

    for (const mc of metaCampaigns) {
      await query(
        `INSERT INTO campaigns (id, workspace_id, ad_account_id, meta_campaign_id, name, status, objective, buying_type, daily_budget, lifetime_budget, bid_strategy, special_ad_categories, start_time, stop_time, last_synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           status = EXCLUDED.status,
           objective = EXCLUDED.objective,
           daily_budget = EXCLUDED.daily_budget,
           lifetime_budget = EXCLUDED.lifetime_budget,
           bid_strategy = EXCLUDED.bid_strategy,
           last_synced_at = NOW()`,
        [
          generateId(),
          this.workspaceId,
          this.adAccountId,
          mc.id,
          mc.name,
          mc.status,
          mc.objective,
          mc.buying_type || 'AUCTION',
          mc.daily_budget ? Number(mc.daily_budget) / 100 : null,
          mc.lifetime_budget ? Number(mc.lifetime_budget) / 100 : null,
          mc.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
          JSON.stringify(mc.special_ad_categories || []),
          mc.start_time || null,
          mc.stop_time || null,
        ]
      );
      count++;
    }

    return count;
  }

  private async syncAdSets(): Promise<number> {
    const metaAdSets = await this.client.getAdSets(this.metaAccountId);
    let count = 0;

    for (const mas of metaAdSets) {
      // Find local campaign ID
      const campaignResult = await query(
        'SELECT id FROM campaigns WHERE meta_campaign_id = $1 AND workspace_id = $2',
        [mas.campaign_id, this.workspaceId]
      );

      if (campaignResult.rows.length === 0) continue;

      await query(
        `INSERT INTO adsets (id, workspace_id, campaign_id, meta_adset_id, name, status, daily_budget, lifetime_budget, bid_amount, billing_event, optimization_goal, targeting, placements, schedule, promoted_object, last_synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           status = EXCLUDED.status,
           daily_budget = EXCLUDED.daily_budget,
           lifetime_budget = EXCLUDED.lifetime_budget,
           targeting = EXCLUDED.targeting,
           last_synced_at = NOW()`,
        [
          generateId(),
          this.workspaceId,
          campaignResult.rows[0].id,
          mas.id,
          mas.name,
          mas.status,
          mas.daily_budget ? Number(mas.daily_budget) / 100 : null,
          mas.lifetime_budget ? Number(mas.lifetime_budget) / 100 : null,
          mas.bid_amount ? Number(mas.bid_amount) / 100 : null,
          mas.billing_event || 'IMPRESSIONS',
          mas.optimization_goal || 'LINK_CLICKS',
          JSON.stringify(mas.targeting || {}),
          JSON.stringify({ automatic: true }),
          JSON.stringify({}),
          JSON.stringify(mas.promoted_object || null),
        ]
      );
      count++;
    }

    return count;
  }

  private async syncAds(): Promise<number> {
    const metaAds = await this.client.getAds(this.metaAccountId);
    let count = 0;

    for (const ma of metaAds) {
      const adsetResult = await query(
        'SELECT id FROM adsets WHERE meta_adset_id = $1 AND workspace_id = $2',
        [ma.adset_id, this.workspaceId]
      );

      if (adsetResult.rows.length === 0) continue;

      await query(
        `INSERT INTO ads (id, workspace_id, adset_id, meta_ad_id, name, status, creative, tracking_specs, last_synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           status = EXCLUDED.status,
           creative = EXCLUDED.creative,
           last_synced_at = NOW()`,
        [
          generateId(),
          this.workspaceId,
          adsetResult.rows[0].id,
          ma.id,
          ma.name,
          ma.status,
          JSON.stringify(ma.creative || {}),
          JSON.stringify(ma.tracking_specs || null),
        ]
      );
      count++;
    }

    return count;
  }

  private async syncInsights(daysBack: number): Promise<number> {
    const since = format(subDays(new Date(), daysBack), 'yyyy-MM-dd');
    const until = format(new Date(), 'yyyy-MM-dd');

    const insights = await this.client.getAccountInsights(
      this.metaAccountId,
      { since, until },
      'ad'
    );

    let count = 0;

    for (const insight of insights) {
      // Resolve local IDs
      let campaignId = null;
      let adsetId = null;
      let adId = null;

      if (insight.campaign_id) {
        const res = await query('SELECT id FROM campaigns WHERE meta_campaign_id = $1 AND workspace_id = $2', [insight.campaign_id, this.workspaceId]);
        if (res.rows.length > 0) campaignId = res.rows[0].id;
      }
      if (insight.adset_id) {
        const res = await query('SELECT id FROM adsets WHERE meta_adset_id = $1 AND workspace_id = $2', [insight.adset_id, this.workspaceId]);
        if (res.rows.length > 0) adsetId = res.rows[0].id;
      }
      if (insight.ad_id) {
        const res = await query('SELECT id FROM ads WHERE meta_ad_id = $1 AND workspace_id = $2', [insight.ad_id, this.workspaceId]);
        if (res.rows.length > 0) adId = res.rows[0].id;
      }

      // Upsert insight data
      await query(
        `INSERT INTO ad_insights (
          id, workspace_id, ad_account_id, campaign_id, adset_id, ad_id,
          level, date_start, date_stop,
          impressions, reach, frequency, clicks, unique_clicks,
          ctr, unique_ctr, cpc, cpm, cpp, spend,
          actions, conversions, cost_per_action_type, purchase_roas,
          video_views, link_clicks, landing_page_views, outbound_clicks
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9,
          $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24,
          $25, $26, $27, $28
        )`,
        [
          generateId(), this.workspaceId, this.adAccountId, campaignId, adsetId, adId,
          'ad', insight.date_start, insight.date_stop,
          Number(insight.impressions || 0), Number(insight.reach || 0),
          Number(insight.frequency || 0), Number(insight.clicks || 0),
          Number(insight.unique_clicks || 0),
          Number(insight.ctr || 0), Number(insight.unique_ctr || 0),
          Number(insight.cpc || 0), Number(insight.cpm || 0),
          Number(insight.cpp || 0), Number(insight.spend || 0),
          JSON.stringify(insight.actions || []),
          JSON.stringify(insight.conversions || []),
          JSON.stringify(insight.cost_per_action_type || []),
          JSON.stringify(insight.purchase_roas || []),
          Number(insight.video_views || 0),
          Number(insight.link_clicks || 0),
          Number(insight.landing_page_views || 0),
          Number(insight.outbound_clicks || 0),
        ]
      );
      count++;
    }

    return count;
  }
}
