// ============================================
// AD FUSION v2.0 - A/B Testing Framework
// Statistical significance testing with auto-winner detection
// ============================================
import config from '../../config';
import { query } from '../../config/database';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { ABTest, ABTestVariant, ABVariantResult, StatisticalTestResult } from '../../types';

export class ABTestingEngine {
  private workspaceId: string;

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
  }

  // ==========================================
  // CREATE A/B TEST
  // ==========================================
  async createTest(params: {
    name: string;
    description?: string;
    test_type: string;
    hypothesis?: string;
    primary_metric?: string;
    confidence_level?: number;
    minimum_sample_size?: number;
    variants: Array<{ name: string; entity_type: string; entity_id: string; meta_id?: string; traffic_split: number; is_control: boolean }>;
    max_duration_days?: number;
    created_by?: string;
  }): Promise<string> {
    const id = generateId();
    const defaults = config.optimization.abTesting;

    const variants = params.variants.map(v => ({
      id: generateId(),
      ...v,
    }));

    // Validate traffic splits sum to 100
    const totalSplit = variants.reduce((sum, v) => sum + v.traffic_split, 0);
    if (Math.abs(totalSplit - 100) > 0.01) {
      throw new Error(`Traffic splits must sum to 100%, got ${totalSplit}%`);
    }

    // Ensure exactly one control
    const controlCount = variants.filter(v => v.is_control).length;
    if (controlCount !== 1) {
      throw new Error('Exactly one variant must be marked as control');
    }

    await query(
      `INSERT INTO ab_tests (id, workspace_id, name, description, test_type, hypothesis, primary_metric, confidence_level, minimum_sample_size, minimum_conversions, variants, max_duration_days, auto_end_on_significance, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        id, this.workspaceId, params.name, params.description || null,
        params.test_type, params.hypothesis || null,
        params.primary_metric || 'ctr',
        params.confidence_level || defaults.defaultConfidence,
        params.minimum_sample_size || defaults.minSampleSize,
        defaults.minConversions,
        JSON.stringify(variants),
        params.max_duration_days || defaults.maxDurationDays,
        defaults.autoEndOnSignificance,
        params.created_by || null,
      ]
    );

    return id;
  }

  // ==========================================
  // START TEST
  // ==========================================
  async startTest(testId: string): Promise<void> {
    await query(
      `UPDATE ab_tests SET status = 'running', started_at = NOW() WHERE id = $1 AND workspace_id = $2 AND status = 'draft'`,
      [testId, this.workspaceId]
    );
  }

  // ==========================================
  // EVALUATE RUNNING TESTS
  // ==========================================
  async evaluateRunningTests(): Promise<{ evaluated: number; winners_found: number }> {
    let evaluated = 0;
    let winnersFound = 0;

    const tests = await query(
      `SELECT * FROM ab_tests WHERE workspace_id = $1 AND status = 'running'`,
      [this.workspaceId]
    );

    for (const row of tests.rows) {
      const test = row as any;
      try {
        const result = await this.evaluateTest(test);
        evaluated++;
        if (result.winner_found) winnersFound++;
      } catch (error) {
        logger.error('A/B test evaluation failed', { testId: test.id, error: (error as Error).message });
      }
    }

    return { evaluated, winners_found: winnersFound };
  }

  private async evaluateTest(test: any): Promise<{ winner_found: boolean }> {
    const variants = test.variants || [];
    const results: Record<string, ABVariantResult> = {};

    // Collect metrics for each variant
    for (const variant of variants) {
      const metricsResult = await query(
        `SELECT
          COALESCE(SUM(i.impressions), 0) as impressions,
          COALESCE(SUM(i.clicks), 0) as clicks,
          CASE WHEN SUM(i.impressions) > 0 THEN (SUM(i.clicks)::DECIMAL / SUM(i.impressions)) * 100 ELSE 0 END as ctr,
          COALESCE(SUM(i.spend), 0) as spend,
          CASE WHEN SUM(i.clicks) > 0 THEN SUM(i.spend) / SUM(i.clicks) ELSE 0 END as cpc,
          CASE WHEN SUM(i.impressions) > 0 THEN (SUM(i.spend) / SUM(i.impressions)) * 1000 ELSE 0 END as cpm
         FROM ad_insights i
         WHERE i.${variant.entity_type}_id = $1
           AND i.workspace_id = $2
           AND i.date_start >= $3`,
        [variant.entity_id, this.workspaceId, test.started_at]
      );

      const m = metricsResult.rows[0] as any;
      results[variant.id] = {
        impressions: Number(m.impressions),
        clicks: Number(m.clicks),
        ctr: Number(m.ctr),
        conversions: 0,
        spend: Number(m.spend),
        roas: 0,
        cpa: 0,
        cpc: Number(m.cpc),
        cpm: Number(m.cpm),
      };
    }

    // Run statistical significance test
    const control = variants.find((v: any) => v.is_control);
    const challengers = variants.filter((v: any) => !v.is_control);

    let bestChallenger: any = null;
    let bestTestResult: StatisticalTestResult | null = null;

    for (const challenger of challengers) {
      const controlResult = results[control.id];
      const challengerResult = results[challenger.id];

      const statResult = this.runZTest(
        controlResult,
        challengerResult,
        test.primary_metric,
        test.confidence_level || 0.95,
        test.minimum_sample_size
      );

      if (statResult.is_significant && (!bestTestResult || statResult.lift_percentage > bestTestResult.lift_percentage)) {
        bestChallenger = challenger;
        bestTestResult = statResult;
      }
    }

    // Update results
    await query(
      `UPDATE ab_tests SET results = $1 WHERE id = $2`,
      [JSON.stringify(results), test.id]
    );

    // Check for auto-completion
    let winnerFound = false;
    const daysRunning = Math.floor((Date.now() - new Date(test.started_at).getTime()) / (24 * 60 * 60 * 1000));

    if (bestTestResult?.is_significant && test.auto_end_on_significance) {
      // Winner found
      await query(
        `UPDATE ab_tests SET
          status = 'completed', winner_variant_id = $1,
          statistical_significance = $2, p_value = $3, lift_percentage = $4,
          ended_at = NOW()
         WHERE id = $5`,
        [
          bestChallenger.id,
          bestTestResult.confidence,
          bestTestResult.p_value,
          bestTestResult.lift_percentage,
          test.id,
        ]
      );

      // Create notification
      await query(
        `INSERT INTO notifications (id, workspace_id, channel, type, title, message, metadata)
         VALUES ($1, $2, 'in_app', 'ab_test_winner', $3, $4, $5)`,
        [
          generateId(), this.workspaceId,
          `A/B Test Winner: "${test.name}"`,
          `Variant "${bestChallenger.name}" beat control by ${bestTestResult.lift_percentage.toFixed(1)}% on ${test.primary_metric} with ${(bestTestResult.confidence * 100).toFixed(1)}% confidence.`,
          JSON.stringify({ test_id: test.id, winner_id: bestChallenger.id, lift: bestTestResult.lift_percentage }),
        ]
      );

      winnerFound = true;
    } else if (daysRunning >= test.max_duration_days) {
      // Max duration reached - end without winner
      await query(
        `UPDATE ab_tests SET status = 'completed', ended_at = NOW() WHERE id = $1`,
        [test.id]
      );
    }

    return { winner_found: winnerFound };
  }

  // ==========================================
  // STATISTICAL Z-TEST (Two-proportion)
  // ==========================================
  private runZTest(
    control: ABVariantResult,
    challenger: ABVariantResult,
    metric: string,
    requiredConfidence: number,
    minSampleSize: number
  ): StatisticalTestResult {
    // Get metric values based on primary metric
    let controlRate: number;
    let challengerRate: number;
    let controlN: number;
    let challengerN: number;

    switch (metric) {
      case 'ctr':
        controlRate = control.impressions > 0 ? control.clicks / control.impressions : 0;
        challengerRate = challenger.impressions > 0 ? challenger.clicks / challenger.impressions : 0;
        controlN = control.impressions;
        challengerN = challenger.impressions;
        break;
      case 'conversion_rate':
        controlRate = control.clicks > 0 ? control.conversions / control.clicks : 0;
        challengerRate = challenger.clicks > 0 ? challenger.conversions / challenger.clicks : 0;
        controlN = control.clicks;
        challengerN = challenger.clicks;
        break;
      default: // ctr as default
        controlRate = control.impressions > 0 ? control.clicks / control.impressions : 0;
        challengerRate = challenger.impressions > 0 ? challenger.clicks / challenger.impressions : 0;
        controlN = control.impressions;
        challengerN = challenger.impressions;
    }

    const sampleSizeSufficient = controlN >= minSampleSize && challengerN >= minSampleSize;

    if (!sampleSizeSufficient || controlN === 0 || challengerN === 0) {
      return {
        is_significant: false,
        p_value: 1,
        confidence: 0,
        z_score: 0,
        lift_percentage: 0,
        sample_size_sufficient: false,
        recommendation: `Need at least ${minSampleSize} impressions per variant. Control: ${controlN}, Challenger: ${challengerN}.`,
      };
    }

    // Pooled proportion
    const pooledP = (controlRate * controlN + challengerRate * challengerN) / (controlN + challengerN);
    const pooledSE = Math.sqrt(pooledP * (1 - pooledP) * (1 / controlN + 1 / challengerN));

    if (pooledSE === 0) {
      return {
        is_significant: false, p_value: 1, confidence: 0, z_score: 0,
        lift_percentage: 0, sample_size_sufficient: true,
        recommendation: 'No variance detected in the data.',
      };
    }

    const zScore = (challengerRate - controlRate) / pooledSE;
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore))); // Two-tailed
    const confidence = 1 - pValue;
    const liftPercentage = controlRate > 0 ? ((challengerRate - controlRate) / controlRate) * 100 : 0;
    const isSignificant = confidence >= requiredConfidence && challengerRate > controlRate;

    let recommendation: string;
    if (isSignificant) {
      recommendation = `Challenger wins with ${liftPercentage.toFixed(1)}% lift at ${(confidence * 100).toFixed(1)}% confidence. Apply the winning variant.`;
    } else if (confidence >= 0.8) {
      recommendation = `Trending positive (${(confidence * 100).toFixed(1)}% confidence) but not yet significant. Continue running.`;
    } else {
      recommendation = `No significant difference detected (${(confidence * 100).toFixed(1)}% confidence). Continue collecting data.`;
    }

    return {
      is_significant: isSignificant,
      p_value: pValue,
      confidence,
      z_score: zScore,
      lift_percentage: liftPercentage,
      sample_size_sufficient: sampleSizeSufficient,
      winner_variant_id: isSignificant ? 'challenger' : undefined,
      recommendation,
    };
  }

  // Normal CDF approximation (Abramowitz & Stegun)
  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * y);
  }

  // ==========================================
  // GET TEST RESULTS
  // ==========================================
  async getTestResults(testId: string): Promise<any> {
    const result = await query(
      `SELECT * FROM ab_tests WHERE id = $1 AND workspace_id = $2`,
      [testId, this.workspaceId]
    );

    if (result.rows.length === 0) throw new Error('A/B test not found');

    const test = result.rows[0] as any;
    const variants = test.variants || [];
    const results = test.results || {};

    // If test is running, get live results
    if (test.status === 'running') {
      const control = variants.find((v: any) => v.is_control);
      const challengers = variants.filter((v: any) => !v.is_control);

      const liveStats: any[] = [];
      for (const challenger of challengers) {
        if (results[control?.id] && results[challenger.id]) {
          const statResult = this.runZTest(
            results[control.id],
            results[challenger.id],
            test.primary_metric,
            test.confidence_level,
            test.minimum_sample_size
          );
          liveStats.push({ variant_id: challenger.id, variant_name: challenger.name, ...statResult });
        }
      }

      return { ...test, live_statistics: liveStats };
    }

    return test;
  }
}
