// ============================================
// AD FUSION v2.0 - Meta Conversions API (CAPI) Service
// Server-side event tracking with deduplication
// ============================================
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import config from '../../config';
import { query } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { decrypt } from '../../utils/encryption';
import { CAPIEvent, CAPIUserData, CAPICustomData, CAPIEventName, CAPIActionSource } from '../../types';

export class CAPIService {
  private workspaceId: string;
  private pixelId: string;
  private accessToken: string;
  private client: AxiosInstance;
  private dedupWindowSeconds: number;

  constructor(workspaceId: string, pixelId: string, accessTokenEncrypted: string) {
    this.workspaceId = workspaceId;
    this.pixelId = pixelId;
    this.accessToken = decrypt(accessTokenEncrypted);
    this.dedupWindowSeconds = config.meta.capi.deduplicationWindowSeconds;
    this.client = axios.create({
      baseURL: `${config.meta.graphApiBase}/${config.meta.apiVersion}`,
      timeout: 30000,
    });
  }

  // ==========================================
  // SEND SINGLE EVENT
  // ==========================================
  async sendEvent(
    eventName: CAPIEventName,
    eventData: {
      event_source_url?: string;
      user_data?: Partial<CAPIUserData>;
      custom_data?: Partial<CAPICustomData>;
      action_source?: CAPIActionSource;
      event_id?: string;
      event_time?: number;
    }
  ): Promise<{ event_id: string; status: string }> {
    const eventId = eventData.event_id || `af_${generateId()}`;
    const eventTime = eventData.event_time || Math.floor(Date.now() / 1000);

    // Check for deduplication
    const isDuplicate = await this.checkDuplicate(eventId, eventTime);
    if (isDuplicate) {
      logger.debug('CAPI event deduplicated', { eventId, eventName });
      await this.storeEvent(eventName, eventId, new Date(eventTime * 1000), eventData, 'deduped');
      return { event_id: eventId, status: 'deduped' };
    }

    // Hash user data for privacy
    const hashedUserData = this.hashUserData(eventData.user_data || {});

    // Build Meta CAPI payload
    const payload = {
      data: [{
        event_name: eventName,
        event_time: eventTime,
        event_id: eventId,
        event_source_url: eventData.event_source_url,
        action_source: eventData.action_source || 'website',
        user_data: hashedUserData,
        custom_data: eventData.custom_data || {},
      }],
    };

    try {
      const response = await this.client.post(
        `/${this.pixelId}/events`,
        payload,
        {
          params: { access_token: this.accessToken },
          headers: { 'Content-Type': 'application/json' },
        }
      );

      await this.storeEvent(eventName, eventId, new Date(eventTime * 1000), eventData, 'sent', response.data);

      // Update daily counter
      await query(
        `UPDATE capi_configurations SET events_sent_today = events_sent_today + 1, last_event_at = NOW(), last_error = NULL
         WHERE workspace_id = $1 AND pixel_id = $2`,
        [this.workspaceId, this.pixelId]
      );

      return { event_id: eventId, status: 'sent' };
    } catch (error) {
      const errMsg = (error as any).response?.data?.error?.message || (error as Error).message;
      logger.error('CAPI event send failed', { eventName, eventId, error: errMsg });

      await this.storeEvent(eventName, eventId, new Date(eventTime * 1000), eventData, 'failed', null, errMsg);

      // Update error
      await query(
        `UPDATE capi_configurations SET last_error = $1 WHERE workspace_id = $2 AND pixel_id = $3`,
        [errMsg, this.workspaceId, this.pixelId]
      );

      throw error;
    }
  }

  // ==========================================
  // SEND BATCH EVENTS
  // ==========================================
  async sendBatchEvents(
    events: Array<{
      event_name: CAPIEventName;
      event_source_url?: string;
      user_data?: Partial<CAPIUserData>;
      custom_data?: Partial<CAPICustomData>;
      action_source?: CAPIActionSource;
      event_id?: string;
      event_time?: number;
    }>
  ): Promise<{ sent: number; deduped: number; failed: number }> {
    let sent = 0;
    let deduped = 0;
    let failed = 0;

    // Process in batches
    const batchSize = config.meta.capi.batchSize;
    const batches = [];
    for (let i = 0; i < events.length; i += batchSize) {
      batches.push(events.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      const validEvents = [];

      for (const event of batch) {
        const eventId = event.event_id || `af_${generateId()}`;
        const eventTime = event.event_time || Math.floor(Date.now() / 1000);

        const isDuplicate = await this.checkDuplicate(eventId, eventTime);
        if (isDuplicate) {
          deduped++;
          continue;
        }

        validEvents.push({
          event_name: event.event_name,
          event_time: eventTime,
          event_id: eventId,
          event_source_url: event.event_source_url,
          action_source: event.action_source || 'website',
          user_data: this.hashUserData(event.user_data || {}),
          custom_data: event.custom_data || {},
        });
      }

      if (validEvents.length === 0) continue;

      try {
        await this.client.post(
          `/${this.pixelId}/events`,
          { data: validEvents },
          {
            params: { access_token: this.accessToken },
            headers: { 'Content-Type': 'application/json' },
          }
        );
        sent += validEvents.length;
      } catch (error) {
        failed += validEvents.length;
        logger.error('CAPI batch send failed', { count: validEvents.length, error: (error as Error).message });
      }
    }

    // Update daily counters
    await query(
      `UPDATE capi_configurations SET
        events_sent_today = events_sent_today + $1,
        events_deduped_today = events_deduped_today + $2,
        last_event_at = NOW()
       WHERE workspace_id = $3 AND pixel_id = $4`,
      [sent, deduped, this.workspaceId, this.pixelId]
    );

    return { sent, deduped, failed };
  }

  // ==========================================
  // DEDUPLICATION
  // ==========================================
  private async checkDuplicate(eventId: string, eventTime: number): Promise<boolean> {
    // Check Redis first (fast path)
    const cacheKey = `capi:dedup:${this.pixelId}:${eventId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return true;

    // Check database (slower path)
    const result = await query(
      `SELECT id FROM capi_events
       WHERE pixel_id = $1 AND event_id = $2
         AND event_time >= to_timestamp($3) - INTERVAL '${this.dedupWindowSeconds} seconds'
         AND processing_status != 'deduped'
       LIMIT 1`,
      [this.pixelId, eventId, eventTime]
    );

    return result.rows.length > 0;
  }

  // ==========================================
  // HASH USER DATA (SHA-256)
  // ==========================================
  private hashUserData(userData: Partial<CAPIUserData>): Record<string, string | undefined> {
    const hashField = (value?: string): string | undefined => {
      if (!value) return undefined;
      // Don't hash if already hashed (64 hex chars)
      if (/^[a-f0-9]{64}$/i.test(value)) return value;
      return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
    };

    return {
      em: hashField(userData.em),
      ph: hashField(userData.ph),
      fn: hashField(userData.fn),
      ln: hashField(userData.ln),
      ct: hashField(userData.ct),
      st: hashField(userData.st),
      zp: hashField(userData.zp),
      country: hashField(userData.country),
      external_id: hashField(userData.external_id),
      client_ip_address: userData.client_ip_address,
      client_user_agent: userData.client_user_agent,
      fbc: userData.fbc,
      fbp: userData.fbp,
    };
  }

  // ==========================================
  // STORE EVENT
  // ==========================================
  private async storeEvent(
    eventName: string,
    eventId: string,
    eventTime: Date,
    eventData: any,
    status: string,
    metaResponse?: any,
    errorMessage?: string
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO capi_events (id, workspace_id, pixel_id, event_name, event_id, event_time, event_source_url, user_data, custom_data, action_source, processing_status, meta_response, sent_at, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          generateId(), this.workspaceId, this.pixelId,
          eventName, eventId, eventTime,
          eventData.event_source_url || null,
          JSON.stringify(eventData.user_data || {}),
          JSON.stringify(eventData.custom_data || {}),
          eventData.action_source || 'website',
          status,
          metaResponse ? JSON.stringify(metaResponse) : null,
          status === 'sent' ? new Date() : null,
          errorMessage || null,
        ]
      );

      // Set dedup cache
      if (status === 'sent') {
        await cacheSet(`capi:dedup:${this.pixelId}:${eventId}`, '1', this.dedupWindowSeconds);
      }
    } catch (error) {
      logger.warn('Failed to store CAPI event', { error: (error as Error).message });
    }
  }

  // ==========================================
  // GET CAPI STATS
  // ==========================================
  static async getStats(workspaceId: string): Promise<any> {
    const configs = await query(
      `SELECT cc.*, aa.name as account_name
       FROM capi_configurations cc
       JOIN ad_accounts aa ON aa.id = cc.ad_account_id
       WHERE cc.workspace_id = $1`,
      [workspaceId]
    );

    const eventStats = await query(
      `SELECT pixel_id, event_name, processing_status, COUNT(*) as count
       FROM capi_events
       WHERE workspace_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'
       GROUP BY pixel_id, event_name, processing_status`,
      [workspaceId]
    );

    return {
      configurations: configs.rows,
      event_stats_24h: eventStats.rows,
    };
  }

  // ==========================================
  // PROCESS PENDING EVENTS (RETRY)
  // ==========================================
  static async processPendingEvents(workspaceId: string): Promise<number> {
    const pending = await query(
      `SELECT ce.*, cc.access_token_encrypted
       FROM capi_events ce
       JOIN capi_configurations cc ON cc.pixel_id = ce.pixel_id AND cc.workspace_id = ce.workspace_id
       WHERE ce.workspace_id = $1 AND ce.processing_status = 'pending'
         AND ce.created_at >= NOW() - INTERVAL '1 hour'
       ORDER BY ce.created_at
       LIMIT 100`,
      [workspaceId]
    );

    let processed = 0;
    for (const row of pending.rows) {
      const event = row as any;
      try {
        const service = new CAPIService(workspaceId, event.pixel_id, event.access_token_encrypted);
        await service.sendEvent(event.event_name, {
          event_source_url: event.event_source_url,
          user_data: event.user_data,
          custom_data: event.custom_data,
          action_source: event.action_source,
          event_id: event.event_id,
          event_time: Math.floor(new Date(event.event_time).getTime() / 1000),
        });
        processed++;
      } catch (error) {
        logger.warn('CAPI retry failed', { eventId: event.event_id, error: (error as Error).message });
      }
    }

    return processed;
  }

  // ==========================================
  // RESET DAILY COUNTERS
  // ==========================================
  static async resetDailyCounters(): Promise<void> {
    await query(
      `UPDATE capi_configurations SET events_sent_today = 0, events_deduped_today = 0`
    );
  }
}
