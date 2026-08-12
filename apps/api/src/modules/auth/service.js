import { conflict, forbidden, unauthorized } from '../../utils/errors.js';
import { generateOpaqueToken, hashToken } from './tokens.js';
import { maxRole } from './permissions.js';

const TOKEN_TABLES = new Set(['verification_tokens', 'password_reset_tokens']);
const DAY_MS = 24 * 60 * 60 * 1000;

function mapUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url ?? null,
    emailVerifiedAt: row.email_verified_at ?? null,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? null,
  };
}

export function createAuthService({
  pool,
  password,
  accessTokens,
  mailer,
  refreshTtlDays = 7,
  now = () => new Date(),
}) {
  async function getUserByEmail(email) {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] ?? null;
  }

  async function createRefreshToken({ userId, meta }) {
    const token = generateOpaqueToken();
    const expiresAt = new Date(now().getTime() + refreshTtlDays * DAY_MS);
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, hashToken(token), expiresAt, meta?.userAgent ?? null, meta?.ip ?? null],
    );
    return { token, expiresAt };
  }

  async function consumeToken(table, rawToken) {
    if (!TOKEN_TABLES.has(table)) {
      throw new Error(`unsafe token table: ${table}`);
    }
    const { rows } = await pool.query(
      `UPDATE ${table}
         SET consumed_at = now()
       WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
       RETURNING *`,
      [hashToken(rawToken)],
    );
    return rows[0] ?? null;
  }

  async function register({ email, name, password: plainPassword }) {
    const existing = await getUserByEmail(email);
    if (existing) {
      throw conflict('An account with this email already exists');
    }

    const passwordHash = await password.hash(plainPassword);
    const { rows } = await pool.query(
      `INSERT INTO users (email, name, password_hash, status)
       VALUES ($1, $2, $3, 'pending_verification')
       RETURNING *`,
      [email, name, passwordHash],
    );
    const user = mapUser(rows[0]);

    const token = generateOpaqueToken();
    const expiresAt = new Date(now().getTime() + DAY_MS);
    await pool.query(
      `INSERT INTO verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, hashToken(token), expiresAt],
    );

    const delivery = mailer.sendVerification(user.email, token);
    return { user, verificationUrl: delivery?.url ?? null };
  }

  async function verifyEmail({ token }) {
    const record = await consumeToken('verification_tokens', token);
    if (!record) {
      throw unauthorized('Verification link is invalid or has expired');
    }
    const { rows } = await pool.query(
      `UPDATE users
         SET status = 'active', email_verified_at = $2, updated_at = now()
       WHERE id = $1 AND email_verified_at IS NULL
       RETURNING *`,
      [record.user_id, now()],
    );
    if (rows.length === 0) {
      throw conflict('Email has already been verified');
    }
    return { user: mapUser(rows[0]) };
  }

  async function login({ email, password: plainPassword, meta }) {
    const user = await getUserByEmail(email);
    const passwordOk = user && (await password.verify(plainPassword, user.password_hash));
    if (!user || !passwordOk) {
      throw unauthorized('Invalid email or password');
    }
    if (user.status === 'disabled') {
      throw forbidden('This account has been disabled');
    }
    if (user.status === 'pending_verification') {
      throw forbidden('Please verify your email address before logging in');
    }

    const { rows } = await pool.query(
      `UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1 RETURNING *`,
      [user.id],
    );
    const session = await createRefreshToken({ userId: user.id, meta });
    const accessToken = await accessTokens.sign({ id: user.id, email: user.email });

    return {
      user: mapUser(rows[0]),
      accessToken,
      refreshToken: session.token,
    };
  }

  async function refresh({ token, meta }) {
    const { rows } = await pool.query('SELECT * FROM refresh_tokens WHERE token_hash = $1', [
      hashToken(token),
    ]);
    const record = rows[0];
    if (!record) {
      throw unauthorized('Invalid refresh token');
    }
    if (new Date(record.expires_at).getTime() <= now().getTime()) {
      throw unauthorized('Invalid refresh token');
    }
    if (record.revoked_at || record.replaced_by) {
      // Reuse detection: a token that was already rotated or revoked is being
      // replayed. Revoke the whole family for that user.
      await pool.query(
        `UPDATE refresh_tokens
           SET revoked_at = now(), updated_at = now()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [record.user_id],
      );
      throw unauthorized('Invalid refresh token');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const next = generateOpaqueToken();
      const expiresAt = new Date(now().getTime() + refreshTtlDays * DAY_MS);
      const inserted = await client.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, replaced_by, user_agent, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [record.user_id, hashToken(next), expiresAt, record.id, meta?.userAgent ?? null, meta?.ip ?? null],
      );
      await client.query(
        `UPDATE refresh_tokens
           SET revoked_at = now(), replaced_by = $2, updated_at = now()
         WHERE id = $1 AND revoked_at IS NULL`,
        [record.id, inserted.rows[0].id],
      );
      await client.query('COMMIT');

      const { rows: userRows } = await client.query('SELECT email FROM users WHERE id = $1', [
        record.user_id,
      ]);
      const accessToken = await accessTokens.sign({ id: record.user_id, email: userRows[0]?.email });
      return { accessToken, refreshToken: next };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function logout({ token }) {
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = now(), updated_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [hashToken(token)],
    );
    return { ok: true };
  }

  async function forgotPassword({ email }) {
    const user = await getUserByEmail(email);
    if (user) {
      const token = generateOpaqueToken();
      const expiresAt = new Date(now().getTime() + 60 * 60 * 1000);
      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
        [user.id, hashToken(token), expiresAt],
      );
      mailer.sendPasswordReset(user.email, token);
    }
    return { ok: true };
  }

  async function resetPassword({ token, password: plainPassword }) {
    const record = await consumeToken('password_reset_tokens', token);
    if (!record) {
      throw unauthorized('Reset link is invalid or has expired');
    }
    const passwordHash = await password.hash(plainPassword);
    await pool.query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [
      record.user_id,
      passwordHash,
    ]);
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = now(), updated_at = now()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [record.user_id],
    );
    return { ok: true };
  }

  async function getProfile(userId) {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) {
      throw unauthorized('Account not found');
    }
    return { user: mapUser(rows[0]) };
  }

  async function resolveEffectiveRole({ userId, orgId, projectId }) {
    let role = null;
    let resolvedOrgId = orgId;

    if (projectId && !resolvedOrgId) {
      const { rows } = await pool.query('SELECT organization_id FROM projects WHERE id = $1', [
        projectId,
      ]);
      resolvedOrgId = rows[0]?.organization_id ?? null;
    }

    if (resolvedOrgId) {
      const [{ rows: ownerRows }, { rows: memberRows }] = await Promise.all([
        pool.query('SELECT 1 FROM organizations WHERE id = $1 AND owner_id = $2', [
          resolvedOrgId,
          userId,
        ]),
        pool.query(
          `SELECT role FROM organization_members
            WHERE organization_id = $1 AND user_id = $2 AND status = 'active'`,
          [resolvedOrgId, userId],
        ),
      ]);
      role = ownerRows.length > 0 ? 'owner' : (memberRows[0]?.role ?? null);
    }

    if (projectId) {
      const { rows } = await pool.query('SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2', [
        projectId,
        userId,
      ]);
      const projectRole = rows[0]?.role ?? null;
      role = role ? maxRole(role, projectRole) : projectRole;
    }

    return role;
  }

  return {
    register,
    verifyEmail,
    login,
    refresh,
    logout,
    forgotPassword,
    resetPassword,
    getProfile,
    resolveEffectiveRole,
  };
}
