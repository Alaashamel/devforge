import pg from 'pg';
import { TEST_DATABASE_URL } from './setup.js';

const { Pool } = pg;

function adminUrl(url) {
  const parsed = new URL(url);
  parsed.pathname = '/postgres';
  return parsed.toString();
}

export default async function globalSetup() {
  const databaseUrl = process.env.DATABASE_URL || TEST_DATABASE_URL;
  const dbName = new URL(databaseUrl).pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(dbName)) {
    throw new Error(`unsafe database name for test setup: ${dbName}`);
  }
  const pool = new Pool({ connectionString: adminUrl(databaseUrl) });
  try {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );
    if (rowCount === 0) {
      await pool.query(`CREATE DATABASE ${dbName}`);
    }
  } finally {
    await pool.end();
  }
}
