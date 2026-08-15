"""Tests for signed job/archive token helpers."""

import time

import pytest

from app.auth import sign_archive_url, sign_job_token, verify_archive_token, verify_job_token

SECRET = "test-secret"


def _now() -> int:
    return int(time.time() * 1000)


def test_job_token_roundtrip():
    token = sign_job_token("job-123", _now() + 60_000, SECRET)
    assert verify_job_token(token, SECRET, 300, _now()) == "job-123"


def test_job_token_rejects_expired():
    token = sign_job_token("job-123", _now() - 1, SECRET)
    assert verify_job_token(token, SECRET, 300, _now()) is None


def test_job_token_rejects_tampered_signature():
    token = sign_job_token("job-123", _now() + 60_000, SECRET)
    tampered = token[:-2] + ("aa" if token[-2:] != "aa" else "bb")
    assert verify_job_token(tampered, SECRET, 300, _now()) is None


def test_job_token_rejects_wrong_secret():
    token = sign_job_token("job-123", _now() + 60_000, SECRET)
    assert verify_job_token(token, "other-secret", 300, _now()) is None


def test_job_token_rejects_malformed():
    assert verify_job_token("not-a-token", SECRET, 300, _now()) is None
    assert verify_job_token("", SECRET, 300, _now()) is None


def test_archive_token_roundtrip():
    token = sign_archive_url("repo-1", 300, SECRET)
    assert verify_archive_token("repo-1", token, SECRET, 300, _now())


def test_archive_token_rejects_wrong_repository():
    token = sign_archive_url("repo-1", 300, SECRET)
    assert not verify_archive_token("repo-2", token, SECRET, 300, _now())


def test_archive_token_rejects_expired():
    token = sign_archive_url("repo-1", 300, SECRET, _now() - 400_000)
    assert not verify_archive_token("repo-1", token, SECRET, 300, _now())


@pytest.mark.parametrize(
    "token",
    ["", "garbage", "abc.def", "1.2.3.4"],
)
def test_archive_token_rejects_malformed(token):
    assert not verify_archive_token("repo-1", token, SECRET, 300, _now())
