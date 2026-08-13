import { badRequest, notFound } from '../../utils/errors.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_WEEKS = 52;
const DEFAULT_WEEKS = 12;

function startOfWeekUTC(date) {
  const d = new Date(date.getTime());
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function parseWeeks(value) {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_WEEKS;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_WEEKS) {
    throw badRequest(`weeks must be an integer between 1 and ${MAX_WEEKS}`);
  }
  return parsed;
}

// Builds a Monday-aligned UTC window of `weeks` buckets ending at the current
// week, plus the ordered list of bucket start dates.
function buildWindow(weeks, nowDate) {
  const lastWeekStart = startOfWeekUTC(nowDate);
  const start = new Date(lastWeekStart.getTime() - (weeks - 1) * WEEK_MS);
  const periods = [];
  for (let i = 0; i < weeks; i += 1) {
    periods.push(new Date(start.getTime() + i * WEEK_MS));
  }
  return { start, lastWeekStart, periods };
}

function percent(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function healthStatus(score) {
  if (score >= 75) return 'healthy';
  if (score >= 50) return 'degraded';
  return 'critical';
}

const OVERVIEW_SQL = `
  SELECT
    (SELECT count(*)::int FROM repositories WHERE organization_id = $1) AS repositories,
    (SELECT count(*)::int FROM pull_requests pr JOIN repositories r ON r.id = pr.repository_id WHERE r.organization_id = $1) AS pull_requests,
    (SELECT count(*)::int FROM pull_requests pr JOIN repositories r ON r.id = pr.repository_id WHERE r.organization_id = $1 AND pr.state = 'open') AS prs_open,
    (SELECT count(*)::int FROM pull_requests pr JOIN repositories r ON r.id = pr.repository_id WHERE r.organization_id = $1 AND pr.state = 'merged') AS prs_merged,
    (SELECT count(*)::int FROM pull_requests pr JOIN repositories r ON r.id = pr.repository_id WHERE r.organization_id = $1 AND pr.state = 'closed') AS prs_closed,
    (SELECT coalesce(sum(pr.additions), 0)::int FROM pull_requests pr JOIN repositories r ON r.id = pr.repository_id WHERE r.organization_id = $1) AS additions,
    (SELECT coalesce(sum(pr.deletions), 0)::int FROM pull_requests pr JOIN repositories r ON r.id = pr.repository_id WHERE r.organization_id = $1) AS deletions,
    (SELECT count(*)::int FROM projects WHERE organization_id = $1 AND deleted_at IS NULL) AS projects,
    (SELECT count(*)::int FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.organization_id = $1 AND t.deleted_at IS NULL) AS tasks,
    (SELECT count(*)::int FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.organization_id = $1 AND t.deleted_at IS NULL AND t.status = 'done') AS tasks_done
`;

const TOP_CONTRIBUTORS_SQL = `
  SELECT pr.author AS author,
         count(*)::int AS merged,
         coalesce(sum(pr.additions), 0)::int AS additions,
         coalesce(sum(pr.deletions), 0)::int AS deletions
  FROM pull_requests pr
  JOIN repositories r ON r.id = pr.repository_id
  WHERE r.organization_id = $1 AND pr.state = 'merged'
  GROUP BY pr.author
  ORDER BY merged DESC, additions DESC
  LIMIT 5
`;

const RECENT_MERGED_SQL = `
  SELECT pr.number, pr.title, pr.author, pr.merged_at, r.full_name AS repository
  FROM pull_requests pr
  JOIN repositories r ON r.id = pr.repository_id
  WHERE r.organization_id = $1 AND pr.state = 'merged'
  ORDER BY pr.merged_at DESC NULLS LAST
  LIMIT 5
`;

const HEALTH_SQL = `
  SELECT
    (SELECT count(*)::int FROM pull_requests pr JOIN repositories r ON r.id = pr.repository_id WHERE r.organization_id = $1) AS total_prs,
    (SELECT count(*)::int FROM pull_requests pr JOIN repositories r ON r.id = pr.repository_id WHERE r.organization_id = $1 AND pr.state = 'merged') AS merged_prs,
    (SELECT count(*)::int FROM pull_requests pr JOIN repositories r ON r.id = pr.repository_id WHERE r.organization_id = $1 AND pr.state = 'closed') AS closed_prs,
    (SELECT count(*)::int FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.organization_id = $1 AND t.deleted_at IS NULL) AS total_tasks,
    (SELECT count(*)::int FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.organization_id = $1 AND t.deleted_at IS NULL AND t.status = 'done') AS done_tasks,
    (SELECT count(*)::int FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.organization_id = $1 AND t.deleted_at IS NULL AND t.type = 'issue') AS total_issues,
    (SELECT count(*)::int FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.organization_id = $1 AND t.deleted_at IS NULL AND t.type = 'issue' AND t.status = 'done') AS closed_issues,
    (SELECT count(DISTINCT cr.pull_request_id)::int FROM code_reviews cr JOIN repositories r ON r.id = cr.repository_id WHERE r.organization_id = $1 AND cr.status = 'completed') AS reviewed_prs
`;

const VELOCITY_EVENTS_SQL = `
  SELECT 'merged_pr' AS kind, pr.merged_at AS at
  FROM pull_requests pr
  JOIN repositories r ON r.id = pr.repository_id
  WHERE r.organization_id = $1 AND pr.state = 'merged' AND pr.merged_at >= $2
  UNION ALL
  SELECT 'done_task' AS kind, t.updated_at AS at
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  WHERE p.organization_id = $1 AND t.deleted_at IS NULL AND t.status = 'done'
    AND t.type <> 'issue' AND t.updated_at >= $2
  UNION ALL
  SELECT 'closed_issue' AS kind, t.updated_at AS at
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  WHERE p.organization_id = $1 AND t.deleted_at IS NULL AND t.status = 'done' AND t.type = 'issue' AND t.updated_at >= $2
  UNION ALL
  SELECT 'review' AS kind, cr.updated_at AS at
  FROM code_reviews cr
  JOIN repositories r ON r.id = cr.repository_id
  WHERE r.organization_id = $1 AND cr.status = 'completed' AND cr.updated_at >= $2
`;

const REPOSITORY_SUMMARIES_SQL = `
  SELECT r.id, r.name, r.full_name, r.url,
         count(pr.id)::int AS total_prs,
         count(pr.id) FILTER (WHERE pr.state = 'open')::int AS open_prs,
         count(pr.id) FILTER (WHERE pr.state = 'merged')::int AS merged_prs,
         count(pr.id) FILTER (WHERE pr.state = 'closed')::int AS closed_prs,
         coalesce(sum(pr.additions), 0)::int AS additions,
         coalesce(sum(pr.deletions), 0)::int AS deletions
  FROM repositories r
  LEFT JOIN pull_requests pr ON pr.repository_id = r.id
  WHERE r.organization_id = $1
  GROUP BY r.id, r.name, r.full_name, r.url
  ORDER BY merged_prs DESC, r.name ASC
`;

const MONTHLY_ACTIVITY_SQL = `
  SELECT to_char(date_trunc('month', pr.created_at), 'YYYY-MM') AS period,
         count(*)::int AS created,
         count(*) FILTER (WHERE pr.state = 'open')::int AS open,
         count(*) FILTER (WHERE pr.state = 'merged')::int AS merged,
         count(*) FILTER (WHERE pr.state = 'closed')::int AS closed,
         coalesce(sum(pr.additions), 0)::int AS additions,
         coalesce(sum(pr.deletions), 0)::int AS deletions
  FROM pull_requests pr
  WHERE pr.repository_id = $1
  GROUP BY 1
  ORDER BY 1 DESC
  LIMIT 12
`;

const RECENT_PULL_REQUESTS_SQL = `
  SELECT number, title, state, author, additions, deletions, merged_at, created_at
  FROM pull_requests
  WHERE repository_id = $1
  ORDER BY created_at DESC
  LIMIT 10
`;

const REVIEWS_BY_STATUS_SQL = `
  SELECT status, count(*)::int AS count
  FROM code_reviews
  WHERE repository_id = $1
  GROUP BY status
  ORDER BY count DESC
`;

// Team members plus their in-window task rows (task rows are filtered to the
// window so developers with no recent activity still appear).
const DEVELOPER_TASK_ROWS_SQL = `
  SELECT u.id AS user_id, u.name, u.email, u.avatar_url,
         t.id AS task_id, t.status, t.type, t.estimate, t.updated_at
  FROM users u
  JOIN organization_members om ON om.user_id = u.id
    AND om.organization_id = $1 AND om.status = 'active'
  LEFT JOIN tasks t ON t.assignee_id = u.id
  LEFT JOIN projects p ON p.id = t.project_id
    AND p.organization_id = $1 AND p.deleted_at IS NULL
  WHERE t.id IS NULL OR (p.id IS NOT NULL AND t.deleted_at IS NULL AND t.updated_at >= $2)
  ORDER BY u.name ASC
`;

const DEVELOPER_PR_ROWS_SQL = `
  SELECT gc.user_id AS user_id, pr.state, pr.additions, pr.deletions, pr.merged_at
  FROM pull_requests pr
  JOIN repositories r ON r.id = pr.repository_id
  JOIN github_connections gc ON gc.github_login = pr.author
  WHERE r.organization_id = $1 AND pr.state = 'merged' AND pr.merged_at >= $2
`;

const DEVELOPER_METRICS_UPSERT_SQL = `
  INSERT INTO developer_metrics (organization_id, user_id, period, commits, pull_requests, reviews,
                                 issues_closed, tasks_completed, velocity_points, health_score, computed_at)
  VALUES ($1, $2, $3, 0, $4, 0, 0, $5, $6, $7, now())
  ON CONFLICT (organization_id, user_id, period) DO UPDATE SET
    pull_requests = EXCLUDED.pull_requests,
    tasks_completed = EXCLUDED.tasks_completed,
    velocity_points = EXCLUDED.velocity_points,
    health_score = EXCLUDED.health_score,
    computed_at = now(),
    updated_at = now()
`;

function mapRepositorySummary(r) {
  return {
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    url: r.url,
    totalPrs: r.total_prs,
    openPrs: r.open_prs,
    mergedPrs: r.merged_prs,
    closedPrs: r.closed_prs,
    additions: r.additions,
    deletions: r.deletions,
  };
}

function mapRecentMerged(r) {
  return {
    number: r.number,
    title: r.title,
    author: r.author ?? null,
    repository: r.repository,
    mergedAt: r.merged_at ?? null,
  };
}

export function createAnalyticsService({ pool, now = () => new Date() }) {
  async function assertOrg(orgId) {
    const { rows } = await pool.query('SELECT id FROM organizations WHERE id = $1', [orgId]);
    if (rows.length === 0) {
      throw notFound('Organization not found');
    }
  }

  async function assertRepo({ orgId, repoId }) {
    const { rows } = await pool.query(
      'SELECT * FROM repositories WHERE organization_id = $1 AND id = $2',
      [orgId, repoId],
    );
    if (rows.length === 0) {
      throw notFound('Repository not found');
    }
    return rows[0];
  }

  async function getOverview({ orgId }) {
    await assertOrg(orgId);
    const { rows: [r] } = await pool.query(OVERVIEW_SQL, [orgId]);
    const { rows: contributors } = await pool.query(TOP_CONTRIBUTORS_SQL, [orgId]);
    const { rows: recent } = await pool.query(RECENT_MERGED_SQL, [orgId]);
    return {
      data: {
        repositories: r.repositories,
        pullRequests: r.pull_requests,
        prsByState: {
          open: r.prs_open,
          merged: r.prs_merged,
          closed: r.prs_closed,
        },
        additions: r.additions,
        deletions: r.deletions,
        projects: r.projects,
        tasks: r.tasks,
        tasksDone: r.tasks_done,
        completionRatio: percent(r.tasks_done, r.tasks),
        topContributors: contributors.map((c) => ({
          author: c.author,
          merged: c.merged,
          additions: c.additions,
          deletions: c.deletions,
        })),
        recentMerged: recent.map(mapRecentMerged),
      },
    };
  }

  async function getVelocity({ orgId, weeks: weeksParam }) {
    await assertOrg(orgId);
    const weeks = parseWeeks(weeksParam);
    const window = buildWindow(weeks, now());
    const { rows } = await pool.query(VELOCITY_EVENTS_SQL, [orgId, window.start]);

    const buckets = new Map(
      window.periods.map((period) => [
        isoDate(period),
        { period: isoDate(period), mergedPrs: 0, completedTasks: 0, issuesClosed: 0, reviewsCompleted: 0 },
      ]),
    );
    for (const row of rows) {
      const period = isoDate(startOfWeekUTC(row.at));
      const bucket = buckets.get(period);
      if (!bucket) continue;
      if (row.kind === 'merged_pr') bucket.mergedPrs += 1;
      else if (row.kind === 'done_task') bucket.completedTasks += 1;
      else if (row.kind === 'closed_issue') bucket.issuesClosed += 1;
      else if (row.kind === 'review') bucket.reviewsCompleted += 1;
    }

    const series = [...buckets.values()];
    const totals = series.reduce(
      (acc, b) => ({
        mergedPrs: acc.mergedPrs + b.mergedPrs,
        completedTasks: acc.completedTasks + b.completedTasks,
        issuesClosed: acc.issuesClosed + b.issuesClosed,
        reviewsCompleted: acc.reviewsCompleted + b.reviewsCompleted,
      }),
      { mergedPrs: 0, completedTasks: 0, issuesClosed: 0, reviewsCompleted: 0 },
    );

    return {
      data: {
        window: { start: isoDate(window.start), end: isoDate(window.lastWeekStart), weeks },
        series,
        totals,
      },
    };
  }

  async function getHealth({ orgId }) {
    await assertOrg(orgId);
    const { rows: [r] } = await pool.query(HEALTH_SQL, [orgId]);

    const components = {
      taskCompletion: {
        rate: percent(r.done_tasks, r.total_tasks),
        weight: 35,
        available: r.total_tasks > 0,
      },
      mergeRate: {
        rate: percent(r.merged_prs, r.merged_prs + r.closed_prs),
        weight: 30,
        available: r.merged_prs + r.closed_prs > 0,
      },
      issueCloseRate: {
        rate: percent(r.closed_issues, r.total_issues),
        weight: 20,
        available: r.total_issues > 0,
      },
      reviewCoverage: {
        rate: percent(r.reviewed_prs, r.total_prs),
        weight: 15,
        available: r.total_prs > 0,
      },
    };

    const available = Object.values(components).filter((c) => c.available);
    let score = null;
    if (available.length > 0) {
      const weightSum = available.reduce((sum, c) => sum + c.weight, 0);
      score = clampScore(
        (available.reduce((sum, c) => sum + c.rate * c.weight, 0) / weightSum) * 100,
      );
    }

    return {
      data: {
        score,
        status: score === null ? 'no-data' : healthStatus(score),
        components: {
          taskCompletion: components.taskCompletion.rate,
          mergeRate: components.mergeRate.rate,
          issueCloseRate: components.issueCloseRate.rate,
          reviewCoverage: components.reviewCoverage.rate,
        },
        breakdown: {
          totalPrs: r.total_prs,
          mergedPrs: r.merged_prs,
          closedPrs: r.closed_prs,
          reviewedPrs: r.reviewed_prs,
          totalTasks: r.total_tasks,
          doneTasks: r.done_tasks,
          totalIssues: r.total_issues,
          closedIssues: r.closed_issues,
        },
      },
    };
  }

  async function getDevelopers({ orgId, weeks: weeksParam }) {
    await assertOrg(orgId);
    const weeks = parseWeeks(weeksParam);
    const window = buildWindow(weeks, now());

    const [taskResult, prResult] = await Promise.all([
      pool.query(DEVELOPER_TASK_ROWS_SQL, [orgId, window.start]),
      pool.query(DEVELOPER_PR_ROWS_SQL, [orgId, window.start]),
    ]);

    const developers = new Map();
    for (const row of taskResult.rows) {
      if (!developers.has(row.user_id)) {
        developers.set(row.user_id, {
          userId: row.user_id,
          name: row.name,
          email: row.email,
          avatarUrl: row.avatar_url ?? null,
          tasksAssigned: 0,
          tasksCompleted: 0,
          velocityPoints: 0,
          mergedPrs: 0,
          additions: 0,
          deletions: 0,
          healthScore: null,
          weekly: new Map(),
        });
      }
      const dev = developers.get(row.user_id);
      if (row.task_id) {
        dev.tasksAssigned += 1;
        if (row.status === 'done') {
          dev.tasksCompleted += 1;
          dev.velocityPoints += row.estimate ?? 0;
          const period = isoDate(startOfWeekUTC(row.updated_at));
          const bucket = dev.weekly.get(period) ?? { period, tasksCompleted: 0, velocityPoints: 0, pullRequests: 0 };
          bucket.tasksCompleted += 1;
          bucket.velocityPoints += row.estimate ?? 0;
          dev.weekly.set(period, bucket);
        }
      }
    }

    for (const row of prResult.rows) {
      const dev = developers.get(row.user_id);
      if (!dev) continue;
      dev.mergedPrs += 1;
      dev.additions += row.additions;
      dev.deletions += row.deletions;
      const period = isoDate(startOfWeekUTC(row.merged_at));
      const bucket = dev.weekly.get(period) ?? { period, tasksCompleted: 0, velocityPoints: 0, pullRequests: 0 };
      bucket.pullRequests += 1;
      dev.weekly.set(period, bucket);
    }

    let materialized = 0;
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');
      for (const dev of developers.values()) {
        if (dev.tasksAssigned > 0) {
          dev.healthScore = clampScore((dev.tasksCompleted / dev.tasksAssigned) * 100);
        }
        for (const bucket of dev.weekly.values()) {
          await dbClient.query(DEVELOPER_METRICS_UPSERT_SQL, [
            orgId,
            dev.userId,
            bucket.period,
            bucket.pullRequests,
            bucket.tasksCompleted,
            bucket.velocityPoints,
            dev.healthScore,
          ]);
          materialized += 1;
        }
      }
      await dbClient.query('COMMIT');
    } catch (err) {
      await dbClient.query('ROLLBACK');
      throw err;
    } finally {
      dbClient.release();
    }

    const developersList = [...developers.values()]
      .map((dev) => ({
        userId: dev.userId,
        name: dev.name,
        email: dev.email,
        avatarUrl: dev.avatarUrl,
        tasksAssigned: dev.tasksAssigned,
        tasksCompleted: dev.tasksCompleted,
        velocityPoints: Math.round(dev.velocityPoints * 100) / 100,
        mergedPrs: dev.mergedPrs,
        additions: dev.additions,
        deletions: dev.deletions,
        healthScore: dev.healthScore,
      }))
      .sort((a, b) => b.velocityPoints - a.velocityPoints || b.tasksCompleted - a.tasksCompleted || a.name.localeCompare(b.name));

    return {
      data: { developers: developersList },
      meta: {
        window: { start: isoDate(window.start), end: isoDate(window.lastWeekStart), weeks },
        developerMetrics: materialized,
      },
    };
  }

  async function listRepositorySummaries({ orgId }) {
    await assertOrg(orgId);
    const { rows } = await pool.query(REPOSITORY_SUMMARIES_SQL, [orgId]);
    return { data: { repositories: rows.map(mapRepositorySummary) } };
  }

  async function getRepositoryActivity({ orgId, repoId }) {
    const repo = await assertRepo({ orgId, repoId });
    const [monthlyResult, recentResult, reviewsResult] = await Promise.all([
      pool.query(MONTHLY_ACTIVITY_SQL, [repoId]),
      pool.query(RECENT_PULL_REQUESTS_SQL, [repoId]),
      pool.query(REVIEWS_BY_STATUS_SQL, [repoId]),
    ]);
    return {
      data: {
        repository: {
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          url: repo.url,
          defaultBranch: repo.default_branch,
          primaryLanguage: repo.primary_language ?? null,
          lastSyncedAt: repo.last_synced_at ?? null,
        },
        monthly: monthlyResult.rows.map((m) => ({
          period: m.period,
          created: m.created,
          open: m.open,
          merged: m.merged,
          closed: m.closed,
          additions: m.additions,
          deletions: m.deletions,
        })),
        recent: recentResult.rows.map((pr) => ({
          number: pr.number,
          title: pr.title,
          state: pr.state,
          author: pr.author ?? null,
          additions: pr.additions,
          deletions: pr.deletions,
          mergedAt: pr.merged_at ?? null,
          createdAt: pr.created_at,
        })),
        reviews: Object.fromEntries(reviewsResult.rows.map((r) => [r.status, r.count])),
      },
    };
  }

  return {
    getOverview,
    getVelocity,
    getHealth,
    getDevelopers,
    listRepositorySummaries,
    getRepositoryActivity,
  };
}
