import { describe, it, expect } from 'vitest';
import {
  createAccessTokenService,
  generateOpaqueToken,
  hashToken,
} from '../src/modules/auth/tokens.js';

describe('access token service', () => {
  const service = createAccessTokenService({ secret: 's'.repeat(40), ttl: '15m' });

  it('signs and verifies a token, returning the claims', async () => {
    const userId = '00000000-0000-0000-0000-000000000001';
    const token = await service.sign({ id: userId, email: 'a@b.c' });
    await expect(service.verify(token)).resolves.toEqual({ userId, email: 'a@b.c' });
  });

  it('returns null for an already-expired token', async () => {
    const short = createAccessTokenService({ secret: 's'.repeat(40), ttl: '0s' });
    const token = await short.sign({ id: 'u', email: 'a@b.c' });
    await expect(short.verify(token)).resolves.toBeNull();
  });

  it('returns null when the token was signed with a different secret', async () => {
    const other = createAccessTokenService({ secret: 't'.repeat(40) });
    const token = await service.sign({ id: 'u', email: 'a@b.c' });
    await expect(other.verify(token)).resolves.toBeNull();
  });

  it('returns null for garbage input', async () => {
    await expect(service.verify('garbage')).resolves.toBeNull();
  });
});

describe('opaque tokens', () => {
  it('generates unique tokens and stable sha256 hashes', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
    expect(hashToken(a)).toHaveLength(64);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
  });
});
