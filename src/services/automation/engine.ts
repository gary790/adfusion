// ============================================
// AD FUSION - Automation Rule Engine
// Evaluate rules, execute actions, manage scheduling
// ============================================
import { MetaApiClient } from '../meta/client';
import { query, transaction } from '../../config/database';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import config from '../../config';
import {
  AutomationRule, RuleCondition, RuleAction, RuleExecution,
  ConditionOperator,
} from '../../types';

interface EntityMetrics {
  id: string;
  meta_id: string;
  name: string;
  status: string;
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  conversions: number;
  roas: number;
  cpa: number;
}

export class AutomationEngine {
  private workspaceId: string;

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
  }

  // ==========================================
  // EVALUATE ALL ACTIVE RULES
  // ==========================================
  async evaluateAllRules(): Promise<RuleExecution[]> {
    logger.info('Evaluating automation rules', { workspaceId: this.workspaceId });
    const executions: RuleExecution[] = [];

    try {
      // Get active rules
      const rulesResult = await query(
        `SELECT * FROM automation_rules
         WHERE workspace_id = $1 AND is_active = true
         ORDER BY created_at`,
        [this.workspaceId]
      );

      for (const ruleRow of rulesResult.rows) {
        const rule = ruleRow as any;

        // Check cooldown
        if (rule.last_triggered_at) {
          const cooldownMs = (rule.cooldown_period || 6) * 60 * 60 * 1000;
          if (Date.now() - new Date(rule.last_triggered_at).getTime() < cooldownMs) {
            logger.debug('Rule in cooldown', { ruleId: rule.id, name: rule.name });
            continue;
          }
        }

        try {
          const execution = await this.evaluateRule(rule);
          if (execution) {
            executions.push(execution);
          }
        } catch (error) {
          logger.error('Rule evaluation failed', {
            ruleId: rule.id,
            error: (error as Error).message,
          });

          // Log failed execution
          await this.logExecution(rule.id, {
            status: 'failed',
            error_message: (error as Error).message,
            conditions_met: {},
            actions_taken: {},
            affected_entities: [],
          });
        }
      }

      logger.info('Rule evaluation complete', {
        workspaceId: this.workspaceId,
        rulesChecked: rulesResult.rows.length,
        triggered: executions.length,
      });

      return executions;
    } catch (error) {
      logger.error('Rule evaluation batch failed', { error: (error as Error).message });
      throw error;
    }
  }

  // ==========================================
  // EVALUATE SINGLE RULE
  // ==========================================
  async evaluateRule(rule: any): Promise<RuleExecution | null> {
    const startTime = Date.now();

    // Get entities to check based on scope
    const entities = await this.getEntitiesForRule(rule);

    if (entities.length === 0) {
      return null;
    }

    const triggeredEntities: string[] = [];
    const conditionsMet: Record<string, unknown> = {};

    for (const entity of entities) {
      const conditionResults = this.evaluateConditions(
        rule.conditions,
        rule.condition_logic || 'AND',
        entity
      );

      if (conditionResults.allMet) {
        triggeredEntities.push(entity.id);
        conditionsMet[entity.id] = conditionResults.details;
      }
    }

    if (triggeredEntities.length === 0) {
      return null;
    }

    // Execute actions
    const actionResults = await this.executeActions(
      rule.actions,
      triggeredEntities,
      rule.scope
    );

    // Log execution
    const execution = await this.logExecution(rule.id, {
      status: actionResults.allSucceeded ? 'success' : 'partial',
      conditions_met: conditionsMet,
      actions_taken: actionResults.details,
      affected_entities: triggeredEntities,
      execution_time_ms: Date.now() - startTime,
    });

    // Update rule trigger info
    await query(
      `UPDATE automation_rules SET last_triggered_at = NOW(), trigger_count = trigger_count + 1 WHERE id = $1`,
      [rule.id]
    );

    // Create notification
    await this.createNotification(rule, triggeredEntities, actionResults);

    return execution;
  }

  // ==========================================
  // GET ENTITIES WITH METRICS
  // ==========================================
  private async getEntitiesForRule(rule: any): Promise<EntityMetrics[]> {
    const lookbackHours = rule.lookback_window || 24;
    const scopeIds = rule.scope_ids || [];
    const table = rule.scope === 'campaign' ? 'campaigns' : rule.scope === 'adset' ? 'adsets' : 'ads';
    const metaIdCol = rule.scope === 'campaign' ? 'meta_campaign_id' : rule.scope === 'adset' ? 'meta_adset_id' : 'meta_ad_id';

    let entityFilter = `AND e.status = 'ACTIVE'`;
    if (scopeIds.length > 0) {
      entityFilter += ` AND e.id IN (${scopeIds.map((_: string, i: number) => `$${i + 3}`).join(',')})`;
    }

    const params: unknown[] = [
      this.workspaceId,
      lookbackHours,
      ...(scopeIds.length > 0 ? scopeIds : []),
    ];

    const result = await query(
      `SELECT
        e.id, e.${metaIdCol} as meta_id, e.name, e.status,
        COALESCE(SUM(i.impressions), 0) as impressions,
        COALESCE(SUM(i.reach), 0) as reach,
        COALESCE(SUM(i.clicks), 0) as clicks,
        COALESCE(SUM(i.spend), 0) as spend,
        CASE WHEN SUM(i.impressions) > 0 THEN (SUM(i.clicks)::DECIMAL / SUM(i.impressions)) * 100 ELSE 0 END as ctr,
        CASE WHEN SUM(i.clicks) > 0 THEN SUM(i.spend) / SUM(i.clicks) ELSE 0 END as cpc,
        CASE WHEN SUM(i.impressions) > 0 THEN (SUM(i.spend) / SUM(i.impressions)) * 1000 ELSE 0 END as cpm,
        COALESCE(AVG(i.frequency), 0) as frequency
       FROM ${table} e
       LEFT JOIN ad_insights i ON i.${rule.scope}_id = e.id
         AND i.date_start >= NOW() - INTERVAL '${lookbackHours} hours'
       WHERE e.workspace_id = $1 ${entityFilter}
       GROUP BY e.id, e.${metaIdCol}, e.name, e.status`,
      params
    );

    return result.rows.map((r: any) => ({
      id: r.id,
      meta_id: r.meta_id,
      name: r.name,
      status: r.status,
      impressions: Number(r.impressions),
      reach: Number(r.reach),
      clicks: Number(r.clicks),
      spend: Number(r.spend),
      ctr: Number(r.ctr),
      cpc: Number(r.cpc),
      cpm: Number(r.cpm),
      frequency: Number(r.frequency),
      conversions: 0,
      roas: 0,
      cpa: 0,
    }));
  }

  // ==========================================
  // EVALUATE CONDITIONS
  // ==========================================
  private evaluateConditions(
    conditions: RuleCondition[],
    logic: 'AND' | 'OR',
    entity: EntityMetrics
  ): { allMet: boolean; details: Record<string, unknown> } {
    const details: Record<string, unknown> = {};
    const results: boolean[] = [];

    for (const condition of conditions) {
      const metricValue = this.getMetricValue(entity, condition.metric);
      const conditionMet = this.compareValues(metricValue, condition.operator, condition.value);

      details[condition.metric] = {
        actual: metricValue,
        operator: condition.operator,
        threshold: condition.value,
        met: conditionMet,
      };

      results.push(conditionMet);
    }

    const allMet = logic === 'AND'
      ? results.every(r => r)
      : results.some(r => r);

    return { allMet, details };
  }

  private getMetricValue(entity: EntityMetrics, metric: string): number {
    const metricMap: Record<string, number> = {
      impressions: entity.impressions,
      reach: entity.reach,
      clicks: entity.clicks,
      spend: entity.spend,
      ctr: entity.ctr,
      cpc: entity.cpc,
      cpm: entity.cpm,
      frequency: entity.frequency,
      conversions: entity.conversions,
      roas: entity.roas,
      cpa: entity.cpa,
    };
    return metricMap[metric] ?? 0;
  }

  private compareValues(actual: number, operator: ConditionOperator, threshold: number): boolean {
    switch (operator) {
      case 'greater_than': return actual > threshold;
      case 'less_than': return actual < threshold;
      case 'equal_to': return Math.abs(actual - threshold) < 0.0001;
      case 'greater_than_or_equal': return actual >= threshold;
      case 'less_than_or_equal': return actual <= threshold;
      default: return false;
    }
  }

  // ==========================================
  // EXECUTE ACTIONS
  // ==========================================
  private async executeActions(
    actions: RuleAction[],
    entityIds: string[],
    scope: string
  ): Promise<{ allSucceeded: boolean; details: Record<string, unknown> }> {
    const details: Record<string, unknown> = {};
    let allSucceeded = true;

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'pause':
            await this.executePause(entityIds, scope);
            details[action.type] = { success: true, entities: entityIds };
            break;

          case 'activate':
            await this.executeActivate(entityIds, scope);
            details[action.type] = { success: true, entities: entityIds };
            break;

          case 'increase_budget':
            const increaseResult = await this.executeBudgetChange(entityIds, scope, action.params as any, 'increase');
            details[action.type] = increaseResult;
            break;

          case 'decrease_budget':
            const decreaseResult = await this.executeBudgetChange(entityIds, scope, action.params as any, 'decrease');
            details[action.type] = decreaseResult;
            break;

          case 'send_notification':
            details[action.type] = { success: true, message: 'Notification sent' };
            break;

          default:
            details[action.type] = { success: false, error: 'Unknown action type' };
            allSucceeded = false;
        }
      } catch (error) {
        details[action.type] = { success: false, error: (error as Error).message };
        allSucceeded = false;
      }
    }

    return { allSucceeded, details };
  }

  private async executePause(entityIds: string[], scope: string): Promise<void> {
    const table = scope === 'campaign' ? 'campaigns' : scope === 'adset' ? 'adsets' : 'ads';
    const metaIdCol = scope === 'campaign' ? 'meta_campaign_id' : scope === 'adset' ? 'meta_adset_id' : 'meta_ad_id';

    for (const entityId of entityIds) {
      // Get entity and its ad account for Meta API call
      const entityResult = await query(
        `SELECT e.${metaIdCol} as meta_id, aa.access_token_encrypted
         FROM ${table} e
         JOIN ad_accounts aa ON aa.workspace_id = e.workspace_id
         WHERE e.id = $1`,
        [entityId]
      );

      if (entityResult.rows.length > 0) {
        const entity = entityResult.rows[0] as any;
        try {
          const metaClient = new MetaApiClient(entity.access_token_encrypted);
          if (scope === 'campaign') {
            await metaClient.updateCampaign(entity.meta_id, { status: 'PAUSED' });
          } else if (scope === 'adset') {
            await metaClient.updateAdSet(entity.meta_id, { status: 'PAUSED' });
          } else {
            await metaClient.updateAd(entity.meta_id, { status: 'PAUSED' });
          }
        } catch (error) {
          logger.warn('Meta API pause failed', { entityId, error: (error as Error).message });
        }

        // Update local DB
        await query(
          `UPDATE ${table} SET status = 'PAUSED' WHERE id = $1`,
          [entityId]
        );
      }
    }
  }

  private async executeActivate(entityIds: string[], scope: string): Promise<void> {
    const table = scope === 'campaign' ? 'campaigns' : scope === 'adset' ? 'adsets' : 'ads';
    const metaIdCol = scope === 'campaign' ? 'meta_campaign_id' : scope === 'adset' ? 'meta_adset_id' : 'meta_ad_id';

    for (const entityId of entityIds) {
      const entityResult = await query(
        `SELECT e.${metaIdCol} as meta_id, aa.access_token_encrypted
         FROM ${table} e
         JOIN ad_accounts aa ON aa.workspace_id = e.workspace_id
         WHERE e.id = $1`,
        [entityId]
      );

      if (entityResult.rows.length > 0) {
        const entity = entityResult.rows[0] as any;
        try {
          const metaClient = new MetaApiClient(entity.access_token_encrypted);
          if (scope === 'campaign') {
            await metaClient.updateCampaign(entity.meta_id, { status: 'ACTIVE' });
          } else if (scope === 'adset') {
            await metaClient.updateAdSet(entity.meta_id, { status: 'ACTIVE' });
          } else {
            await metaClient.updateAd(entity.meta_id, { status: 'ACTIVE' });
          }
        } catch (error) {
          logger.warn('Meta API activate failed', { entityId, error: (error as Error).message });
        }

        await query(
          `UPDATE ${table} SET status = 'ACTIVE' WHERE id = $1`,
          [entityId]
        );
      }
    }
  }

  private async executeBudgetChange(
    entityIds: string[],
    scope: string,
    params: { percentage?: number; amount?: number },
    direction: 'increase' | 'decrease'
  ): Promise<Record<string, unknown>> {
    const table = scope === 'campaign' ? 'campaigns' : scope === 'adset' ? 'adsets' : 'ads';
    const metaIdCol = scope === 'campaign' ? 'meta_campaign_id' : scope === 'adset' ? 'meta_adset_id' : 'meta_ad_id';
    const results: Record<string, unknown> = {};

    for (const entityId of entityIds) {
      const entityResult = await query(
        `SELECT e.${metaIdCol} as meta_id, e.daily_budget, aa.access_token_encrypted
         FROM ${table} e
         JOIN ad_accounts aa ON aa.workspace_id = e.workspace_id
         WHERE e.id = $1`,
        [entityId]
      );

      if (entityResult.rows.length > 0) {
        const entity = entityResult.rows[0] as any;
        const currentBudget = Number(entity.daily_budget) || 0;

        let changeAmount = 0;
        if (params.percentage) {
          // Cap at max 20% increase (safety)
          const cappedPercentage = Math.min(params.percentage, config.optimization.scaling.maxBudgetIncrease * 100);
          changeAmount = currentBudget * (cappedPercentage / 100);
        } else if (params.amount) {
          changeAmount = params.amount;
        }

        const newBudget = direction === 'increase'
          ? currentBudget + changeAmount
          : Math.max(1, currentBudget - changeAmount); // Never go below $1

        try {
          const metaClient = new MetaApiClient(entity.access_token_encrypted);
          if (scope === 'campaign') {
            await metaClient.updateCampaign(entity.meta_id, { daily_budget: newBudget });
          } else if (scope === 'adset') {
            await metaClient.updateAdSet(entity.meta_id, { daily_budget: newBudget });
          }

          await query(
            `UPDATE ${table} SET daily_budget = $1 WHERE id = $2`,
            [newBudget, entityId]
          );

          results[entityId] = {
            success: true,
            previous_budget: currentBudget,
            new_budget: newBudget,
            change: direction === 'increase' ? `+$${changeAmount.toFixed(2)}` : `-$${changeAmount.toFixed(2)}`,
          };
        } catch (error) {
          results[entityId] = { success: false, error: (error as Error).message };
        }
      }
    }

    return results;
  }

  // ==========================================
  // LOGGING & NOTIFICATIONS
  // ==========================================
  private async logExecution(
    ruleId: string,
    data: {
      status: string;
      conditions_met: Record<string, unknown>;
      actions_taken: Record<string, unknown>;
      affected_entities: string[];
      error_message?: string;
      execution_time_ms?: number;
    }
  ): Promise<RuleExecution> {
    const id = generateId();
    await query(
      `INSERT INTO rule_executions (id, rule_id, workspace_id, conditions_met, actions_taken, affected_entities, status, error_message, execution_time_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id, ruleId, this.workspaceId,
        JSON.stringify(data.conditions_met),
        JSON.stringify(data.actions_taken),
        JSON.stringify(data.affected_entities),
        data.status,
        data.error_message || null,
        data.execution_time_ms || null,
      ]
    );

    return {
      id,
      rule_id: ruleId,
      workspace_id: this.workspaceId,
      triggered_at: new Date(),
      conditions_met: data.conditions_met,
      actions_taken: data.actions_taken,
      affected_entities: data.affected_entities,
      status: data.status as any,
      error_message: data.error_message,
    };
  }

  private async createNotification(
    rule: any,
    affectedEntities: string[],
    actionResults: Record<string, unknown>
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO notifications (id, workspace_id, channel, type, title, message, metadata)
         VALUES ($1, $2, 'in_app', 'rule_triggered', $3, $4, $5)`,
        [
          generateId(),
          this.workspaceId,
          `Rule "${rule.name}" triggered`,
          `Rule executed on ${affectedEntities.length} ${rule.scope}(s). Actions: ${rule.actions.map((a: any) => a.type).join(', ')}`,
          JSON.stringify({
            rule_id: rule.id,
            affected_count: affectedEntities.length,
            actions: rule.actions.map((a: any) => a.type),
          }),
        ]
      );
    } catch (error) {
      logger.warn('Failed to create notification', { error: (error as Error).message });
    }
  }
}
