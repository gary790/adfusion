// ============================================
// AD FUSION v2.0 - Cross-Channel Attribution Routes
// ============================================
import { Router, Response } from 'express';
import { authenticate, requireWorkspace, AuthRequest } from '../middleware/auth';
import { AttributionEngine } from '../services/attribution/engine';
import { successResponse, errorResponse } from '../utils/helpers';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);
router.use(requireWorkspace);

// GET /api/attribution/channels
router.get('/channels', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new AttributionEngine(req.workspace_id!);
    const channels = await engine.getChannels();
    res.json(successResponse(channels));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get attribution channels'));
  }
});

// POST /api/attribution/channels
router.post('/channels', async (req: AuthRequest, res: Response): Promise<void> => {
  const { channel_name, channel_type } = req.body;
  if (!channel_name || !channel_type) {
    res.status(400).json(errorResponse('MISSING_PARAMS', 'channel_name and channel_type required'));
    return;
  }
  try {
    const engine = new AttributionEngine(req.workspace_id!);
    const id = await engine.addChannel(req.body);
    res.status(201).json(successResponse({ id, message: 'Channel added' }));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to add channel'));
  }
});

// POST /api/attribution/import-meta - Auto-import from existing Meta data
router.post('/import-meta', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new AttributionEngine(req.workspace_id!);
    const imported = await engine.importMetaData();
    res.json(successResponse({ imported, message: `${imported} records imported from Meta insights` }));
  } catch (error) {
    logger.error('Meta attribution import failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to import Meta data'));
  }
});

// POST /api/attribution/import-manual
router.post('/import-manual', async (req: AuthRequest, res: Response): Promise<void> => {
  const { channel_id, data } = req.body;
  if (!channel_id || !data?.length) {
    res.status(400).json(errorResponse('MISSING_PARAMS', 'channel_id and data array required'));
    return;
  }
  try {
    const engine = new AttributionEngine(req.workspace_id!);
    const imported = await engine.importManualData(channel_id, data);
    res.json(successResponse({ imported }));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to import manual data'));
  }
});

// POST /api/attribution/calculate-blended
router.post('/calculate-blended', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new AttributionEngine(req.workspace_id!);
    const days = parseInt((req.query as any).days || '30');
    const calculated = await engine.calculateBlendedMetrics(days);
    res.json(successResponse({ calculated, message: `${calculated} blended metric days calculated` }));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to calculate blended metrics'));
  }
});

// GET /api/attribution/report
router.get('/report', async (req: AuthRequest, res: Response): Promise<void> => {
  const { date_from, date_to } = req.query as Record<string, string>;
  const dateFrom = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateTo = date_to || new Date().toISOString().split('T')[0];
  try {
    const engine = new AttributionEngine(req.workspace_id!);
    const report = await engine.generateReport(dateFrom, dateTo);
    res.json(successResponse(report));
  } catch (error) {
    logger.error('Attribution report failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to generate attribution report'));
  }
});

export default router;
