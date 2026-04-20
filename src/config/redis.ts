// ============================================
// AD FUSION - Redis Cache Layer
// ============================================
import Redis from 'ioredis';
import config from '../config';
import { logger } from '../utils/logger';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      lazyConnect: true,
    });

    redis.on('connect', () => logger.info('Redis connected'));
    redis.on('error', (err) => logger.error('Redis error', { error: err.message }));
    redis.on('close', () => logger.warn('Redis connection closed'));
  }
  return redis;
}

// Cache helpers
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const r = getRedis();
    const data = await r.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.warn('Cache get failed', { key, error: (error as Error).message });
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number = 300): Promise<void> {
  try {
    const r = getRedis();
    await r.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (error) {
    logger.warn('Cache set failed', { key, error: (error as Error).message });
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    const r = getRedis();
    await r.del(key);
  } catch (error) {
    logger.warn('Cache delete failed', { key, error: (error as Error).message });
  }
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  try {
    const r = getRedis();
    const keys = await r.keys(pattern);
    if (keys.length > 0) {
      await r.del(...keys);
    }
  } catch (error) {
    logger.warn('Cache pattern delete failed', { pattern, error: (error as Error).message });
  }
}

export async function checkRedisConnection(): Promise<boolean> {
  try {
    const r = getRedis();
    await r.ping();
    return true;
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
