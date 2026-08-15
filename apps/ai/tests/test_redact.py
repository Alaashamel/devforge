"""Tests for secret scanning and redaction.

validate-repo: intentional secret-pattern fixtures
"""

from app.ingestion.redact import redact_secrets, scan_secrets


def test_redacts_openai_key():
    content = "OPENAI_API_KEY = 'sk-abcdefghijklmnopqrstuvwxyz'"
    redacted, count = redact_secrets(content)
    assert count == 1
    assert "sk-abcdef" not in redacted
    assert "[REDACTED]" in redacted


def test_redacts_private_key_block():
    content = "-----BEGIN RSA PRIVATE KEY-----\nMIICWwIBAAKBg\n-----END RSA PRIVATE KEY-----"
    redacted, count = redact_secrets(content)
    assert count == 1
    assert "MIICWwIBAAKBg" not in redacted


def test_redacts_github_token():
    content = "token = ghp_1234567890abcdefghijklmnop"
    redacted, count = redact_secrets(content)
    assert count >= 1
    assert "ghp_" not in redacted


def test_redacts_assigned_secret():
    content = "password = hunter2supersecret\n"
    redacted, count = redact_secrets(content)
    assert count == 1
    assert "hunter2" not in redacted


def test_scan_detects_patterns():
    hits = scan_secrets("sk-abcdefghijklmnopqrstuvwxyz and AKIA1234567890ABCDEF")
    assert "openai-key" in hits
    assert "aws-access-key" in hits


def test_plain_code_is_untouched():
    redacted, count = redact_secrets("def main():\n    return 'hello'\n")
    assert count == 0
    assert "def main()" in redacted
