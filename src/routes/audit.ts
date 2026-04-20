// ============================================
// AD FUSION v2.0 - Proactive AI Audit Routes
// ============================================
import { Router, Response } from 'express';
import { authenticate, requireWorkspace, AuthRequest } from '../middleware/auth';
import { ProactiveAuditEngine } from '../services/audit/engine';
import { successResponse, errorResponse } from '../utils/helpers';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);
router.use(requireWorkspace);

// POST /api/audit/run - Run a manual audit
router.post('/run', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new ProactiveAuditEngine(req.workspace_id!);
    const result = await engine.runAudit('manual');
    res.json(successResponse(result));
  } catch (error) {
    logger.error('Audit run failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('AUDIT_ERROR', `Audit failed: ${(error as Error).message}`));
  }
});

// GET /api/audit/recommendations - Get pending recommendations
router.get('/recommendations', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new ProactiveAuditEngine(req.workspace_id!);
    const recommendations = await engine.getPendingRecommendations();
    res.json(successResponse(recommendations));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get recommendations'));
  }
});

// POST /api/audit/recommendations/:id/apply
router.post('/recommendations/:id/apply', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new ProactiveAuditEngine(req.workspace_id!);
    await engine.applyRecommendation(req.params.id as string, (req as any).user_id);
    res.json(successResponse({ message: 'Recommendation applied' }));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to apply recommendation'));
  }
});

// POST /api/audit/recommendations/:id/dismiss
router.post('/recommendations/:id/dismiss', async (req: AuthRequest, res: Response): Promise<void> => {
  const { reason } = req.body;
  try {
    const engine = new ProactiveAuditEngine(req.workspace_id!);
    await engine.dismissRecommendation(req.params.id as string, reason || 'Dismissed by user');
    res.json(successResponse({ message: 'Recommendation dismissed' }));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to dismiss recommendation'));
  }
});

// GET /api/audit/history
router.get('/history', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new ProactiveAuditEngine(req.workspace_id!);
    const history = await engine.getAuditHistory();
    res.json(successResponse(history));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get audit history'));
  }
});

export default router;
