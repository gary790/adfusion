// ============================================
// AD FUSION - Common Utility Helpers
// ============================================
import { v4 as uuidv4 } from 'uuid';
import { ApiResponse, PaginationMeta, PaginatedRequest } from '../types';

// Generate UUID
export function generateId(): string {
  return uuidv4();
}

// Build successful API response
export function successResponse<T>(data: T, meta?: PaginationMeta): ApiResponse<T> {
  return { success: true, data, meta };
}

// Build error API response
export function errorResponse(code: string, message: string, details?: Record<string, unknown>): ApiResponse {
  return { success: false, error: { code, message, details } };
}

// Parse pagination parameters
export function parsePagination(params: PaginatedRequest): {
  limit: number;
  offset: number;
  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
} {
  const page = Math.max(1, params.page || 1);
  const perPage = Math.min(100, Math.max(1, params.per_page || 20));
  return {
    limit: perPage,
    offset: (page - 1) * perPage,
    sortBy: params.sort_by || 'created_at',
    sortOrder: (params.sort_order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'),
  };
}

// Build pagination meta
export function buildPaginationMeta(total: number, page: number, perPage: number): PaginationMeta {
  return {
    page,
    per_page: perPage,
    total,
    total_pages: Math.ceil(total / perPage),
  };
}

// Retry with exponential backoff (for Meta API calls)
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

// Sleep utility
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Safe JSON parse
export function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

// Calculate percentage change
export function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

// Format currency
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

// Sanitize Meta account ID
export function sanitizeMetaAccountId(id: string): string {
  return id.startsWith('act_') ? id : `act_${id}`;
}

// Extract numeric ID from Meta account format
export function extractMetaId(id: string): string {
  return id.replace('act_', '');
}

// Chunk array for batch operations
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Deep merge objects
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key as keyof T];
    const targetVal = target[key as keyof T];
    if (
      sourceVal &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      (result as Record<string, unknown>)[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      );
    } else if (sourceVal !== undefined) {
      (result as Record<string, unknown>)[key] = sourceVal;
    }
  }
  return result;
}
