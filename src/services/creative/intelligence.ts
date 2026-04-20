// ============================================
// AD FUSION — Creative Intelligence Engine
// Element-level analysis, fatigue tracking, winners hub,
// format breakdown, AI creative analysis
// ============================================
import OpenAI from 'openai';
import config from '../../config';
import { query } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';

interface CreativeAnalysis {
  hook_type: string;
  copy_angle: string;
  visual_style: string;
  primary_color: string;
  has_text_overlay: boolean;
  has_face: boolean;
  has_product: boolean;
  strengths: string[];
  weaknesses: string[];
  improvement_suggestions: string[];
  predicted_performance: 'high' | 'medium' | 'low';
  score: number;
}

interface WinnerCriteria {
  min_spend: number;
  min_impressions: number;
  min_ctr: number;
  min_roas: number;
  min_days_active: number;
}

interface ElementReport {
  element_type: string;
  element_value: string;
  avg_ctr: number;
  avg_cpc: number;
  avg_roas: number;
  sample_size: number;
  percentile_rank: number;
}

interface FatigueResult {
  creative_id: string;
  fatigue_score: number;
  fatigue_status: 'healthy' | 'warning' | 'fatigued' | 'critical';
  signals: string[];
  days_until_fatigue: number | null;
  recommendation: string;
  suggested_action: string;
}

export class CreativeIntelligenceEngine {
  private openai: OpenAI;
  private workspaceId: string;

  constructor(workspaceId: string) {
    this.openai = new OpenAI({ apiKey: config.openai.apiKey });
    this.workspaceId = workspaceId;
  }

  // ==========================================
  // AI CREATIVE ANALYSIS
  // Analyze creative elements at a granular level
  // ==========================================
  async analyzeCreative(
    creativeId: string,
    adContent: {
      headline?: string;
      primary_text?: string;
      description?: string;
      cta_type?: string;
      image_url?: string;
      ad_type?: string;
      format?: string;
    }
  ): Promise<CreativeAnalysis> {
    const systemPrompt = `You are a world-class Meta ads creative analyst specializing in element-level ad analysis.

You analyze ad creatives to identify:
1. HOOK TYPE: question, number, how_to, bold_claim, curiosity_gap, social_proof, urgency, controversy, story, benefit, pain_point, before_after
2. COPY ANGLE: pain_point, aspiration, fear_of_missing_out, social_proof, authority, scarcity, exclusivity, transformation, comparison, testimonial
3. VISUAL STYLE: polished, ugc, lifestyle, product_shot, testimonial, comparison, infographic, meme, founder_selfie, behind_scenes, unboxing, demo
4. PRIMARY COLOR: the dominant color (e.g., "blue", "red", "neutral", "black", "white")

Meta creative best practices (2026 Andromeda era):
- Creative diversity drives 70% of campaign performance
- Hook in first 3 words / first 3 seconds for video
- 15-50 different creatives per ad set (not variations of same concept)
- Format variety: mix static, video, UGC, carousel
- Short copy and long copy both outperform medium-length
- Faces increase stopping power by 30%+
- Product-focused visuals outperform lifestyle in e-commerce

Output as JSON:
{
  "hook_type": "string",
  "copy_angle": "string", 
  "visual_style": "string",
  "primary_color": "string",
  "has_text_overlay": boolean,
  "has_face": boolean,
  "has_product": boolean,
  "strengths": ["specific strength 1", "specific strength 2"],
  "weaknesses": ["specific weakness 1"],
  "improvement_suggestions": ["actionable suggestion 1", "actionable suggestion 2"],
  "predicted_performance": "high|medium|low",
  "score": 0-100
}`;

    const userPrompt = `Analyze this Meta ad creative:

TYPE: ${adContent.ad_type || 'image'}
FORMAT: ${adContent.format || 'unknown'}
HEADLINE: ${adContent.headline || 'N/A'}
PRIMARY TEXT: ${adContent.primary_text || 'N/A'}
DESCRIPTION: ${adContent.description || 'N/A'}
CTA: ${adContent.cta_type || 'N/A'}
IMAGE URL: ${adContent.image_url || 'N/A'}

Provide a detailed element-level analysis.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1500,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const analysis = JSON.parse(response.choices[0].message.content || '{}') as CreativeAnalysis;

      // Store analysis in creative_assets
      await query(
        `UPDATE creative_assets SET 
          hook_type = $1, copy_angle = $2, visual_style = $3, primary_color = $4,
          has_text_overlay = $5, has_face = $6, has_product = $7, ai_analysis = $8,
          updated_at = NOW()
         WHERE id = $9 AND workspace_id = $10`,
        [
          analysis.hook_type, analysis.copy_angle, analysis.visual_style, analysis.primary_color,
          analysis.has_text_overlay, analysis.has_face, analysis.has_product,
          JSON.stringify(analysis),
          creativeId, this.workspaceId,
        ]
      );

      return analysis;
    } catch (error) {
      logger.error('Creative analysis failed', { error: (error as Error).message, creativeId });
      throw error;
    }
  }

  // ==========================================
  // ADVANCED CREATIVE FATIGUE DETECTION
  // Per-creative, trend-based, with prediction
  // ==========================================
  async detectCreativeFatigue(creativeId: string): Promise<FatigueResult> {
    // Fetch daily performance for this creative (last 30 days)
    const perfResult = await query(
      `SELECT date, impressions, clicks, spend, ctr, cpm, frequency, conversions, roas
       FROM creative_performance
       WHERE creative_asset_id = $1 AND workspace_id = $2
       ORDER BY date DESC LIMIT 30`,
      [creativeId, this.workspaceId]
    );

    const dailyData = perfResult.rows.reverse() as any[];

    if (dailyData.length < 5) {
      return {
        creative_id: creativeId,
        fatigue_score: 0,
        fatigue_status: 'healthy',
        signals: ['Insufficient data (need 5+ days)'],
        days_until_fatigue: null,
        recommendation: 'Keep running — not enough data to assess fatigue.',
        suggested_action: 'monitor',
      };
    }

    const signals: string[] = [];
    let fatigueScore = 0;

    // Signal 1: Frequency climbing
    const recentFreq = this.avg(dailyData.slice(-3).map(d => Number(d.frequency)));
    const earlierFreq = this.avg(dailyData.slice(0, Math.min(7, dailyData.length)).map(d => Number(d.frequency)));
    if (recentFreq > config.optimization.creativeFatigue.maxFrequency) {
      signals.push(`Frequency at ${recentFreq.toFixed(1)} (threshold: ${config.optimization.creativeFatigue.maxFrequency})`);
      fatigueScore += 25;
    }
    if (earlierFreq > 0 && (recentFreq - earlierFreq) / earlierFreq > 0.30) {
      signals.push(`Frequency climbing ${((recentFreq - earlierFreq) / earlierFreq * 100).toFixed(0)}%`);
      fatigueScore += 10;
    }

    // Signal 2: CTR declining
    const recentCtr = this.avg(dailyData.slice(-3).map(d => Number(d.ctr)));
    const peakCtr = Math.max(...dailyData.map(d => Number(d.ctr)));
    const ctrDropFromPeak = peakCtr > 0 ? (peakCtr - recentCtr) / peakCtr : 0;
    if (ctrDropFromPeak > config.optimization.creativeFatigue.ctrDropThreshold) {
      signals.push(`CTR dropped ${(ctrDropFromPeak * 100).toFixed(1)}% from peak (${peakCtr.toFixed(3)}% → ${recentCtr.toFixed(3)}%)`);
      fatigueScore += 25;
    }

    // Signal 3: CPM rising (auction pressure from saturation)
    const recentCpm = this.avg(dailyData.slice(-3).map(d => Number(d.cpm)));
    const earlierCpm = this.avg(dailyData.slice(0, Math.min(7, dailyData.length)).map(d => Number(d.cpm)));
    if (earlierCpm > 0 && (recentCpm - earlierCpm) / earlierCpm > 0.15) {
      signals.push(`CPM rising ${((recentCpm - earlierCpm) / earlierCpm * 100).toFixed(0)}% ($${earlierCpm.toFixed(2)} → $${recentCpm.toFixed(2)})`);
      fatigueScore += 15;
    }

    // Signal 4: Conversion rate declining
    const recentConvRate = this.avg(dailyData.slice(-3).map(d => Number(d.clicks) > 0 ? Number(d.conversions) / Number(d.clicks) * 100 : 0));
    const earlierConvRate = this.avg(dailyData.slice(0, Math.min(7, dailyData.length)).map(d => Number(d.clicks) > 0 ? Number(d.conversions) / Number(d.clicks) * 100 : 0));
    if (earlierConvRate > 0 && (earlierConvRate - recentConvRate) / earlierConvRate > 0.25) {
      signals.push(`Conversion rate dropped ${((earlierConvRate - recentConvRate) / earlierConvRate * 100).toFixed(0)}%`);
      fatigueScore += 15;
    }

    // Signal 5: Days active (creative type decay curves)
    const daysActive = dailyData.length;
    const decayCurve = config.optimization.creativeFatigue.decayCurve;
    const expectedLifespan = decayCurve.static; // default to static
    if (daysActive > expectedLifespan) {
      signals.push(`Active for ${daysActive} days (expected lifespan: ~${expectedLifespan} days for this format)`);
      fatigueScore += 10;
    }

    // Predict days until fatigue (linear extrapolation of CTR decline)
    let daysUntilFatigue: number | null = null;
    if (ctrDropFromPeak > 0 && ctrDropFromPeak < 1) {
      const daysToCurrentDrop = dailyData.length;
      const remainingDrop = 1 - ctrDropFromPeak;
      const dropRate = ctrDropFromPeak / daysToCurrentDrop;
      if (dropRate > 0) {
        const daysToZero = remainingDrop / dropRate;
        daysUntilFatigue = Math.max(0, Math.round(daysToZero * 0.5)); // fatigue at ~50% of remaining life
      }
    }

    // Cap score
    fatigueScore = Math.min(100, fatigueScore);

    // Determine status
    let fatigueStatus: 'healthy' | 'warning' | 'fatigued' | 'critical';
    if (fatigueScore >= 75) fatigueStatus = 'critical';
    else if (fatigueScore >= 50) fatigueStatus = 'fatigued';
    else if (fatigueScore >= 25) fatigueStatus = 'warning';
    else fatigueStatus = 'healthy';

    // Generate recommendation
    let recommendation: string;
    let suggestedAction: string;
    if (fatigueScore >= 75) {
      recommendation = 'CRITICAL: Replace this creative immediately. Pause and launch fresh variants with different hook types and visual styles.';
      suggestedAction = 'pause_and_replace';
    } else if (fatigueScore >= 50) {
      recommendation = 'Creative is fatigued. Prepare 3-5 replacement creatives using different angles. Begin transitioning spend.';
      suggestedAction = 'prepare_replacement';
    } else if (fatigueScore >= 25) {
      recommendation = 'Early fatigue signals detected. Have backup creatives ready. Consider expanding audience to reduce frequency.';
      suggestedAction = 'prepare_backup';
    } else {
      recommendation = 'Creative is performing well. Continue monitoring.';
      suggestedAction = 'monitor';
    }

    // Update creative_assets table
    await query(
      `UPDATE creative_assets SET 
        fatigue_score = $1, fatigue_status = $2, peak_ctr = $3,
        days_active = $4, updated_at = NOW()
       WHERE id = $5 AND workspace_id = $6`,
      [fatigueScore, fatigueStatus, peakCtr, daysActive, creativeId, this.workspaceId]
    );

    return {
      creative_id: creativeId,
      fatigue_score: fatigueScore,
      fatigue_status: fatigueStatus,
      signals,
      days_until_fatigue: daysUntilFatigue,
      recommendation,
      suggested_action: suggestedAction,
    };
  }

  // ==========================================
  // WINNERS HUB
  // Identify and rank top-performing creatives
  // ==========================================
  async identifyWinners(criteria?: Partial<WinnerCriteria>): Promise<any[]> {
    const defaults: WinnerCriteria = {
      min_spend: 50,
      min_impressions: 5000,
      min_ctr: 1.0,
      min_roas: 1.5,
      min_days_active: 3,
    };
    const c = { ...defaults, ...criteria };

    const result = await query(
      `SELECT ca.*,
        CASE
          WHEN ca.avg_roas >= 3 AND ca.avg_ctr >= 1.5 THEN 90 + LEAST(10, ca.avg_roas)
          WHEN ca.avg_roas >= 2 AND ca.avg_ctr >= 1.0 THEN 70 + LEAST(20, ca.avg_roas * 5)
          WHEN ca.avg_roas >= $6 AND ca.avg_ctr >= $5 THEN 50 + LEAST(20, ca.avg_roas * 10)
          ELSE LEAST(50, ca.avg_ctr * 20 + ca.avg_roas * 10)
        END as computed_winner_score
       FROM creative_assets ca
       WHERE ca.workspace_id = $1
         AND ca.total_spend >= $2
         AND ca.total_impressions >= $3
         AND ca.days_active >= $4
         AND ca.avg_ctr >= $5
         AND ca.fatigue_status != 'critical'
       ORDER BY computed_winner_score DESC
       LIMIT 50`,
      [this.workspaceId, c.min_spend, c.min_impressions, c.min_days_active, c.min_ctr, c.min_roas]
    );

    // Update winner flags
    for (const row of result.rows) {
      const r = row as any;
      await query(
        `UPDATE creative_assets SET is_winner = true, winner_score = $1 WHERE id = $2`,
        [Math.round(r.computed_winner_score), r.id]
      );
    }

    return result.rows;
  }

  // ==========================================
  // ELEMENT PERFORMANCE REPORT
  // Which hook types, copy angles, visual styles perform best?
  // ==========================================
  async getElementPerformanceReport(
    elementType: 'hook_type' | 'copy_angle' | 'visual_style' | 'format' | 'cta_type',
    days: number = 30
  ): Promise<ElementReport[]> {
    const cacheKey = `workspace:${this.workspaceId}:creative_elements:${elementType}:${days}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ElementReport[];

    const colName = elementType === 'format' ? 'format' : elementType;

    const result = await query(
      `SELECT 
        ca.${colName} as element_value,
        COUNT(DISTINCT ca.id) as sample_size,
        AVG(ca.avg_ctr) as avg_ctr,
        AVG(ca.avg_cpc) as avg_cpc,
        AVG(ca.avg_roas) as avg_roas,
        SUM(ca.total_spend) as total_spend,
        PERCENT_RANK() OVER (ORDER BY AVG(ca.avg_ctr)) * 100 as percentile_rank
       FROM creative_assets ca
       WHERE ca.workspace_id = $1
         AND ca.${colName} IS NOT NULL
         AND ca.total_impressions >= 1000
         AND ca.first_served_at >= NOW() - INTERVAL '${days} days'
       GROUP BY ca.${colName}
       HAVING COUNT(DISTINCT ca.id) >= 3
       ORDER BY avg_ctr DESC`,
      [this.workspaceId]
    );

    const report: ElementReport[] = result.rows.map((r: any) => ({
      element_type: elementType,
      element_value: r.element_value,
      avg_ctr: Number(r.avg_ctr),
      avg_cpc: Number(r.avg_cpc),
      avg_roas: Number(r.avg_roas),
      sample_size: Number(r.sample_size),
      percentile_rank: Math.round(Number(r.percentile_rank)),
    }));

    await cacheSet(cacheKey, report, 300); // 5 min cache
    return report;
  }

  // ==========================================
  // CREATIVE DIVERSITY SCORE
  // How diverse is the creative mix? (Andromeda wants variety)
  // ==========================================
  async getCreativeDiversityScore(campaignId?: string): Promise<{
    score: number;
    total_creatives: number;
    format_breakdown: Record<string, number>;
    hook_type_breakdown: Record<string, number>;
    visual_style_breakdown: Record<string, number>;
    recommendations: string[];
  }> {
    let whereClause = 'ca.workspace_id = $1 AND ca.fatigue_status != \'critical\'';
    const params: unknown[] = [this.workspaceId];

    if (campaignId) {
      whereClause += ` AND EXISTS (
        SELECT 1 FROM ads a 
        JOIN adsets ast ON a.adset_id = ast.id 
        WHERE ast.campaign_id = $2 AND a.meta_ad_id = ca.meta_creative_id
      )`;
      params.push(campaignId);
    }

    const result = await query(
      `SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT ca.asset_type) as format_types,
        COUNT(DISTINCT ca.hook_type) as hook_types,
        COUNT(DISTINCT ca.visual_style) as visual_styles,
        COUNT(DISTINCT ca.copy_angle) as copy_angles,
        json_object_agg(COALESCE(ca.asset_type, 'unknown'), ca.type_count) as format_breakdown
       FROM (
         SELECT asset_type, hook_type, visual_style, copy_angle,
                COUNT(*) OVER (PARTITION BY asset_type) as type_count
         FROM creative_assets ca
         WHERE ${whereClause}
       ) ca`,
      params
    );

    // Also get breakdowns
    const formatResult = await query(
      `SELECT asset_type, COUNT(*) as cnt FROM creative_assets WHERE workspace_id = $1 AND fatigue_status != 'critical' GROUP BY asset_type`,
      [this.workspaceId]
    );
    const hookResult = await query(
      `SELECT hook_type, COUNT(*) as cnt FROM creative_assets WHERE workspace_id = $1 AND hook_type IS NOT NULL GROUP BY hook_type`,
      [this.workspaceId]
    );
    const styleResult = await query(
      `SELECT visual_style, COUNT(*) as cnt FROM creative_assets WHERE workspace_id = $1 AND visual_style IS NOT NULL GROUP BY visual_style`,
      [this.workspaceId]
    );

    const toBreakdown = (rows: any[]) => {
      const obj: Record<string, number> = {};
      for (const r of rows) {
        obj[r[Object.keys(r)[0]] || 'unknown'] = Number(r.cnt);
      }
      return obj;
    };

    const formatBreakdown = toBreakdown(formatResult.rows);
    const hookBreakdown = toBreakdown(hookResult.rows);
    const styleBreakdown = toBreakdown(styleResult.rows);

    const row = result.rows[0] as any;
    const totalCreatives = Number(row?.total || 0);
    const formatTypes = Number(row?.format_types || 0);
    const hookTypes = Number(row?.hook_types || 0);
    const visualStyles = Number(row?.visual_styles || 0);

    // Calculate diversity score (0-100)
    let score = 0;

    // Volume score (0-25): Are there enough creatives?
    if (totalCreatives >= 50) score += 25;
    else if (totalCreatives >= 25) score += 20;
    else if (totalCreatives >= 15) score += 15;
    else if (totalCreatives >= 6) score += 10;
    else score += Math.round(totalCreatives / 6 * 10);

    // Format variety (0-25): Mix of image, video, carousel, UGC
    const maxFormats = 5;
    score += Math.round((formatTypes / maxFormats) * 25);

    // Hook diversity (0-25)
    const maxHooks = 8;
    score += Math.round((Math.min(hookTypes, maxHooks) / maxHooks) * 25);

    // Visual style diversity (0-25)
    const maxStyles = 6;
    score += Math.round((Math.min(visualStyles, maxStyles) / maxStyles) * 25);

    // Generate recommendations
    const recommendations: string[] = [];
    if (totalCreatives < 15) {
      recommendations.push(`Only ${totalCreatives} active creatives. Andromeda performs best with 15-50 diverse creatives per ad set.`);
    }
    if (formatTypes < 3) {
      recommendations.push('Low format variety. Add video, carousel, or UGC-style content alongside static images.');
    }
    if (hookTypes < 4) {
      recommendations.push('Limited hook diversity. Test question hooks, number hooks, social proof, and curiosity gaps.');
    }
    if (visualStyles < 3) {
      recommendations.push('Visual style too uniform. Mix polished production with UGC, lifestyle, and testimonial styles.');
    }
    if (!formatBreakdown['video'] || formatBreakdown['video'] < 3) {
      recommendations.push('Static images drive 60-70% of conversions, but video is essential for Reels/Stories placements.');
    }

    return {
      score: Math.min(100, score),
      total_creatives: totalCreatives,
      format_breakdown: formatBreakdown,
      hook_type_breakdown: hookBreakdown,
      visual_style_breakdown: styleBreakdown,
      recommendations,
    };
  }

  // ==========================================
  // BATCH FATIGUE SCAN (for all active creatives)
  // ==========================================
  async batchFatigueScan(): Promise<FatigueResult[]> {
    const activeCreatives = await query(
      `SELECT id FROM creative_assets 
       WHERE workspace_id = $1 AND days_active >= 3 AND total_impressions >= 1000
       ORDER BY total_spend DESC LIMIT 100`,
      [this.workspaceId]
    );

    const results: FatigueResult[] = [];
    for (const row of activeCreatives.rows) {
      try {
        const result = await this.detectCreativeFatigue((row as any).id);
        results.push(result);
      } catch (error) {
        logger.warn('Fatigue scan failed for creative', { creativeId: (row as any).id });
      }
    }

    return results;
  }

  // ==========================================
  // HELPERS
  // ==========================================
  private avg(nums: number[]): number {
    if (nums.length === 0) return 0;
    return nums.reduce((sum, n) => sum + n, 0) / nums.length;
  }
}
