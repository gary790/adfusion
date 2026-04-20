// ============================================
// AD FUSION v2.0 - Background Job Runner
// Cron-based sync, rule evaluation, AI audit,
// creative fatigue scoring, CAPI processing, A/B testing
// ============================================
import cron from 'node-cron';
import { query } from '../config/database';
import { MetaSyncService } from '../services/meta/sync';
import { AutomationEngine } from '../services/automation/engine';
import { CreativeIntelligenceEngine } from '../services/creative/engine';
import { ProactiveAuditEngine } from '../services/audit/engine';
import { ABTestingEngine } from '../services/abtesting/engine';
import { AttributionEngine } from '../services/attribution/engine';
import { CAPIService } from '../services/capi/service';
import { logger } from '../utils/logger';
import { generateId } from '../utils/helpers';

export function startJobs(): void {
  logger.info('Starting background jobs (v2.0 - World Class)');

  // ==========================================
  // INCREMENTAL SYNC - every 10 minutes
  // ==========================================
  cron.schedule('*/10 * * * *', async () => {
    logger.info('Running incremental sync job');
    try {
      const accounts = await query(
        `SELECT aa.id, aa.meta_account_id, aa.access_token_encrypted, aa.workspace_id
         FROM ad_accounts aa
         JOIN workspaces w ON w.id = aa.workspace_id
         WHERE aa.is_active = true AND w.is_active = true
           AND (aa.token_expires_at IS NULL OR aa.token_expires_at > NOW())
         ORDER BY aa.last_synced_at ASC NULLS FIRST
         LIMIT 10`
      );

      for (const acc of accounts.rows) {
        const account = acc as any;
        try {
          const syncService = new MetaSyncService(
            account.access_token_encrypted,
            account.workspace_id,
            account.id,
            account.meta_account_id
          );
          const count = await syncService.incrementalSync();
          logger.debug('Incremental sync completed', { accountId: account.meta_account_id, insightsCount: count });
        } catch (error) {
          logger.error('Incremental sync failed for account', { accountId: account.meta_account_id, error: (error as Error).message });
        }
      }
    } catch (error) {
      logger.error('Sync job failed', { error: (error as Error).message });
    }
  });

  // ==========================================
  // FULL SYNC - daily at 2 AM UTC
  // ==========================================
  cron.schedule('0 2 * * *', async () => {
    logger.info('Running full sync job');
    try {
      const accounts = await query(
        `SELECT aa.id, aa.meta_account_id, aa.access_token_encrypted, aa.workspace_id
         FROM ad_accounts aa
         JOIN workspaces w ON w.id = aa.workspace_id
         WHERE aa.is_active = true AND w.is_active = true
           AND (aa.token_expires_at IS NULL OR aa.token_expires_at > NOW())`
      );

      for (const acc of accounts.rows) {
        const account = acc as any;
        const jobId = generateId();
        try {
          await query(
            `INSERT INTO sync_jobs (id, workspace_id, ad_account_id, sync_type, status)
             VALUES ($1, $2, $3, 'full', 'running')`,
            [jobId, account.workspace_id, account.id]
          );

          const syncService = new MetaSyncService(
            account.access_token_encrypted, account.workspace_id,
            account.id, account.meta_account_id
          );
          const stats = await syncService.fullSync();

          await query(
            `UPDATE sync_jobs SET status='completed', stats=$1, completed_at=NOW() WHERE id=$2`,
            [JSON.stringify(stats), jobId]
          );
        } catch (error) {
          await query(
            `UPDATE sync_jobs SET status='failed', error_message=$1, completed_at=NOW() WHERE id=$2`,
            [(error as Error).message, jobId]
          );
        }
      }
    } catch (error) {
      logger.error('Full sync job failed', { error: (error as Error).message });
    }
  });

  // ==========================================
  // AUTOMATION RULES - every 30 minutes
  // ==========================================
  cron.schedule('*/30 * * * *', async () => {
    logger.info('Running automation rule evaluation');
    try {
      const workspaces = await query(
        `SELECT DISTINCT w.id FROM workspaces w
         JOIN automation_rules ar ON ar.workspace_id = w.id
         WHERE w.is_active = true AND ar.is_active = true`
      );

      for (const ws of workspaces.rows) {
        const workspace = ws as any;
        try {
          const engine = new AutomationEngine(workspace.id);
          const executions = await engine.evaluateAllRules();
          if (executions.length > 0) {
            logger.info('Rules triggered', { workspaceId: workspace.id, count: executions.length });
          }
        } catch (error) {
          logger.error('Rule evaluation failed for workspace', { workspaceId: workspace.id, error: (error as Error).message });
        }
      }
    } catch (error) {
      logger.error('Rule evaluation job failed', { error: (error as Error).message });
    }
  });

  // ==========================================
  // [NEW] CREATIVE FATIGUE SCORING - every 2 hours
  // ==========================================
  cron.schedule('0 */2 * * *', async () => {
    logger.info('Running creative fatigue scoring');
    try {
      const workspaces = await query(
        `SELECT DISTINCT w.id FROM workspaces w
         JOIN creative_assets ca ON ca.workspace_id = w.id
         WHERE w.is_active = true`
      );

      for (const ws of workspaces.rows) {
        try {
          const engine = new CreativeIntelligenceEngine((ws as any).id);
          await engine.updateCreativePerformance();
          const result = await engine.scoreFatigue();
          await engine.identifyWinners();
          if (result.alerts > 0) {
            logger.warn('Creative fatigue alerts', { workspaceId: (ws as any).id, alerts: result.alerts });
          }
        } catch (error) {
          logger.error('Creative fatigue scoring failed', { workspaceId: (ws as any).id, error: (error as Error).message });
        }
      }
    } catch (error) {
      logger.error('Creative fatigue job failed', { error: (error as Error).message });
    }
  });

  // ==========================================
  // [NEW] PROACTIVE AI AUDIT - daily at 6 AM UTC
  // ==========================================
  cron.schedule('0 6 * * *', async () => {
    logger.info('Running proactive AI audit');
    try {
      const workspaces = await query(
        `SELECT w.id FROM workspaces w
         WHERE w.is_active = true AND w.plan IN ('professional', 'enterprise')
         AND w.settings->>'proactive_ai_enabled' != 'false'`
      );

      for (const ws of workspaces.rows) {
        try {
          const engine = new ProactiveAuditEngine((ws as any).id);
          const result = await engine.runAudit('scheduled');
          logger.info('AI audit completed', {
            workspaceId: (ws as any).id,
            healthScore: result.health_score,
            findings: result.findings.length,
            recommendations: result.recommendations_count,
          });
        } catch (error) {
          logger.error('AI audit failed for workspace', { workspaceId: (ws as any).id, error: (error as Error).message });
        }
      }
    } catch (error) {
      logger.error('AI audit job failed', { error: (error as Error).message });
    }
  });

  // ==========================================
  // [NEW] A/B TEST EVALUATION - every hour
  // ==========================================
  cron.schedule('0 * * * *', async () => {
    logger.info('Running A/B test evaluation');
    try {
      const workspaces = await query(
        `SELECT DISTINCT workspace_id as id FROM ab_tests WHERE status = 'running'`
      );

      for (const ws of workspaces.rows) {
        try {
          const engine = new ABTestingEngine((ws as any).id);
          const result = await engine.evaluateRunningTests();
          if (result.winners_found > 0) {
            logger.info('A/B test winners found', { workspaceId: (ws as any).id, winners: result.winners_found });
          }
        } catch (error) {
          logger.error('A/B test evaluation failed', { workspaceId: (ws as any).id, error: (error as Error).message });
        }
      }
    } catch (error) {
      logger.error('A/B test job failed', { error: (error as Error).message });
    }
  });

  // ==========================================
  // [NEW] ATTRIBUTION DATA SYNC - every 4 hours
  // ==========================================
  cron.schedule('0 */4 * * *', async () => {
    logger.info('Running attribution data sync');
    try {
      const workspaces = await query(
        `SELECT DISTINCT workspace_id as id FROM attribution_channels WHERE is_active = true`
      );

      for (const ws of workspaces.rows) {
        try {
          const engine = new AttributionEngine((ws as any).id);
          await engine.importMetaData();
          await engine.calculateBlendedMetrics();
        } catch (error) {
          logger.error('Attribution sync failed', { workspaceId: (ws as any).id, error: (error as Error).message });
        }
      }
    } catch (error) {
      logger.error('Attribution job failed', { error: (error as Error).message });
    }
  });

  // ==========================================
  // [NEW] CAPI RETRY PENDING EVENTS - every 5 minutes
  // ==========================================
  cron.schedule('*/5 * * * *', async () => {
    try {
      const workspaces = await query(
        `SELECT DISTINCT workspace_id as id FROM capi_events WHERE processing_status = 'pending' AND created_at >= NOW() - INTERVAL '1 hour'`
      );

      for (const ws of workspaces.rows) {
        try {
          const processed = await CAPIService.processPendingEvents((ws as any).id);
          if (processed > 0) {
            logger.info('CAPI events retried', { workspaceId: (ws as any).id, processed });
          }
        } catch (error) {
          logger.error('CAPI retry failed', { error: (error as Error).message });
        }
      }
    } catch (error) {
      // Silently handle if tables don't exist yet
    }
  });

  // ==========================================
  // [NEW] CAPI DAILY COUNTER RESET - midnight UTC
  // ==========================================
  cron.schedule('0 0 * * *', async () => {
    try {
      await CAPIService.resetDailyCounters();
      logger.info('CAPI daily counters reset');
    } catch (error) {
      // Silently handle
    }
  });

  // ==========================================
  // TOKEN EXPIRATION CHECK - daily at 9 AM UTC
  // ==========================================
  cron.schedule('0 9 * * *', async () => {
    logger.info('Checking token expirations');
    try {
      const expiring = await query(
        `SELECT aa.id, aa.meta_account_id, aa.workspace_id, aa.token_expires_at, w.name as workspace_name
         FROM ad_accounts aa
         JOIN workspaces w ON w.id = aa.workspace_id
         WHERE aa.is_active = true
           AND aa.token_expires_at IS NOT NULL
           AND aa.token_expires_at < NOW() + INTERVAL '7 days'`
      );

      for (const acc of expiring.rows) {
        const account = acc as any;
        const daysLeft = Math.ceil((new Date(account.token_expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        await query(
          `INSERT INTO notifications (id, workspace_id, channel, type, title, message, metadata)
           VALUES ($1, $2, 'in_app', 'token_expiring', 'Meta Token Expiring Soon', $3, $4)
           ON CONFLICT DO NOTHING`,
          [
            generateId(), account.workspace_id,
            `Access token for account ${account.meta_account_id} expires in ${daysLeft} days. Please reconnect your Meta account.`,
            JSON.stringify({ ad_account_id: account.id, days_left: daysLeft }),
          ]
        );
      }

      if (expiring.rows.length > 0) {
        logger.warn('Found expiring tokens', { count: expiring.rows.length });
      }
    } catch (error) {
      logger.error('Token check failed', { error: (error as Error).message });
    }
  });

  // ==========================================
  // CLEANUP - weekly (Sundays at 3 AM)
  // ==========================================
  cron.schedule('0 3 * * 0', async () => {
    logger.info('Running data cleanup');
    try {
      await query("DELETE FROM rule_executions WHERE triggered_at < NOW() - INTERVAL '90 days'");
      await query("DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '30 days' AND is_read = true");
      await query("DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '180 days'");
      await query("DELETE FROM sync_jobs WHERE started_at < NOW() - INTERVAL '30 days'");
      await query("DELETE FROM capi_events WHERE created_at < NOW() - INTERVAL '30 days' AND processing_status IN ('sent', 'deduped')");
      await query("DELETE FROM ai_recommendations WHERE status IN ('applied', 'dismissed', 'expired') AND created_at < NOW() - INTERVAL '30 days'");
      await query("DELETE FROM creative_performance WHERE date < NOW() - INTERVAL '90 days'");
      logger.info('Data cleanup completed');
    } catch (error) {
      logger.error('Cleanup job failed', { error: (error as Error).message });
    }
  });

  logger.info('All background jobs scheduled (v2.0: +6 new jobs — creative fatigue, AI audit, A/B testing, attribution sync, CAPI retry, CAPI counter reset)');
}
