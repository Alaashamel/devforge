import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

export function createAccessTokenService({ secret, ttl = '15m' }) {
  const key = new TextEncoder().encode(secret);

  return {
    async sign({ id, email }) {
      return new SignJWT({ email })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(id)
        .setIssuedAt()
        .setExpirationTime(ttl)
        .sign(key);
    },
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key);
        if (!payload.sub) return null;
        return { userId: payload.sub, email: payload.email };
      } catch {
        return null;
      }
    },
  };
}

export function generateOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
