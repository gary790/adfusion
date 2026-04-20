// ============================================
// AD FUSION - AI Routes
// Expose AI engine capabilities via API
// ============================================
import { Router, Response } from 'express';
import { body } from 'express-validator';
import { authenticate, requireWorkspace, requireRole, AuthRequest } from '../middleware/auth';
import { AIOptimizationEngine } from '../services/ai/engine';
import { query } from '../config/database';
import { successResponse, errorResponse } from '../utils/helpers';
import { logger } from '../utils/logger';

const router = Router();

router.use(authenticate);
router.use(requireWorkspace);

// ==========================================
// POST /api/ai/analyze-campaign
// ==========================================
router.post('/analyze-campaign', async (req: AuthRequest, res: Response): Promise<void> => {
  const workspaceId = req.workspace_id!;
  const { campaign_id, date_from, date_to } = req.body;

  if (!campaign_id) {
    res.status(400).json(errorResponse('MISSING_PARAM', 'campaign_id is required'));
    return;
  }

  try {
    // Check campaign exists
    const campaignResult = await query(
      'SELECT id, name, status, objective, daily_budget FROM campaigns WHERE id = $1 AND workspace_id = $2',
      [campaign_id, workspaceId]
    );

    if (campaignResult.rows.length === 0) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Campaign not found'));
      return;
    }

    // Get last 7 days metrics summary
    const dateFrom = date_from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dateTo = date_to || new Date().toISOString().split('T')[0];

    const metricsResult = await query(
      `SELECT
        SUM(impressions) as impressions, SUM(reach) as reach,
        AVG(frequency) as frequency, SUM(clicks) as clicks,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks)::DECIMAL / SUM(impressions)) * 100 ELSE 0 END as ctr,
        CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END as cpc,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(spend) / SUM(impressions)) * 1000 ELSE 0 END as cpm,
        SUM(spend) as spend,
        SUM(link_clicks) as link_clicks,
        SUM(landing_page_views) as landing_page_views
       FROM ad_insights
       WHERE campaign_id = $1 AND workspace_id = $2
         AND date_start >= $3 AND date_stop <= $4`,
      [campaign_id, workspaceId, dateFrom, dateTo]
    );

    // Get daily historical data
    const historyResult = await query(
      `SELECT date_start as date,
        SUM(impressions) as impressions, SUM(reach) as reach,
        AVG(frequency) as frequency, SUM(clicks) as clicks,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks)::DECIMAL / SUM(impressions)) * 100 ELSE 0 END as ctr,
        CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END as cpc,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(spend) / SUM(impressions)) * 1000 ELSE 0 END as cpm,
        SUM(spend) as spend
       FROM ad_insights
       WHERE campaign_id = $1 AND workspace_id = $2
         AND date_start >= NOW() - INTERVAL '30 days'
       GROUP BY date_start
       ORDER BY date_start`,
      [campaign_id, workspaceId]
    );

    const ai = new AIOptimizationEngine(workspaceId);
    const analysis = await ai.analyzeCampaignPerformance(
      campaign_id,
      {
        campaign: campaignResult.rows[0],
        summary_metrics: metricsResult.rows[0] || {},
        date_range: { from: dateFrom, to: dateTo },
      },
      historyResult.rows
    );

    res.json(successResponse(analysis));
  } catch (error) {
    logger.error('AI campaign analysis failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('AI_ERROR', `Analysis failed: ${(error as Error).message}`));
  }
});

// ==========================================
// POST /api/ai/generate-copy
// ==========================================
router.post(
  '/generate-copy',
  [
    body('product_name').trim().isLength({ min: 1 }),
    body('product_description').trim().isLength({ min: 10 }),
    body('target_audience').trim().isLength({ min: 5 }),
    body('tone').isIn(['professional', 'casual', 'urgent', 'emotional', 'humorous', 'authoritative', 'inspirational', 'conversational', 'provocative']),
    body('objective').isIn([
      'OUTCOME_AWARENESS', 'OUTCOME_TRAFFIC', 'OUTCOME_ENGAGEMENT',
      'OUTCOME_LEADS', 'OUTCOME_APP_PROMOTION', 'OUTCOME_SALES',
    ]),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const workspaceId = req.workspace_id!;

    try {
      const ai = new AIOptimizationEngine(workspaceId);
      const copies = await ai.generateAdCopy(req.body);

      res.json(successResponse({
        copies,
        count: copies.length,
      }));
    } catch (error) {
      logger.error('AI copy generation failed', { error: (error as Error).message });
      res.status(500).json(errorResponse('AI_ERROR', `Copy generation failed: ${(error as Error).message}`));
    }
  }
);

// ==========================================
// POST /api/ai/generate-headlines
// ==========================================
router.post('/generate-headlines', async (req: AuthRequest, res: Response): Promise<void> => {
  const workspaceId = req.workspace_id!;
  const { product_info, target_audience, count } = req.body;

  if (!product_info || !target_audience) {
    res.status(400).json(errorResponse('MISSING_PARAMS', 'product_info and target_audience required'));
    return;
  }

  try {
    const ai = new AIOptimizationEngine(workspaceId);
    const headlines = await ai.generateHeadlines(product_info, target_audience, count || 10);

    res.json(successResponse({ headlines }));
  } catch (error) {
    logger.error('Headline generation failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('AI_ERROR', 'Headline generation failed'));
  }
});

// ==========================================
// POST /api/ai/creative-fatigue
// ==========================================
router.post('/creative-fatigue', async (req: AuthRequest, res: Response): Promise<void> => {
  const workspaceId = req.workspace_id!;
  const { ad_id } = req.body;

  if (!ad_id) {
    res.status(400).json(errorResponse('MISSING_PARAM', 'ad_id required'));
    return;
  }

  try {
    // Get daily metrics for the ad
    const metricsResult = await query(
      `SELECT date_start as date, impressions, clicks, ctr, frequency, spend
       FROM ad_insights
       WHERE ad_id = $1 AND workspace_id = $2
       ORDER BY date_start`,
      [ad_id, workspaceId]
    );

    const dailyMetrics = metricsResult.rows.map((r: any) => ({
      date: r.date,
      impressions: Number(r.impressions),
      clicks: Number(r.clicks),
      ctr: Number(r.ctr),
      frequency: Number(r.frequency),
      spend: Number(r.spend),
    }));

    const ai = new AIOptimizationEngine(workspaceId);
    const result = await ai.detectCreativeFatigue(ad_id, dailyMetrics);

    res.json(successResponse(result));
  } catch (error) {
    logger.error('Creative fatigue check failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('AI_ERROR', 'Creative fatigue check failed'));
  }
});

// ==========================================
// POST /api/ai/scaling-readiness
// ==========================================
router.post('/scaling-readiness', async (req: AuthRequest, res: Response): Promise<void> => {
  const workspaceId = req.workspace_id!;
  const { campaign_id } = req.body;

  if (!campaign_id) {
    res.status(400).json(errorResponse('MISSING_PARAM', 'campaign_id required'));
    return;
  }

  try {
    // Get campaign data
    const campaignResult = await query(
      'SELECT daily_budget, created_at FROM campaigns WHERE id = $1 AND workspace_id = $2',
      [campaign_id, workspaceId]
    );

    if (campaignResult.rows.length === 0) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Campaign not found'));
      return;
    }

    const campaign = campaignResult.rows[0] as any;
    const daysRunning = Math.floor((Date.now() - new Date(campaign.created_at).getTime()) / (24 * 60 * 60 * 1000));

    // Get aggregate metrics
    const metricsResult = await query(
      `SELECT
        SUM(clicks) as total_clicks,
        SUM(spend) as total_spend,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks)::DECIMAL / SUM(impressions)) * 100 ELSE 0 END as ctr,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(spend) / SUM(impressions)) * 1000 ELSE 0 END as cpm
       FROM ad_insights
       WHERE campaign_id = $1 AND workspace_id = $2
         AND date_start >= NOW() - INTERVAL '7 days'`,
      [campaign_id, workspaceId]
    );

    const metrics = metricsResult.rows[0] as any;

    const ai = new AIOptimizationEngine(workspaceId);
    const result = await ai.checkScalingReadiness({
      daily_budget: Number(campaign.daily_budget) || 0,
      days_running: daysRunning,
      total_conversions: 0, // Would come from actual conversion data
      roas: 0, // Would come from actual ROAS data
      cpa: 0,
      ctr: Number(metrics?.ctr) || 0,
      cpm: Number(metrics?.cpm) || 0,
    });

    res.json(successResponse(result));
  } catch (error) {
    logger.error('Scaling readiness check failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('AI_ERROR', 'Scaling readiness check failed'));
  }
});

// ==========================================
// POST /api/ai/recommend-audiences
// ==========================================
router.post('/recommend-audiences', async (req: AuthRequest, res: Response): Promise<void> => {
  const workspaceId = req.workspace_id!;
  const { product_info, current_targeting, campaign_id } = req.body;

  try {
    let performanceData = {};
    if (campaign_id) {
      const metricsResult = await query(
        `SELECT
          SUM(impressions) as impressions, SUM(clicks) as clicks,
          SUM(spend) as spend, AVG(frequency) as frequency,
          CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks)::DECIMAL / SUM(impressions)) * 100 ELSE 0 END as ctr
         FROM ad_insights
         WHERE campaign_id = $1 AND workspace_id = $2
           AND date_start >= NOW() - INTERVAL '14 days'`,
        [campaign_id, workspaceId]
      );
      performanceData = metricsResult.rows[0] || {};
    }

    const ai = new AIOptimizationEngine(workspaceId);
    const result = await ai.recommendAudiences(
      product_info || '',
      current_targeting || {},
      performanceData
    );

    res.json(successResponse(result));
  } catch (error) {
    logger.error('Audience recommendation failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('AI_ERROR', 'Audience recommendation failed'));
  }
});

// ==========================================
// POST /api/ai/optimize-budget
// ==========================================
router.post('/optimize-budget', async (req: AuthRequest, res: Response): Promise<void> => {
  const workspaceId = req.workspace_id!;
  const { total_budget } = req.body;

  if (!total_budget) {
    res.status(400).json(errorResponse('MISSING_PARAM', 'total_budget required'));
    return;
  }

  try {
    // Get all active campaigns with metrics
    const campaignsResult = await query(
      `SELECT c.id, c.name, c.daily_budget,
        (SELECT json_build_object(
          'spend', COALESCE(SUM(i.spend), 0),
          'impressions', COALESCE(SUM(i.impressions), 0),
          'clicks', COALESCE(SUM(i.clicks), 0),
          'ctr', CASE WHEN SUM(i.impressions) > 0 THEN (SUM(i.clicks)::DECIMAL / SUM(i.impressions)) * 100 ELSE 0 END,
          'cpc', CASE WHEN SUM(i.clicks) > 0 THEN SUM(i.spend) / SUM(i.clicks) ELSE 0 END,
          'cpm', CASE WHEN SUM(i.impressions) > 0 THEN (SUM(i.spend) / SUM(i.impressions)) * 1000 ELSE 0 END
        )
        FROM ad_insights i
        WHERE i.campaign_id = c.id AND i.date_start >= NOW() - INTERVAL '7 days'
        ) as metrics
       FROM campaigns c
       WHERE c.workspace_id = $1 AND c.status = 'ACTIVE'
       ORDER BY c.daily_budget DESC`,
      [workspaceId]
    );

    const campaigns = campaignsResult.rows.map((c: any) => ({
      id: c.id,
      name: c.name,
      daily_budget: Number(c.daily_budget) || 0,
      metrics: c.metrics || {},
    }));

    const ai = new AIOptimizationEngine(workspaceId);
    const result = await ai.optimizeBudget(campaigns, total_budget);

    res.json(successResponse(result));
  } catch (error) {
    logger.error('Budget optimization failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('AI_ERROR', 'Budget optimization failed'));
  }
});

// ==========================================
// GET /api/ai/history - Get AI analysis history
// ==========================================
router.get('/history', async (req: AuthRequest, res: Response): Promise<void> => {
  const workspaceId = req.workspace_id!;
  const { type, limit: limitStr } = req.query as Record<string, string>;
  const limit = Math.min(parseInt(limitStr || '20'), 100);

  try {
    let queryStr = `SELECT id, analysis_type, target_id, target_type, confidence_score, model_used, tokens_used, processing_time_ms, created_at
       FROM ai_analyses
       WHERE workspace_id = $1`;
    const params: unknown[] = [workspaceId];

    if (type) {
      queryStr += ` AND analysis_type = $2`;
      params.push(type);
    }

    queryStr += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(queryStr, params);
    res.json(successResponse(result.rows));
  } catch (error) {
    logger.error('Get AI history failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get AI history'));
  }
});

export default router;
