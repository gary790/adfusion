// ============================================
// AD FUSION v2.0 - Cross-Channel Attribution Service
// Blended ROAS/MER, multi-channel data import
// ============================================
import config from '../../config';
import { query } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { AttributionReport, BlendedMetrics } from '../../types';

export class AttributionEngine {
  private workspaceId: string;

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
  }

  // ==========================================
  // ADD ATTRIBUTION CHANNEL
  // ==========================================
  async addChannel(params: {
    channel_name: string;
    channel_type: string;
    api_credentials_encrypted?: string;
    import_config?: Record<string, unknown>;
  }): Promise<string> {
    const id = generateId();
    await query(
      `INSERT INTO attribution_channels (id, workspace_id, channel_name, channel_type, api_credentials_encrypted, import_config)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (workspace_id, channel_name) DO UPDATE SET
         channel_type = EXCLUDED.channel_type,
         api_credentials_encrypted = COALESCE(EXCLUDED.api_credentials_encrypted, attribution_channels.api_credentials_encrypted),
         import_config = COALESCE(EXCLUDED.import_config, attribution_channels.import_config)`,
      [id, this.workspaceId, params.channel_name, params.channel_type, params.api_credentials_encrypted || null, JSON.stringify(params.import_config || {})]
    );
    return id;
  }

  // ==========================================
  // AUTO-IMPORT META DATA FROM EXISTING INSIGHTS
  // ==========================================
  async importMetaData(): Promise<number> {
    // Auto-create Meta channel if not exists
    await this.addChannel({ channel_name: 'meta', channel_type: 'paid' });

    const channelResult = await query(
      `SELECT id FROM attribution_channels WHERE workspace_id = $1 AND channel_name = 'meta'`,
      [this.workspaceId]
    );
    const channelId = (channelResult.rows[0] as any)?.id;
    if (!channelId) return 0;

    // Import from ad_insights aggregated by date and campaign
    const result = await query(
      `INSERT INTO attribution_data (id, workspace_id, channel_id, date, spend, revenue, impressions, clicks, conversions, roas, cpa, campaign_name, campaign_id)
       SELECT
         uuid_generate_v4(),
         i.workspace_id,
         $2,
         i.date_start,
         SUM(i.spend),
         0, -- revenue calculated from ROAS later
         SUM(i.impressions),
         SUM(i.clicks),
         0, -- conversions from actions JSON
         0,
         0,
         c.name,
         c.id::TEXT
       FROM ad_insights i
       JOIN campaigns c ON c.id = i.campaign_id
       WHERE i.workspace_id = $1
         AND i.date_start >= NOW() - INTERVAL '30 days'
       GROUP BY i.workspace_id, i.date_start, c.name, c.id
       ON CONFLICT (workspace_id, channel_id, date, campaign_id) DO UPDATE SET
         spend = EXCLUDED.spend,
         impressions = EXCLUDED.impressions,
         clicks = EXCLUDED.clicks`,
      [this.workspaceId, channelId]
    );

    // Update last imported timestamp
    await query(
      `UPDATE attribution_channels SET last_imported_at = NOW() WHERE id = $1`,
      [channelId]
    );

    return result.rowCount || 0;
  }

  // ==========================================
  // IMPORT MANUAL DATA (CSV-style)
  // ==========================================
  async importManualData(channelId: string, data: Array<{
    date: string;
    spend: number;
    revenue: number;
    impressions?: number;
    clicks?: number;
    conversions?: number;
    campaign_name?: string;
  }>): Promise<number> {
    let imported = 0;

    for (const row of data) {
      const roas = row.spend > 0 ? row.revenue / row.spend : 0;
      const cpa = row.conversions && row.conversions > 0 ? row.spend / row.conversions : 0;

      await query(
        `INSERT INTO attribution_data (id, workspace_id, channel_id, date, spend, revenue, impressions, clicks, conversions, roas, cpa, campaign_name, campaign_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (workspace_id, channel_id, date, campaign_id) DO UPDATE SET
           spend = EXCLUDED.spend, revenue = EXCLUDED.revenue,
           impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks,
           conversions = EXCLUDED.conversions, roas = EXCLUDED.roas, cpa = EXCLUDED.cpa`,
        [
          generateId(), this.workspaceId, channelId,
          row.date, row.spend, row.revenue,
          row.impressions || 0, row.clicks || 0, row.conversions || 0,
          roas, cpa, row.campaign_name || null, row.campaign_name || 'manual',
        ]
      );
      imported++;
    }

    await query(`UPDATE attribution_channels SET last_imported_at = NOW() WHERE id = $1`, [channelId]);
    return imported;
  }

  // ==========================================
  // CALCULATE BLENDED METRICS
  // ==========================================
  async calculateBlendedMetrics(daysBack: number = 30): Promise<number> {
    const result = await query(
      `INSERT INTO blended_metrics (id, workspace_id, date, total_spend, total_revenue, total_orders, mer, blended_roas, blended_cpa, channel_breakdown)
       SELECT
         uuid_generate_v4(),
         ad.workspace_id,
         ad.date,
         SUM(ad.spend),
         SUM(ad.revenue),
         SUM(ad.conversions),
         CASE WHEN SUM(ad.spend) > 0 THEN SUM(ad.revenue) / SUM(ad.spend) ELSE 0 END,
         CASE WHEN SUM(ad.spend) > 0 THEN SUM(ad.revenue) / SUM(ad.spend) ELSE 0 END,
         CASE WHEN SUM(ad.conversions) > 0 THEN SUM(ad.spend) / SUM(ad.conversions) ELSE 0 END,
         json_object_agg(
           ac.channel_name,
           json_build_object('spend', SUM(ad.spend), 'revenue', SUM(ad.revenue), 'roas', CASE WHEN SUM(ad.spend) > 0 THEN SUM(ad.revenue) / SUM(ad.spend) ELSE 0 END, 'conversions', SUM(ad.conversions))
         )
       FROM attribution_data ad
       JOIN attribution_channels ac ON ac.id = ad.channel_id
       WHERE ad.workspace_id = $1 AND ad.date >= NOW() - INTERVAL '${daysBack} days'
       GROUP BY ad.workspace_id, ad.date
       ON CONFLICT (workspace_id, date) DO UPDATE SET
         total_spend = EXCLUDED.total_spend,
         total_revenue = EXCLUDED.total_revenue,
         total_orders = EXCLUDED.total_orders,
         mer = EXCLUDED.mer,
         blended_roas = EXCLUDED.blended_roas,
         blended_cpa = EXCLUDED.blended_cpa,
         channel_breakdown = EXCLUDED.channel_breakdown`,
      [this.workspaceId]
    );

    return result.rowCount || 0;
  }

  // ==========================================
  // GENERATE ATTRIBUTION REPORT
  // ==========================================
  async generateReport(dateFrom: string, dateTo: string): Promise<AttributionReport> {
    const cacheKey = `workspace:${this.workspaceId}:attribution:report:${dateFrom}:${dateTo}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as AttributionReport;

    // Blended totals
    const blendedResult = await query(
      `SELECT
        COALESCE(SUM(total_spend), 0) as total_spend,
        COALESCE(SUM(total_revenue), 0) as total_revenue,
        CASE WHEN SUM(total_spend) > 0 THEN SUM(total_revenue) / SUM(total_spend) ELSE 0 END as mer,
        CASE WHEN SUM(total_spend) > 0 THEN SUM(total_revenue) / SUM(total_spend) ELSE 0 END as blended_roas,
        CASE WHEN SUM(total_orders) > 0 THEN SUM(total_spend) / SUM(total_orders) ELSE 0 END as blended_cac
       FROM blended_metrics
       WHERE workspace_id = $1 AND date >= $2 AND date <= $3`,
      [this.workspaceId, dateFrom, dateTo]
    );

    // Per-channel breakdown
    const channelResult = await query(
      `SELECT ac.channel_name, ac.channel_type,
        COALESCE(SUM(ad.spend), 0) as spend,
        COALESCE(SUM(ad.revenue), 0) as revenue,
        CASE WHEN SUM(ad.spend) > 0 THEN SUM(ad.revenue) / SUM(ad.spend) ELSE 0 END as roas,
        COALESCE(SUM(ad.conversions), 0) as conversions
       FROM attribution_channels ac
       LEFT JOIN attribution_data ad ON ad.channel_id = ac.id AND ad.date >= $2 AND ad.date <= $3
       WHERE ac.workspace_id = $1 AND ac.is_active = true
       GROUP BY ac.channel_name, ac.channel_type
       ORDER BY SUM(ad.spend) DESC NULLS LAST`,
      [this.workspaceId, dateFrom, dateTo]
    );

    const totalSpend = Number((blendedResult.rows[0] as any)?.total_spend || 0);
    const totalRevenue = Number((blendedResult.rows[0] as any)?.total_revenue || 0);

    const channels = channelResult.rows.map((c: any) => ({
      name: c.channel_name,
      type: c.channel_type,
      spend: Number(c.spend),
      revenue: Number(c.revenue),
      roas: Number(c.roas),
      conversions: Number(c.conversions),
      share_of_spend: totalSpend > 0 ? (Number(c.spend) / totalSpend) * 100 : 0,
      share_of_revenue: totalRevenue > 0 ? (Number(c.revenue) / totalRevenue) * 100 : 0,
    }));

    // Trend
    const trendResult = await query(
      `SELECT date, total_spend, total_revenue, mer
       FROM blended_metrics
       WHERE workspace_id = $1 AND date >= $2 AND date <= $3
       ORDER BY date`,
      [this.workspaceId, dateFrom, dateTo]
    );

    const report: AttributionReport = {
      workspace_id: this.workspaceId,
      date_range: { from: dateFrom, to: dateTo },
      blended: {
        total_spend: totalSpend,
        total_revenue: totalRevenue,
        mer: Number((blendedResult.rows[0] as any)?.mer || 0),
        blended_roas: Number((blendedResult.rows[0] as any)?.blended_roas || 0),
        blended_cac: Number((blendedResult.rows[0] as any)?.blended_cac || 0),
      },
      channels,
      trend: trendResult.rows.map((r: any) => ({
        date: r.date,
        total_spend: Number(r.total_spend),
        total_revenue: Number(r.total_revenue),
        mer: Number(r.mer),
      })),
    };

    await cacheSet(cacheKey, report, 300);
    return report;
  }

  // ==========================================
  // GET CHANNELS
  // ==========================================
  async getChannels(): Promise<any[]> {
    const result = await query(
      `SELECT * FROM attribution_channels WHERE workspace_id = $1 ORDER BY channel_name`,
      [this.workspaceId]
    );
    return result.rows;
  }
}
