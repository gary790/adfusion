// ============================================
// AD FUSION - Automation Routes
// CRUD for rules + execution history
// ============================================
import { Router, Response } from 'express';
import { body } from 'express-validator';
import { authenticate, requireWorkspace, requireRole, AuthRequest } from '../middleware/auth';
import { AutomationEngine } from '../services/automation/engine';
import { query } from '../config/database';
import { generateId, successResponse, errorResponse, parsePagination, buildPaginationMeta } from '../utils/helpers';
import { logger } from '../utils/logger';

const router = Router();

router.use(authenticate);
router.use(requireWorkspace);

// ==========================================
// GET /api/automation/rules - List rules
// ==========================================
router.get('/rules', async (req: AuthRequest, res: Response): Promise<void> => {
  const workspaceId = req.workspace_id!;
  const { is_active } = req.query;

  try {
    let queryStr = `SELECT ar.*, u.name as created_by_name,
        (SELECT COUNT(*) FROM rule_executions re WHERE re.rule_id = ar.id) as execution_count,
        (SELECT MAX(triggered_at) FROM rule_executions re WHERE re.rule_id = ar.id) as last_execution
       FROM automation_rules ar
       LEFT JOIN users u ON ar.created_by = u.id
       WHERE ar.workspace_id = $1`;
    const params: unknown[] = [workspaceId];

    if (is_active !== undefined) {
      queryStr += ` AND ar.is_active = $2`;
      params.push(is_active === 'true');
    }

    queryStr += ` ORDER BY ar.created_at DESC`;

    const result = await query(queryStr, params);
    res.json(successResponse(result.rows));
  } catch (error) {
    logger.error('List rules failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to list rules'));
  }
});

// ==========================================
// POST /api/automation/rules - Create rule
// ==========================================
router.post(
  '/rules',
  requireRole('owner', 'admin', 'manager'),
  [
    body('name').trim().isLength({ min: 1, max: 255 }),
    body('scope').isIn(['campaign', 'adset', 'ad']),
    body('conditions').isArray({ min: 1 }),
    body('actions').isArray({ min: 1 }),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const workspaceId = req.workspace_id!;
    const {
      name, description, scope, scope_ids,
      conditions, condition_logic, actions,
      schedule, lookback_window, cooldown_period,
    } = req.body;

    try {
      const ruleId = generateId();
      await query(
        `INSERT INTO automation_rules (id, workspace_id, name, description, scope, scope_ids, conditions, condition_logic, actions, schedule, lookback_window, cooldown_period, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          ruleId, workspaceId, name, description || null,
          scope, JSON.stringify(scope_ids || []),
          JSON.stringify(conditions), condition_logic || 'AND',
          JSON.stringify(actions),
          JSON.stringify(schedule || { frequency: 'hourly' }),
          lookback_window || 24, cooldown_period || 6,
          req.user!.id,
        ]
      );

      // Audit log
      await query(
        `INSERT INTO audit_log (id, workspace_id, user_id, action, entity_type, entity_id, new_value)
         VALUES ($1, $2, $3, 'rule.created', 'automation_rule', $4, $5)`,
        [generateId(), workspaceId, req.user!.id, ruleId, JSON.stringify({ name, scope, conditions })]
      );

      res.status(201).json(successResponse({
        id: ruleId,
        name,
        scope,
        conditions,
        actions,
        message: 'Rule created successfully',
      }));
    } catch (error) {
      logger.error('Create rule failed', { error: (error as Error).message });
      res.status(500).json(errorResponse('CREATE_FAILED', 'Failed to create rule'));
    }
  }
);

// ==========================================
// GET /api/automation/rules/:id
// ==========================================
router.get('/rules/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const workspaceId = req.workspace_id!;

  try {
    const result = await query(
      `SELECT ar.*, u.name as created_by_name
       FROM automation_rules ar
       LEFT JOIN users u ON ar.created_by = u.id
       WHERE ar.id = $1 AND ar.workspace_id = $2`,
      [id, workspaceId]
    );

    if (result.rows.length === 0) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Rule not found'));
      return;
    }

    // Get recent executions
    const executions = await query(
      `SELECT id, triggered_at, conditions_met, actions_taken, affected_entities, status, error_message, execution_time_ms
       FROM rule_executions
       WHERE rule_id = $1
       ORDER BY triggered_at DESC
       LIMIT 20`,
      [id]
    );

    res.json(successResponse({
      rule: result.rows[0],
      executions: executions.rows,
    }));
  } catch (error) {
    logger.error('Get rule failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get rule'));
  }
});

// ==========================================
// PATCH /api/automation/rules/:id - Update rule
// ==========================================
router.patch(
  '/rules/:id',
  requireRole('owner', 'admin', 'manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const workspaceId = req.workspace_id!;
    const updates = req.body;

    try {
      const setClauses: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      const allowedFields = [
        'name', 'description', 'is_active', 'scope', 'condition_logic',
        'lookback_window', 'cooldown_period',
      ];
      const jsonFields = ['scope_ids', 'conditions', 'actions', 'schedule'];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          setClauses.push(`${key} = $${idx++}`);
          params.push(value);
        } else if (jsonFields.includes(key)) {
          setClauses.push(`${key} = $${idx++}`);
          params.push(JSON.stringify(value));
        }
      }

      if (setClauses.length === 0) {
        res.status(400).json(errorResponse('NO_UPDATES', 'No valid fields to update'));
        return;
      }

      params.push(id, workspaceId);
      await query(
        `UPDATE automation_rules SET ${setClauses.join(', ')}, updated_at = NOW()
         WHERE id = $${idx++} AND workspace_id = $${idx}`,
        params
      );

      res.json(successResponse({ message: 'Rule updated', id }));
    } catch (error) {
      logger.error('Update rule failed', { error: (error as Error).message });
      res.status(500).json(errorResponse('UPDATE_FAILED', 'Failed to update rule'));
    }
  }
);

// ==========================================
// DELETE /api/automation/rules/:id
// ==========================================
router.delete(
  '/rules/:id',
  requireRole('owner', 'admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const workspaceId = req.workspace_id!;

    try {
      const result = await query(
        'DELETE FROM automation_rules WHERE id = $1 AND workspace_id = $2 RETURNING id',
        [id, workspaceId]
      );

      if (result.rows.length === 0) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Rule not found'));
        return;
      }

      res.json(successResponse({ message: 'Rule deleted' }));
    } catch (error) {
      logger.error('Delete rule failed', { error: (error as Error).message });
      res.status(500).json(errorResponse('DELETE_FAILED', 'Failed to delete rule'));
    }
  }
);

// ==========================================
// POST /api/automation/rules/:id/run - Manually trigger rule
// ==========================================
router.post(
  '/rules/:id/run',
  requireRole('owner', 'admin', 'manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const workspaceId = req.workspace_id!;

    try {
      const ruleResult = await query(
        'SELECT * FROM automation_rules WHERE id = $1 AND workspace_id = $2',
        [id, workspaceId]
      );

      if (ruleResult.rows.length === 0) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Rule not found'));
        return;
      }

      const engine = new AutomationEngine(workspaceId);
      const execution = await engine.evaluateRule(ruleResult.rows[0]);

      if (execution) {
        res.json(successResponse({
          message: 'Rule executed',
          execution,
        }));
      } else {
        res.json(successResponse({
          message: 'Rule conditions not met — no action taken',
        }));
      }
    } catch (error) {
      logger.error('Manual rule run failed', { error: (error as Error).message });
      res.status(500).json(errorResponse('EXECUTION_FAILED', `Rule execution failed: ${(error as Error).message}`));
    }
  }
);

// ==========================================
// GET /api/automation/executions - Execution history
// ==========================================
router.get('/executions', async (req: AuthRequest, res: Response): Promise<void> => {
  const workspaceId = req.workspace_id!;
  const { rule_id, status, limit: limitStr } = req.query as Record<string, string>;
  const limit = Math.min(parseInt(limitStr || '50'), 200);

  try {
    let queryStr = `SELECT re.*, ar.name as rule_name, ar.scope
       FROM rule_executions re
       JOIN automation_rules ar ON re.rule_id = ar.id
       WHERE re.workspace_id = $1`;
    const params: unknown[] = [workspaceId];
    let idx = 2;

    if (rule_id) {
      queryStr += ` AND re.rule_id = $${idx++}`;
      params.push(rule_id);
    }
    if (status) {
      queryStr += ` AND re.status = $${idx++}`;
      params.push(status);
    }

    queryStr += ` ORDER BY re.triggered_at DESC LIMIT $${idx}`;
    params.push(limit);

    const result = await query(queryStr, params);
    res.json(successResponse(result.rows));
  } catch (error) {
    logger.error('Get executions failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get executions'));
  }
});

// ==========================================
// GET /api/automation/presets - Pre-built rule templates
// ==========================================
router.get('/presets', (_req: AuthRequest, res: Response): void => {
  const presets = [
    {
      id: 'stop_losers',
      name: 'Stop Losing Ads',
      description: 'Pause ads with CTR below 0.8% and spend over $50',
      scope: 'ad',
      conditions: [
        { metric: 'ctr', operator: 'less_than', value: 0.8 },
        { metric: 'spend', operator: 'greater_than', value: 50 },
      ],
      condition_logic: 'AND',
      actions: [{ type: 'pause', params: {} }],
      schedule: { frequency: 'every_6_hours' },
      lookback_window: 72,
      cooldown_period: 24,
    },
    {
      id: 'scale_winners',
      name: 'Scale Winning Campaigns',
      description: 'Increase budget by 20% for campaigns with ROAS > 3x',
      scope: 'campaign',
      conditions: [
        { metric: 'roas', operator: 'greater_than', value: 3 },
        { metric: 'spend', operator: 'greater_than', value: 100 },
      ],
      condition_logic: 'AND',
      actions: [{ type: 'increase_budget', params: { percentage: 20 } }],
      schedule: { frequency: 'daily' },
      lookback_window: 72,
      cooldown_period: 72,
    },
    {
      id: 'creative_fatigue',
      name: 'Detect Creative Fatigue',
      description: 'Notify when frequency exceeds 3.0 and CTR drops below 0.9%',
      scope: 'ad',
      conditions: [
        { metric: 'frequency', operator: 'greater_than', value: 3.0 },
        { metric: 'ctr', operator: 'less_than', value: 0.9 },
      ],
      condition_logic: 'AND',
      actions: [{ type: 'send_notification', params: {} }],
      schedule: { frequency: 'daily' },
      lookback_window: 168,
      cooldown_period: 48,
    },
    {
      id: 'budget_protection',
      name: 'Budget Protection',
      description: 'Pause ad sets spending over $100/day with CPC > $5',
      scope: 'adset',
      conditions: [
        { metric: 'spend', operator: 'greater_than', value: 100 },
        { metric: 'cpc', operator: 'greater_than', value: 5 },
      ],
      condition_logic: 'AND',
      actions: [
        { type: 'pause', params: {} },
        { type: 'send_notification', params: {} },
      ],
      schedule: { frequency: 'hourly' },
      lookback_window: 24,
      cooldown_period: 12,
    },
    {
      id: 'high_cpm_alert',
      name: 'High CPM Alert',
      description: 'Notify when CPM exceeds $20 (indicates audience saturation)',
      scope: 'adset',
      conditions: [
        { metric: 'cpm', operator: 'greater_than', value: 20 },
        { metric: 'impressions', operator: 'greater_than', value: 1000 },
      ],
      condition_logic: 'AND',
      actions: [{ type: 'send_notification', params: {} }],
      schedule: { frequency: 'daily' },
      lookback_window: 48,
      cooldown_period: 48,
    },
  ];

  res.json(successResponse(presets));
});

export default router;
