import { describe, it, expect } from 'vitest';
import { createGithubCrypto } from '../src/modules/github/crypto.js';

describe('github crypto', () => {
  const crypto = createGithubCrypto({ key: 'test-encryption-key-for-github' });

  it('round-trips encrypted tokens', () => {
    const encoded = crypto.encrypt('gho_secret_token');
    expect(encoded).toMatch(/^v1:/);
    expect(crypto.decrypt(encoded)).toBe('gho_secret_token');
  });

  it('uses a fresh IV on every encryption', () => {
    const a = crypto.encrypt('same-value');
    const b = crypto.encrypt('same-value');
    expect(a).not.toBe(b);
    expect(crypto.decrypt(a)).toBe('same-value');
    expect(crypto.decrypt(b)).toBe('same-value');
  });

  it('rejects tampered ciphertext', () => {
    const encoded = crypto.encrypt('secret');
    const last = encoded[encoded.length - 1];
    const tampered = encoded.slice(0, -1) + (last === 'A' ? 'B' : 'A');
    expect(() => crypto.decrypt(tampered)).toThrow();
  });

  it('rejects ciphertext from a different key', () => {
    const other = createGithubCrypto({ key: 'a-completely-different-key' });
    expect(() => other.decrypt(crypto.encrypt('secret'))).toThrow();
  });

  it('signs and verifies OAuth state payloads', () => {
    const state = crypto.sign({ userId: 'u1', exp: 123456, nonce: 'abc' });
    expect(crypto.verify(state)).toEqual({ userId: 'u1', exp: 123456, nonce: 'abc' });
  });

  it('rejects tampered or foreign-signed state', () => {
    const state = crypto.sign({ userId: 'u1', exp: 123 });
    const tampered = state.slice(0, -1) + (state.endsWith('a') ? 'b' : 'a');
    expect(crypto.verify(tampered)).toBeNull();
    const other = createGithubCrypto({ key: 'another-key' });
    expect(other.verify(state)).toBeNull();
  });

  it('returns null for malformed state', () => {
    expect(crypto.verify('no-dot-here')).toBeNull();
    expect(crypto.verify('')).toBeNull();
  });
});
