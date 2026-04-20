// ============================================
// AD FUSION v2.0 - CAPI / Server-Side Tracking Routes
// ============================================
import { Router, Response } from 'express';
import { authenticate, requireWorkspace, AuthRequest } from '../middleware/auth';
import { CAPIService } from '../services/capi/service';
import { query } from '../config/database';
import { successResponse, errorResponse, generateId } from '../utils/helpers';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);
router.use(requireWorkspace);

// GET /api/capi/configurations
router.get('/configurations', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT cc.*, aa.name as account_name
       FROM capi_configurations cc
       JOIN ad_accounts aa ON aa.id = cc.ad_account_id
       WHERE cc.workspace_id = $1`,
      [req.workspace_id!]
    );
    res.json(successResponse(result.rows));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get CAPI configurations'));
  }
});

// POST /api/capi/configure
router.post('/configure', async (req: AuthRequest, res: Response): Promise<void> => {
  const { ad_account_id, pixel_id, access_token_encrypted, event_mapping } = req.body;
  if (!ad_account_id || !pixel_id) {
    res.status(400).json(errorResponse('MISSING_PARAMS', 'ad_account_id and pixel_id required'));
    return;
  }
  try {
    const id = generateId();
    await query(
      `INSERT INTO capi_configurations (id, workspace_id, ad_account_id, pixel_id, access_token_encrypted, event_mapping)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (workspace_id, pixel_id) DO UPDATE SET
         access_token_encrypted = COALESCE(EXCLUDED.access_token_encrypted, capi_configurations.access_token_encrypted),
         event_mapping = COALESCE(EXCLUDED.event_mapping, capi_configurations.event_mapping),
         is_active = true`,
      [id, req.workspace_id!, ad_account_id, pixel_id, access_token_encrypted || '', JSON.stringify(event_mapping || {})]
    );
    res.json(successResponse({ id, message: 'CAPI configured successfully' }));
  } catch (error) {
    logger.error('CAPI configuration failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to configure CAPI'));
  }
});

// POST /api/capi/events (send a single event)
router.post('/events', async (req: AuthRequest, res: Response): Promise<void> => {
  const { pixel_id, event_name, event_data } = req.body;
  if (!pixel_id || !event_name) {
    res.status(400).json(errorResponse('MISSING_PARAMS', 'pixel_id and event_name required'));
    return;
  }
  try {
    const configResult = await query(
      `SELECT access_token_encrypted FROM capi_configurations WHERE workspace_id = $1 AND pixel_id = $2 AND is_active = true`,
      [req.workspace_id!, pixel_id]
    );
    if (configResult.rows.length === 0) {
      res.status(404).json(errorResponse('NOT_FOUND', 'CAPI configuration not found for this pixel'));
      return;
    }
    const capi = new CAPIService(req.workspace_id!, pixel_id, (configResult.rows[0] as any).access_token_encrypted);
    const result = await capi.sendEvent(event_name, event_data || {});
    res.json(successResponse(result));
  } catch (error) {
    logger.error('CAPI event send failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('CAPI_ERROR', `Event send failed: ${(error as Error).message}`));
  }
});

// GET /api/capi/stats
router.get('/stats', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stats = await CAPIService.getStats(req.workspace_id!);
    res.json(successResponse(stats));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get CAPI stats'));
  }
});

export default router;
