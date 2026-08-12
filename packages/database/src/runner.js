import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

const MIGRATION_FILE = /^(\d{4})_(.+)\.js$/;

/**
 * List migration files in a directory, ordered by their numeric prefix.
 * A migration file is `NNNN_name.js` exporting `up(db)` and `down(db)`.
 */
export function listMigrations(dir = DEFAULT_MIGRATIONS_DIR) {
  const entries = existsSync(dir) ? readdirSync(dir) : [];
  const migrations = [];
  for (const entry of entries) {
    const match = MIGRATION_FILE.exec(entry);
    if (!match) {
      if (entry.endsWith('.js')) {
        throw new Error(`invalid migration filename: ${entry} (expected NNNN_name.js)`);
      }
      continue;
    }
    const number = Number(match[1]);
    if (migrations.some((migration) => migration.number === number)) {
      throw new Error(`duplicate migration number: ${number}`);
    }
    migrations.push({
      number,
      name: `${match[1]}_${match[2]}`,
      file: entry,
      path: join(dir, entry),
    });
  }
  return migrations.sort((a, b) => a.number - b.number);
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id bigserial PRIMARY KEY,
      name text NOT NULL UNIQUE,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function getApplied(client) {
  const { rows } = await client.query(
    'SELECT name, applied_at FROM schema_migrations ORDER BY id',
  );
  return rows.map((row) => ({ name: row.name, appliedAt: row.applied_at }));
}

async function loadMigration(migration) {
  const mod = await import(pathToFileURL(migration.path).href);
  if (typeof mod.up !== 'function' || typeof mod.down !== 'function') {
    throw new Error(
      `migration ${migration.name} must export async functions up(db) and down(db)`,
    );
  }
  return mod;
}

/**
 * Apply pending migrations inside a single transaction. Pass a connected
 * pg client; the transaction is opened and committed/rolled back here.
 */
export async function migrateUp({ client, dir = DEFAULT_MIGRATIONS_DIR, to }) {
  const migrations = listMigrations(dir);
  const target = migrations.find((migration) => migration.name === to);
  if (to && !target) {
    throw new Error(`unknown migration to apply: ${to}`);
  }
  await client.query('BEGIN');
  try {
    await ensureMigrationTable(client);
    const applied = new Set((await getApplied(client)).map((row) => row.name));
    const pending = migrations.filter((migration) => !applied.has(migration.name));
    const run = to ? pending.filter((migration) => migration.number <= target.number) : pending;
    for (const migration of run) {
      const mod = await loadMigration(migration);
      await mod.up(client);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
    }
    await client.query('COMMIT');
    return run.map((migration) => migration.name);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

/**
 * Roll back the last `steps` applied migrations (default 1), newest first,
 * inside a single transaction.
 */
export async function migrateDown({ client, dir = DEFAULT_MIGRATIONS_DIR, steps = 1 }) {
  if (!Number.isInteger(steps) || steps < 1) {
    throw new Error('steps must be a positive integer');
  }
  const migrations = listMigrations(dir);
  const byName = new Map(migrations.map((migration) => [migration.name, migration]));
  await client.query('BEGIN');
  try {
    await ensureMigrationTable(client);
    const applied = await getApplied(client);
    const toRollback = applied.slice(-steps).reverse();
    for (const record of toRollback) {
      const migration = byName.get(record.name);
      if (!migration) {
        throw new Error(`applied migration ${record.name} has no migration file`);
      }
      const mod = await loadMigration(migration);
      await mod.down(client);
      await client.query('DELETE FROM schema_migrations WHERE name = $1', [record.name]);
    }
    await client.query('COMMIT');
    return toRollback.map((record) => record.name);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

/**
 * Report applied/pending state for every migration file.
 */
export async function migrationStatus({ client, dir = DEFAULT_MIGRATIONS_DIR }) {
  await ensureMigrationTable(client);
  const applied = new Map((await getApplied(client)).map((row) => [row.name, row.appliedAt]));
  return listMigrations(dir).map((migration) => ({
    name: migration.name,
    appliedAt: applied.get(migration.name) ?? null,
  }));
}

const TEMPLATE = (name) => `// Migration: ${name}
export const up = async (db) => {
  // await db.query(\`...\`);
};

export const down = async (db) => {
  // await db.query(\`...\`);
};
`;

/**
 * Scaffold an empty migration file with the next numeric prefix.
 */
export function scaffoldMigration(dir, name) {
  const clean = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  if (!clean) {
    throw new Error('migration name must be a non-empty string');
  }
  const existing = listMigrations(dir);
  const number = existing.length === 0 ? 1 : existing[existing.length - 1].number + 1;
  const filename = `${String(number).padStart(4, '0')}_${clean}.js`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), TEMPLATE(`${String(number).padStart(4, '0')}_${clean}`), 'utf8');
  return filename;
}
