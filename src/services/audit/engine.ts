// ============================================
// AD FUSION v2.0 - Proactive AI Audit Engine
// Daily account health audit, auto-recommendations
// ============================================
import OpenAI from 'openai';
import config from '../../config';
import { query } from '../../config/database';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { AuditFinding, AIRecommendation, RecommendationCategory } from '../../types';

export class ProactiveAuditEngine {
  private openai: OpenAI;
  private workspaceId: string;

  constructor(workspaceId: string) {
    this.openai = new OpenAI({ apiKey: config.openai.apiKey });
    this.workspaceId = workspaceId;
  }

  // ==========================================
  // RUN FULL AUDIT
  // ==========================================
  async runAudit(runType: 'scheduled' | 'manual' | 'triggered' = 'manual'): Promise<{
    audit_id: string;
    health_score: number;
    findings: AuditFinding[];
    recommendations_count: number;
  }> {
    const auditId = generateId();
    const startTime = Date.now();

    await query(
      `INSERT INTO ai_audit_runs (id, workspace_id, run_type, status) VALUES ($1, $2, $3, 'running')`,
      [auditId, this.workspaceId, runType]
    );

    try {
      const findings: AuditFinding[] = [];
      let entitiesScanned = 0;

      // 1. Creative Health Check
      const creativeFindings = await this.auditCreativeHealth();
      findings.push(...creativeFindings.findings);
      entitiesScanned += creativeFindings.scanned;

      // 2. Budget Efficiency Check
      const budgetFindings = await this.auditBudgetEfficiency();
      findings.push(...budgetFindings.findings);
      entitiesScanned += budgetFindings.scanned;

      // 3. Andromeda Readiness Check
      const andromedaFindings = await this.auditAndromedaReadiness();
      findings.push(...andromedaFindings.findings);
      entitiesScanned += andromedaFindings.scanned;

      // 4. Signal Strength (CAPI)
      const signalFindings = await this.auditSignalStrength();
      findings.push(...signalFindings.findings);

      // 5. Structure Health
      const structureFindings = await this.auditCampaignStructure();
      findings.push(...structureFindings.findings);
      entitiesScanned += structureFindings.scanned;

      // Calculate health score
      const healthScore = this.calculateHealthScore(findings);

      // Generate AI-powered recommendations from findings
      const recommendations = await this.generateRecommendations(findings, auditId);

      // Auto-apply if enabled
      let autoApplied = 0;
      // Auto-apply logic would go here if enabled

      // Update audit run
      const processingTime = Date.now() - startTime;
      await query(
        `UPDATE ai_audit_runs SET
          status = 'completed', entities_scanned = $1, issues_found = $2,
          recommendations_generated = $3, auto_applied_count = $4,
          health_score = $5, findings = $6, completed_at = NOW(), processing_time_ms = $7
         WHERE id = $8`,
        [
          entitiesScanned, findings.filter(f => f.severity !== 'success').length,
          recommendations.length, autoApplied, healthScore,
          JSON.stringify(findings), processingTime, auditId,
        ]
      );

      // Create notification
      await query(
        `INSERT INTO notifications (id, workspace_id, channel, type, title, message, metadata)
         VALUES ($1, $2, 'in_app', 'audit_complete', $3, $4, $5)`,
        [
          generateId(), this.workspaceId,
          `Account Health Audit: ${healthScore.toFixed(0)}/100`,
          `Scanned ${entitiesScanned} entities. Found ${findings.filter(f => f.severity === 'critical').length} critical, ${findings.filter(f => f.severity === 'warning').length} warnings. Generated ${recommendations.length} recommendations.`,
          JSON.stringify({ audit_id: auditId, health_score: healthScore }),
        ]
      );

      // Clear dashboard cache
      await cacheDel(`workspace:${this.workspaceId}:dashboard:*`);

      return { audit_id: auditId, health_score: healthScore, findings, recommendations_count: recommendations.length };
    } catch (error) {
      await query(`UPDATE ai_audit_runs SET status = 'failed', completed_at = NOW() WHERE id = $1`, [auditId]);
      throw error;
    }
  }

  // ==========================================
  // CREATIVE HEALTH AUDIT
  // ==========================================
  private async auditCreativeHealth(): Promise<{ findings: AuditFinding[]; scanned: number }> {
    const findings: AuditFinding[] = [];

    // Check fatigue status
    const fatigueResult = await query(
      `SELECT fatigue_status, COUNT(*) as count
       FROM creative_assets WHERE workspace_id = $1
       GROUP BY fatigue_status`,
      [this.workspaceId]
    );

    let scanned = 0;
    for (const row of fatigueResult.rows) {
      const r = row as any;
      scanned += Number(r.count);
      if (r.fatigue_status === 'critical') {
        findings.push({
          category: 'creative_fatigue', severity: 'critical',
          message: `${r.count} creative(s) at CRITICAL fatigue — replace immediately`,
          current_value: Number(r.count),
        });
      } else if (r.fatigue_status === 'fatigued') {
        findings.push({
          category: 'creative_fatigue', severity: 'warning',
          message: `${r.count} creative(s) showing fatigue — prepare replacements`,
          current_value: Number(r.count),
        });
      }
    }

    // Check diversity
    const diversityResult = await query(
      `SELECT COUNT(DISTINCT asset_type) as format_count, COUNT(*) as total
       FROM creative_assets WHERE workspace_id = $1`,
      [this.workspaceId]
    );
    const diversity = diversityResult.rows[0] as any;

    if (Number(diversity.total) < config.optimization.creativeFatigue.diversityTarget.minAdsPerAdSet) {
      findings.push({
        category: 'creative_diversity', severity: 'warning',
        message: `Only ${diversity.total} creatives — Andromeda works best with ${config.optimization.creativeFatigue.diversityTarget.minAdsPerAdSet}+ diverse ads`,
        current_value: Number(diversity.total),
        benchmark_value: config.optimization.creativeFatigue.diversityTarget.minAdsPerAdSet,
      });
    }

    if (Number(diversity.format_count) < 3) {
      findings.push({
        category: 'creative_diversity', severity: 'warning',
        message: `Only ${diversity.format_count} creative format(s) — mix static, video, UGC, and carousel for better Andromeda matching`,
        current_value: Number(diversity.format_count),
        benchmark_value: 4,
      });
    }

    return { findings, scanned };
  }

  // ==========================================
  // BUDGET EFFICIENCY AUDIT
  // ==========================================
  private async auditBudgetEfficiency(): Promise<{ findings: AuditFinding[]; scanned: number }> {
    const findings: AuditFinding[] = [];

    const campaigns = await query(
      `SELECT c.id, c.name, c.daily_budget, c.status,
        COALESCE(SUM(i.spend), 0) as spend_7d,
        COALESCE(SUM(i.impressions), 0) as impressions_7d,
        COALESCE(SUM(i.clicks), 0) as clicks_7d,
        CASE WHEN SUM(i.impressions) > 0 THEN (SUM(i.clicks)::DECIMAL / SUM(i.impressions)) * 100 ELSE 0 END as ctr_7d,
        CASE WHEN SUM(i.impressions) > 0 THEN (SUM(i.spend) / SUM(i.impressions)) * 1000 ELSE 0 END as cpm_7d
       FROM campaigns c
       LEFT JOIN ad_insights i ON i.campaign_id = c.id AND i.date_start >= NOW() - INTERVAL '7 days'
       WHERE c.workspace_id = $1 AND c.status = 'ACTIVE'
       GROUP BY c.id, c.name, c.daily_budget, c.status`,
      [this.workspaceId]
    );

    for (const row of campaigns.rows) {
      const c = row as any;
      const ctr = Number(c.ctr_7d);
      const cpm = Number(c.cpm_7d);

      if (ctr < config.optimization.diagnostics.ctrFloor * 100 && Number(c.impressions_7d) > 1000) {
        findings.push({
          category: 'budget_efficiency', severity: 'critical',
          entity_type: 'campaign', entity_id: c.id, entity_name: c.name,
          message: `Campaign "${c.name}" CTR ${ctr.toFixed(2)}% below ${(config.optimization.diagnostics.ctrFloor * 100).toFixed(1)}% floor — consider pausing or refreshing creative`,
          metric_name: 'ctr', current_value: ctr,
          benchmark_value: config.optimization.diagnostics.ctrFloor * 100,
        });
      }

      if (Number(c.spend_7d) > 0 && Number(c.clicks_7d) === 0) {
        findings.push({
          category: 'budget_efficiency', severity: 'critical',
          entity_type: 'campaign', entity_id: c.id, entity_name: c.name,
          message: `Campaign "${c.name}" spent $${Number(c.spend_7d).toFixed(2)} with ZERO clicks in 7 days`,
          metric_name: 'clicks', current_value: 0,
        });
      }
    }

    return { findings, scanned: campaigns.rows.length };
  }

  // ==========================================
  // ANDROMEDA READINESS AUDIT
  // ==========================================
  private async auditAndromedaReadiness(): Promise<{ findings: AuditFinding[]; scanned: number }> {
    const findings: AuditFinding[] = [];

    // Check for Advantage+ usage
    const advPlusResult = await query(
      `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_advantage_plus = true) as advantage_plus
       FROM campaigns WHERE workspace_id = $1 AND status = 'ACTIVE'`,
      [this.workspaceId]
    );

    const stats = advPlusResult.rows[0] as any;
    const total = Number(stats.total);
    const advPlus = Number(stats.advantage_plus);

    if (total > 0 && advPlus === 0 && config.optimization.andromeda.enabled) {
      findings.push({
        category: 'andromeda_readiness', severity: 'info',
        message: `None of your ${total} active campaigns use Advantage+. Meta's Andromeda engine delivers up to 22% higher ROAS with Advantage+ enabled.`,
        current_value: 0, benchmark_value: total,
      });
    }

    // Check for broad targeting (Andromeda prefers it)
    const narrowTargeting = await query(
      `SELECT COUNT(*) as count
       FROM adsets
       WHERE workspace_id = $1 AND status = 'ACTIVE'
         AND advantage_targeting = false
         AND (targeting::text LIKE '%interests%' OR targeting::text LIKE '%behaviors%')`,
      [this.workspaceId]
    );

    const narrowCount = Number((narrowTargeting.rows[0] as any).count);
    if (narrowCount > 0 && config.optimization.andromeda.broadTargetingPreferred) {
      findings.push({
        category: 'andromeda_readiness', severity: 'info',
        message: `${narrowCount} ad set(s) use narrow interest/behavior targeting. Andromeda's 10,000x more complex model performs better with broad targeting + Advantage+ audience.`,
        current_value: narrowCount,
      });
    }

    return { findings, scanned: total };
  }

  // ==========================================
  // SIGNAL STRENGTH AUDIT (CAPI)
  // ==========================================
  private async auditSignalStrength(): Promise<{ findings: AuditFinding[] }> {
    const findings: AuditFinding[] = [];

    const capiResult = await query(
      `SELECT COUNT(*) as count FROM capi_configurations WHERE workspace_id = $1 AND is_active = true`,
      [this.workspaceId]
    );

    if (Number((capiResult.rows[0] as any).count) === 0) {
      findings.push({
        category: 'signal_strength', severity: 'critical',
        message: 'No Conversions API (CAPI) configured. iOS 14.5+ causes 20-30% conversion under-reporting. Server-side tracking is essential for accurate attribution.',
        current_value: 0, benchmark_value: 1,
      });
    }

    return { findings };
  }

  // ==========================================
  // CAMPAIGN STRUCTURE AUDIT
  // ==========================================
  private async auditCampaignStructure(): Promise<{ findings: AuditFinding[]; scanned: number }> {
    const findings: AuditFinding[] = [];

    // Check for over-fragmentation
    const structureResult = await query(
      `SELECT objective, COUNT(*) as count
       FROM campaigns
       WHERE workspace_id = $1 AND status = 'ACTIVE'
       GROUP BY objective
       HAVING COUNT(*) > $2`,
      [this.workspaceId, config.optimization.andromeda.maxCampaignsPerObjective]
    );

    for (const row of structureResult.rows) {
      const r = row as any;
      findings.push({
        category: 'structure', severity: 'warning',
        message: `${r.count} active campaigns for "${r.objective}" objective. Consolidate to ${config.optimization.andromeda.maxCampaignsPerObjective} max for better Andromeda optimization.`,
        current_value: Number(r.count),
        benchmark_value: config.optimization.andromeda.maxCampaignsPerObjective,
      });
    }

    const totalResult = await query(
      `SELECT COUNT(*) as count FROM campaigns WHERE workspace_id = $1 AND status = 'ACTIVE'`,
      [this.workspaceId]
    );

    return { findings, scanned: Number((totalResult.rows[0] as any).count) };
  }

  // ==========================================
  // CALCULATE HEALTH SCORE
  // ==========================================
  private calculateHealthScore(findings: AuditFinding[]): number {
    let score = 100;

    for (const finding of findings) {
      switch (finding.severity) {
        case 'critical': score -= 15; break;
        case 'warning': score -= 8; break;
        case 'info': score -= 3; break;
        case 'success': score += 2; break;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  // ==========================================
  // GENERATE AI RECOMMENDATIONS
  // ==========================================
  private async generateRecommendations(findings: AuditFinding[], auditRunId: string): Promise<AIRecommendation[]> {
    if (findings.length === 0) return [];

    const criticalAndWarnings = findings.filter(f => f.severity === 'critical' || f.severity === 'warning');
    if (criticalAndWarnings.length === 0) return [];

    try {
      const response = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert Meta ads optimizer using Andromeda-era best practices (2025-2026).
Given audit findings, generate specific, actionable recommendations.
Each recommendation must be concrete with exact steps.

Output JSON array:
[{
  "category": "creative_refresh|budget_shift|audience_expansion|pause_underperformer|scale_winner|structure_change|andromeda_optimization|capi_setup|signal_improvement",
  "priority": "critical|high|medium|low",
  "title": "short action title",
  "description": "detailed steps to implement",
  "rationale": "data-driven justification from the findings",
  "action_type": "pause|increase_budget|decrease_budget|send_notification|null",
  "estimated_impact": {"metric": "ctr|roas|cpm|cpa", "predicted_change_pct": number, "confidence": 0-1},
  "auto_applicable": true/false
}]`,
          },
          {
            role: 'user',
            content: `Generate recommendations for these audit findings:\n\n${JSON.stringify(criticalAndWarnings, null, 2)}`,
          },
        ],
        max_tokens: 3000,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const rawResult = JSON.parse(response.choices[0].message.content || '{}');
      const recsArray = Array.isArray(rawResult) ? rawResult : (rawResult.recommendations || [rawResult]);

      const recommendations: AIRecommendation[] = [];

      for (const rec of recsArray) {
        const id = generateId();
        const finding = criticalAndWarnings.find(f => f.category === rec.category);

        await query(
          `INSERT INTO ai_recommendations (id, workspace_id, audit_run_id, category, priority, title, description, rationale, action_type, action_params, target_entity_type, target_entity_id, estimated_impact, auto_applicable)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            id, this.workspaceId, auditRunId,
            rec.category || 'general', rec.priority || 'medium',
            rec.title, rec.description, rec.rationale || null,
            rec.action_type || null, JSON.stringify(rec.action_params || {}),
            finding?.entity_type || null, finding?.entity_id || null,
            JSON.stringify(rec.estimated_impact || {}),
            rec.auto_applicable || false,
          ]
        );

        recommendations.push({
          id,
          workspace_id: this.workspaceId,
          audit_run_id: auditRunId,
          category: rec.category as RecommendationCategory,
          priority: rec.priority || 'medium',
          title: rec.title,
          description: rec.description,
          rationale: rec.rationale,
          action_type: rec.action_type,
          estimated_impact: rec.estimated_impact,
          status: 'pending',
          auto_applicable: rec.auto_applicable || false,
          auto_apply_approved: false,
          created_at: new Date(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
      }

      return recommendations;
    } catch (error) {
      logger.error('AI recommendation generation failed', { error: (error as Error).message });
      return [];
    }
  }

  // ==========================================
  // GET PENDING RECOMMENDATIONS
  // ==========================================
  async getPendingRecommendations(): Promise<any[]> {
    const result = await query(
      `SELECT * FROM ai_recommendations
       WHERE workspace_id = $1 AND status = 'pending' AND expires_at > NOW()
       ORDER BY
         CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         created_at DESC`,
      [this.workspaceId]
    );
    return result.rows;
  }

  // ==========================================
  // APPLY RECOMMENDATION
  // ==========================================
  async applyRecommendation(recommendationId: string, userId: string): Promise<void> {
    await query(
      `UPDATE ai_recommendations SET status = 'applied', applied_at = NOW(), applied_by = $1 WHERE id = $2 AND workspace_id = $3`,
      [userId, recommendationId, this.workspaceId]
    );
  }

  // ==========================================
  // DISMISS RECOMMENDATION
  // ==========================================
  async dismissRecommendation(recommendationId: string, reason: string): Promise<void> {
    await query(
      `UPDATE ai_recommendations SET status = 'dismissed', dismissed_reason = $1 WHERE id = $2 AND workspace_id = $3`,
      [reason, recommendationId, this.workspaceId]
    );
  }

  // ==========================================
  // GET AUDIT HISTORY
  // ==========================================
  async getAuditHistory(limit: number = 10): Promise<any[]> {
    const result = await query(
      `SELECT * FROM ai_audit_runs WHERE workspace_id = $1 ORDER BY started_at DESC LIMIT $2`,
      [this.workspaceId, limit]
    );
    return result.rows;
  }
}
