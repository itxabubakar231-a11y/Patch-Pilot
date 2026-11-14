"""
Unit tests for centralized admin token authentication (app.core.auth).

Verifies:
- Authorization: Bearer <valid_token> succeeds and returns token.
- Missing Authorization header fails closed with standard 401 envelope.
- Malformed header (non-Bearer) fails closed with standard 401 envelope.
- Mismatched token fails closed with standard 401 envelope.
- Unset or empty PATCHPILOT_ADMIN_TOKEN fails closed with 401.
- Short/weak PATCHPILOT_ADMIN_TOKEN (<16 characters) fails closed with 401.
- admin_auth_exception_handler formats the exact documented error envelope.
"""

import pytest
from fastapi import status
from fastapi.responses import JSONResponse

from app.core.auth import (
    AdminAuthException,
    admin_auth_exception_handler,
    verify_admin_token,
    MIN_TOKEN_LENGTH,
)

VALID_TOKEN = "patchpilot-test-admin-secret-key-12345"


@pytest.fixture(autouse=True)
def set_test_admin_token(monkeypatch):
    """Ensure a valid test token is set by default."""
    monkeypatch.setenv("PATCHPILOT_ADMIN_TOKEN", VALID_TOKEN)


def test_verify_admin_token_success():
    """Valid Bearer token matching environment secret succeeds."""
    token = verify_admin_token(authorization=f"Bearer {VALID_TOKEN}")
    assert token == VALID_TOKEN


def test_verify_admin_token_missing_header():
    """Missing Authorization header raises AdminAuthException with 401."""
    with pytest.raises(AdminAuthException) as exc_info:
        verify_admin_token(authorization=None)

    assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert exc_info.value.code == "UNAUTHORIZED"
    assert exc_info.value.message == "Missing or invalid Authorization header."


def test_verify_admin_token_invalid_prefix():
    """Non-Bearer schemes (Basic, Token, raw string) raise 401."""
    for bad_header in (
        f"Basic {VALID_TOKEN}",
        f"Token {VALID_TOKEN}",
        VALID_TOKEN,
        "Bearer",
        "",
    ):
        with pytest.raises(AdminAuthException) as exc_info:
            verify_admin_token(authorization=bad_header)
        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
        assert exc_info.value.code == "UNAUTHORIZED"
        assert exc_info.value.message == "Missing or invalid Authorization header."


def test_verify_admin_token_incorrect_value():
    """Mismatched token raises 401 with generic Invalid admin token message."""
    with pytest.raises(AdminAuthException) as exc_info:
        verify_admin_token(authorization="Bearer wrong-token-value-0000")

    assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert exc_info.value.code == "UNAUTHORIZED"
    assert exc_info.value.message == "Invalid admin token."


@pytest.mark.anyio
async def test_verify_admin_token_non_ascii_value():
    """Non-ASCII Authorization value returns 401 with standard error envelope, not 500."""
    with pytest.raises(AdminAuthException) as exc_info:
        verify_admin_token(authorization="Bearer non_ascii_🔑_token_éàü")

    assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert exc_info.value.code == "UNAUTHORIZED"
    assert exc_info.value.message == "Invalid admin token."

    # Verify standard error envelope formatted by exception handler
    response: JSONResponse = await admin_auth_exception_handler(None, exc_info.value)
    assert response.status_code == 401
    assert response.body.decode("utf-8") == '{"error":{"code":"UNAUTHORIZED","message":"Invalid admin token."}}'


def test_verify_admin_token_unconfigured_server_token(monkeypatch):
    """When server environment token is missing, fails closed with 401."""
    monkeypatch.delenv("PATCHPILOT_ADMIN_TOKEN", raising=False)
    with pytest.raises(AdminAuthException) as exc_info:
        verify_admin_token(authorization=f"Bearer {VALID_TOKEN}")

    assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert exc_info.value.code == "UNAUTHORIZED"
    assert exc_info.value.message == "Management authentication is not configured or token is weak."


def test_verify_admin_token_weak_server_token(monkeypatch):
    """When server token is shorter than 16 chars, fails closed with 401."""
    short_token = "short_token_15c"
    assert len(short_token) < MIN_TOKEN_LENGTH
    monkeypatch.setenv("PATCHPILOT_ADMIN_TOKEN", short_token)

    with pytest.raises(AdminAuthException) as exc_info:
        verify_admin_token(authorization=f"Bearer {short_token}")

    assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert exc_info.value.code == "UNAUTHORIZED"
    assert exc_info.value.message == "Management authentication is not configured or token is weak."


@pytest.mark.anyio
async def test_admin_auth_exception_handler_schema():
    """Confirm the exception handler returns the exact docs/API.md error envelope."""
    exc = AdminAuthException(code="UNAUTHORIZED", message="Custom auth test message.")
    response: JSONResponse = await admin_auth_exception_handler(None, exc)

    assert response.status_code == 401
    assert response.body.decode("utf-8") == '{"error":{"code":"UNAUTHORIZED","message":"Custom auth test message."}}'
