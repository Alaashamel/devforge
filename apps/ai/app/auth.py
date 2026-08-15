"""Signed job tokens shared between the core API and the AI service.

Token format (mirrors apps/api/src/modules/ai/service.js):

    base64url(jobId) "." <exp ms epoch> "." base64url(hmac_sha256("{jobId}.{exp}", secret))
"""

import base64
import hashlib
import hmac
import time


def sign_message(message: str, secret: str) -> str:
    sig = hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(sig).decode().rstrip("=")


def sign_job_token(job_id: str, exp: int, secret: str) -> str:
    body = f"{job_id}.{exp}"
    sig = sign_message(body, secret)
    enc_job_id = base64.urlsafe_b64encode(job_id.encode()).decode().rstrip("=")
    return f"{enc_job_id}.{exp}.{sig}"


def verify_job_token(
    token: str, secret: str, ttl_seconds: int, now_ms: int | None = None
) -> str | None:
    """Return the job id when the token is valid, else None."""
    now_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        enc_job_id, exp_raw, sig = parts
        job_id = base64.urlsafe_b64decode(enc_job_id + "=" * (-len(enc_job_id) % 4)).decode()
        exp = int(exp_raw)
    except (ValueError, UnicodeDecodeError):
        return None
    if not job_id or exp < now_ms or exp > now_ms + ttl_seconds * 1000:
        return None
    expected = sign_message(f"{job_id}.{exp}", secret)
    if not hmac.compare_digest(expected, sig):
        return None
    return job_id


def sign_archive_url(repo_id: str, ttl_seconds: int, secret: str, now_ms: int | None = None) -> str:
    """Sign an archive download token: archive.{repoId}.{exp}."""
    now_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    exp = now_ms + ttl_seconds * 1000
    sig = sign_message(f"archive.{repo_id}.{exp}", secret)
    return f"{exp}.{sig}"


def verify_archive_token(
    repo_id: str, token: str, secret: str, ttl_seconds: int, now_ms: int | None = None
) -> bool:
    now_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    try:
        exp_raw, sig = token.split(".")
        exp = int(exp_raw)
    except (ValueError, TypeError):
        return False
    if exp < now_ms or exp > now_ms + ttl_seconds * 1000:
        return False
    expected = sign_message(f"archive.{repo_id}.{exp}", secret)
    return hmac.compare_digest(expected, sig)
