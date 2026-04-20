// ============================================
// AD FUSION — Meta Conversions API (CAPI) Service
// Server-side event tracking with deduplication
// ============================================
import axios from 'axios';
import crypto from 'crypto';
import config from '../../config';
import { query } from '../../config/database';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { decrypt } from '../../utils/encryption';

interface CAPIEvent {
  event_name: string;
  event_time: number; // Unix timestamp
  event_id?: string; // For deduplication with browser pixel
  event_source_url?: string;
  action_source: 'website' | 'app' | 'email' | 'phone_call' | 'chat' | 'physical_store' | 'other';
  user_data: {
    em?: string; // email (will be SHA256 hashed)
    ph?: string; // phone (will be SHA256 hashed)
    fn?: string; // first name
    ln?: string; // last name
    ct?: string; // city
    st?: string; // state
    zp?: string; // zip
    country?: string;
    external_id?: string;
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string; // Facebook click ID
    fbp?: string; // Facebook browser pixel ID
    subscription_id?: string;
    fb_login_id?: string;
    lead_id?: string;
  };
  custom_data?: {
    value?: number;
    currency?: string;
    content_ids?: string[];
    content_type?: string;
    content_name?: string;
    content_category?: string;
    num_items?: number;
    order_id?: string;
    search_string?: string;
    status?: string;
    predicted_ltv?: number;
  };
  opt_out?: boolean;
}

interface CAPIResponse {
  events_received: number;
  messages: string[];
  fbtrace_id: string;
}

export class ConversionsAPIService {
  private workspaceId: string;

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
  }

  // ==========================================
  // SEND EVENTS TO META CAPI
  // ==========================================
  async sendEvents(
    configId: string,
    events: CAPIEvent[]
  ): Promise<{ sent: number; matched: number; errors: string[] }> {
    const startTime = Date.now();
    const errors: string[] = [];

    // Get CAPI configuration
    const configResult = await query(
      'SELECT * FROM capi_configurations WHERE id = $1 AND workspace_id = $2 AND is_active = true',
      [configId, this.workspaceId]
    );

    if (configResult.rows.length === 0) {
      throw new Error('CAPI configuration not found or inactive');
    }

    const capiConfig = configResult.rows[0] as any;
    const accessToken = decrypt(capiConfig.access_token_encrypted);
    const pixelId = capiConfig.pixel_id;

    // Process events: hash PII, add event IDs, dedup
    const processedEvents = [];
    for (const event of events) {
      // Generate dedup key
      const eventId = event.event_id || generateId();
      const dedupKey = this.generateDedupKey(event, eventId);

      // Check deduplication
      if (capiConfig.deduplication_enabled) {
        const isDuplicate = await this.checkDuplicate(dedupKey, configId, capiConfig.dedup_window_minutes);
        if (isDuplicate) {
          continue;
        }
      }

      // Hash PII data
      const hashedUserData = this.hashUserData(event.user_data);

      processedEvents.push({
        event_name: event.event_name,
        event_time: event.event_time,
        event_id: eventId,
        event_source_url: event.event_source_url,
        action_source: event.action_source,
        user_data: hashedUserData,
        custom_data: event.custom_data,
        opt_out: event.opt_out || false,
      });
    }

    if (processedEvents.length === 0) {
      return { sent: 0, matched: 0, errors: ['All events deduplicated'] };
    }

    try {
      // Send to Meta Conversions API
      const url = `${config.meta.graphApiBase}/${config.meta.apiVersion}/${pixelId}/events`;

      const payload: any = {
        data: processedEvents,
        access_token: accessToken,
      };

      // Add test event code if configured
      if (capiConfig.test_event_code) {
        payload.test_event_code = capiConfig.test_event_code;
      }

      const response = await axios.post<CAPIResponse>(url, payload, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
      });

      const result = response.data;
      const eventsReceived = result.events_received || 0;

      // Log events to database
      for (const event of processedEvents) {
        await query(
          `INSERT INTO capi_events (id, workspace_id, capi_config_id, event_name, event_time, event_id, 
            event_source_url, action_source, user_data_hash, custom_data, sent_to_meta, 
            meta_response_code, meta_events_received, dedup_key, processing_time_ms)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, 200, $11, $12, $13)`,
          [
            generateId(), this.workspaceId, configId,
            event.event_name, new Date(event.event_time * 1000),
            event.event_id, event.event_source_url, event.action_source,
            JSON.stringify(this.redactUserData(event.user_data)),
            JSON.stringify(event.custom_data || {}),
            eventsReceived,
            this.generateDedupKey(events.find(e => e.event_id === event.event_id) || event as any, event.event_id!),
            Date.now() - startTime,
          ]
        );
      }

      // Update config stats
      await query(
        `UPDATE capi_configurations SET 
          events_sent_today = events_sent_today + $1,
          events_matched_today = events_matched_today + $2,
          match_rate = CASE WHEN events_sent_today + $1 > 0 
            THEN (events_matched_today + $2)::DECIMAL / (events_sent_today + $1) 
            ELSE 0 END,
          last_event_sent_at = NOW(),
          last_error = NULL
         WHERE id = $3`,
        [processedEvents.length, eventsReceived, configId]
      );

      logger.info('CAPI events sent', {
        workspaceId: this.workspaceId,
        pixelId,
        sent: processedEvents.length,
        received: eventsReceived,
      });

      return {
        sent: processedEvents.length,
        matched: eventsReceived,
        errors,
      };
    } catch (error) {
      const errorMsg = (error as any).response?.data?.error?.message || (error as Error).message;

      // Update config with error
      await query(
        `UPDATE capi_configurations SET last_error = $1 WHERE id = $2`,
        [errorMsg, configId]
      );

      logger.error('CAPI send failed', { error: errorMsg, configId });
      errors.push(errorMsg);
      return { sent: 0, matched: 0, errors };
    }
  }

  // ==========================================
  // CAPI HEALTH CHECK
  // ==========================================
  async getHealth(configId: string): Promise<{
    is_healthy: boolean;
    match_rate: number;
    events_today: number;
    last_event: string | null;
    last_error: string | null;
    recommendations: string[];
  }> {
    const result = await query(
      'SELECT * FROM capi_configurations WHERE id = $1 AND workspace_id = $2',
      [configId, this.workspaceId]
    );

    if (result.rows.length === 0) {
      throw new Error('CAPI configuration not found');
    }

    const cfg = result.rows[0] as any;
    const matchRate = Number(cfg.match_rate) || 0;
    const recommendations: string[] = [];

    if (matchRate < 0.3) {
      recommendations.push('Match rate below 30%. Ensure you are sending hashed email and/or phone with events.');
    }
    if (matchRate < 0.5) {
      recommendations.push('Match rate below 50%. Add fbp (browser pixel ID) and fbc (click ID) to improve matching.');
    }
    if (!cfg.last_event_sent_at) {
      recommendations.push('No events sent yet. Verify your integration is correctly configured.');
    }
    if (cfg.last_error) {
      recommendations.push(`Last error: ${cfg.last_error}. Check your access token and pixel permissions.`);
    }
    if (cfg.events_sent_today === 0 && cfg.last_event_sent_at) {
      recommendations.push('No events sent today. Check if your website/app is correctly sending events.');
    }

    return {
      is_healthy: matchRate >= 0.3 && !cfg.last_error && cfg.events_sent_today > 0,
      match_rate: matchRate,
      events_today: cfg.events_sent_today || 0,
      last_event: cfg.last_event_sent_at || null,
      last_error: cfg.last_error || null,
      recommendations,
    };
  }

  // ==========================================
  // GENERATE TRACKING SNIPPET
  // Returns JavaScript snippet for the user's website
  // ==========================================
  generateTrackingSnippet(pixelId: string, apiEndpoint: string): string {
    return `<!-- Ad Fusion Server-Side Tracking -->
<script>
(function() {
  var AF_PIXEL = '${pixelId}';
  var AF_ENDPOINT = '${apiEndpoint}';
  
  // Get Facebook identifiers
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  }
  
  window.afTrack = function(eventName, customData) {
    var payload = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: 'af_' + Math.random().toString(36).substr(2, 12) + '_' + Date.now(),
      event_source_url: window.location.href,
      action_source: 'website',
      user_data: {
        client_user_agent: navigator.userAgent,
        fbp: getCookie('_fbp'),
        fbc: getCookie('_fbc')
      },
      custom_data: customData || {}
    };
    
    // Send via Beacon API (non-blocking)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(AF_ENDPOINT, JSON.stringify(payload));
    } else {
      fetch(AF_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        keepalive: true
      });
    }
  };
  
  // Auto-track PageView
  window.afTrack('PageView');
})();
</script>`;
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================
  private hashUserData(userData: CAPIEvent['user_data']): Record<string, unknown> {
    const hashed: Record<string, unknown> = {};

    // Fields that need SHA256 hashing
    const hashFields = ['em', 'ph', 'fn', 'ln', 'ct', 'st', 'zp', 'country', 'external_id'];
    for (const field of hashFields) {
      const value = (userData as any)[field];
      if (value) {
        hashed[field] = [this.sha256(String(value).toLowerCase().trim())];
      }
    }

    // Fields passed as-is
    if (userData.client_ip_address) hashed.client_ip_address = userData.client_ip_address;
    if (userData.client_user_agent) hashed.client_user_agent = userData.client_user_agent;
    if (userData.fbc) hashed.fbc = userData.fbc;
    if (userData.fbp) hashed.fbp = userData.fbp;
    if (userData.fb_login_id) hashed.fb_login_id = userData.fb_login_id;
    if (userData.lead_id) hashed.lead_id = userData.lead_id;
    if (userData.subscription_id) hashed.subscription_id = userData.subscription_id;

    return hashed;
  }

  private redactUserData(userData: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(userData)) {
      if (['em', 'ph', 'fn', 'ln'].includes(key)) {
        redacted[key] = '***REDACTED***';
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  }

  private sha256(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  private generateDedupKey(event: CAPIEvent, eventId: string): string {
    return `${event.event_name}:${eventId}:${event.event_time}`;
  }

  private async checkDuplicate(dedupKey: string, configId: string, windowMinutes: number): Promise<boolean> {
    const result = await query(
      `SELECT id FROM capi_events 
       WHERE dedup_key = $1 AND capi_config_id = $2 
       AND created_at >= NOW() - INTERVAL '${windowMinutes} minutes'
       LIMIT 1`,
      [dedupKey, configId]
    );
    return result.rows.length > 0;
  }
}
