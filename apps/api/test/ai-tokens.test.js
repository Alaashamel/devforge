import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  signArchiveToken,
  signJobToken,
  verifyArchiveToken,
  verifyJobToken,
} from '../src/modules/ai/tokens.js';

const SECRET = 'devforge-test-ai-job-secret-000000000000';
const NOW = () => 1_700_000_000_000;

function b64url(input) {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function hmac(message) {
  return createHmac('sha256', SECRET).update(message).digest('base64url');
}

describe('ai job tokens', () => {
  it('produces the Python-compatible job token format', () => {
    const jobId = '11111111-1111-4111-8111-111111111111';
    const token = signJobToken(jobId, SECRET, 300, NOW);
    const exp = 1_700_000_300_000;
    expect(token).toBe(`${b64url(jobId)}.${exp}.${hmac(`${jobId}.${exp}`)}`);
  });

  it('round-trips job tokens and rejects tampering and expiry', () => {
    const jobId = '22222222-2222-4222-8222-222222222222';
    const token = signJobToken(jobId, SECRET, 300, NOW);
    expect(verifyJobToken(token, SECRET, 300, NOW)).toBe(jobId);
    expect(verifyJobToken(`${token}extra`, SECRET, 300, NOW)).toBeNull();
    expect(verifyJobToken(token, 'wrong-secret', 300, NOW)).toBeNull();
    expect(verifyJobToken(token, SECRET, 300, () => NOW() + 301_000)).toBeNull();
    expect(verifyJobToken('garbage', SECRET, 300, NOW)).toBeNull();
  });

  it('produces the Python-compatible archive token format', () => {
    const repoId = '33333333-3333-4333-8333-333333333333';
    const token = signArchiveToken(repoId, SECRET, 900, NOW);
    const exp = 1_700_000_900_000;
    expect(token).toBe(`${exp}.${hmac(`archive.${repoId}.${exp}`)}`);
  });

  it('verifies archive tokens and rejects wrong repo and expired tokens', () => {
    const repoId = '44444444-4444-4444-8444-444444444444';
    const token = signArchiveToken(repoId, SECRET, 900, NOW);
    expect(verifyArchiveToken(repoId, token, SECRET, 900, NOW)).toBe(true);
    expect(verifyArchiveToken('other', token, SECRET, 900, NOW)).toBe(false);
    expect(verifyArchiveToken(repoId, `${token}x`, SECRET, 900, NOW)).toBe(false);
    expect(verifyArchiveToken(repoId, token, SECRET, 900, () => NOW() + 901_000)).toBe(false);
    expect(verifyArchiveToken(repoId, 'garbage', SECRET, 900, NOW)).toBe(false);
  });
});
