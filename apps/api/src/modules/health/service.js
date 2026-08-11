import { readFileSync } from 'node:fs';
import { checkDatabase } from '../../database/pool.js';

function readVersion() {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
    );
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const SERVICE_VERSION = readVersion();

export function getLiveness() {
  return {
    status: 'ok',
    service: 'devforge-api',
    version: SERVICE_VERSION,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

export async function getReadiness() {
  const databaseUp = await checkDatabase();
  return {
    status: databaseUp ? 'ok' : 'degraded',
    checks: { database: databaseUp ? 'up' : 'down' },
  };
}
