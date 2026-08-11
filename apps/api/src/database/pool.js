import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 2000,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  // Idle client errors must not crash the process; health reporting
  // reflects database availability instead.
  logger.error({ err }, 'idle database client error');
});

export async function checkDatabase() {
  try {
    const result = await pool.query('SELECT 1');
    return result.rowCount === 1;
  } catch {
    return false;
  }
}
