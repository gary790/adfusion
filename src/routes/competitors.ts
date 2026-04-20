// ============================================
// AD FUSION v2.0 - Competitor Intelligence Routes
// ============================================
import { Router, Response } from 'express';
import { authenticate, requireWorkspace, AuthRequest } from '../middleware/auth';
import { CompetitorIntelligenceEngine } from '../services/competitors/engine';
import { successResponse, errorResponse } from '../utils/helpers';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);
router.use(requireWorkspace);

// GET /api/competitors - List competitors
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new CompetitorIntelligenceEngine(req.workspace_id!);
    const competitors = await engine.getCompetitors();
    res.json(successResponse(competitors));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to list competitors'));
  }
});

// POST /api/competitors - Add competitor
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name } = req.body;
  if (!name) { res.status(400).json(errorResponse('MISSING_PARAM', 'name required')); return; }
  try {
    const engine = new CompetitorIntelligenceEngine(req.workspace_id!);
    const id = await engine.addCompetitor(req.body);
    res.status(201).json(successResponse({ id, message: 'Competitor added' }));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to add competitor'));
  }
});

// POST /api/competitors/:id/fetch-ads - Fetch from Ad Library
router.post('/:id/fetch-ads', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new CompetitorIntelligenceEngine(req.workspace_id!);
    const imported = await engine.fetchCompetitorAds(req.params.id as string);
    res.json(successResponse({ imported, message: `${imported} ads imported from Meta Ad Library` }));
  } catch (error) {
    logger.error('Competitor ad fetch failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', (error as Error).message));
  }
});

// GET /api/competitors/:id/ads - Get competitor's ads
router.get('/:id/ads', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new CompetitorIntelligenceEngine(req.workspace_id!);
    const ads = await engine.getCompetitorAds(req.params.id as string);
    res.json(successResponse(ads));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get competitor ads'));
  }
});

// POST /api/competitors/ads/:adId/analyze - AI analyze competitor ad
router.post('/ads/:adId/analyze', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new CompetitorIntelligenceEngine(req.workspace_id!);
    const analysis = await engine.analyzeCompetitorAd(req.params.adId as string);
    res.json(successResponse(analysis));
  } catch (error) {
    logger.error('Competitor ad analysis failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('AI_ERROR', (error as Error).message));
  }
});

// GET /api/competitors/landscape - Full competitive landscape report
router.get('/landscape', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new CompetitorIntelligenceEngine(req.workspace_id!);
    const report = await engine.generateLandscapeReport();
    res.json(successResponse(report));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to generate landscape report'));
  }
});

export default router;
