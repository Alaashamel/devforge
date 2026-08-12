#!/usr/bin/env node

import { Pool } from 'pg';
import { env } from './env.js';
import {
  migrateUp,
  migrateDown,
  migrationStatus,
  scaffoldMigration,
  DEFAULT_MIGRATIONS_DIR,
} from './runner.js';

function parseArgs(args) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--to' || arg === '--steps') {
      flags[arg.slice(2)] = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--')) {
      const [key, value = true] = arg.slice(2).split('=');
      flags[key] = value;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function usage() {
  process.stdout.write(`
DevForge database migration CLI (reads DATABASE_URL from the environment)

Commands:
  up [--to <name>]    Apply all pending migrations, or up to and including --to.
  down [--steps N]    Roll back the last N migrations (default 1).
  status              Show each migration as applied or pending.
  create <name>       Scaffold a new empty migration file.
`);
}

async function withClient(run) {
  const pool = new Pool({ connectionString: env.databaseUrl });
  const client = await pool.connect();
  try {
    return await run(client);
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const command = positional[0];

  if (command === 'create') {
    const name = positional[1];
    if (!name) {
      usage();
      process.exitCode = 1;
      return;
    }
    const filename = scaffoldMigration(DEFAULT_MIGRATIONS_DIR, name);
    process.stdout.write(`[database] created ${filename}\n`);
    return;
  }

  if (command === 'up') {
    await withClient(async (client) => {
      const applied = await migrateUp({ client, to: flags.to });
      if (applied.length > 0) {
        process.stdout.write(`[database] applied ${applied.join(', ')}\n`);
      }
      process.stdout.write('[database] up to date\n');
    });
    return;
  }

  if (command === 'down') {
    const steps = flags.steps === undefined ? 1 : Number(flags.steps);
    await withClient(async (client) => {
      const rolledBack = await migrateDown({ client, steps });
      if (rolledBack.length > 0) {
        process.stdout.write(`[database] rolled back ${rolledBack.join(', ')}\n`);
      } else {
        process.stdout.write('[database] nothing to roll back\n');
      }
    });
    return;
  }

  if (command === 'status') {
    await withClient(async (client) => {
      const rows = await migrationStatus({ client });
      for (const row of rows) {
        const state = row.appliedAt ? 'applied' : 'pending';
        const at = row.appliedAt ? ` (${row.appliedAt.toISOString()})` : '';
        process.stdout.write(`[database] ${state.padEnd(8)} ${row.name}${at}\n`);
      }
    });
    return;
  }

  usage();
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(`[database] ${err.message}`);
  process.exitCode = 1;
});
