// ============================================
// AD FUSION - Database Connection & Query Layer
// ============================================
import { Pool, PoolConfig, QueryResult } from 'pg';
import config from '../config';
import { logger } from '../utils/logger';

const poolConfig: PoolConfig = {
  connectionString: config.database.url,
  min: config.database.poolMin,
  max: config.database.poolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined,
};

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

pool.on('connect', () => {
  logger.debug('New PostgreSQL connection established');
});

// Core query function with logging
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug('Query executed', {
      text: text.substring(0, 100),
      duration,
      rows: result.rowCount,
    });
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error('Query failed', {
      text: text.substring(0, 200),
      duration,
      error: (error as Error).message,
    });
    throw error;
  }
}

// Transaction helper
export async function transaction<T>(
  callback: (client: {
    query: <R extends Record<string, unknown> = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<QueryResult<R>>;
  }) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback({
      query: <R extends Record<string, unknown> = Record<string, unknown>>(text: string, params?: unknown[]) =>
        client.query<R>(text, params),
    });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Parameterized insert helper
export function buildInsert(table: string, data: Record<string, unknown>): { text: string; values: unknown[] } {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`);

  return {
    text: `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
    values,
  };
}

// Parameterized update helper
export function buildUpdate(
  table: string,
  data: Record<string, unknown>,
  whereColumn: string,
  whereValue: unknown
): { text: string; values: unknown[] } {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setClauses = keys.map((key, i) => `${key} = $${i + 1}`);
  values.push(whereValue);

  return {
    text: `UPDATE ${table} SET ${setClauses.join(', ')}, updated_at = NOW() WHERE ${whereColumn} = $${values.length} RETURNING *`,
    values,
  };
}

// Health check
export async function checkConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export default pool;
