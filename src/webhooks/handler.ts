// ============================================
// AD FUSION - Webhook Handler
// Meta Webhooks + Stripe Webhooks
// ============================================
import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { query } from '../config/database';
import { generateId } from '../utils/helpers';
import { logger } from '../utils/logger';
import config from '../config';

const router = Router();

let stripe: Stripe | null = null;
if (config.stripe.secretKey) {
  stripe = new Stripe(config.stripe.secretKey, { apiVersion: '2024-12-18.acacia' as any });
}

// META WEBHOOK - Verification
router.get('/meta', (req: Request, res: Response): void => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === config.meta.webhookVerifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// META WEBHOOK - Receive events
router.post('/meta', async (req: Request, res: Response): Promise<void> => {
  const payload = req.body;
  if (!payload || !payload.entry) { res.sendStatus(400); return; }
  res.sendStatus(200);
  try {
    for (const entry of payload.entry) {
      for (const change of (entry.changes || [])) {
        const field = change.field;
        const value = change.value as any;
        if (field === 'campaigns' && value.id && value.status) {
          await query('UPDATE campaigns SET status=$1,updated_at=NOW() WHERE meta_campaign_id=$2', [value.status, value.id]);
        } else if (field === 'adsets' && value.id && value.status) {
          await query('UPDATE adsets SET status=$1,updated_at=NOW() WHERE meta_adset_id=$2', [value.status, value.id]);
        } else if (field === 'ads' && value.id && value.status) {
          await query('UPDATE ads SET status=$1,updated_at=NOW() WHERE meta_ad_id=$2', [value.status, value.id]);
        } else if (field === 'spend_cap' && value.spend_cap !== undefined) {
          await query('UPDATE ad_accounts SET spend_cap=$1,updated_at=NOW() WHERE meta_account_id=$2',
            [Number(value.spend_cap)/100, `act_${entry.id}`]);
        }
      }
    }
  } catch (error) {
    logger.error('Meta webhook processing failed', { error: (error as Error).message });
  }
});

// STRIPE WEBHOOK
router.post('/stripe', async (req: Request, res: Response): Promise<void> => {
  if (!stripe || !config.stripe.webhookSecret) { res.sendStatus(200); return; }
  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (error) {
    res.status(400).send(`Webhook Error: ${(error as Error).message}`);
    return;
  }
  res.sendStatus(200);
  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const wsId = session.metadata?.workspace_id;
      const plan = session.metadata?.plan;
      if (wsId && plan) {
        await query('UPDATE workspaces SET plan=$1,stripe_subscription_id=$2,updated_at=NOW() WHERE id=$3',
          [plan, session.subscription, wsId]);
        await query(`INSERT INTO notifications(id,workspace_id,channel,type,title,message) VALUES($1,$2,'in_app','system','Subscription Activated',$3)`,
          [generateId(), wsId, `Upgraded to ${plan} plan!`]);
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      const wsId = sub.metadata?.workspace_id;
      if (wsId) {
        await query("UPDATE workspaces SET plan='free',stripe_subscription_id=NULL,updated_at=NOW() WHERE id=$1", [wsId]);
        await query(`INSERT INTO notifications(id,workspace_id,channel,type,title,message) VALUES($1,$2,'in_app','system','Subscription Cancelled','Downgraded to free plan.')`,
          [generateId(), wsId]);
      }
    } else if (event.type === 'invoice.payment_failed') {
      const inv = event.data.object as Stripe.Invoice;
      const wsRes = await query('SELECT id FROM workspaces WHERE stripe_customer_id=$1', [inv.customer as string]);
      if (wsRes.rows.length > 0) {
        const wsId = (wsRes.rows[0] as any).id;
        await query(`INSERT INTO notifications(id,workspace_id,channel,type,title,message) VALUES($1,$2,'in_app','system','Payment Failed','Please update your payment method.')`,
          [generateId(), wsId]);
      }
    }
  } catch (error) {
    logger.error('Stripe webhook processing failed', { type: event.type, error: (error as Error).message });
  }
});

export default router;
