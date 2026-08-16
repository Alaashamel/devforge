import { AppError, badRequest, conflict, externalServiceError, notFound } from '../../utils/errors.js';
import { signArchiveToken, signJobToken, verifyArchiveToken } from './tokens.js';

export const ANALYSIS_TYPES = ['analyzer', 'architecture', 'code_review', 'docs', 'readme'];

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

function mapConversation(conversation) {
  return {
    id: conversation.id,
    organizationId: conversation.organization_id,
    repositoryId: conversation.repository_id ?? null,
    userId: conversation.user_id,
    title: conversation.title,
    messageCount: conversation.message_count ?? 0,
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at,
  };
}

function mapMessage(message) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    sources: message.sources ?? [],
    createdAt: message.created_at,
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

  async function createAnalysis({ orgId, repoId, type, pullRequestNumber }) {
    const repo = await getRepoRow({ orgId, repoId });
    if (!repo) {
      throw notFound('Repository not found');
    }
    const payload = { repository_name: repo.name };
    let archiveToken = null;
    let archiveUrl = null;
    if (type === 'code_review') {
      const { diff } = await github.downloadPullRequestDiff({
        orgId,
        repoId,
        prNumber: pullRequestNumber,
      });
      payload.pull_request_number = pullRequestNumber;
      payload.diff = diff;
    } else {
      archiveToken = signArchiveToken(repo.id, jobSecret, archiveTokenTtlSeconds, now);
      archiveUrl = `${apiBaseUrl}/api/v1/ai/archive/${repo.id}?token=${encodeURIComponent(archiveToken)}`;
    }
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
          ...(archiveUrl ? { archive_url: archiveUrl, archive_token: archiveToken } : {}),
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

  async function listAnalyses({ orgId, repositoryId, type, pullRequestNumber }) {
    const conditions = ['organization_id = $1'];
    const params = [orgId];
    if (repositoryId) {
      params.push(repositoryId);
      conditions.push(`repository_id = $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }
    if (pullRequestNumber !== undefined && pullRequestNumber !== null && pullRequestNumber !== '') {
      params.push(String(pullRequestNumber));
      conditions.push(`report->>'pull_request_number' = $${params.length}`);
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

  async function getAnalysis({ orgId, analysisId }) {
    const { rows } = await pool.query(
      'SELECT * FROM ai_analyses WHERE id = $1 AND organization_id = $2',
      [analysisId, orgId],
    );
    if (rows.length === 0) {
      throw notFound('Analysis not found');
    }
    return { data: mapAnalysis(rows[0]) };
  }

  async function approveAnalysis({ orgId, analysisId, filePath, message }) {
    const { rows } = await pool.query(
      'SELECT * FROM ai_analyses WHERE id = $1 AND organization_id = $2',
      [analysisId, orgId],
    );
    if (rows.length === 0) {
      throw notFound('Analysis not found');
    }
    const analysis = rows[0];
    if (!['docs', 'readme'].includes(analysis.type)) {
      throw badRequest(
        `Analysis type ${analysis.type} cannot be approved — only generated docs/README files can`,
      );
    }
    if (analysis.status !== 'completed') {
      throw conflict('Analysis is not complete yet — approve after the job finishes');
    }
    const report = analysis.report ?? {};
    const file = (report.files ?? []).find((f) => f.path === filePath);
    if (!file) {
      throw badRequest(`Generated file ${filePath} not found in this analysis`);
    }
    const repo = await getRepoRow({ orgId, repoId: analysis.repository_id });
    if (!repo) {
      throw notFound('Repository not found');
    }
    const commitMessage = message || `docs: ${filePath} — generated by DevForge`;
    const result = await github.commitGeneratedFile({
      orgId,
      repoId: analysis.repository_id,
      path: filePath,
      content: file.content,
      message: commitMessage,
    });
    const approvals = [
      ...(report.approvals ?? []),
      { path: filePath, sha: result.sha, committedAt: now().toISOString() },
    ];
    await pool.query(
      'UPDATE ai_analyses SET report = $1, updated_at = now() WHERE id = $2',
      [JSON.stringify({ ...report, approvals }), analysisId],
    );
    return { data: { analysisId, ...result, approvals } };
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

  async function listConversations({ orgId, userId, repositoryId }) {
    const conditions = ['organization_id = $1', 'user_id = $2'];
    const params = [orgId, userId];
    if (repositoryId) {
      params.push(repositoryId);
      conditions.push(`repository_id = $${params.length}`);
    }
    const { rows } = await pool.query(
      `SELECT c.*,
              (SELECT count(*)::int FROM ai_messages m WHERE m.conversation_id = c.id)
                AS message_count
         FROM ai_conversations c
        WHERE ${conditions.join(' AND ')}
        ORDER BY c.updated_at DESC
        LIMIT 100`,
      params,
    );
    return { data: rows.map(mapConversation) };
  }

  async function getConversation({ orgId, userId, conversationId }) {
    const { rows } = await pool.query(
      `SELECT c.*,
              (SELECT count(*)::int FROM ai_messages m WHERE m.conversation_id = c.id)
                AS message_count
         FROM ai_conversations c
        WHERE c.id = $1 AND c.organization_id = $2 AND c.user_id = $3`,
      [conversationId, orgId, userId],
    );
    if (rows.length === 0) {
      throw notFound('Conversation not found');
    }
    return { data: mapConversation(rows[0]) };
  }

  async function createConversation({ orgId, userId, repositoryId, title }) {
    const repo = await getRepoRow({ orgId, repoId: repositoryId });
    if (!repo) {
      throw notFound('Repository not found');
    }
    const { rows } = await pool.query(
      `INSERT INTO ai_conversations (organization_id, user_id, repository_id, title)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [orgId, userId, repositoryId, title || 'New conversation'],
    );
    return { data: mapConversation(rows[0]) };
  }

  async function deleteConversation({ orgId, userId, conversationId }) {
    const { rowCount } = await pool.query(
      'DELETE FROM ai_conversations WHERE id = $1 AND organization_id = $2 AND user_id = $3',
      [conversationId, orgId, userId],
    );
    if (rowCount === 0) {
      throw notFound('Conversation not found');
    }
    return { data: { deleted: true } };
  }

  async function listMessages({ orgId, userId, conversationId }) {
    await getConversation({ orgId, userId, conversationId });
    const { rows } = await pool.query(
      'SELECT * FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId],
    );
    return { data: rows.map(mapMessage) };
  }

  async function streamAssistantReply({ orgId, userId, conversationId, content }) {
    const conversation = await getConversation({ orgId, userId, conversationId });
    if (!conversation.data.repositoryId) {
      throw badRequest('This conversation is not linked to a repository');
    }
    const repo = await getRepoRow({ orgId, repoId: conversation.data.repositoryId });
    if (!repo) {
      throw notFound('Repository not found');
    }

    await pool.query(
      "INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'user', $2)",
      [conversationId, content],
    );
    const { rows: history } = await pool.query(
      'SELECT role, content FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId],
    );

    const token = signJobToken('assistant', jobSecret, jobTokenTtlSeconds, now);
    let aiResponse;
    try {
      aiResponse = await fetchImpl(`${aiServiceUrl}/assistant/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Devforge-Job-Token': token,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          organization_id: orgId,
          repository_id: conversation.data.repositoryId,
          repository_name: repo.name,
          messages: history,
        }),
      });
    } catch (err) {
      throw externalServiceError('AI service unreachable', null, err);
    }
    if (!aiResponse.ok || !aiResponse.body) {
      throw externalServiceError(
        `AI service rejected the assistant request (HTTP ${aiResponse.status})`,
      );
    }

    let sources = [];
    let answer = '';
    let failed = false;
    let pending = '';
    const encoder = new TextEncoder();

    const relay = new TransformStream({
      transform(chunk, controller) {
        pending += new TextDecoder().decode(chunk);
        let boundary;
        while ((boundary = pending.indexOf('\n\n')) !== -1) {
          const event = pending.slice(0, boundary);
          pending = pending.slice(boundary + 2);
          if (event.startsWith('data: ')) {
            try {
              const payload = JSON.parse(event.slice('data: '.length));
              if (payload.type === 'sources') {
                sources = Array.isArray(payload.sources) ? payload.sources : [];
              } else if (payload.type === 'delta') {
                answer += payload.text ?? '';
              } else if (payload.type === 'error') {
                failed = true;
              }
            } catch {
              // Ignore malformed events; pass them through untouched.
            }
          }
          controller.enqueue(encoder.encode(`${event}\n\n`));
        }
      },
      async flush(controller) {
        if (pending) {
          controller.enqueue(encoder.encode(pending));
        }
        if (!failed) {
          await pool.query(
            `INSERT INTO ai_messages (conversation_id, role, content, sources)
             VALUES ($1, 'assistant', $2, $3)`,
            [conversationId, answer, JSON.stringify(sources)],
          );
        }
      },
    });

    const reader = aiResponse.body.getReader();
    const writer = relay.writable.getWriter();
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          await writer.write(value);
        }
        await writer.close();
      } catch {
        await writer.abort().catch(() => {});
      }
    })();

    return { stream: relay.readable };
  }

  return {
    createAnalysis,
    getJobStatus,
    listAnalyses,
    getAnalysis,
    approveAnalysis,
    streamArchive,
    listConversations,
    getConversation,
    createConversation,
    deleteConversation,
    listMessages,
    streamAssistantReply,
  };
}
