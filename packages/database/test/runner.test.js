import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { env } from '../src/env.js';
import {
  migrateUp,
  migrateDown,
  migrationStatus,
  listMigrations,
} from '../src/runner.js';

const { Pool } = pg;

let pool;
let client;

const MIGRATION_NAMES = [
  '0001_identity',
  '0002_organizations',
  '0003_projects',
  '0004_github',
  '0005_collaboration',
  '0006_ai',
  '0007_analytics',
  '0008_github_unique_connection',
  '0009_chat',
  '0010_ai_vectors',
];

const EXPECTED_TABLES = [
  'users',
  'refresh_tokens',
  'verification_tokens',
  'password_reset_tokens',
  'organizations',
  'organization_members',
  'teams',
  'team_members',
  'projects',
  'project_members',
  'milestones',
  'tasks',
  'labels',
  'task_labels',
  'task_comments',
  'task_activity',
  'task_dependencies',
  'github_connections',
  'repositories',
  'repository_webhooks',
  'pull_requests',
  'code_reviews',
  'notifications',
  'activities',
  'ai_analyses',
  'ai_conversations',
  'ai_messages',
  'ai_jobs',
  'developer_metrics',
  'chat_messages',
  'ai_document_chunks',
];

async function tableNames() {
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  return rows.map((row) => row.table_name).sort();
}

beforeAll(async () => {
  pool = new Pool({ connectionString: env.databaseUrl });
  client = await pool.connect();
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA public');
});

afterAll(async () => {
  client.release();
  await pool.end();
});

describe('migration runner', () => {
  it('applies every migration in order', async () => {
    const applied = await migrateUp({ client });
    expect(applied).toEqual(MIGRATION_NAMES);
    const status = await migrationStatus({ client });
    expect(status.map((row) => row.name)).toEqual(MIGRATION_NAMES);
    for (const row of status) {
      expect(row.appliedAt).toBeInstanceOf(Date);
    }
  });

  it('is idempotent when run again', async () => {
    const applied = await migrateUp({ client });
    expect(applied).toEqual([]);
    const { rows } = await client.query(
      'SELECT count(*)::int AS n FROM schema_migrations',
    );
    expect(rows[0].n).toBe(MIGRATION_NAMES.length);
  });

  it('creates the documented baseline schema', async () => {
    const names = await tableNames();
    expect(names).toEqual([...EXPECTED_TABLES, 'schema_migrations'].sort());

    const { rows: email } = await client.query(`
      SELECT data_type, udt_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'email'
    `);
    expect(email[0].udt_name).toBe('citext');
    expect(email[0].data_type).toBe('USER-DEFINED');

    const { rows: softDelete } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'tasks' AND column_name = 'deleted_at'
    `);
    expect(softDelete).toHaveLength(1);

    const { rows: fk } = await client.query(`
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'organizations' AND kcu.column_name = 'owner_id'
    `);
    expect(fk).toHaveLength(1);

    const { rows: idx } = await client.query(`
      SELECT 1 FROM pg_indexes
      WHERE indexname = 'notifications_user_id_read_at_idx'
    `);
    expect(idx).toHaveLength(1);

    const { rows: unique } = await client.query(`
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'projects' AND indexname = 'projects_organization_id_key_key'
    `);
    expect(unique).toHaveLength(1);
  });

  it('rolls back the last migration and re-applies it', async () => {
    const rolledBack = await migrateDown({ client, steps: 1 });
    expect(rolledBack).toEqual(['0010_ai_vectors']);

    const { rows: idx } = await client.query(`
      SELECT 1 FROM pg_indexes
      WHERE indexname = 'ai_document_chunks_embedding_hnsw_idx'
    `);
    expect(idx).toHaveLength(0);

    const reapplied = await migrateUp({ client });
    expect(reapplied).toEqual(['0010_ai_vectors']);

    const { rows: idxAfter } = await client.query(`
      SELECT 1 FROM pg_indexes
      WHERE indexname = 'ai_document_chunks_embedding_hnsw_idx'
    `);
    expect(idxAfter).toHaveLength(1);
  });
});

describe('atomicity', () => {
  it('rolls back the whole batch when a migration fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'df-failing-'));
    try {
      writeFileSync(
        join(dir, '0001_ok.js'),
        `export const up = async (db) => {
  await db.query('CREATE TABLE ok_table (id int PRIMARY KEY)');
};
export const down = async (db) => {
  await db.query('DROP TABLE ok_table');
};`,
      );
      writeFileSync(
        join(dir, '0002_boom.js'),
        `export const up = async () => {
  throw new Error('boom');
};
export const down = async () => {};`,
      );
      await expect(migrateUp({ client, dir })).rejects.toThrow('boom');

      const { rows } = await client.query(
        'SELECT count(*)::int AS n FROM schema_migrations',
      );
      expect(rows[0].n).toBe(MIGRATION_NAMES.length);

      const { rowCount } = await client.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'ok_table'
      `);
      expect(rowCount).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an unknown --to target', async () => {
    await expect(
      migrateUp({ client, to: '0009_nope' }),
    ).rejects.toThrow(/unknown migration/);
  });
});

describe('listMigrations helper', () => {
  it('reports ten baseline migrations', () => {
    const migrations = listMigrations();
    expect(migrations).toHaveLength(10);
    expect(migrations[0].name).toBe('0001_identity');
    expect(migrations[9].name).toBe('0010_ai_vectors');
  });
});
