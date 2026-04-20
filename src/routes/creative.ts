// ============================================
// AD FUSION v2.0 - Creative Intelligence Routes
// ============================================
import { Router, Response } from 'express';
import { authenticate, requireWorkspace, AuthRequest } from '../middleware/auth';
import { CreativeIntelligenceEngine } from '../services/creative/engine';
import { successResponse, errorResponse } from '../utils/helpers';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);
router.use(requireWorkspace);

// GET /api/creative/leaderboard
router.get('/leaderboard', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new CreativeIntelligenceEngine(req.workspace_id!);
    const { sort_by, limit } = req.query as Record<string, string>;
    const leaderboard = await engine.getLeaderboard(sort_by || 'avg_ctr', parseInt(limit || '20'));
    res.json(successResponse(leaderboard));
  } catch (error) {
    logger.error('Creative leaderboard failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get creative leaderboard'));
  }
});

// GET /api/creative/diversity
router.get('/diversity', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new CreativeIntelligenceEngine(req.workspace_id!);
    const report = await engine.analyzeDiversity();
    res.json(successResponse(report));
  } catch (error) {
    logger.error('Creative diversity analysis failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to analyze creative diversity'));
  }
});

// GET /api/creative/winners
router.get('/winners', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new CreativeIntelligenceEngine(req.workspace_id!);
    const result = await engine.identifyWinners();
    res.json(successResponse(result));
  } catch (error) {
    logger.error('Creative winners failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to identify creative winners'));
  }
});

// POST /api/creative/sync
router.post('/sync', async (req: AuthRequest, res: Response): Promise<void> => {
  const { ad_account_id } = req.body;
  if (!ad_account_id) { res.status(400).json(errorResponse('MISSING_PARAM', 'ad_account_id required')); return; }
  try {
    const engine = new CreativeIntelligenceEngine(req.workspace_id!);
    const result = await engine.syncCreativeAssets(ad_account_id);
    res.json(successResponse(result));
  } catch (error) {
    logger.error('Creative sync failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to sync creative assets'));
  }
});

// POST /api/creative/score-fatigue
router.post('/score-fatigue', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new CreativeIntelligenceEngine(req.workspace_id!);
    const result = await engine.scoreFatigue();
    res.json(successResponse(result));
  } catch (error) {
    logger.error('Fatigue scoring failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to score creative fatigue'));
  }
});

// POST /api/creative/:id/tag-elements
router.post('/:id/tag-elements', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new CreativeIntelligenceEngine(req.workspace_id!);
    const elements = await engine.tagCreativeElements(req.params.id as string);
    res.json(successResponse(elements));
  } catch (error) {
    logger.error('Element tagging failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to tag creative elements'));
  }
});

export default router;
