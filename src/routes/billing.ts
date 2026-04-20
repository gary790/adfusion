// ============================================
// AD FUSION - Billing Routes (Stripe)
// Subscriptions, usage tracking, plan management
// ============================================
import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { authenticate, requireWorkspace, requireRole, AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { successResponse, errorResponse, generateId } from '../utils/helpers';
import { logger } from '../utils/logger';
import config from '../config';

const router = Router();

// Initialize Stripe (only if key is configured)
let stripe: Stripe | null = null;
if (config.stripe.secretKey) {
  stripe = new Stripe(config.stripe.secretKey, { apiVersion: '2024-12-18.acacia' as any });
}

router.use(authenticate);
router.use(requireWorkspace);

// ==========================================
// GET /api/billing/status - Current billing status
// ==========================================
router.get('/status', async (req: AuthRequest, res: Response): Promise<void> => {
  const workspaceId = req.workspace_id!;

  try {
    const wsResult = await query(
      'SELECT plan, stripe_customer_id, stripe_subscription_id, settings FROM workspaces WHERE id = $1',
      [workspaceId]
    );

    if (wsResult.rows.length === 0) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Workspace not found'));
      return;
    }

    const workspace = wsResult.rows[0] as any;
    const planConfig = config.stripe.plans[workspace.plan as keyof typeof config.stripe.plans];

    // Get current usage
    const today = new Date().toISOString().split('T')[0];
    const firstOfMonth = `${today.substring(0, 7)}-01`;

    const usageResult = await query(
      `SELECT usage_type, SUM(count) as total
       FROM api_usage
       WHERE workspace_id = $1 AND period_start >= $2
       GROUP BY usage_type`,
      [workspaceId, firstOfMonth]
    );

    const usage = usageResult.rows.reduce((acc: Record<string, number>, row: any) => {
      acc[row.usage_type] = Number(row.total);
      return acc;
    }, {});

    // Get entity counts
    const countsResult = await query(
      `SELECT
        (SELECT COUNT(*) FROM ad_accounts WHERE workspace_id = $1 AND is_active = true) as ad_accounts,
        (SELECT COUNT(*) FROM campaigns WHERE workspace_id = $1 AND status != 'DELETED') as campaigns,
        (SELECT COUNT(*) FROM automation_rules WHERE workspace_id = $1) as rules`,
      [workspaceId]
    );
    const counts = countsResult.rows[0] as any;

    let subscriptionDetails = null;
    if (stripe && workspace.stripe_subscription_id) {
      try {
        const subscription = await stripe.subscriptions.retrieve(workspace.stripe_subscription_id);
        subscriptionDetails = {
          status: subscription.status,
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
        };
      } catch (error) {
        logger.warn('Failed to retrieve subscription', { error: (error as Error).message });
      }
    }

    res.json(successResponse({
      plan: workspace.plan,
      limits: planConfig?.limits || {},
      usage: {
        ai_requests: usage.ai_request || 0,
        meta_api_calls: usage.meta_api_call || 0,
        syncs: usage.sync || 0,
      },
      entity_counts: {
        ad_accounts: Number(counts.ad_accounts),
        campaigns: Number(counts.campaigns),
        rules: Number(counts.rules),
      },
      subscription: subscriptionDetails,
    }));
  } catch (error) {
    logger.error('Get billing status failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get billing status'));
  }
});

// ==========================================
// POST /api/billing/create-checkout
// ==========================================
router.post(
  '/create-checkout',
  requireRole('owner'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    if (!stripe) {
      res.status(503).json(errorResponse('BILLING_NOT_CONFIGURED', 'Stripe is not configured'));
      return;
    }

    const workspaceId = req.workspace_id!;
    const { plan } = req.body;

    if (!plan || !['starter', 'professional', 'enterprise'].includes(plan)) {
      res.status(400).json(errorResponse('INVALID_PLAN', 'Invalid plan selected'));
      return;
    }

    try {
      const wsResult = await query(
        'SELECT stripe_customer_id, owner_id FROM workspaces WHERE id = $1',
        [workspaceId]
      );
      const workspace = wsResult.rows[0] as any;

      // Get or create Stripe customer
      let customerId = workspace.stripe_customer_id;
      if (!customerId) {
        const userResult = await query('SELECT email, name FROM users WHERE id = $1', [workspace.owner_id]);
        const user = userResult.rows[0] as any;

        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name,
          metadata: { workspace_id: workspaceId, user_id: workspace.owner_id },
        });

        customerId = customer.id;
        await query(
          'UPDATE workspaces SET stripe_customer_id = $1 WHERE id = $2',
          [customerId, workspaceId]
        );
      }

      const planConfig = config.stripe.plans[plan as keyof typeof config.stripe.plans];

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price: planConfig.price_id,
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: `${config.apiBaseUrl}/?billing=success&plan=${plan}`,
        cancel_url: `${config.apiBaseUrl}/?billing=cancelled`,
        metadata: { workspace_id: workspaceId, plan },
        subscription_data: {
          trial_period_days: 14,
          metadata: { workspace_id: workspaceId },
        },
      });

      res.json(successResponse({
        checkout_url: session.url,
        session_id: session.id,
      }));
    } catch (error) {
      logger.error('Create checkout failed', { error: (error as Error).message });
      res.status(500).json(errorResponse('CHECKOUT_FAILED', 'Failed to create checkout session'));
    }
  }
);

// ==========================================
// POST /api/billing/create-portal
// ==========================================
router.post(
  '/create-portal',
  requireRole('owner'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    if (!stripe) {
      res.status(503).json(errorResponse('BILLING_NOT_CONFIGURED', 'Stripe is not configured'));
      return;
    }

    const workspaceId = req.workspace_id!;

    try {
      const wsResult = await query(
        'SELECT stripe_customer_id FROM workspaces WHERE id = $1',
        [workspaceId]
      );
      const workspace = wsResult.rows[0] as any;

      if (!workspace.stripe_customer_id) {
        res.status(400).json(errorResponse('NO_SUBSCRIPTION', 'No active subscription'));
        return;
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: workspace.stripe_customer_id,
        return_url: `${config.apiBaseUrl}/`,
      });

      res.json(successResponse({ portal_url: session.url }));
    } catch (error) {
      logger.error('Create portal failed', { error: (error as Error).message });
      res.status(500).json(errorResponse('PORTAL_FAILED', 'Failed to create billing portal'));
    }
  }
);

// ==========================================
// GET /api/billing/plans - Available plans
// ==========================================
router.get('/plans', (_req: AuthRequest, res: Response): void => {
  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      billing_period: 'monthly',
      features: [
        '1 ad account',
        '5 campaigns',
        '10 AI requests/month',
        '3 automation rules',
        'Basic dashboard',
        'Email support',
      ],
      limits: config.stripe.plans.free.limits,
    },
    {
      id: 'starter',
      name: 'Starter',
      price: 49,
      billing_period: 'monthly',
      features: [
        '3 ad accounts',
        '25 campaigns',
        '100 AI requests/month',
        '10 automation rules',
        'Advanced analytics',
        'Priority support',
        '14-day free trial',
      ],
      limits: config.stripe.plans.starter.limits,
    },
    {
      id: 'professional',
      name: 'Professional',
      price: 149,
      billing_period: 'monthly',
      features: [
        '10 ad accounts',
        '100 campaigns',
        '500 AI requests/month',
        '50 automation rules',
        'Full AI optimization suite',
        'Custom rule engine',
        'API access',
        'Dedicated support',
        '14-day free trial',
      ],
      limits: config.stripe.plans.professional.limits,
      popular: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 499,
      billing_period: 'monthly',
      features: [
        'Unlimited ad accounts',
        'Unlimited campaigns',
        'Unlimited AI requests',
        'Unlimited automation rules',
        'White-label option',
        'Custom integrations',
        'SLA guarantee',
        'Dedicated account manager',
      ],
      limits: config.stripe.plans.enterprise.limits,
    },
  ];

  res.json(successResponse(plans));
});

export default router;
