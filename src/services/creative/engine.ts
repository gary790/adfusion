// ============================================
// AD FUSION v2.0 - Creative Intelligence Engine
// Creative analysis, element tagging, fatigue scoring, winners hub
// ============================================
import OpenAI from 'openai';
import config from '../../config';
import { query } from '../../config/database';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import {
  CreativeAsset, CreativePerformancePoint, CreativeDiversityReport,
  CreativeElements, FatigueStatus, WinnerCategory,
} from '../../types';

export class CreativeIntelligenceEngine {
  private openai: OpenAI;
  private workspaceId: string;

  constructor(workspaceId: string) {
    this.openai = new OpenAI({ apiKey: config.openai.apiKey });
    this.workspaceId = workspaceId;
  }

  // ==========================================
  // CREATIVE ASSET SYNC & INDEXING
  // ==========================================
  async syncCreativeAssets(adAccountId: string): Promise<{ synced: number; updated: number }> {
    let synced = 0;
    let updated = 0;

    // Get all ads with their creatives
    const adsResult = await query(
      `SELECT a.id, a.meta_ad_id, a.name, a.creative, a.status, a.ad_format,
              ast.campaign_id, c.name as campaign_name
       FROM ads a
       JOIN adsets ast ON a.adset_id = ast.id
       JOIN campaigns c ON ast.campaign_id = c.id
       JOIN ad_accounts aa ON c.ad_account_id = aa.id
       WHERE a.workspace_id = $1 AND aa.id = $2 AND a.status != 'DELETED'`,
      [this.workspaceId, adAccountId]
    );

    for (const ad of adsResult.rows) {
      const adRow = ad as any;
      const creative = typeof adRow.creative === 'string' ? JSON.parse(adRow.creative) : adRow.creative;

      // Determine asset type from creative data
      const assetType = this.detectAssetType(creative, adRow.ad_format);

      // Check if creative asset exists
      const existing = await query(
        `SELECT id FROM creative_assets WHERE workspace_id = $1 AND meta_creative_id = $2`,
        [this.workspaceId, creative?.meta_creative_id || adRow.meta_ad_id]
      );

      if (existing.rows.length === 0) {
        // Create new creative asset
        const id = generateId();
        await query(
          `INSERT INTO creative_assets (id, workspace_id, ad_account_id, meta_creative_id, name, asset_type, format, thumbnail_url, source_url, linked_ad_ids)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            id, this.workspaceId, adAccountId,
            creative?.meta_creative_id || adRow.meta_ad_id,
            adRow.name, assetType,
            this.detectFormat(assetType),
            creative?.thumbnail_url || creative?.image_url || null,
            creative?.image_url || creative?.video_id || null,
            JSON.stringify([adRow.id]),
          ]
        );

        // Link ad to creative asset
        await query(`UPDATE ads SET creative_asset_id = $1 WHERE id = $2`, [id, adRow.id]);
        synced++;
      } else {
        // Update linked ads
        const assetId = (existing.rows[0] as any).id;
        await query(
          `UPDATE creative_assets SET linked_ad_ids = linked_ad_ids || $1::jsonb WHERE id = $2
           AND NOT (linked_ad_ids @> $1::jsonb)`,
          [JSON.stringify([adRow.id]), assetId]
        );
        await query(`UPDATE ads SET creative_asset_id = $1 WHERE id = $2`, [assetId, adRow.id]);
        updated++;
      }
    }

    return { synced, updated };
  }

  // ==========================================
  // UPDATE CREATIVE PERFORMANCE METRICS
  // ==========================================
  async updateCreativePerformance(): Promise<number> {
    // Aggregate ad-level insights into creative asset performance
    const result = await query(
      `INSERT INTO creative_performance (id, creative_asset_id, workspace_id, date, impressions, clicks, spend, conversions, ctr, cpc, cpm, frequency, roas)
       SELECT
         uuid_generate_v4(),
         ca.id,
         ca.workspace_id,
         i.date_start,
         COALESCE(SUM(i.impressions), 0),
         COALESCE(SUM(i.clicks), 0),
         COALESCE(SUM(i.spend), 0),
         0, -- conversions from actions JSON
         CASE WHEN SUM(i.impressions) > 0 THEN (SUM(i.clicks)::DECIMAL / SUM(i.impressions)) * 100 ELSE 0 END,
         CASE WHEN SUM(i.clicks) > 0 THEN SUM(i.spend) / SUM(i.clicks) ELSE 0 END,
         CASE WHEN SUM(i.impressions) > 0 THEN (SUM(i.spend) / SUM(i.impressions)) * 1000 ELSE 0 END,
         COALESCE(AVG(i.frequency), 0),
         0
       FROM creative_assets ca
       JOIN ads a ON a.creative_asset_id = ca.id
       JOIN ad_insights i ON i.ad_id = a.id
       WHERE ca.workspace_id = $1
         AND i.date_start >= NOW() - INTERVAL '3 days'
       GROUP BY ca.id, ca.workspace_id, i.date_start
       ON CONFLICT (creative_asset_id, date) DO UPDATE SET
         impressions = EXCLUDED.impressions,
         clicks = EXCLUDED.clicks,
         spend = EXCLUDED.spend,
         ctr = EXCLUDED.ctr,
         cpc = EXCLUDED.cpc,
         cpm = EXCLUDED.cpm,
         frequency = EXCLUDED.frequency`,
      [this.workspaceId]
    );

    // Update aggregate metrics on creative_assets
    await query(
      `UPDATE creative_assets ca SET
        total_spend = sub.total_spend,
        total_impressions = sub.total_impressions,
        total_clicks = sub.total_clicks,
        avg_ctr = sub.avg_ctr,
        avg_cpc = sub.avg_cpc,
        days_active = sub.days_active
       FROM (
         SELECT creative_asset_id,
           SUM(spend) as total_spend,
           SUM(impressions) as total_impressions,
           SUM(clicks) as total_clicks,
           CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks)::DECIMAL / SUM(impressions)) * 100 ELSE 0 END as avg_ctr,
           CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END as avg_cpc,
           COUNT(DISTINCT date) as days_active
         FROM creative_performance
         WHERE workspace_id = $1
         GROUP BY creative_asset_id
       ) sub
       WHERE ca.id = sub.creative_asset_id`,
      [this.workspaceId]
    );

    return result.rowCount || 0;
  }

  // ==========================================
  // FATIGUE SCORING ENGINE
  // ==========================================
  async scoreFatigue(): Promise<{ scored: number; alerts: number }> {
    let scored = 0;
    let alerts = 0;

    const assets = await query(
      `SELECT ca.id, ca.asset_type, ca.days_active,
              (SELECT json_agg(row_to_json(cp) ORDER BY cp.date)
               FROM creative_performance cp
               WHERE cp.creative_asset_id = ca.id AND cp.date >= NOW() - INTERVAL '14 days'
              ) as performance_data
       FROM creative_assets ca
       WHERE ca.workspace_id = $1 AND ca.total_impressions > ${config.optimization.creativeFatigue.minImpressions}`,
      [this.workspaceId]
    );

    for (const row of assets.rows) {
      const asset = row as any;
      const perfData = asset.performance_data || [];
      if (perfData.length < 3) continue;

      const { score, status, signals } = this.calculateFatigueScore(perfData, asset.asset_type, asset.days_active);

      await query(
        `UPDATE creative_assets SET fatigue_score = $1, fatigue_status = $2 WHERE id = $3`,
        [score, status, asset.id]
      );

      scored++;

      if (status === 'fatigued' || status === 'critical') {
        alerts++;
        // Create notification
        await query(
          `INSERT INTO notifications (id, workspace_id, channel, type, title, message, metadata)
           VALUES ($1, $2, 'in_app', 'creative_fatigue', $3, $4, $5)`,
          [
            generateId(), this.workspaceId,
            `Creative Fatigue Alert: ${status.toUpperCase()}`,
            `Creative asset (${asset.asset_type}) scored ${score.toFixed(0)}/100 fatigue. Signals: ${signals.join('; ')}`,
            JSON.stringify({ creative_asset_id: asset.id, score, status, signals }),
          ]
        );
      }
    }

    return { scored, alerts };
  }

  private calculateFatigueScore(
    perfData: any[],
    assetType: string,
    daysActive: number
  ): { score: number; status: FatigueStatus; signals: string[] } {
    const signals: string[] = [];
    let score = 0;

    // 1. Frequency check
    const latestFreq = perfData[perfData.length - 1]?.frequency || 0;
    if (latestFreq > config.optimization.creativeFatigue.maxFrequency) {
      signals.push(`Frequency ${latestFreq.toFixed(1)} > ${config.optimization.creativeFatigue.maxFrequency} threshold`);
      score += 30;
    } else if (latestFreq > 2.5) {
      score += 15;
    }

    // 2. CTR decline
    const recentCtr = perfData.slice(-3).reduce((sum: number, d: any) => sum + Number(d.ctr || 0), 0) / 3;
    const earlierCtr = perfData.slice(0, Math.min(7, perfData.length)).reduce((sum: number, d: any) => sum + Number(d.ctr || 0), 0) / Math.min(7, perfData.length);
    const ctrDrop = earlierCtr > 0 ? (earlierCtr - recentCtr) / earlierCtr : 0;

    if (ctrDrop > config.optimization.creativeFatigue.ctrDropThreshold) {
      signals.push(`CTR dropped ${(ctrDrop * 100).toFixed(1)}%`);
      score += 35;
    } else if (ctrDrop > 0.10) {
      score += 15;
    }

    // 3. CPM trend (rising = saturation)
    const recentCpm = perfData.slice(-3).reduce((sum: number, d: any) => sum + Number(d.cpm || 0), 0) / 3;
    const earlierCpm = perfData.slice(0, Math.min(7, perfData.length)).reduce((sum: number, d: any) => sum + Number(d.cpm || 0), 0) / Math.min(7, perfData.length);
    if (earlierCpm > 0 && (recentCpm - earlierCpm) / earlierCpm > 0.15) {
      signals.push(`CPM rising ${(((recentCpm - earlierCpm) / earlierCpm) * 100).toFixed(1)}%`);
      score += 20;
    }

    // 4. Days active vs expected lifespan
    const decayCurve = (config.optimization.creativeFatigue.decayCurve as Record<string, number>)[assetType] || 12;
    if (daysActive > decayCurve * 1.5) {
      signals.push(`Active ${daysActive}d vs ${decayCurve}d expected lifespan`);
      score += 15;
    } else if (daysActive > decayCurve) {
      score += 8;
    }

    // Determine status
    let status: FatigueStatus = 'healthy';
    if (score >= 70) status = 'critical';
    else if (score >= 50) status = 'fatigued';
    else if (score >= 30) status = 'early_warning';

    return { score: Math.min(100, score), status, signals };
  }

  // ==========================================
  // WINNERS HUB
  // ==========================================
  async identifyWinners(): Promise<{ winners: number; categories: Record<string, string> }> {
    const categories: Record<string, string> = {};

    // Top CTR winner (min 1000 impressions)
    await this.markWinner('top_ctr', `
      SELECT id FROM creative_assets
      WHERE workspace_id = $1 AND total_impressions >= 1000 AND fatigue_status != 'critical'
      ORDER BY avg_ctr DESC LIMIT 1
    `);
    categories['top_ctr'] = 'Highest CTR';

    // Top ROAS winner
    await this.markWinner('top_roas', `
      SELECT id FROM creative_assets
      WHERE workspace_id = $1 AND total_impressions >= 1000 AND avg_roas > 0
      ORDER BY avg_roas DESC LIMIT 1
    `);
    categories['top_roas'] = 'Best ROAS';

    // Top conversions winner
    await this.markWinner('top_conversions', `
      SELECT id FROM creative_assets
      WHERE workspace_id = $1 AND total_conversions > 0
      ORDER BY total_conversions DESC LIMIT 1
    `);
    categories['top_conversions'] = 'Most Conversions';

    // Top engagement (spend efficiency)
    await this.markWinner('top_engagement', `
      SELECT id FROM creative_assets
      WHERE workspace_id = $1 AND total_clicks > 0 AND total_spend > 0
      ORDER BY (total_clicks::DECIMAL / total_spend) DESC LIMIT 1
    `);
    categories['top_engagement'] = 'Best Efficiency';

    const winnerCount = await query(
      `SELECT COUNT(*) as count FROM creative_assets WHERE workspace_id = $1 AND is_winner = true`,
      [this.workspaceId]
    );

    return { winners: Number((winnerCount.rows[0] as any).count), categories };
  }

  private async markWinner(category: WinnerCategory, sql: string): Promise<void> {
    // Reset previous winners in this category
    await query(
      `UPDATE creative_assets SET is_winner = false, winner_category = NULL
       WHERE workspace_id = $1 AND winner_category = $2`,
      [this.workspaceId, category]
    );

    const result = await query(sql, [this.workspaceId]);
    if (result.rows.length > 0) {
      await query(
        `UPDATE creative_assets SET is_winner = true, winner_category = $1 WHERE id = $2`,
        [category, (result.rows[0] as any).id]
      );
    }
  }

  // ==========================================
  // CREATIVE DIVERSITY ANALYSIS
  // ==========================================
  async analyzeDiversity(): Promise<CreativeDiversityReport> {
    const cacheKey = `workspace:${this.workspaceId}:creative:diversity`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as CreativeDiversityReport;

    const assetsResult = await query(
      `SELECT asset_type, fatigue_status, COUNT(*) as count
       FROM creative_assets
       WHERE workspace_id = $1
       GROUP BY asset_type, fatigue_status`,
      [this.workspaceId]
    );

    const formatBreakdown: Record<string, number> = {};
    let totalCreatives = 0;
    let healthyCount = 0;
    let fatiguedCount = 0;
    let criticalCount = 0;

    for (const row of assetsResult.rows) {
      const r = row as any;
      const count = Number(r.count);
      formatBreakdown[r.asset_type] = (formatBreakdown[r.asset_type] || 0) + count;
      totalCreatives += count;
      if (r.fatigue_status === 'healthy' || r.fatigue_status === 'early_warning') healthyCount += count;
      if (r.fatigue_status === 'fatigued') fatiguedCount += count;
      if (r.fatigue_status === 'critical') criticalCount += count;
    }

    // Active creatives (linked to active ads)
    const activeResult = await query(
      `SELECT COUNT(DISTINCT ca.id) as count
       FROM creative_assets ca
       JOIN ads a ON a.creative_asset_id = ca.id
       WHERE ca.workspace_id = $1 AND a.status = 'ACTIVE'`,
      [this.workspaceId]
    );
    const activeCreatives = Number((activeResult.rows[0] as any).count);

    // Calculate diversity score
    const diversityScore = this.calculateDiversityScore(formatBreakdown, totalCreatives, healthyCount, fatiguedCount, criticalCount);

    // Generate recommendations
    const recommendations = this.generateDiversityRecommendations(formatBreakdown, totalCreatives, activeCreatives, healthyCount, criticalCount);

    const report: CreativeDiversityReport = {
      total_creatives: totalCreatives,
      active_creatives: activeCreatives,
      format_breakdown: formatBreakdown,
      healthy_count: healthyCount,
      fatigued_count: fatiguedCount,
      critical_count: criticalCount,
      diversity_score: diversityScore,
      recommendations,
    };

    await cacheSet(cacheKey, report, 300);
    return report;
  }

  private calculateDiversityScore(
    breakdown: Record<string, number>,
    total: number,
    healthy: number,
    fatigued: number,
    critical: number
  ): number {
    if (total === 0) return 0;
    let score = 0;

    // Format diversity (25 points) - how many different formats
    const formatCount = Object.keys(breakdown).length;
    score += Math.min(25, formatCount * 5);

    // Health ratio (25 points)
    const healthRatio = healthy / total;
    score += healthRatio * 25;

    // Volume adequacy (25 points) - enough creatives for Andromeda
    const idealCount = config.optimization.creativeFatigue.diversityTarget.idealAdsPerAdSet;
    score += Math.min(25, (total / idealCount) * 25);

    // Balance (25 points) - not too concentrated in one format
    const maxShare = Math.max(...Object.values(breakdown)) / total;
    score += (1 - maxShare) * 25;

    // Penalty for critical fatigue
    score -= (critical / total) * 15;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private generateDiversityRecommendations(
    breakdown: Record<string, number>,
    total: number,
    active: number,
    healthy: number,
    critical: number
  ): string[] {
    const recs: string[] = [];
    const targets = config.optimization.creativeFatigue.diversityTarget;

    if (total < targets.minAdsPerAdSet) {
      recs.push(`Add more creatives — you have ${total}, Andromeda works best with ${targets.minAdsPerAdSet}-${targets.maxAdsPerAdSet} diverse ads per ad set.`);
    }

    if (!breakdown['video'] || (breakdown['video'] || 0) / total < 0.15) {
      recs.push(`Add video creatives — short raw videos and polished content to improve ad matching variety.`);
    }

    if (!breakdown['ugc'] || (breakdown['ugc'] || 0) / total < 0.10) {
      recs.push(`Add UGC (user-generated content) — UGC has 18-day fatigue lifespan vs 10 for static images.`);
    }

    if (critical > 0) {
      recs.push(`${critical} creative(s) at CRITICAL fatigue — replace immediately with fresh variants.`);
    }

    const staticShare = (breakdown['image'] || 0) / (total || 1);
    if (staticShare > 0.60) {
      recs.push(`Too concentrated on static images (${(staticShare * 100).toFixed(0)}%). Diversify with video, carousel, and UGC.`);
    }

    return recs;
  }

  // ==========================================
  // AI CREATIVE ELEMENT TAGGING
  // ==========================================
  async tagCreativeElements(assetId: string): Promise<CreativeElements> {
    const assetResult = await query(
      `SELECT ca.*, a.creative FROM creative_assets ca
       LEFT JOIN ads a ON a.creative_asset_id = ca.id
       WHERE ca.id = $1 AND ca.workspace_id = $2 LIMIT 1`,
      [assetId, this.workspaceId]
    );

    if (assetResult.rows.length === 0) throw new Error('Creative asset not found');

    const asset = assetResult.rows[0] as any;
    const creative = typeof asset.creative === 'string' ? JSON.parse(asset.creative) : asset.creative;

    const response = await this.openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: 'system',
          content: `You are a creative analyst for Meta ads. Analyze the ad creative metadata and tag its elements.
Output JSON: {"headline_style":"question|bold_claim|number|how_to|social_proof|urgency|curiosity","cta_type":"string","color_palette":["hex"],"has_faces":bool,"has_text_overlay":bool,"visual_complexity":"low|medium|high","brand_elements":["string"],"copy_length":"short|medium|long","emotion_tone":"string","hooks_used":["string"]}`,
        },
        {
          role: 'user',
          content: `Analyze this ad creative:\nType: ${asset.asset_type}\nName: ${asset.name}\nCreative data: ${JSON.stringify(creative || {})}\nPerformance: CTR=${asset.avg_ctr}%, Spend=$${asset.total_spend}`,
        },
      ],
      max_tokens: 800,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const elements = JSON.parse(response.choices[0].message.content || '{}') as CreativeElements;

    await query(
      `UPDATE creative_assets SET elements = $1 WHERE id = $2`,
      [JSON.stringify(elements), assetId]
    );

    return elements;
  }

  // ==========================================
  // GET CREATIVE LEADERBOARD
  // ==========================================
  async getLeaderboard(
    sortBy: string = 'avg_ctr',
    limit: number = 20
  ): Promise<any[]> {
    const validSorts = ['avg_ctr', 'avg_roas', 'total_spend', 'total_impressions', 'total_clicks', 'fatigue_score'];
    const sort = validSorts.includes(sortBy) ? sortBy : 'avg_ctr';

    const result = await query(
      `SELECT ca.*, 
        (SELECT COUNT(*) FROM ads a WHERE a.creative_asset_id = ca.id AND a.status = 'ACTIVE') as active_ad_count
       FROM creative_assets ca
       WHERE ca.workspace_id = $1 AND ca.total_impressions >= ${config.optimization.creativeFatigue.minImpressions}
       ORDER BY ${sort} DESC
       LIMIT $2`,
      [this.workspaceId, limit]
    );

    return result.rows;
  }

  // ==========================================
  // HELPERS
  // ==========================================
  private detectAssetType(creative: any, adFormat?: string): string {
    if (adFormat) return adFormat;
    if (creative?.carousel_cards?.length) return 'carousel';
    if (creative?.video_id) return 'video';
    return 'image';
  }

  private detectFormat(assetType: string): string {
    const formatMap: Record<string, string> = {
      image: 'static', video: 'video', carousel: 'carousel',
      ugc: 'video', dynamic: 'static', collection: 'static',
      instant_experience: 'static',
    };
    return formatMap[assetType] || 'static';
  }
}
