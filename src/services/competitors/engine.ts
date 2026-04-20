// ============================================
// AD FUSION v2.0 - Competitor Ad Intelligence
// Meta Ad Library API integration & AI analysis
// ============================================
import axios from 'axios';
import OpenAI from 'openai';
import config from '../../config';
import { query } from '../../config/database';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { CompetitorAdAnalysis } from '../../types';

export class CompetitorIntelligenceEngine {
  private openai: OpenAI;
  private workspaceId: string;

  constructor(workspaceId: string) {
    this.openai = new OpenAI({ apiKey: config.openai.apiKey });
    this.workspaceId = workspaceId;
  }

  // ==========================================
  // ADD COMPETITOR
  // ==========================================
  async addCompetitor(params: {
    name: string;
    meta_page_id?: string;
    meta_page_name?: string;
    website_url?: string;
    industry?: string;
    notes?: string;
  }): Promise<string> {
    const id = generateId();
    await query(
      `INSERT INTO competitor_profiles (id, workspace_id, name, meta_page_id, meta_page_name, website_url, industry, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, this.workspaceId, params.name, params.meta_page_id, params.meta_page_name, params.website_url, params.industry, params.notes]
    );
    return id;
  }

  // ==========================================
  // FETCH ADS FROM META AD LIBRARY
  // ==========================================
  async fetchCompetitorAds(competitorId: string): Promise<number> {
    const competitor = await query(
      `SELECT * FROM competitor_profiles WHERE id = $1 AND workspace_id = $2`,
      [competitorId, this.workspaceId]
    );

    if (competitor.rows.length === 0) throw new Error('Competitor not found');

    const comp = competitor.rows[0] as any;
    if (!comp.meta_page_id) {
      logger.warn('Competitor has no Meta page ID - cannot fetch from Ad Library');
      return 0;
    }

    try {
      // Meta Ad Library API (public, no user token needed - uses app token)
      const appAccessToken = `${config.meta.appId}|${config.meta.appSecret}`;
      const response = await axios.get(
        `${config.meta.adLibraryApiBase}/${config.meta.apiVersion}/ads_archive`,
        {
          params: {
            access_token: appAccessToken,
            ad_reached_countries: ['US'],
            search_page_ids: comp.meta_page_id,
            ad_active_status: 'ALL',
            fields: 'id,ad_creation_time,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,ad_creative_link_captions,page_name,publisher_platforms,estimated_audience_size,languages,ad_delivery_start_time,ad_delivery_stop_time',
            limit: 50,
          },
        }
      );

      const ads = response.data?.data || [];
      let imported = 0;

      for (const ad of ads) {
        // Check if already exists
        const exists = await query(
          `SELECT id FROM competitor_ads WHERE workspace_id = $1 AND meta_ad_library_id = $2`,
          [this.workspaceId, ad.id]
        );

        if (exists.rows.length === 0) {
          await query(
            `INSERT INTO competitor_ads (id, workspace_id, competitor_id, meta_ad_library_id, ad_text, headline, description, platforms, start_date, end_date, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              generateId(), this.workspaceId, competitorId, ad.id,
              (ad.ad_creative_bodies || []).join('\n') || null,
              (ad.ad_creative_link_titles || []).join('\n') || null,
              (ad.ad_creative_link_descriptions || []).join('\n') || null,
              JSON.stringify(ad.publisher_platforms || ['facebook']),
              ad.ad_delivery_start_time || null,
              ad.ad_delivery_stop_time || null,
              !ad.ad_delivery_stop_time,
            ]
          );
          imported++;
        }
      }

      return imported;
    } catch (error) {
      logger.error('Meta Ad Library fetch failed', { competitorId, error: (error as Error).message });
      // Return 0 gracefully - Ad Library may not be available in all regions
      return 0;
    }
  }

  // ==========================================
  // AI ANALYSIS OF COMPETITOR ADS
  // ==========================================
  async analyzeCompetitorAd(adId: string): Promise<CompetitorAdAnalysis> {
    const adResult = await query(
      `SELECT ca.*, cp.name as competitor_name, cp.industry
       FROM competitor_ads ca
       JOIN competitor_profiles cp ON cp.id = ca.competitor_id
       WHERE ca.id = $1 AND ca.workspace_id = $2`,
      [adId, this.workspaceId]
    );

    if (adResult.rows.length === 0) throw new Error('Competitor ad not found');

    const ad = adResult.rows[0] as any;

    const response = await this.openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: 'system',
          content: `You are a Meta ads competitive intelligence analyst. Analyze competitor ad copy/creative and extract actionable insights.
Output JSON: {
  "hooks": ["list of hooks used"],
  "frameworks": ["AIDA","PAS","BAB", etc],
  "tone": "professional/casual/urgent/etc",
  "strengths": ["what they do well"],
  "weaknesses": ["where they fall short"],
  "angles": ["marketing angles/positioning used"],
  "estimated_ctr_range": "low/medium/high",
  "actionable_insights": ["specific things to copy or counter"]
}`,
        },
        {
          role: 'user',
          content: `Analyze this competitor ad from ${ad.competitor_name}${ad.industry ? ` (${ad.industry})` : ''}:

Ad Text: ${ad.ad_text || 'N/A'}
Headline: ${ad.headline || 'N/A'}
Description: ${ad.description || 'N/A'}
CTA: ${ad.call_to_action || 'N/A'}
Creative Type: ${ad.creative_type || 'unknown'}
Platforms: ${(ad.platforms || []).join(', ')}
Active Since: ${ad.start_date || 'unknown'}
Still Running: ${ad.is_active ? 'Yes' : 'No'}`,
        },
      ],
      max_tokens: 1500,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });

    const analysis = JSON.parse(response.choices[0].message.content || '{}') as CompetitorAdAnalysis;

    await query(
      `UPDATE competitor_ads SET ai_analysis = $1 WHERE id = $2`,
      [JSON.stringify(analysis), adId]
    );

    return analysis;
  }

  // ==========================================
  // COMPETITIVE LANDSCAPE REPORT
  // ==========================================
  async generateLandscapeReport(): Promise<any> {
    const competitors = await query(
      `SELECT cp.*, 
        (SELECT COUNT(*) FROM competitor_ads ca WHERE ca.competitor_id = cp.id AND ca.is_active = true) as active_ad_count,
        (SELECT COUNT(*) FROM competitor_ads ca WHERE ca.competitor_id = cp.id) as total_ad_count
       FROM competitor_profiles cp
       WHERE cp.workspace_id = $1 AND cp.is_active = true`,
      [this.workspaceId]
    );

    const analyzedAds = await query(
      `SELECT ca.*, cp.name as competitor_name
       FROM competitor_ads ca
       JOIN competitor_profiles cp ON cp.id = ca.competitor_id
       WHERE ca.workspace_id = $1 AND ca.ai_analysis IS NOT NULL AND ca.ai_analysis != '{}'::jsonb
       ORDER BY ca.created_at DESC LIMIT 50`,
      [this.workspaceId]
    );

    // Aggregate insights from AI analyses
    const allHooks: string[] = [];
    const allFrameworks: string[] = [];
    const allAngles: string[] = [];
    const allInsights: string[] = [];

    for (const ad of analyzedAds.rows) {
      const analysis = (ad as any).ai_analysis || {};
      if (analysis.hooks) allHooks.push(...analysis.hooks);
      if (analysis.frameworks) allFrameworks.push(...analysis.frameworks);
      if (analysis.angles) allAngles.push(...analysis.angles);
      if (analysis.actionable_insights) allInsights.push(...analysis.actionable_insights);
    }

    // Count frequency of hooks and frameworks
    const hookFrequency = this.countFrequency(allHooks);
    const frameworkFrequency = this.countFrequency(allFrameworks);
    const angleFrequency = this.countFrequency(allAngles);

    return {
      competitors: competitors.rows,
      total_tracked_ads: analyzedAds.rows.length,
      top_hooks: Object.entries(hookFrequency).sort(([, a], [, b]) => b - a).slice(0, 10),
      top_frameworks: Object.entries(frameworkFrequency).sort(([, a], [, b]) => b - a).slice(0, 5),
      top_angles: Object.entries(angleFrequency).sort(([, a], [, b]) => b - a).slice(0, 10),
      actionable_insights: [...new Set(allInsights)].slice(0, 15),
    };
  }

  private countFrequency(items: string[]): Record<string, number> {
    return items.reduce((acc: Record<string, number>, item) => {
      const normalized = item.toLowerCase().trim();
      acc[normalized] = (acc[normalized] || 0) + 1;
      return acc;
    }, {});
  }

  // ==========================================
  // GET ALL COMPETITORS
  // ==========================================
  async getCompetitors(): Promise<any[]> {
    const result = await query(
      `SELECT cp.*,
        (SELECT COUNT(*) FROM competitor_ads ca WHERE ca.competitor_id = cp.id) as total_ads,
        (SELECT COUNT(*) FROM competitor_ads ca WHERE ca.competitor_id = cp.id AND ca.is_active = true) as active_ads
       FROM competitor_profiles cp
       WHERE cp.workspace_id = $1
       ORDER BY cp.created_at DESC`,
      [this.workspaceId]
    );
    return result.rows;
  }

  // ==========================================
  // GET COMPETITOR ADS
  // ==========================================
  async getCompetitorAds(competitorId: string, limit: number = 20): Promise<any[]> {
    const result = await query(
      `SELECT * FROM competitor_ads
       WHERE competitor_id = $1 AND workspace_id = $2
       ORDER BY start_date DESC NULLS LAST
       LIMIT $3`,
      [competitorId, this.workspaceId, limit]
    );
    return result.rows;
  }
}
