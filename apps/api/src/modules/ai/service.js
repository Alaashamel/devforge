import { AppError, externalServiceError, notFound } from '../../utils/errors.js';
import { signArchiveToken, signJobToken, verifyArchiveToken } from './tokens.js';

export const ANALYSIS_TYPES = ['architecture', 'code_review', 'docs', 'readme'];

function mapJob(job) {
  return {
    id: job.id,
    organizationId: job.organization_id ?? null,
    repositoryId: job.repository_id ?? null,
    type: job.type,
    status: job.status,
    payload: job.payload ?? {},
    result: job.result ?? null,
    error: job.error ?? null,
    attempts: job.attempts,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

function mapAnalysis(analysis) {
  return {
    id: analysis.id,
    organizationId: analysis.organization_id,
    repositoryId: analysis.repository_id ?? null,
    type: analysis.type,
    status: analysis.status,
    model: analysis.model ?? null,
    score: analysis.score ?? {},
    report: analysis.report ?? {},
    createdAt: analysis.created_at,
    updatedAt: analysis.updated_at,
  };
}

/**
 * AI job orchestration. The API creates bounded analysis jobs, submits them
 * to the isolated AI service over a signed job token, and streams
 * credential-free repository archives back to the AI service. The AI service
 * persists results into the shared database; the API only reads them back.
 */
export function createAiService({
  pool,
  github,
  aiServiceUrl,
  jobSecret,
  jobTokenTtlSeconds,
  archiveTokenTtlSeconds,
  apiBaseUrl,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
}) {
  async function getRepoRow({ orgId, repoId }) {
    const { rows } = await pool.query(
      'SELECT * FROM repositories WHERE organization_id = $1 AND id = $2',
      [orgId, repoId],
    );
    return rows[0] ?? null;
  }

  async function failJob(jobId, error) {
    await pool.query(
      "UPDATE ai_jobs SET status = 'failed', error = $2, updated_at = now() WHERE id = $1",
      [jobId, error],
    );
  }

  async function createAnalysis({ orgId, repoId, type }) {
    const repo = await getRepoRow({ orgId, repoId });
    if (!repo) {
      throw notFound('Repository not found');
    }
    const archiveToken = signArchiveToken(repo.id, jobSecret, archiveTokenTtlSeconds, now);
    const payload = { repository_name: repo.name };
    const { rows } = await pool.query(
      `INSERT INTO ai_jobs (organization_id, repository_id, type, status, payload)
       VALUES ($1, $2, $3, 'queued', $4) RETURNING *`,
      [orgId, repoId, type, JSON.stringify(payload)],
    );
    const job = rows[0];
    const jobToken = signJobToken(job.id, jobSecret, jobTokenTtlSeconds, now);

    let response;
    try {
      response = await fetchImpl(`${aiServiceUrl}/jobs/${job.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Devforge-Job-Token': jobToken,
        },
        body: JSON.stringify({
          job_id: job.id,
          type,
          organization_id: orgId,
          project_id: null,
          repository_id: repo.id,
          archive_url: `${apiBaseUrl}/api/v1/ai/archive/${repo.id}?token=${encodeURIComponent(archiveToken)}`,
          archive_token: archiveToken,
          payload,
        }),
      });
    } catch (err) {
      await failJob(job.id, 'AI service unreachable');
      throw externalServiceError('AI service unreachable', null, err);
    }
    if (!response.ok) {
      await failJob(job.id, `AI service rejected the job (HTTP ${response.status})`);
      throw externalServiceError(`AI service rejected the job (HTTP ${response.status})`);
    }
    return { jobId: job.id, status: 'accepted', type };
  }

  async function getJobStatus({ orgId, jobId }) {
    const { rows } = await pool.query(
      'SELECT * FROM ai_jobs WHERE id = $1 AND organization_id = $2',
      [jobId, orgId],
    );
    if (rows.length === 0) {
      throw notFound('AI job not found');
    }
    return { data: mapJob(rows[0]) };
  }

  async function listAnalyses({ orgId, repositoryId }) {
    const conditions = ['organization_id = $1'];
    const params = [orgId];
    if (repositoryId) {
      params.push(repositoryId);
      conditions.push(`repository_id = $${params.length}`);
    }
    const { rows } = await pool.query(
      `SELECT * FROM ai_analyses
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT 100`,
      params,
    );
    return { data: rows.map(mapAnalysis) };
  }

  async function streamArchive({ repoId, token }) {
    if (!verifyArchiveToken(repoId, token, jobSecret, archiveTokenTtlSeconds, now)) {
      throw new AppError('Invalid or expired archive token', {
        status: 401,
        code: 'INVALID_ARCHIVE_TOKEN',
      });
    }
    const { rows } = await pool.query(
      'SELECT organization_id FROM repositories WHERE id = $1',
      [repoId],
    );
    if (rows.length === 0) {
      throw notFound('Repository not found');
    }
    return github.downloadRepositoryArchive({
      orgId: rows[0].organization_id,
      repoId,
    });
  }

  return { createAnalysis, getJobStatus, listAnalyses, streamArchive };
}
