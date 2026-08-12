// Idempotent local-development seed. Safe to run repeatedly (upserts via
// ON CONFLICT DO NOTHING with fixed UUIDs). Refuses to run in production.
import { Pool } from 'pg';
import { env } from './env.js';

const U = '00000000-0000-0000-0000-0000000000';
const user = (n) => `${U}${String(n).padStart(2, '0')}`;

const seed = async (db) => {
  const users = [
    {
      id: user(1),
      email: 'alaa@devforge.test',
      name: 'Alaa Shamel',
      status: 'active',
      email_verified_at: new Date(),
      password_hash: 'seed-only-placeholder-hash',
    },
    {
      id: user(2),
      email: 'jordan@devforge.test',
      name: 'Jordan Rivera',
      status: 'active',
      email_verified_at: new Date(),
      password_hash: 'seed-only-placeholder-hash',
    },
    {
      id: user(3),
      email: 'sam@devforge.test',
      name: 'Sam Okafor',
      status: 'active',
      email_verified_at: null,
      password_hash: 'seed-only-placeholder-hash',
    },
  ];
  for (const u of users) {
    await db.query(
      `INSERT INTO users (id, email, name, password_hash, email_verified_at, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING`,
      [u.id, u.email, u.name, u.password_hash, u.email_verified_at, u.status],
    );
  }

  const orgs = [
    { id: user(10), slug: 'devforge', name: 'DevForge Inc.', owner_id: user(1), plan: 'pro' },
    { id: user(11), slug: 'acme', name: 'Acme Labs', owner_id: user(2), plan: 'free' },
  ];
  for (const o of orgs) {
    await db.query(
      `INSERT INTO organizations (id, name, slug, owner_id, plan)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug) DO NOTHING`,
      [o.id, o.name, o.slug, o.owner_id, o.plan],
    );
  }

  await db.query(
    `INSERT INTO organization_members (organization_id, user_id, role, status, joined_at)
     VALUES
       ($1, $2, 'owner', 'active', now()),
       ($1, $3, 'admin', 'active', now()),
       ($1, $4, 'developer', 'active', now()),
       ($5, $3, 'owner', 'active', now())
     ON CONFLICT (organization_id, user_id) DO NOTHING`,
    [user(10), user(1), user(2), user(3), user(11)],
  );

  await db.query(
    `INSERT INTO teams (id, organization_id, name, description)
     VALUES ($1, $2, 'Platform', 'Core platform squad')
     ON CONFLICT (id) DO NOTHING`,
    [user(30), user(10)],
  );
  await db.query(
    `INSERT INTO team_members (team_id, user_id)
     VALUES ($1, $2), ($1, $3)
     ON CONFLICT (team_id, user_id) DO NOTHING`,
    [user(30), user(1), user(2)],
  );

  const projects = [
    {
      id: user(40),
      organization_id: user(10),
      name: 'DevForge Platform',
      key: 'DF',
      created_by: user(1),
    },
    {
      id: user(41),
      organization_id: user(11),
      name: 'Acme Marketing Site',
      key: 'ACME',
      created_by: user(2),
    },
  ];
  for (const p of projects) {
    await db.query(
      `INSERT INTO projects (id, organization_id, name, key, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, key) DO NOTHING`,
      [p.id, p.organization_id, p.name, p.key, p.created_by],
    );
  }

  await db.query(
    `INSERT INTO project_members (project_id, user_id, role)
     VALUES ($1, $2, 'owner'), ($1, $3, 'admin'), ($1, $4, 'developer')
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [user(40), user(1), user(2), user(3)],
  );

  await db.query(
    `INSERT INTO milestones (id, project_id, title, status, position)
     VALUES ($1, $2, 'Alpha', 'active', 1), ($3, $2, 'Beta', 'planned', 2)
     ON CONFLICT (id) DO NOTHING`,
    [user(50), user(40), user(51)],
  );

  const labels = [
    { id: user(60), project_id: user(40), name: 'backend', color: '#0ea5e9' },
    { id: user(61), project_id: user(40), name: 'frontend', color: '#a855f7' },
    { id: user(62), project_id: user(40), name: 'bug', color: '#ef4444' },
  ];
  for (const l of labels) {
    await db.query(
      `INSERT INTO labels (id, project_id, name, color)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, name) DO NOTHING`,
      [l.id, l.project_id, l.name, l.color],
    );
  }

  const tasks = [
    {
      id: user(70),
      project_id: user(40),
      milestone_id: user(50),
      type: 'task',
      status: 'in_progress',
      priority: 'high',
      title: 'Baseline database schema',
      description: 'Land migration tooling and the Phase 2 schema.',
      assignee_id: user(1),
      reporter_id: user(1),
      position: 1,
    },
    {
      id: user(71),
      project_id: user(40),
      milestone_id: user(50),
      type: 'issue',
      status: 'todo',
      priority: 'medium',
      title: 'Health dashboard polish',
      description: 'Add uptime sparkline and last-checked timestamp.',
      assignee_id: user(2),
      reporter_id: user(1),
      position: 2,
    },
    {
      id: user(72),
      project_id: user(40),
      type: 'bug',
      status: 'todo',
      priority: 'urgent',
      title: 'Readiness 503 shows as error in UI',
      description: 'Treat degraded as data, not failure.',
      assignee_id: user(3),
      reporter_id: user(2),
      position: 3,
    },
  ];
  for (const t of tasks) {
    await db.query(
      `INSERT INTO tasks (id, project_id, milestone_id, type, status, priority, title, description, assignee_id, reporter_id, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO NOTHING`,
      [t.id, t.project_id, t.milestone_id, t.type, t.status, t.priority, t.title, t.description, t.assignee_id, t.reporter_id, t.position],
    );
  }

  await db.query(
    `INSERT INTO task_labels (task_id, label_id)
     VALUES ($1, $2), ($3, $4)
     ON CONFLICT (task_id, label_id) DO NOTHING`,
    [user(70), user(60), user(72), user(62)],
  );

  await db.query(
    `INSERT INTO task_comments (id, task_id, author_id, body)
     VALUES ($1, $2, $3, 'Migrations now apply cleanly against the dev compose database.')
     ON CONFLICT (id) DO NOTHING`,
    [user(80), user(70), user(1)],
  );

  await db.query(
    `INSERT INTO task_activity (id, task_id, actor_id, action, field, new_value)
     VALUES ($1, $2, $3, 'status_change', 'status', 'in_progress')
     ON CONFLICT (id) DO NOTHING`,
    [user(81), user(70), user(1)],
  );

  await db.query(
    `INSERT INTO notifications (id, user_id, type, title, href)
     VALUES ($1, $2, 'task_assigned', 'Baseline database schema assigned to you', '/projects/DF/tasks/${user(70)}')
     ON CONFLICT (id) DO NOTHING`,
    [user(82), user(1)],
  );

  await db.query(
    `INSERT INTO github_connections (id, user_id, github_user_id, github_login, access_token_encrypted, scopes)
     VALUES ($1, $2, 7654321, 'alaa-devforge', 'dev-only-placeholder-token', '{repo,read:org}')
     ON CONFLICT (github_user_id) DO NOTHING`,
    [user(90), user(1)],
  );

  await db.query(
    `INSERT INTO repositories (id, organization_id, github_repo_id, name, full_name, url, default_branch)
     VALUES ($1, $2, 123456789, 'devforge', 'Alaashamel/devforge', 'https://github.com/Alaashamel/devforge', 'main')
     ON CONFLICT (organization_id, github_repo_id) DO NOTHING`,
    [user(91), user(10)],
  );

  await db.query(
    `INSERT INTO repository_webhooks (id, repository_id, github_webhook_id, events, active)
     VALUES ($1, $2, 555, '{pull_request,push}', true)
     ON CONFLICT (id) DO NOTHING`,
    [user(92), user(91)],
  );

  await db.query(
    `INSERT INTO pull_requests (id, repository_id, number, title, state, author, head_ref, base_ref, additions, deletions)
     VALUES ($1, $2, 1, 'feat(database): migration tooling and baseline schema', 'open', 'Alaashamel', 'feat/database-schema', 'main', 1200, 40)
     ON CONFLICT (repository_id, number) DO NOTHING`,
    [user(93), user(91)],
  );

  await db.query(
    `INSERT INTO ai_conversations (id, organization_id, user_id, project_id, title)
     VALUES ($1, $2, $3, $4, 'Phase 2 schema review')
     ON CONFLICT (id) DO NOTHING`,
    [user(95), user(10), user(1), user(40)],
  );
  await db.query(
    `INSERT INTO ai_messages (id, conversation_id, role, content)
     VALUES ($1, $2, 'user', 'Summarize the baseline schema.'), ($3, $2, 'assistant', 'Identity, organizations, projects, GitHub, collaboration and AI tables land in six migrations.')
     ON CONFLICT (id) DO NOTHING`,
    [user(96), user(95), user(97)],
  );
};

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('refusing to seed a production database');
  }
  const pool = new Pool({ connectionString: env.databaseUrl });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await seed(client);
    await client.query('COMMIT');
    const { rows } = await client.query(
      `SELECT (SELECT count(*) FROM users) AS users,
              (SELECT count(*) FROM organizations) AS organizations,
              (SELECT count(*) FROM projects) AS projects,
              (SELECT count(*) FROM tasks) AS tasks`,
    );
    const r = rows[0];
    process.stdout.write(
      `[database] seed complete — ${r.users} users, ${r.organizations} organizations, ${r.projects} projects, ${r.tasks} tasks\n`,
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`[database] seed failed: ${err.message}`);
  process.exitCode = 1;
});
