// ============================================
// AD FUSION - Dashboard Routes
// Aggregated data for the main dashboard view
// ============================================
import { Router, Response } from 'express';
import { authenticate, requireWorkspace, AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { cacheGet, cacheSet } from '../config/redis';
import { successResponse, errorResponse } from '../utils/helpers';
import { logger } from '../utils/logger';

const router = Router();

router.use(authenticate);
router.use(requireWorkspace);

// ==========================================
// GET /api/dashboard/summary - Main dashboard overview
// ==========================================
router.get('/summary', async (req: AuthRequest, res: Response): Promise<void> => {
  const workspaceId = req.workspace_id!;
  const { date_from, date_to, ad_account_id } = req.query as Record<string, string>;

  const dateFrom = date_from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateTo = date_to || new Date().toISOString().split('T')[0];

  try {
    const cacheKey = `workspace:${workspaceId}:dashboard:summary:${dateFrom}:${dateTo}:${ad_account_id || 'all'}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      res.json(successResponse(cached));
      return;
    }

    let accountFilter = '';
    const params: unknown[] = [workspaceId, dateFrom, dateTo];
    if (ad_account_id) {
      accountFilter = 'AND i.ad_account_id = $4';
      params.push(ad_account_id);
    }

    // Performance summary for current period
    const currentResult = await query(
      `SELECT
        COALESCE(SUM(i.spend), 0) as total_spend,
        COALESCE(SUM(i.impressions), 0) as total_impressions,
        COALESCE(SUM(i.reach), 0) as total_reach,
        COALESCE(SUM(i.clicks), 0) as total_clicks,
        COALESCE(SUM(i.link_clicks), 0) as total_link_clicks,
        COALESCE(SUM(i.landing_page_views), 0) as total_landing_page_views,
        CASE WHEN SUM(i.impressions) > 0 THEN (SUM(i.clicks)::DECIMAL / SUM(i.impressions)) * 100 ELSE 0 END as avg_ctr,
        CASE WHEN SUM(i.clicks) > 0 THEN SUM(i.spend) / SUM(i.clicks) ELSE 0 END as avg_cpc,
        CASE WHEN SUM(i.impressions) > 0 THEN (SUM(i.spend) / SUM(i.impressions)) * 1000 ELSE 0 END as avg_cpm,
        COALESCE(AVG(i.frequency), 0) as avg_frequency
       FROM ad_insights i
       WHERE i.workspace_id = $1 AND i.date_start >= $2 AND i.date_stop <= $3 ${accountFilter}`,
      params
    );

    // Previous period for comparison
    const daysDiff = Math.ceil((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (24 * 60 * 60 * 1000));
    const prevFrom = new Date(new Date(dateFrom).getTime() - daysDiff * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const prevParams = [workspaceId, prevFrom, dateFrom, ...(ad_account_id ? [ad_account_id] : [])];

    const previousResult = await query(
      `SELECT
        COALESCE(SUM(i.spend), 0) as total_spend,
        COALESCE(SUM(i.impressions), 0) as total_impressions,
        COALESCE(SUM(i.clicks), 0) as total_clicks,
        CASE WHEN SUM(i.impressions) > 0 THEN (SUM(i.clicks)::DECIMAL / SUM(i.impressions)) * 100 ELSE 0 END as avg_ctr,
        CASE WHEN SUM(i.clicks) > 0 THEN SUM(i.spend) / SUM(i.clicks) ELSE 0 END as avg_cpc,
        CASE WHEN SUM(i.impressions) > 0 THEN (SUM(i.spend) / SUM(i.impressions)) * 1000 ELSE 0 END as avg_cpm
       FROM ad_insights i
       WHERE i.workspace_id = $1 AND i.date_start >= $2 AND i.date_stop < $3 ${accountFilter}`,
      prevParams
    );

    const current = currentResult.rows[0] as any;
    const previous = previousResult.rows[0] as any;

    // Calculate changes
    const calcChange = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev) * 100;
    };

    // Account overview
    const accountsResult = await query(
      `SELECT COUNT(*) as total_accounts,
        COUNT(*) FILTER (WHERE is_active = true) as active_accounts,
        COUNT(*) FILTER (WHERE token_expires_at < NOW() + INTERVAL '7 days') as expiring_tokens
       FROM ad_accounts WHERE workspace_id = $1`,
      [workspaceId]
    );

    // Campaign counts
    const campaignCounts = await query(
      `SELECT status, COUNT(*) as count
       FROM campaigns WHERE workspace_id = $1
       GROUP BY status`,
      [workspaceId]
    );

    // Active rules count
    const ruleCount = await query(
      'SELECT COUNT(*) as count FROM automation_rules WHERE workspace_id = $1 AND is_active = true',
      [workspaceId]
    );

    const summary = {
      metrics: {
        spend: { value: Number(current.total_spend), change: calcChange(Number(current.total_spend), Number(previous.total_spend)) },
        impressions: { value: Number(current.total_impressions), change: calcChange(Number(current.total_impressions), Number(previous.total_impressions)) },
        reach: { value: Number(current.total_reach), change: 0 },
        clicks: { value: Number(current.total_clicks), change: calcChange(Number(current.total_clicks), Number(previous.total_clicks)) },
        ctr: { value: Number(current.avg_ctr), change: calcChange(Number(current.avg_ctr), Number(previous.avg_ctr)) },
        cpc: { value: Number(current.avg_cpc), change: calcChange(Number(current.avg_cpc), Number(previous.avg_cpc)) },
        cpm: { value: Number(current.avg_cpm), change: calcChange(Number(current.avg_cpm), Number(previous.avg_cpm)) },
        frequency: { value: Number(current.avg_frequency), change: 0 },
        link_clicks: { value: Number(current.total_link_clicks), change: 0 },
        landing_page_views: { value: Number(current.total_landing_page_views), change: 0 },
      },
      accounts: accountsResult.rows[0],
      campaign_breakdown: campaignCounts.rows.reduce((acc: Record<string, number>, row: any) => {
        acc[row.status] = Number(row.count);
        return acc;
      }, {}),
      active_rules: Number((ruleCount.rows[0] as any).count),
      date_range: { from: dateFrom, to: dateTo },
    };

    await cacheSet(cacheKey, summary, 120); // Cache for 2 minutes
    res.json(successResponse(summary));
  } catch (error) {
    logger.error('Dashboard summary failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get dashboard summary'));
  }
});

// ==========================================
// GET /api/dashboard/spend-trend
// ==========================================
router.get('/spend-trend', async (req: AuthRequest, res: Response): Promise<void> => {
  const workspaceId = req.workspace_id!;
  const { days } = req.query as Record<string, string>;
  const dayCount = parseInt(days || '30');

  try {
    const result = await query(
      `SELECT date_start as date,
        SUM(spend) as spend,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(reach) as reach,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks)::DECIMAL / SUM(impressions)) * 100 ELSE 0 END as ctr,
        CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END as cpc,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(spend) / SUM(impressions)) * 1000 ELSE 0 END as cpm
       FROM ad_insights
       WHERE workspace_id = $1 AND date_start >= NOW() - INTERVAL '${dayCount} days'
       GROUP BY date_start
       ORDER BY date_start`,
      [workspaceId]
    );

    res.json(successResponse(result.rows));
  } catch (error) {
    logger.error('Spend trend failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get spend trend'));
  }
});

// ==========================================
// GET /api/dashboard/top-campaigns
// ==========================================
router.get('/top-campaigns', async (req: AuthRequest, res: Response): Promise<void> => {
  const workspaceId = req.workspace_id!;
  const { sort_by, limit: limitStr, days } = req.query as Record<string, string>;
  const limit = Math.min(parseInt(limitStr || '10'), 50);
  const dayCount = parseInt(days || '7');
  const sortMetric = ['spend', 'clicks', 'impressions', 'ctr', 'cpc'].includes(sort_by || '') ? sort_by : 'spend';

  try {
    const result = await query(
      `SELECT c.id, c.name, c.status, c.objective, c.daily_budget,
        COALESCE(SUM(i.spend), 0) as spend,
        COALESCE(SUM(i.impressions), 0) as impressions,
        COALESCE(SUM(i.clicks), 0) as clicks,
        COALESCE(SUM(i.reach), 0) as reach,
        CASE WHEN SUM(i.impressions) > 0 THEN (SUM(i.clicks)::DECIMAL / SUM(i.impressions)) * 100 ELSE 0 END as ctr,
        CASE WHEN SUM(i.clicks) > 0 THEN SUM(i.spend) / SUM(i.clicks) ELSE 0 END as cpc,
        CASE WHEN SUM(i.impressions) > 0 THEN (SUM(i.spend) / SUM(i.impressions)) * 1000 ELSE 0 END as cpm,
        COALESCE(AVG(i.frequency), 0) as frequency
       FROM campaigns c
       LEFT JOIN ad_insights i ON i.campaign_id = c.id AND i.date_start >= NOW() - INTERVAL '${dayCount} days'
       WHERE c.workspace_id = $1 AND c.status != 'DELETED'
       GROUP BY c.id, c.name, c.status, c.objective, c.daily_budget
       ORDER BY ${sortMetric} DESC
       LIMIT $2`,
      [workspaceId, limit]
    );

    res.json(successResponse(result.rows));
  } catch (error) {
    logger.error('Top campaigns failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get top campaigns'));
  }
});

// ==========================================
// GET /api/dashboard/top-ads
// ==========================================
router.get('/top-ads', async (req: AuthRequest, res: Response): Promise<void> => {
  const workspaceId = req.workspace_id!;
  const { sort_by, limit: limitStr, days } = req.query as Record<string, string>;
  const limit = Math.min(parseInt(limitStr || '10'), 50);
  const dayCount = parseInt(days || '7');
  const sortMetric = ['spend', 'clicks', 'ctr', 'cpc'].includes(sort_by || '') ? sort_by : 'ctr';

  try {
    const result = await query(
      `SELECT a.id, a.name, a.status, a.creative,
        c.name as campaign_name,
        COALESCE(SUM(i.spend), 0) as spend,
        COALESCE(SUM(i.impressions), 0) as impressions,
        COALESCE(SUM(i.clicks), 0) as clicks,
        CASE WHEN SUM(i.impressions) > 0 THEN (SUM(i.clicks)::DECIMAL / SUM(i.impressions)) * 100 ELSE 0 END as ctr,
        CASE WHEN SUM(i.clicks) > 0 THEN SUM(i.spend) / SUM(i.clicks) ELSE 0 END as cpc,
        COALESCE(AVG(i.frequency), 0) as frequency
       FROM ads a
       JOIN adsets ast ON a.adset_id = ast.id
       JOIN campaigns c ON ast.campaign_id = c.id
       LEFT JOIN ad_insights i ON i.ad_id = a.id AND i.date_start >= NOW() - INTERVAL '${dayCount} days'
       WHERE a.workspace_id = $1 AND a.status != 'DELETED'
       GROUP BY a.id, a.name, a.status, a.creative, c.name
       HAVING SUM(i.impressions) > 0
       ORDER BY ${sortMetric} DESC
       LIMIT $2`,
      [workspaceId, limit]
    );

    res.json(successResponse(result.rows));
  } catch (error) {
    logger.error('Top ads failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get top ads'));
  }
});

// ==========================================
// GET /api/dashboard/notifications
// ==========================================
router.get('/notifications', async (req: AuthRequest, res: Response): Promise<void> => {
  const workspaceId = req.workspace_id!;
  const { unread_only, limit: limitStr } = req.query as Record<string, string>;
  const limit = Math.min(parseInt(limitStr || '20'), 100);

  try {
    let queryStr = `SELECT * FROM notifications WHERE workspace_id = $1`;
    const params: unknown[] = [workspaceId];

    if (unread_only === 'true') {
      queryStr += ' AND is_read = false';
    }

    queryStr += ` ORDER BY created_at DESC LIMIT $2`;
    params.push(limit);

    const result = await query(queryStr, params);

    // Also get unread count
    const unreadResult = await query(
      'SELECT COUNT(*) as count FROM notifications WHERE workspace_id = $1 AND is_read = false',
      [workspaceId]
    );

    res.json(successResponse({
      notifications: result.rows,
      unread_count: Number((unreadResult.rows[0] as any).count),
    }));
  } catch (error) {
    logger.error('Get notifications failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get notifications'));
  }
});

// ==========================================
// PATCH /api/dashboard/notifications/:id/read
// ==========================================
router.patch('/notifications/:id/read', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const workspaceId = req.workspace_id!;

  try {
    await query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND workspace_id = $2',
      [id, workspaceId]
    );
    res.json(successResponse({ message: 'Marked as read' }));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to update notification'));
  }
});

// ==========================================
// POST /api/dashboard/notifications/read-all
// ==========================================
router.post('/notifications/read-all', async (req: AuthRequest, res: Response): Promise<void> => {
  const workspaceId = req.workspace_id!;

  try {
    await query(
      'UPDATE notifications SET is_read = true WHERE workspace_id = $1 AND is_read = false',
      [workspaceId]
    );
    res.json(successResponse({ message: 'All notifications marked as read' }));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to update notifications'));
  }
});

export default router;
