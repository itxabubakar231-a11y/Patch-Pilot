"""
PatchPilot Core Authentication Module.

Implements centralized, constant-time Bearer token authentication for management API endpoints.
Strictly adheres to docs/ARCHITECTURE.md (Section 7) and docs/API.md (Section 1).

Key Rules:
- A single local admin token (PATCHPILOT_ADMIN_TOKEN) gates all management endpoints.
- Minimum token length: 16 characters (fail closed if missing or weak).
- Constant-time comparison using secrets.compare_digest to prevent timing attacks.
- Standard error envelope: {"error": {"code": ..., "message": ...}}.
- Token values are never logged, printed, or exposed in error messages.
"""

import os
import secrets
from typing import Optional
from fastapi import Header, HTTPException, Request, status
from fastapi.responses import JSONResponse

# Minimum acceptable length for the environment admin token
MIN_TOKEN_LENGTH = 16


class AdminAuthException(HTTPException):
    """
    Custom authentication exception returning the standard PatchPilot error envelope.
    Conforms strictly to docs/API.md.
    """

    def __init__(
        self,
        code: str = "UNAUTHORIZED",
        message: str = "Invalid admin token.",
        status_code: int = status.HTTP_401_UNAUTHORIZED,
    ):
        super().__init__(status_code=status_code, detail=message)
        self.code = code
        self.message = message


async def admin_auth_exception_handler(_request: Request, exc: AdminAuthException) -> JSONResponse:
    """Exception handler ensuring exact {"error": {"code": ..., "message": ...}} schema."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message}},
    )


def verify_admin_token(authorization: Optional[str] = Header(None)) -> str:
    """
    FastAPI dependency for local admin token verification.
    Validates Authorization: Bearer <PATCHPILOT_ADMIN_TOKEN>.

    Security invariants:
    - Fails closed if PATCHPILOT_ADMIN_TOKEN is missing or < 16 characters.
    - Requires 'Bearer <token>' format.
    - Compares using secrets.compare_digest (constant time).
    - Returns the validated token string upon success.
    """
    expected_token = os.getenv("PATCHPILOT_ADMIN_TOKEN")
    if not expected_token or len(expected_token.strip()) < MIN_TOKEN_LENGTH:
        # Fail closed: refuse access if server environment token is missing or weak
        raise AdminAuthException(
            code="UNAUTHORIZED",
            message="Management authentication is not configured or token is weak.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    if not authorization or not authorization.startswith("Bearer "):
        raise AdminAuthException(
            code="UNAUTHORIZED",
            message="Missing or invalid Authorization header.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    token = authorization.split("Bearer ", 1)[1].strip()
    if not secrets.compare_digest(token, expected_token.strip()):
        raise AdminAuthException(
            code="UNAUTHORIZED",
            message="Invalid admin token.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )
    return token
