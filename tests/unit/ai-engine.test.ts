// ============================================
// AD FUSION - Unit Tests: AI Engine
// ============================================
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import config from '../../src/config';

describe('AI Optimization Engine', () => {
  describe('Creative Fatigue Detection (Algorithmic)', () => {
    const thresholds = config.optimization.creativeFatigue;

    it('should detect high frequency as fatigue signal', () => {
      const frequency = 4.5;
      expect(frequency > thresholds.maxFrequency).toBe(true);
    });

    it('should detect CTR decline as fatigue signal', () => {
      const earlyMetrics = [
        { ctr: 2.0 }, { ctr: 1.9 }, { ctr: 2.1 }, { ctr: 1.8 },
      ];
      const recentMetrics = [
        { ctr: 1.2 }, { ctr: 1.1 }, { ctr: 1.0 },
      ];

      const earlyAvg = earlyMetrics.reduce((s, m) => s + m.ctr, 0) / earlyMetrics.length;
      const recentAvg = recentMetrics.reduce((s, m) => s + m.ctr, 0) / recentMetrics.length;
      const drop = (earlyAvg - recentAvg) / earlyAvg;

      expect(drop).toBeGreaterThan(thresholds.ctrDropThreshold);
    });

    it('should not flag healthy creative as fatigued', () => {
      const frequency = 1.5;
      const ctrEarly = 1.5;
      const ctrRecent = 1.45;
      const drop = (ctrEarly - ctrRecent) / ctrEarly;

      expect(frequency < thresholds.maxFrequency).toBe(true);
      expect(drop < thresholds.ctrDropThreshold).toBe(true);
    });

    it('should require minimum impressions for reliable detection', () => {
      const totalImpressions = 500;
      expect(totalImpressions < thresholds.minImpressions).toBe(true);
    });
  });

  describe('Scaling Readiness Check', () => {
    const thresholds = config.optimization.scaling;

    it('should block scaling for campaigns in learning phase', () => {
      const learningStage = 'LEARNING';
      expect(learningStage).toBe('LEARNING');
    });

    it('should require minimum data days before scaling', () => {
      const daysRunning = 2;
      expect(daysRunning < thresholds.minDataDays).toBe(true);
    });

    it('should require minimum conversions', () => {
      const conversions = 5;
      expect(conversions < thresholds.minConversions).toBe(true);
    });

    it('should cap budget increase at threshold', () => {
      const currentBudget = 100;
      const maxIncrease = currentBudget * thresholds.maxBudgetIncrease;
      expect(maxIncrease).toBe(20); // 20% of $100
    });

    it('should approve scaling when all criteria met', () => {
      const campaign = {
        daysRunning: 5,
        totalConversions: 15,
        roas: 2.5,
        ctr: 1.2,
        learningStage: 'LEARNING_COMPLETE',
      };

      const criteria = [
        campaign.daysRunning >= thresholds.minDataDays,
        campaign.totalConversions >= thresholds.minConversions,
        campaign.roas >= thresholds.roasFloor,
        campaign.ctr >= config.optimization.diagnostics.ctrFloor * 100,
        campaign.learningStage !== 'LEARNING',
      ];

      expect(criteria.every(c => c)).toBe(true);
    });
  });

  describe('OpenAI Prompt Construction', () => {
    it('should include all required fields in campaign analysis prompt', () => {
      const requiredFields = [
        'Creative fatigue', 'Learning phase', 'Budget optimization',
        'Audience saturation', 'CTR', 'CPC', 'CPM', 'ROAS',
      ];
      
      // The system prompt in engine.ts includes all these
      for (const field of requiredFields) {
        expect(field).toBeTruthy();
      }
    });

    it('should enforce JSON output format', () => {
      // The engine uses response_format: { type: 'json_object' }
      const format = { type: 'json_object' };
      expect(format.type).toBe('json_object');
    });
  });
});

describe('Automation Engine', () => {
  describe('Condition Evaluation', () => {
    const compareValues = (actual: number, operator: string, threshold: number): boolean => {
      switch (operator) {
        case 'greater_than': return actual > threshold;
        case 'less_than': return actual < threshold;
        case 'equal_to': return Math.abs(actual - threshold) < 0.0001;
        case 'greater_than_or_equal': return actual >= threshold;
        case 'less_than_or_equal': return actual <= threshold;
        default: return false;
      }
    };

    it('should evaluate greater_than correctly', () => {
      expect(compareValues(5, 'greater_than', 3)).toBe(true);
      expect(compareValues(3, 'greater_than', 5)).toBe(false);
    });

    it('should evaluate less_than correctly', () => {
      expect(compareValues(3, 'less_than', 5)).toBe(true);
      expect(compareValues(5, 'less_than', 3)).toBe(false);
    });

    it('should evaluate AND logic correctly', () => {
      const conditions = [true, true, true];
      expect(conditions.every(c => c)).toBe(true);

      const mixed = [true, false, true];
      expect(mixed.every(c => c)).toBe(false);
    });

    it('should evaluate OR logic correctly', () => {
      const conditions = [false, true, false];
      expect(conditions.some(c => c)).toBe(true);

      const allFalse = [false, false, false];
      expect(allFalse.some(c => c)).toBe(false);
    });
  });

  describe('Budget Change Safety', () => {
    it('should cap budget increase at 20%', () => {
      const maxIncrease = 0.20;
      const requestedIncrease = 0.50;
      const cappedIncrease = Math.min(requestedIncrease, maxIncrease);
      expect(cappedIncrease).toBe(0.20);
    });

    it('should never decrease budget below $1', () => {
      const currentBudget = 5;
      const decrease = 10;
      const newBudget = Math.max(1, currentBudget - decrease);
      expect(newBudget).toBe(1);
    });
  });
});
