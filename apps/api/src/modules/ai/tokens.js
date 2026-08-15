import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed job/archive tokens shared with the AI service.
 *
 * Mirrors apps/ai/app/auth.py exactly so both sides interoperate:
 *
 *   job token:     base64url(jobId) "." <exp ms> "." base64url(hmac_sha256("{jobId}.{exp}", secret))
 *   archive token: <exp ms> "." base64url(hmac_sha256("archive.{repoId}.{exp}", secret))
 */

function sign(message, secret) {
  return createHmac('sha256', secret).update(message).digest('base64url');
}

export function signJobToken(jobId, secret, ttlSeconds, now = Date.now) {
  const exp = Number(now()) + ttlSeconds * 1000;
  const encoded = Buffer.from(String(jobId), 'utf8').toString('base64url');
  return `${encoded}.${exp}.${sign(`${jobId}.${exp}`, secret)}`;
}

export function verifyJobToken(token, secret, ttlSeconds, now = Date.now) {
  if (typeof token !== 'string') {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [encoded, expRaw, signature] = parts;
  const exp = Number(expRaw);
  if (!encoded || !signature || !Number.isInteger(exp)) {
    return null;
  }
  let jobId;
  try {
    jobId = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!jobId) {
    return null;
  }
  const current = Number(now());
  if (exp < current || exp > current + ttlSeconds * 1000) {
    return null;
  }
  const expected = Buffer.from(sign(`${jobId}.${exp}`, secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }
  return jobId;
}

export function signArchiveToken(repoId, secret, ttlSeconds, now = Date.now) {
  const exp = Number(now()) + ttlSeconds * 1000;
  return `${exp}.${sign(`archive.${repoId}.${exp}`, secret)}`;
}

export function verifyArchiveToken(repoId, token, secret, ttlSeconds, now = Date.now) {
  if (typeof token !== 'string') {
    return false;
  }
  const dot = token.lastIndexOf('.');
  if (dot === -1) {
    return false;
  }
  const expRaw = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const exp = Number(expRaw);
  if (!signature || !Number.isInteger(exp)) {
    return false;
  }
  const current = Number(now());
  if (exp < current || exp > current + ttlSeconds * 1000) {
    return false;
  }
  const expected = Buffer.from(sign(`archive.${repoId}.${exp}`, secret));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
