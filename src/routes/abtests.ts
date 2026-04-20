// ============================================
// AD FUSION v2.0 - A/B Testing Routes
// ============================================
import { Router, Response } from 'express';
import { authenticate, requireWorkspace, AuthRequest } from '../middleware/auth';
import { ABTestingEngine } from '../services/abtesting/engine';
import { successResponse, errorResponse } from '../utils/helpers';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);
router.use(requireWorkspace);

// GET /api/abtests - List all tests
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { query: dbQuery } = await import('../config/database');
    const { status } = req.query as Record<string, string>;
    let sql = `SELECT * FROM ab_tests WHERE workspace_id = $1`;
    const params: unknown[] = [req.workspace_id!];
    if (status) { sql += ` AND status = $2`; params.push(status); }
    sql += ` ORDER BY created_at DESC`;
    const result = await dbQuery(sql, params);
    res.json(successResponse(result.rows));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to list A/B tests'));
  }
});

// POST /api/abtests - Create test
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new ABTestingEngine(req.workspace_id!);
    const id = await engine.createTest({ ...req.body, created_by: (req as any).user_id });
    res.status(201).json(successResponse({ id, message: 'A/B test created' }));
  } catch (error) {
    logger.error('A/B test creation failed', { error: (error as Error).message });
    res.status(400).json(errorResponse('VALIDATION_ERROR', (error as Error).message));
  }
});

// GET /api/abtests/:id - Get test details with live stats
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new ABTestingEngine(req.workspace_id!);
    const test = await engine.getTestResults(req.params.id as string);
    res.json(successResponse(test));
  } catch (error) {
    res.status(404).json(errorResponse('NOT_FOUND', (error as Error).message));
  }
});

// POST /api/abtests/:id/start - Start test
router.post('/:id/start', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new ABTestingEngine(req.workspace_id!);
    await engine.startTest(req.params.id as string);
    res.json(successResponse({ message: 'A/B test started' }));
  } catch (error) {
    res.status(400).json(errorResponse('AB_TEST_ERROR', (error as Error).message));
  }
});

// POST /api/abtests/evaluate - Evaluate all running tests
router.post('/evaluate', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engine = new ABTestingEngine(req.workspace_id!);
    const result = await engine.evaluateRunningTests();
    res.json(successResponse(result));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to evaluate A/B tests'));
  }
});

export default router;
