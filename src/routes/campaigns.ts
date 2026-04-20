// ============================================
// AD FUSION - Campaign Routes
// CRUD operations + Meta sync + Insights
// ============================================
import { Router, Response } from 'express';
import { body, param, query as queryValidator } from 'express-validator';
import { authenticate, requireWorkspace, requireRole, AuthRequest } from '../middleware/auth';
import { query, transaction } from '../config/database';
import { cacheGet, cacheSet, cacheDel } from '../config/redis';
import { MetaApiClient } from '../services/meta/client';
import { MetaSyncService } from '../services/meta/sync';
import { generateId, successResponse, errorResponse, parsePagination, buildPaginationMeta } from '../utils/helpers';
import { logger } from '../utils/logger';

const router = Router();

// All campaign routes require authentication + workspace
router.use(authenticate);
router.use(requireWorkspace);

// ==========================================
// GET /api/campaigns - List campaigns
// ==========================================
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const workspaceId = req.workspace_id!;
  const { page, per_page, sort_by, sort_order, search, status, ad_account_id, objective } = req.query as Record<string, string>;

  try {
    // Try cache first
    const cacheKey = `workspace:${workspaceId}:campaigns:${JSON.stringify(req.query)}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      res.json(successResponse(cached));
      return;
    }

    const pagination = parsePagination({
      page: page ? parseInt(page) : undefined,
      per_page: per_page ? parseInt(per_page) : undefined,
      sort_by,
      sort_order: sort_order as 'asc' | 'desc',
    });

    // Build dynamic WHERE clause
    const conditions = ['c.workspace_id = $1'];
    const params: unknown[] = [workspaceId];
    let paramIndex = 2;

    if (status) {
      conditions.push(`c.status = $${paramIndex++}`);
      params.push(status);
    }
    if (ad_account_id) {
      conditions.push(`c.ad_account_id = $${paramIndex++}`);
      params.push(ad_account_id);
    }
    if (objective) {
      conditions.push(`c.objective = $${paramIndex++}`);
      params.push(objective);
    }
    if (search) {
      conditions.push(`c.name ILIKE $${paramIndex++}`);
      params.push(`%${search}%`);
    }

    const whereClause = conditions.join(' AND ');

    // Count total
    const countResult = await query(
      `SELECT COUNT(*) as total FROM campaigns c WHERE ${whereClause}`,
      params
    );
    const total = parseInt((countResult.rows[0] as any).total || '0');

    // Get campaigns with latest metrics
    const allowedSorts = ['created_at', 'name', 'status', 'daily_budget', 'updated_at'];
    const sortCol = allowedSorts.includes(pagination.sortBy) ? pagination.sortBy : 'created_at';

    const result = await query(
      `SELECT c.*, aa.meta_account_id, aa.name as account_name,
        (SELECT json_build_object(
          'spend', COALESCE(SUM(i.spend), 0),
          'impressions', COALESCE(SUM(i.impressions), 0),
          'clicks', COALESCE(SUM(i.clicks), 0),
          'reach', COALESCE(SUM(i.reach), 0),
          'ctr', CASE WHEN SUM(i.impressions) > 0 THEN (SUM(i.clicks)::DECIMAL / SUM(i.impressions)) * 100 ELSE 0 END,
          'cpc', CASE WHEN SUM(i.clicks) > 0 THEN SUM(i.spend) / SUM(i.clicks) ELSE 0 END,
          'cpm', CASE WHEN SUM(i.impressions) > 0 THEN (SUM(i.spend) / SUM(i.impressions)) * 1000 ELSE 0 END
        )
        FROM ad_insights i
        WHERE i.campaign_id = c.id AND i.date_start >= NOW() - INTERVAL '7 days'
        ) as metrics_7d,
        (SELECT COUNT(*) FROM adsets WHERE campaign_id = c.id AND status != 'DELETED') as adset_count,
        (SELECT COUNT(*) FROM ads a JOIN adsets ast ON a.adset_id = ast.id WHERE ast.campaign_id = c.id AND a.status != 'DELETED') as ad_count
       FROM campaigns c
       JOIN ad_accounts aa ON c.ad_account_id = aa.id
       WHERE ${whereClause}
       ORDER BY c.${sortCol} ${pagination.sortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, pagination.limit, pagination.offset]
    );

    const responseData = {
      campaigns: result.rows,
      meta: buildPaginationMeta(total, parseInt(page || '1'), parseInt(per_page || '20')),
    };

    await cacheSet(cacheKey, responseData, 60); // Cache for 1 minute
    res.json(successResponse(responseData));
  } catch (error) {
    logger.error('List campaigns failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to list campaigns'));
  }
});

// ==========================================
// GET /api/campaigns/:id - Get single campaign with details
// ==========================================
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const workspaceId = req.workspace_id!;

  try {
    const result = await query(
      `SELECT c.*, aa.meta_account_id, aa.name as account_name
       FROM campaigns c
       JOIN ad_accounts aa ON c.ad_account_id = aa.id
       WHERE c.id = $1 AND c.workspace_id = $2`,
      [id, workspaceId]
    );

    if (result.rows.length === 0) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Campaign not found'));
      return;
    }

    // Get ad sets
    const adsets = await query(
      `SELECT ast.*,
        (SELECT json_build_object(
          'spend', COALESCE(SUM(i.spend), 0),
          'impressions', COALESCE(SUM(i.impressions), 0),
          'clicks', COALESCE(SUM(i.clicks), 0),
          'ctr', CASE WHEN SUM(i.impressions) > 0 THEN (SUM(i.clicks)::DECIMAL / SUM(i.impressions)) * 100 ELSE 0 END
        )
        FROM ad_insights i WHERE i.adset_id = ast.id AND i.date_start >= NOW() - INTERVAL '7 days'
        ) as metrics_7d
       FROM adsets ast
       WHERE ast.campaign_id = $1 AND ast.status != 'DELETED'
       ORDER BY ast.created_at`,
      [id]
    );

    // Get 30-day performance trend
    const insights = await query(
      `SELECT date_start,
        SUM(spend) as spend, SUM(impressions) as impressions,
        SUM(clicks) as clicks, SUM(reach) as reach,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks)::DECIMAL / SUM(impressions)) * 100 ELSE 0 END as ctr,
        CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END as cpc,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(spend) / SUM(impressions)) * 1000 ELSE 0 END as cpm
       FROM ad_insights
       WHERE campaign_id = $1 AND date_start >= NOW() - INTERVAL '30 days'
       GROUP BY date_start
       ORDER BY date_start`,
      [id]
    );

    res.json(successResponse({
      campaign: result.rows[0],
      adsets: adsets.rows,
      performance_trend: insights.rows,
    }));
  } catch (error) {
    logger.error('Get campaign failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get campaign'));
  }
});

// ==========================================
// POST /api/campaigns - Create campaign via Meta API
// ==========================================
router.post(
  '/',
  requireRole('owner', 'admin', 'manager'),
  [
    body('ad_account_id').isUUID(),
    body('name').trim().isLength({ min: 1, max: 255 }),
    body('objective').isIn([
      'OUTCOME_AWARENESS', 'OUTCOME_TRAFFIC', 'OUTCOME_ENGAGEMENT',
      'OUTCOME_LEADS', 'OUTCOME_APP_PROMOTION', 'OUTCOME_SALES',
    ]),
    body('daily_budget').optional().isFloat({ min: 1 }),
    body('lifetime_budget').optional().isFloat({ min: 1 }),
    body('bid_strategy').optional().isIn([
      'LOWEST_COST_WITHOUT_CAP', 'LOWEST_COST_WITH_BID_CAP', 'COST_CAP', 'LOWEST_COST_WITH_MIN_ROAS',
    ]),
    body('status').optional().isIn(['ACTIVE', 'PAUSED']),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const workspaceId = req.workspace_id!;
    const { ad_account_id, name, objective, daily_budget, lifetime_budget, bid_strategy, status, start_time, stop_time, special_ad_categories } = req.body;

    try {
      // Get ad account and token
      const accountResult = await query(
        'SELECT meta_account_id, access_token_encrypted FROM ad_accounts WHERE id = $1 AND workspace_id = $2 AND is_active = true',
        [ad_account_id, workspaceId]
      );

      if (accountResult.rows.length === 0) {
        res.status(404).json(errorResponse('ACCOUNT_NOT_FOUND', 'Ad account not found'));
        return;
      }

      const account = accountResult.rows[0] as any;
      const metaClient = new MetaApiClient(account.access_token_encrypted);

      // Create on Meta
      const metaCampaign = await metaClient.createCampaign(account.meta_account_id, {
        name,
        objective,
        status: status || 'PAUSED',
        daily_budget,
        lifetime_budget,
        bid_strategy,
        special_ad_categories: special_ad_categories || [],
        start_time,
        stop_time,
      });

      // Store locally
      const campaignId = generateId();
      await query(
        `INSERT INTO campaigns (id, workspace_id, ad_account_id, meta_campaign_id, name, status, objective, daily_budget, lifetime_budget, bid_strategy, special_ad_categories, start_time, stop_time, last_synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
        [campaignId, workspaceId, ad_account_id, metaCampaign.id, name, status || 'PAUSED', objective, daily_budget || null, lifetime_budget || null, bid_strategy || 'LOWEST_COST_WITHOUT_CAP', JSON.stringify(special_ad_categories || []), start_time || null, stop_time || null]
      );

      // Audit log
      await query(
        `INSERT INTO audit_log (id, workspace_id, user_id, action, entity_type, entity_id, new_value)
         VALUES ($1, $2, $3, 'campaign.created', 'campaign', $4, $5)`,
        [generateId(), workspaceId, req.user!.id, campaignId, JSON.stringify({ name, objective, status })]
      );

      // Clear cache
      await cacheDel(`workspace:${workspaceId}:campaigns:*`);

      res.status(201).json(successResponse({
        id: campaignId,
        meta_campaign_id: metaCampaign.id,
        name,
        objective,
        status: status || 'PAUSED',
      }));
    } catch (error) {
      logger.error('Create campaign failed', { error: (error as Error).message });
      res.status(500).json(errorResponse('CREATE_FAILED', `Failed to create campaign: ${(error as Error).message}`));
    }
  }
);

// ==========================================
// PATCH /api/campaigns/:id - Update campaign
// ==========================================
router.patch(
  '/:id',
  requireRole('owner', 'admin', 'manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const workspaceId = req.workspace_id!;
    const updates = req.body;

    try {
      // Get campaign + account
      const campaignResult = await query(
        `SELECT c.meta_campaign_id, aa.access_token_encrypted, aa.meta_account_id
         FROM campaigns c
         JOIN ad_accounts aa ON c.ad_account_id = aa.id
         WHERE c.id = $1 AND c.workspace_id = $2`,
        [id, workspaceId]
      );

      if (campaignResult.rows.length === 0) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Campaign not found'));
        return;
      }

      const campaign = campaignResult.rows[0] as any;
      const metaClient = new MetaApiClient(campaign.access_token_encrypted);

      // Update on Meta
      const metaUpdates: Record<string, unknown> = {};
      if (updates.name) metaUpdates.name = updates.name;
      if (updates.status) metaUpdates.status = updates.status;
      if (updates.daily_budget) metaUpdates.daily_budget = updates.daily_budget;
      if (updates.lifetime_budget) metaUpdates.lifetime_budget = updates.lifetime_budget;
      if (updates.bid_strategy) metaUpdates.bid_strategy = updates.bid_strategy;

      if (Object.keys(metaUpdates).length > 0) {
        await metaClient.updateCampaign(campaign.meta_campaign_id, metaUpdates);
      }

      // Update locally
      const setClauses: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (['name', 'status', 'daily_budget', 'lifetime_budget', 'bid_strategy'].includes(key)) {
          setClauses.push(`${key} = $${idx++}`);
          params.push(value);
        }
      }

      if (setClauses.length > 0) {
        params.push(id, workspaceId);
        await query(
          `UPDATE campaigns SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${idx++} AND workspace_id = $${idx}`,
          params
        );
      }

      res.json(successResponse({ message: 'Campaign updated', id }));
    } catch (error) {
      logger.error('Update campaign failed', { error: (error as Error).message });
      res.status(500).json(errorResponse('UPDATE_FAILED', `Failed to update campaign: ${(error as Error).message}`));
    }
  }
);

// ==========================================
// DELETE /api/campaigns/:id
// ==========================================
router.delete(
  '/:id',
  requireRole('owner', 'admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const workspaceId = req.workspace_id!;

    try {
      const campaignResult = await query(
        `SELECT c.meta_campaign_id, aa.access_token_encrypted
         FROM campaigns c
         JOIN ad_accounts aa ON c.ad_account_id = aa.id
         WHERE c.id = $1 AND c.workspace_id = $2`,
        [id, workspaceId]
      );

      if (campaignResult.rows.length === 0) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Campaign not found'));
        return;
      }

      const campaign = campaignResult.rows[0] as any;
      const metaClient = new MetaApiClient(campaign.access_token_encrypted);

      // Archive on Meta (delete = archive)
      await metaClient.deleteCampaign(campaign.meta_campaign_id);

      // Update local status
      await query(
        "UPDATE campaigns SET status = 'DELETED', updated_at = NOW() WHERE id = $1",
        [id]
      );

      res.json(successResponse({ message: 'Campaign deleted' }));
    } catch (error) {
      logger.error('Delete campaign failed', { error: (error as Error).message });
      res.status(500).json(errorResponse('DELETE_FAILED', 'Failed to delete campaign'));
    }
  }
);

// ==========================================
// POST /api/campaigns/:id/sync - Force sync campaign data
// ==========================================
router.post(
  '/:id/sync',
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const workspaceId = req.workspace_id!;

    try {
      const campaignResult = await query(
        `SELECT c.*, aa.access_token_encrypted, aa.meta_account_id, aa.id as account_id
         FROM campaigns c
         JOIN ad_accounts aa ON c.ad_account_id = aa.id
         WHERE c.id = $1 AND c.workspace_id = $2`,
        [id, workspaceId]
      );

      if (campaignResult.rows.length === 0) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Campaign not found'));
        return;
      }

      const campaign = campaignResult.rows[0] as any;
      const syncService = new MetaSyncService(
        campaign.access_token_encrypted,
        workspaceId,
        campaign.account_id,
        campaign.meta_account_id
      );

      const stats = await syncService.fullSync();

      res.json(successResponse({
        message: 'Sync completed',
        stats,
      }));
    } catch (error) {
      logger.error('Campaign sync failed', { error: (error as Error).message });
      res.status(500).json(errorResponse('SYNC_FAILED', 'Failed to sync campaign data'));
    }
  }
);

// ==========================================
// GET /api/campaigns/:id/insights - Get campaign insights
// ==========================================
router.get('/:id/insights', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const workspaceId = req.workspace_id!;
  const { date_from, date_to, level, granularity } = req.query as Record<string, string>;

  try {
    const dateFrom = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dateTo = date_to || new Date().toISOString().split('T')[0];

    let groupBy = 'date_start';
    if (granularity === 'weekly') groupBy = "DATE_TRUNC('week', date_start)";
    if (granularity === 'monthly') groupBy = "DATE_TRUNC('month', date_start)";

    const result = await query(
      `SELECT ${groupBy} as date,
        SUM(impressions) as impressions,
        SUM(reach) as reach,
        AVG(frequency) as frequency,
        SUM(clicks) as clicks,
        SUM(unique_clicks) as unique_clicks,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks)::DECIMAL / SUM(impressions)) * 100 ELSE 0 END as ctr,
        CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END as cpc,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(spend) / SUM(impressions)) * 1000 ELSE 0 END as cpm,
        SUM(spend) as spend,
        SUM(link_clicks) as link_clicks,
        SUM(landing_page_views) as landing_page_views,
        SUM(video_views) as video_views
       FROM ad_insights
       WHERE campaign_id = $1 AND workspace_id = $2
         AND date_start >= $3 AND date_stop <= $4
       GROUP BY ${groupBy}
       ORDER BY ${groupBy}`,
      [id, workspaceId, dateFrom, dateTo]
    );

    // Also get totals
    const totals = await query(
      `SELECT
        SUM(impressions) as total_impressions,
        SUM(reach) as total_reach,
        SUM(clicks) as total_clicks,
        SUM(spend) as total_spend,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks)::DECIMAL / SUM(impressions)) * 100 ELSE 0 END as avg_ctr,
        CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END as avg_cpc,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(spend) / SUM(impressions)) * 1000 ELSE 0 END as avg_cpm,
        AVG(frequency) as avg_frequency
       FROM ad_insights
       WHERE campaign_id = $1 AND workspace_id = $2
         AND date_start >= $3 AND date_stop <= $4`,
      [id, workspaceId, dateFrom, dateTo]
    );

    res.json(successResponse({
      daily: result.rows,
      totals: totals.rows[0],
      date_range: { from: dateFrom, to: dateTo },
    }));
  } catch (error) {
    logger.error('Get insights failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get insights'));
  }
});

// ==========================================
// POST /api/campaigns/sync-all - Sync all accounts
// ==========================================
router.post(
  '/sync-all',
  requireRole('owner', 'admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const workspaceId = req.workspace_id!;

    try {
      const accounts = await query(
        'SELECT id, meta_account_id, access_token_encrypted FROM ad_accounts WHERE workspace_id = $1 AND is_active = true',
        [workspaceId]
      );

      const results = [];
      for (const account of accounts.rows) {
        const acc = account as any;
        try {
          const syncService = new MetaSyncService(
            acc.access_token_encrypted,
            workspaceId,
            acc.id,
            acc.meta_account_id
          );
          const stats = await syncService.fullSync();
          results.push({ account_id: acc.id, status: 'success', stats });
        } catch (error) {
          results.push({ account_id: acc.id, status: 'failed', error: (error as Error).message });
        }
      }

      res.json(successResponse({ results }));
    } catch (error) {
      logger.error('Sync all failed', { error: (error as Error).message });
      res.status(500).json(errorResponse('SYNC_FAILED', 'Failed to sync accounts'));
    }
  }
);

export default router;
