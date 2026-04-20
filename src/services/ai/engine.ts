// ============================================
// AD FUSION - AI Optimization Engine
// Performance diagnosis, copy generation, recommendations
// Powered by OpenAI GPT-4o
// ============================================
import OpenAI from 'openai';
import config from '../../config';
import { query } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import {
  AnalysisResult, Finding, Recommendation, PredictedImpact,
  CopyGenerationRequest, GeneratedCopy, CopyFramework,
  PerformanceSummary, AnalysisType,
} from '../../types';

export class AIOptimizationEngine {
  private openai: OpenAI;
  private workspaceId: string;

  constructor(workspaceId: string) {
    this.openai = new OpenAI({ apiKey: config.openai.apiKey });
    this.workspaceId = workspaceId;
  }

  // ==========================================
  // PERFORMANCE DIAGNOSIS
  // ==========================================
  async analyzeCampaignPerformance(
    campaignId: string,
    metrics: Record<string, unknown>,
    historicalData: Record<string, unknown>[]
  ): Promise<AnalysisResult> {
    const startTime = Date.now();

    const systemPrompt = `You are a world-class Meta (Facebook) ads optimization expert with deep knowledge of:
- Meta Marketing API and campaign structure (Campaign → Ad Set → Ad)
- Performance metrics: CTR, CPC, CPM, ROAS, CPA, frequency, reach, impressions
- Creative fatigue detection (frequency > 3.0, CTR declining > 20%)
- Learning phase mechanics (50 optimization events/week, 3-7 days, resets on >20% budget changes)
- iOS 14.5+ attribution impacts (20-30% conversions unattributed, SKAN limitations)
- Budget optimization strategies (never increase >20% at once, min 3 days data)
- Audience saturation indicators (rising CPM, declining CTR, frequency > 2.5)
- Industry benchmarks: avg CTR 0.90-1.5%, avg CPC $0.50-$2.00, avg CPM $8-$15

IMPORTANT: Provide specific, actionable recommendations with exact numbers and thresholds.
Never give generic advice. Base every recommendation on the actual data provided.

Output your analysis as valid JSON matching this exact structure:
{
  "summary": "One paragraph executive summary",
  "findings": [
    {
      "category": "string (creative_fatigue | audience_saturation | budget | bidding | targeting | creative | learning_phase)",
      "severity": "critical | warning | info",
      "message": "specific finding with numbers",
      "metric_name": "the metric",
      "current_value": number,
      "benchmark_value": number,
      "trend": "improving | declining | stable"
    }
  ],
  "recommendations": [
    {
      "id": "uuid",
      "priority": "high | medium | low",
      "category": "string",
      "title": "clear action title",
      "description": "detailed explanation with specific steps",
      "action_type": "pause | activate | increase_budget | decrease_budget | set_budget | send_notification",
      "action_params": {},
      "estimated_impact": "e.g., +15-25% CTR improvement",
      "confidence": 0.0 to 1.0,
      "auto_applicable": true/false
    }
  ],
  "predicted_impact": {
    "metric": "primary metric to improve",
    "current_value": number,
    "predicted_value": number,
    "change_percentage": number,
    "confidence_interval": [low, high],
    "timeframe_days": number
  }
}`;

    const userPrompt = `Analyze this Meta ad campaign performance:

CURRENT METRICS (Last 7 Days):
${JSON.stringify(metrics, null, 2)}

HISTORICAL DAILY DATA (Last 30 Days):
${JSON.stringify(historicalData, null, 2)}

OPTIMIZATION THRESHOLDS:
- Creative fatigue: frequency > ${config.optimization.creativeFatigue.maxFrequency}, CTR drop > ${config.optimization.creativeFatigue.ctrDropThreshold * 100}%
- Learning phase: needs ${config.optimization.learningPhase.minOptimizationEvents} events/week, max ${config.optimization.learningPhase.maxDays} days
- Scaling: max budget increase ${config.optimization.scaling.maxBudgetIncrease * 100}%, min ${config.optimization.scaling.minDataDays} days data, min ${config.optimization.scaling.minConversions} conversions
- Diagnostics: CPM spike > ${config.optimization.diagnostics.cpmSpikeThreshold * 100}%, CTR floor ${config.optimization.diagnostics.ctrFloor * 100}%, conversion rate floor ${config.optimization.diagnostics.conversionRateFloor * 100}%

Provide a comprehensive analysis with specific, data-driven recommendations.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: config.openai.maxTokens,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}') as AnalysisResult;
      const processingTime = Date.now() - startTime;

      // Store analysis
      await query(
        `INSERT INTO ai_analyses (id, workspace_id, analysis_type, target_id, target_type, input_data, analysis_result, confidence_score, model_used, tokens_used, processing_time_ms)
         VALUES ($1, $2, 'performance_diagnosis', $3, 'campaign', $4, $5, $6, $7, $8, $9)`,
        [
          generateId(), this.workspaceId, campaignId,
          JSON.stringify({ metrics, historicalDataPoints: historicalData.length }),
          JSON.stringify(result),
          result.predicted_impact?.change_percentage ? Math.min(Math.abs(result.predicted_impact.change_percentage) / 100, 1) : 0.7,
          config.openai.model,
          response.usage?.total_tokens || 0,
          processingTime,
        ]
      );

      // Track usage
      await this.trackUsage();

      return result;
    } catch (error) {
      logger.error('AI analysis failed', { error: (error as Error).message, campaignId });
      throw error;
    }
  }

  // ==========================================
  // AD COPY GENERATION
  // ==========================================
  async generateAdCopy(request: CopyGenerationRequest): Promise<GeneratedCopy[]> {
    const startTime = Date.now();
    const variationsCount = request.variations_count || 3;

    const systemPrompt = `You are a world-class direct response copywriter specializing in Meta (Facebook/Instagram) ads.
You master these proven copywriting frameworks:
- AIDA: Attention → Interest → Desire → Action
- PAS: Problem → Agitate → Solution
- BAB: Before → After → Bridge
- FAB: Features → Advantages → Benefits
- PASTOR: Problem → Amplify → Story → Transformation → Offer → Response
- QUEST: Qualify → Understand → Educate → Stimulate → Transition
- STAR: Situation → Task → Action → Result
- 4Ps: Promise → Picture → Proof → Push

Meta Ad Copy Best Practices:
1. Hook in first 3 words (pattern interrupt, question, bold claim, number, controversy)
2. Primary text: 125 chars visible, max 1,000. Front-load the value prop.
3. Headlines: max 40 chars for best display
4. Description: max 30 chars
5. Use social proof, urgency, curiosity gaps
6. Include specific numbers and results
7. Write for mobile-first (short paragraphs, emojis strategically)
8. Match the tone to the target audience
9. Include clear CTA aligned with the campaign objective

Output EXACTLY ${variationsCount} variations as a JSON array:
[
  {
    "id": "uuid",
    "headline": "max 40 chars",
    "primary_text": "the main ad copy (125-500 chars ideal)",
    "description": "max 30 chars",
    "call_to_action": "LEARN_MORE | SHOP_NOW | SIGN_UP | etc",
    "framework_used": "AIDA | PAS | BAB | FAB | etc",
    "hooks": ["hook1", "hook2", "hook3"],
    "score": 0-100,
    "reasoning": "why this copy will work for this audience"
  }
]`;

    const userPrompt = `Generate ${variationsCount} high-converting Meta ad copy variations:

PRODUCT/SERVICE: ${request.product_name}
DESCRIPTION: ${request.product_description}
TARGET AUDIENCE: ${request.target_audience}
TONE: ${request.tone}
CAMPAIGN OBJECTIVE: ${request.objective}
${request.frameworks?.length ? `PREFERRED FRAMEWORKS: ${request.frameworks.join(', ')}` : ''}
${request.key_benefits?.length ? `KEY BENEFITS:\n${request.key_benefits.map(b => `- ${b}`).join('\n')}` : ''}
${request.pain_points?.length ? `PAIN POINTS:\n${request.pain_points.map(p => `- ${p}`).join('\n')}` : ''}
${request.brand_guidelines ? `BRAND GUIDELINES: ${request.brand_guidelines}` : ''}
${request.existing_copy ? `EXISTING COPY (improve on this): ${request.existing_copy}` : ''}
${request.competitor_examples?.length ? `COMPETITOR EXAMPLES:\n${request.competitor_examples.join('\n')}` : ''}
${request.call_to_action ? `PREFERRED CTA: ${request.call_to_action}` : ''}
${request.character_limit ? `CHARACTER LIMIT: ${request.character_limit}` : ''}

Use different frameworks for each variation. Score each honestly (70+ is good, 85+ is excellent).`;

    try {
      const response = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: config.openai.maxTokens,
        temperature: 0.7, // Higher creativity for copy
        response_format: { type: 'json_object' },
      });

      const rawResult = JSON.parse(response.choices[0].message.content || '{}');
      const copies: GeneratedCopy[] = Array.isArray(rawResult) ? rawResult : (rawResult.variations || rawResult.copies || [rawResult]);

      // Ensure IDs
      const result = copies.map(c => ({
        ...c,
        id: c.id || generateId(),
      }));

      const processingTime = Date.now() - startTime;

      // Store each generated copy
      for (const copy of result) {
        await query(
          `INSERT INTO ai_generated_copy (id, workspace_id, request_params, headline, primary_text, description, call_to_action, framework_used, hooks, score, reasoning, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            copy.id, this.workspaceId, JSON.stringify(request),
            copy.headline, copy.primary_text, copy.description || null,
            copy.call_to_action, copy.framework_used,
            JSON.stringify(copy.hooks || []),
            copy.score || 0, copy.reasoning || null, null,
          ]
        );
      }

      // Store analysis record
      await query(
        `INSERT INTO ai_analyses (id, workspace_id, analysis_type, target_id, target_type, input_data, analysis_result, confidence_score, model_used, tokens_used, processing_time_ms)
         VALUES ($1, $2, 'copy_generation', $3, 'account', $4, $5, $6, $7, $8, $9)`,
        [
          generateId(), this.workspaceId, this.workspaceId,
          JSON.stringify(request),
          JSON.stringify({ copies: result }),
          (result.reduce((sum, c) => sum + (c.score || 0), 0) / result.length) / 100,
          config.openai.model,
          response.usage?.total_tokens || 0,
          processingTime,
        ]
      );

      await this.trackUsage();
      return result;
    } catch (error) {
      logger.error('AI copy generation failed', { error: (error as Error).message });
      throw error;
    }
  }

  // ==========================================
  // HEADLINE GENERATION
  // ==========================================
  async generateHeadlines(
    productInfo: string,
    audience: string,
    count: number = 10
  ): Promise<Array<{ headline: string; hook_type: string; score: number }>> {
    const response = await this.openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: 'system',
          content: `You are a Meta ads headline specialist. Generate exactly ${count} headlines (max 40 chars each).
Use diverse hook types: question, number, how-to, bold claim, curiosity gap, social proof, urgency, controversy, story, benefit.
Output as JSON array: [{"headline": "text", "hook_type": "type", "score": 0-100}]`,
        },
        {
          role: 'user',
          content: `Product: ${productInfo}\nTarget Audience: ${audience}\n\nGenerate ${count} high-converting Meta ad headlines.`,
        },
      ],
      max_tokens: 2000,
      temperature: 0.8,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    await this.trackUsage();
    return Array.isArray(result) ? result : (result.headlines || []);
  }

  // ==========================================
  // AUDIENCE RECOMMENDATION
  // ==========================================
  async recommendAudiences(
    productInfo: string,
    currentTargeting: Record<string, unknown>,
    performanceData: Record<string, unknown>
  ): Promise<AnalysisResult> {
    const response = await this.openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: 'system',
          content: `You are a Meta ads audience targeting expert. Analyze current targeting and performance to recommend audience improvements.
Consider: interest expansion, lookalike audiences, demographic adjustments, placement optimization, dayparting.
Output as the standard AnalysisResult JSON with findings and recommendations.`,
        },
        {
          role: 'user',
          content: `Product: ${productInfo}\n\nCurrent Targeting:\n${JSON.stringify(currentTargeting, null, 2)}\n\nPerformance:\n${JSON.stringify(performanceData, null, 2)}`,
        },
      ],
      max_tokens: config.openai.maxTokens,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });

    await this.trackUsage();
    return JSON.parse(response.choices[0].message.content || '{}');
  }

  // ==========================================
  // BUDGET OPTIMIZATION
  // ==========================================
  async optimizeBudget(
    campaigns: Array<{
      id: string;
      name: string;
      daily_budget: number;
      metrics: Record<string, unknown>;
    }>,
    totalBudget: number
  ): Promise<AnalysisResult> {
    const response = await this.openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: 'system',
          content: `You are a Meta ads budget allocation expert. Given multiple campaigns and a total daily budget, recommend optimal budget distribution.
Rules:
- Never increase any campaign budget by more than 20% at once
- Campaigns with ROAS > 3 should get more budget
- Campaigns in learning phase should not have budget changed
- Campaigns with CTR < 0.8% may need pausing instead of more budget
- Always leave 10-15% buffer for testing new campaigns
Output recommendations as AnalysisResult JSON.`,
        },
        {
          role: 'user',
          content: `Total Daily Budget: $${totalBudget}\n\nCampaigns:\n${JSON.stringify(campaigns, null, 2)}`,
        },
      ],
      max_tokens: config.openai.maxTokens,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    await this.trackUsage();
    return JSON.parse(response.choices[0].message.content || '{}');
  }

  // ==========================================
  // CREATIVE FATIGUE DETECTION
  // ==========================================
  async detectCreativeFatigue(
    adId: string,
    dailyMetrics: Array<{
      date: string;
      impressions: number;
      clicks: number;
      ctr: number;
      frequency: number;
      spend: number;
    }>
  ): Promise<{
    is_fatigued: boolean;
    fatigue_score: number; // 0-100
    signals: string[];
    recommendation: string;
  }> {
    if (dailyMetrics.length < 3) {
      return { is_fatigued: false, fatigue_score: 0, signals: ['Insufficient data'], recommendation: 'Need at least 3 days of data' };
    }

    // Algorithmic detection (no AI needed for simple checks)
    const signals: string[] = [];
    let fatigueScore = 0;

    // Check frequency
    const latestFrequency = dailyMetrics[dailyMetrics.length - 1].frequency;
    if (latestFrequency > config.optimization.creativeFatigue.maxFrequency) {
      signals.push(`Frequency at ${latestFrequency.toFixed(1)} (threshold: ${config.optimization.creativeFatigue.maxFrequency})`);
      fatigueScore += 30;
    }

    // Check CTR trend
    const recentCtr = dailyMetrics.slice(-3).reduce((sum, d) => sum + d.ctr, 0) / 3;
    const earlierCtr = dailyMetrics.slice(0, Math.min(7, dailyMetrics.length)).reduce((sum, d) => sum + d.ctr, 0) / Math.min(7, dailyMetrics.length);
    const ctrDrop = earlierCtr > 0 ? (earlierCtr - recentCtr) / earlierCtr : 0;

    if (ctrDrop > config.optimization.creativeFatigue.ctrDropThreshold) {
      signals.push(`CTR dropped ${(ctrDrop * 100).toFixed(1)}% (${earlierCtr.toFixed(3)}% → ${recentCtr.toFixed(3)}%)`);
      fatigueScore += 40;
    }

    // Check total impressions
    const totalImpressions = dailyMetrics.reduce((sum, d) => sum + d.impressions, 0);
    if (totalImpressions < config.optimization.creativeFatigue.minImpressions) {
      signals.push('Below minimum impressions threshold — fatigue detection unreliable');
      fatigueScore = Math.max(0, fatigueScore - 20);
    }

    // Check CPM trend (rising CPM = auction pressure from saturation)
    const recentCpm = dailyMetrics.slice(-3);
    const earlierCpm = dailyMetrics.slice(0, Math.min(7, dailyMetrics.length));
    if (recentCpm.length > 0 && earlierCpm.length > 0) {
      const avgRecentSpendPerImp = recentCpm.reduce((sum, d) => sum + (d.impressions > 0 ? d.spend / d.impressions * 1000 : 0), 0) / recentCpm.length;
      const avgEarlierSpendPerImp = earlierCpm.reduce((sum, d) => sum + (d.impressions > 0 ? d.spend / d.impressions * 1000 : 0), 0) / earlierCpm.length;
      
      if (avgEarlierSpendPerImp > 0 && (avgRecentSpendPerImp - avgEarlierSpendPerImp) / avgEarlierSpendPerImp > 0.15) {
        signals.push('CPM rising >15% — potential audience saturation');
        fatigueScore += 20;
      }
    }

    const isFatigued = fatigueScore >= 50;
    let recommendation = '';
    if (fatigueScore >= 70) {
      recommendation = 'CRITICAL: Replace creative immediately. Pause current ad and launch fresh creative variants.';
    } else if (fatigueScore >= 50) {
      recommendation = 'Creative is showing fatigue. Prepare replacement creatives and consider expanding audience.';
    } else if (fatigueScore >= 30) {
      recommendation = 'Early fatigue signals detected. Monitor closely and have backup creatives ready.';
    } else {
      recommendation = 'Creative performance is healthy. Continue monitoring.';
    }

    return { is_fatigued: isFatigued, fatigue_score: fatigueScore, signals, recommendation };
  }

  // ==========================================
  // SCALING READINESS CHECK
  // ==========================================
  async checkScalingReadiness(
    campaignMetrics: {
      daily_budget: number;
      days_running: number;
      total_conversions: number;
      roas: number;
      cpa: number;
      ctr: number;
      cpm: number;
      learning_stage?: string;
    }
  ): Promise<{
    ready_to_scale: boolean;
    score: number;
    blockers: string[];
    recommended_budget: number;
    strategy: string;
  }> {
    const blockers: string[] = [];
    let score = 0;

    // Check learning phase
    if (campaignMetrics.learning_stage === 'LEARNING') {
      blockers.push('Campaign is still in learning phase — do not scale yet');
    } else {
      score += 20;
    }

    // Check data sufficiency
    if (campaignMetrics.days_running >= config.optimization.scaling.minDataDays) {
      score += 20;
    } else {
      blockers.push(`Only ${campaignMetrics.days_running} days of data (need ${config.optimization.scaling.minDataDays}+)`);
    }

    // Check conversions
    if (campaignMetrics.total_conversions >= config.optimization.scaling.minConversions) {
      score += 20;
    } else {
      blockers.push(`Only ${campaignMetrics.total_conversions} conversions (need ${config.optimization.scaling.minConversions}+)`);
    }

    // Check ROAS
    if (campaignMetrics.roas >= config.optimization.scaling.roasFloor) {
      score += 20;
    } else {
      blockers.push(`ROAS at ${campaignMetrics.roas.toFixed(2)}x (need ${config.optimization.scaling.roasFloor}x+)`);
    }

    // Check CTR health
    if (campaignMetrics.ctr >= config.optimization.diagnostics.ctrFloor * 100) {
      score += 20;
    } else {
      blockers.push(`CTR at ${campaignMetrics.ctr.toFixed(2)}% (below ${config.optimization.diagnostics.ctrFloor * 100}% floor)`);
    }

    const readyToScale = score >= 80 && blockers.length === 0;
    const maxIncrease = campaignMetrics.daily_budget * config.optimization.scaling.maxBudgetIncrease;
    const recommendedBudget = readyToScale
      ? campaignMetrics.daily_budget + maxIncrease
      : campaignMetrics.daily_budget;

    let strategy = '';
    if (readyToScale) {
      if (campaignMetrics.roas > 3) {
        strategy = `Strong ROAS (${campaignMetrics.roas.toFixed(1)}x). Increase budget by 20% to $${recommendedBudget.toFixed(2)}/day. Monitor for 3 days before next increase.`;
      } else {
        strategy = `Moderate ROAS. Increase budget by 15% to $${(campaignMetrics.daily_budget * 1.15).toFixed(2)}/day. Watch CPA closely.`;
      }
    } else {
      strategy = `Not ready to scale. Address blockers first: ${blockers.join('; ')}`;
    }

    return { ready_to_scale: readyToScale, score, blockers, recommended_budget: recommendedBudget, strategy };
  }

  // ==========================================
  // USAGE TRACKING
  // ==========================================
  private async trackUsage(): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      await query(
        `INSERT INTO api_usage (id, workspace_id, usage_type, count, period_start, period_end)
         VALUES ($1, $2, 'ai_request', 1, $3, $3)
         ON CONFLICT (workspace_id, usage_type, period_start)
         DO UPDATE SET count = api_usage.count + 1`,
        [generateId(), this.workspaceId, today]
      );
    } catch (error) {
      logger.warn('Failed to track AI usage', { error: (error as Error).message });
    }
  }
}
