// ============================================
// AD FUSION - Meta Marketing API Client
// Core integration with Meta Graph API
// ============================================
import axios, { AxiosInstance, AxiosError } from 'axios';
import config from '../../config';
import { logger } from '../../utils/logger';
import { retryWithBackoff, sanitizeMetaAccountId, chunkArray } from '../../utils/helpers';
import { decrypt } from '../../utils/encryption';
import {
  Campaign, AdSet, Ad, AdCreative, AdInsight,
  CampaignObjective, CampaignStatus, BidStrategy,
  TargetingSpec, InsightLevel,
} from '../../types';

interface MetaApiResponse<T> {
  data: T[];
  paging?: {
    cursors: { before: string; after: string };
    next?: string;
    previous?: string;
  };
}

interface MetaApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id: string;
  };
}

export class MetaApiClient {
  private client: AxiosInstance;
  private accessToken: string;
  private apiVersion: string;

  constructor(encryptedToken: string) {
    this.accessToken = decrypt(encryptedToken);
    this.apiVersion = config.meta.apiVersion;

    this.client = axios.create({
      baseURL: `${config.meta.graphApiBase}/${this.apiVersion}`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add access token
    this.client.interceptors.request.use((reqConfig) => {
      reqConfig.params = reqConfig.params || {};
      reqConfig.params.access_token = this.accessToken;
      return reqConfig;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<MetaApiError>) => {
        const metaError = error.response?.data?.error;
        if (metaError) {
          logger.error('Meta API error', {
            code: metaError.code,
            subcode: metaError.error_subcode,
            message: metaError.message,
            type: metaError.type,
            traceId: metaError.fbtrace_id,
          });

          // Handle specific error codes
          if (metaError.code === 190) {
            throw new MetaTokenError('Access token expired or invalid');
          }
          if (metaError.code === 17 || metaError.code === 4) {
            throw new MetaRateLimitError('Meta API rate limit reached');
          }
          if (metaError.code === 100) {
            throw new MetaValidationError(metaError.message);
          }
        }
        throw error;
      }
    );
  }

  // ==========================================
  // ACCOUNT OPERATIONS
  // ==========================================

  async getAdAccount(accountId: string): Promise<Record<string, unknown>> {
    const id = sanitizeMetaAccountId(accountId);
    const { data } = await retryWithBackoff(() =>
      this.client.get(`/${id}`, {
        params: {
          fields: 'id,name,account_status,currency,timezone_name,amount_spent,balance,spend_cap,business,owner,funding_source_details,disable_reason',
        },
      })
    );
    return data;
  }

  async getAdAccounts(businessId: string): Promise<Record<string, unknown>[]> {
    return this.fetchAllPages(`/${businessId}/owned_ad_accounts`, {
      fields: 'id,name,account_status,currency,timezone_name,amount_spent,balance,spend_cap',
    });
  }

  // ==========================================
  // CAMPAIGN OPERATIONS
  // ==========================================

  async getCampaigns(accountId: string, params?: Record<string, unknown>): Promise<Record<string, unknown>[]> {
    const id = sanitizeMetaAccountId(accountId);
    return this.fetchAllPages(`/${id}/campaigns`, {
      fields: 'id,name,status,objective,buying_type,daily_budget,lifetime_budget,bid_strategy,special_ad_categories,start_time,stop_time,created_time,updated_time',
      ...params,
    });
  }

  async getCampaign(campaignId: string): Promise<Record<string, unknown>> {
    const { data } = await retryWithBackoff(() =>
      this.client.get(`/${campaignId}`, {
        params: {
          fields: 'id,name,status,objective,buying_type,daily_budget,lifetime_budget,bid_strategy,special_ad_categories,start_time,stop_time,created_time,updated_time,budget_remaining,budget_rebalance_flag,can_use_spend_cap',
        },
      })
    );
    return data;
  }

  async createCampaign(
    accountId: string,
    params: {
      name: string;
      objective: CampaignObjective;
      status?: CampaignStatus;
      daily_budget?: number;
      lifetime_budget?: number;
      bid_strategy?: BidStrategy;
      special_ad_categories?: string[];
      start_time?: string;
      stop_time?: string;
    }
  ): Promise<Record<string, unknown>> {
    const id = sanitizeMetaAccountId(accountId);
    const { data } = await retryWithBackoff(() =>
      this.client.post(`/${id}/campaigns`, {
        name: params.name,
        objective: params.objective,
        status: params.status || 'PAUSED',
        daily_budget: params.daily_budget ? Math.round(params.daily_budget * 100) : undefined, // Meta uses cents
        lifetime_budget: params.lifetime_budget ? Math.round(params.lifetime_budget * 100) : undefined,
        bid_strategy: params.bid_strategy,
        special_ad_categories: params.special_ad_categories || [],
        start_time: params.start_time,
        stop_time: params.stop_time,
      })
    );
    return data;
  }

  async updateCampaign(
    campaignId: string,
    params: Partial<{
      name: string;
      status: CampaignStatus;
      daily_budget: number;
      lifetime_budget: number;
      bid_strategy: BidStrategy;
    }>
  ): Promise<Record<string, unknown>> {
    const updateParams: Record<string, unknown> = { ...params };
    if (updateParams.daily_budget) {
      updateParams.daily_budget = Math.round((updateParams.daily_budget as number) * 100);
    }
    if (updateParams.lifetime_budget) {
      updateParams.lifetime_budget = Math.round((updateParams.lifetime_budget as number) * 100);
    }

    const { data } = await retryWithBackoff(() =>
      this.client.post(`/${campaignId}`, updateParams)
    );
    return data;
  }

  async deleteCampaign(campaignId: string): Promise<void> {
    await retryWithBackoff(() =>
      this.client.post(`/${campaignId}`, { status: 'DELETED' })
    );
  }

  // ==========================================
  // AD SET OPERATIONS
  // ==========================================

  async getAdSets(accountId: string, params?: Record<string, unknown>): Promise<Record<string, unknown>[]> {
    const id = sanitizeMetaAccountId(accountId);
    return this.fetchAllPages(`/${id}/adsets`, {
      fields: 'id,name,status,campaign_id,daily_budget,lifetime_budget,bid_amount,billing_event,optimization_goal,targeting,start_time,end_time,promoted_object,created_time,updated_time',
      ...params,
    });
  }

  async getAdSet(adsetId: string): Promise<Record<string, unknown>> {
    const { data } = await retryWithBackoff(() =>
      this.client.get(`/${adsetId}`, {
        params: {
          fields: 'id,name,status,campaign_id,daily_budget,lifetime_budget,bid_amount,billing_event,optimization_goal,targeting,start_time,end_time,promoted_object,budget_remaining,created_time,updated_time,learning_stage_info',
        },
      })
    );
    return data;
  }

  async createAdSet(
    accountId: string,
    params: {
      name: string;
      campaign_id: string;
      status?: CampaignStatus;
      daily_budget?: number;
      lifetime_budget?: number;
      bid_amount?: number;
      billing_event?: string;
      optimization_goal?: string;
      targeting: TargetingSpec;
      start_time?: string;
      end_time?: string;
      promoted_object?: Record<string, unknown>;
    }
  ): Promise<Record<string, unknown>> {
    const id = sanitizeMetaAccountId(accountId);

    const body: Record<string, unknown> = {
      name: params.name,
      campaign_id: params.campaign_id,
      status: params.status || 'PAUSED',
      billing_event: params.billing_event || 'IMPRESSIONS',
      optimization_goal: params.optimization_goal || 'LINK_CLICKS',
      targeting: params.targeting,
    };

    if (params.daily_budget) body.daily_budget = Math.round(params.daily_budget * 100);
    if (params.lifetime_budget) body.lifetime_budget = Math.round(params.lifetime_budget * 100);
    if (params.bid_amount) body.bid_amount = Math.round(params.bid_amount * 100);
    if (params.start_time) body.start_time = params.start_time;
    if (params.end_time) body.end_time = params.end_time;
    if (params.promoted_object) body.promoted_object = params.promoted_object;

    const { data } = await retryWithBackoff(() =>
      this.client.post(`/${id}/adsets`, body)
    );
    return data;
  }

  async updateAdSet(
    adsetId: string,
    params: Partial<{
      name: string;
      status: CampaignStatus;
      daily_budget: number;
      lifetime_budget: number;
      bid_amount: number;
      targeting: TargetingSpec;
    }>
  ): Promise<Record<string, unknown>> {
    const updateParams: Record<string, unknown> = { ...params };
    if (updateParams.daily_budget) updateParams.daily_budget = Math.round((updateParams.daily_budget as number) * 100);
    if (updateParams.lifetime_budget) updateParams.lifetime_budget = Math.round((updateParams.lifetime_budget as number) * 100);
    if (updateParams.bid_amount) updateParams.bid_amount = Math.round((updateParams.bid_amount as number) * 100);

    const { data } = await retryWithBackoff(() =>
      this.client.post(`/${adsetId}`, updateParams)
    );
    return data;
  }

  // ==========================================
  // AD OPERATIONS
  // ==========================================

  async getAds(accountId: string, params?: Record<string, unknown>): Promise<Record<string, unknown>[]> {
    const id = sanitizeMetaAccountId(accountId);
    return this.fetchAllPages(`/${id}/ads`, {
      fields: 'id,name,status,adset_id,creative{id,name,title,body,image_url,video_id,thumbnail_url,call_to_action_type,link_url,url_tags},tracking_specs,created_time,updated_time',
      ...params,
    });
  }

  async getAd(adId: string): Promise<Record<string, unknown>> {
    const { data } = await retryWithBackoff(() =>
      this.client.get(`/${adId}`, {
        params: {
          fields: 'id,name,status,adset_id,creative{id,name,title,body,image_url,video_id,thumbnail_url,call_to_action_type,link_url,url_tags,object_story_spec},tracking_specs,created_time,updated_time,preview_shareable_link',
        },
      })
    );
    return data;
  }

  async createAd(
    accountId: string,
    params: {
      name: string;
      adset_id: string;
      status?: CampaignStatus;
      creative: Record<string, unknown>;
      tracking_specs?: Record<string, unknown>;
    }
  ): Promise<Record<string, unknown>> {
    const id = sanitizeMetaAccountId(accountId);
    const { data } = await retryWithBackoff(() =>
      this.client.post(`/${id}/ads`, {
        name: params.name,
        adset_id: params.adset_id,
        status: params.status || 'PAUSED',
        creative: params.creative,
        tracking_specs: params.tracking_specs,
      })
    );
    return data;
  }

  async updateAd(
    adId: string,
    params: Partial<{
      name: string;
      status: CampaignStatus;
      creative: Record<string, unknown>;
    }>
  ): Promise<Record<string, unknown>> {
    const { data } = await retryWithBackoff(() =>
      this.client.post(`/${adId}`, params)
    );
    return data;
  }

  // ==========================================
  // AD CREATIVE OPERATIONS
  // ==========================================

  async createAdCreative(
    accountId: string,
    params: {
      name: string;
      object_story_spec: Record<string, unknown>;
      url_tags?: string;
    }
  ): Promise<Record<string, unknown>> {
    const id = sanitizeMetaAccountId(accountId);
    const { data } = await retryWithBackoff(() =>
      this.client.post(`/${id}/adcreatives`, params)
    );
    return data;
  }

  async uploadImage(
    accountId: string,
    imageUrl: string
  ): Promise<Record<string, unknown>> {
    const id = sanitizeMetaAccountId(accountId);
    const { data } = await retryWithBackoff(() =>
      this.client.post(`/${id}/adimages`, { url: imageUrl })
    );
    return data;
  }

  // ==========================================
  // INSIGHTS (Performance Data)
  // ==========================================

  async getInsights(
    objectId: string,
    params: {
      level?: InsightLevel;
      time_range?: { since: string; until: string };
      time_increment?: number | 'monthly' | 'all_days';
      breakdowns?: string[];
      fields?: string[];
      filtering?: Array<{ field: string; operator: string; value: unknown }>;
      limit?: number;
    }
  ): Promise<Record<string, unknown>[]> {
    const fields = params.fields || config.meta.defaultInsightFields;

    const queryParams: Record<string, unknown> = {
      fields: fields.join(','),
      level: params.level || 'ad',
    };

    if (params.time_range) {
      queryParams.time_range = JSON.stringify(params.time_range);
    }
    if (params.time_increment) {
      queryParams.time_increment = params.time_increment;
    }
    if (params.breakdowns) {
      queryParams.breakdowns = params.breakdowns.join(',');
    }
    if (params.filtering) {
      queryParams.filtering = JSON.stringify(params.filtering);
    }

    return this.fetchAllPages(`/${objectId}/insights`, queryParams, params.limit);
  }

  async getAccountInsights(
    accountId: string,
    dateRange: { since: string; until: string },
    level: InsightLevel = 'campaign'
  ): Promise<Record<string, unknown>[]> {
    const id = sanitizeMetaAccountId(accountId);
    return this.getInsights(id, {
      level,
      time_range: dateRange,
      time_increment: 1, // Daily breakdown
    });
  }

  async getCampaignInsights(
    campaignId: string,
    dateRange: { since: string; until: string }
  ): Promise<Record<string, unknown>[]> {
    return this.getInsights(campaignId, {
      level: 'campaign',
      time_range: dateRange,
      time_increment: 1,
    });
  }

  async getAdSetInsights(
    adsetId: string,
    dateRange: { since: string; until: string }
  ): Promise<Record<string, unknown>[]> {
    return this.getInsights(adsetId, {
      level: 'adset',
      time_range: dateRange,
      time_increment: 1,
    });
  }

  async getAdInsights(
    adId: string,
    dateRange: { since: string; until: string }
  ): Promise<Record<string, unknown>[]> {
    return this.getInsights(adId, {
      level: 'ad',
      time_range: dateRange,
      time_increment: 1,
    });
  }

  // ==========================================
  // AUDIENCES
  // ==========================================

  async getCustomAudiences(accountId: string): Promise<Record<string, unknown>[]> {
    const id = sanitizeMetaAccountId(accountId);
    return this.fetchAllPages(`/${id}/customaudiences`, {
      fields: 'id,name,description,approximate_count,data_source,delivery_status,lookalike_spec,operation_status,subtype,time_created,time_updated',
    });
  }

  async getSavedAudiences(accountId: string): Promise<Record<string, unknown>[]> {
    const id = sanitizeMetaAccountId(accountId);
    return this.fetchAllPages(`/${id}/saved_audiences`, {
      fields: 'id,name,targeting,approximate_count',
    });
  }

  async getTargetingSearch(query: string, type: string = 'adinterest'): Promise<Record<string, unknown>[]> {
    const { data } = await retryWithBackoff(() =>
      this.client.get('/search', {
        params: {
          type,
          q: query,
          limit: 50,
        },
      })
    );
    return data.data || [];
  }

  async getReachEstimate(
    accountId: string,
    targeting: TargetingSpec,
    optimizationGoal: string
  ): Promise<Record<string, unknown>> {
    const id = sanitizeMetaAccountId(accountId);
    const { data } = await retryWithBackoff(() =>
      this.client.get(`/${id}/reachestimate`, {
        params: {
          targeting_spec: JSON.stringify(targeting),
          optimization_goal: optimizationGoal,
        },
      })
    );
    return data;
  }

  // ==========================================
  // BATCH OPERATIONS (Efficiency)
  // ==========================================

  async batchRequest(
    requests: Array<{
      method: 'GET' | 'POST' | 'DELETE';
      relative_url: string;
      body?: Record<string, unknown>;
    }>
  ): Promise<Record<string, unknown>[]> {
    // Meta allows max 50 requests per batch
    const chunks = chunkArray(requests, 50);
    const allResults: Record<string, unknown>[] = [];

    for (const chunk of chunks) {
      const { data } = await retryWithBackoff(() =>
        this.client.post('/', {
          batch: chunk.map((req) => ({
            method: req.method,
            relative_url: req.relative_url,
            body: req.body ? new URLSearchParams(req.body as Record<string, string>).toString() : undefined,
          })),
        })
      );
      allResults.push(...data);
    }

    return allResults;
  }

  // ==========================================
  // TOKEN MANAGEMENT
  // ==========================================

  async debugToken(token?: string): Promise<Record<string, unknown>> {
    const { data } = await this.client.get('/debug_token', {
      params: {
        input_token: token || this.accessToken,
      },
    });
    return data.data;
  }

  async exchangeCodeForToken(code: string): Promise<{ access_token: string; expires_in: number }> {
    const { data } = await this.client.get('/oauth/access_token', {
      params: {
        client_id: config.meta.appId,
        client_secret: config.meta.appSecret,
        redirect_uri: config.meta.redirectUri,
        code,
      },
    });
    return data;
  }

  async getLongLivedToken(shortLivedToken: string): Promise<{ access_token: string; expires_in: number }> {
    const { data } = await this.client.get('/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: config.meta.appId,
        client_secret: config.meta.appSecret,
        fb_exchange_token: shortLivedToken,
      },
    });
    return data;
  }

  // ==========================================
  // INTERNAL HELPERS
  // ==========================================

  private async fetchAllPages<T>(
    endpoint: string,
    params: Record<string, unknown>,
    maxItems?: number
  ): Promise<T[]> {
    const allData: T[] = [];
    let nextUrl: string | undefined;

    const initialParams = { ...params, limit: Math.min(maxItems || 500, 500) };

    const response = await retryWithBackoff(() =>
      this.client.get<MetaApiResponse<T>>(endpoint, { params: initialParams })
    );

    allData.push(...response.data.data);
    nextUrl = response.data.paging?.next;

    while (nextUrl && (!maxItems || allData.length < maxItems)) {
      const pageResponse = await retryWithBackoff(() =>
        axios.get<MetaApiResponse<T>>(nextUrl!)
      );
      allData.push(...pageResponse.data.data);
      nextUrl = pageResponse.data.paging?.next;
    }

    return maxItems ? allData.slice(0, maxItems) : allData;
  }
}

// Custom error types
export class MetaTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetaTokenError';
  }
}

export class MetaRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetaRateLimitError';
  }
}

export class MetaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetaValidationError';
  }
}
