"""
FastAPI Router for Security Advisories and Multilingual Localization.
Owned by Member 4 (Team B).
Conforms strictly to docs/API.md (Sections 3.H and 3.I).
"""
import os
import secrets
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse

from app.schemas.advisory import (
    AdvisoryAnalyzeRequest,
    AdvisoryAnalyzeResponse,
    AdvisoryListResponse,
)
from app.services.advisory_service import AdvisoryService, LLMNotConfiguredError

router = APIRouter(prefix="/api/v1/advisories", tags=["Advisories"])

# Default advisory service instance (unconfigured LLM for Sprint 1 safe baseline)
advisory_service = AdvisoryService(llm_configured=False)

MIN_TOKEN_LENGTH = 16


class AdminAuthException(HTTPException):
    """
    Custom authentication exception returning top-level error envelope
    conforming strictly to docs/API.md.
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
    Local admin token verification dependency.
    Validates Authorization: Bearer <PATCHPILOT_ADMIN_TOKEN>.
    Fails closed if PATCHPILOT_ADMIN_TOKEN is missing or weak (<16 characters).
    Uses constant-time comparison via secrets.compare_digest.
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


@router.get("", response_model=AdvisoryListResponse)
def get_advisories(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _token: str = Depends(verify_admin_token),
):
    """
    List known security advisories (with provenance and verification status).
    Requires local admin bearer token.
    """
    return advisory_service.list_advisories(limit=limit, offset=offset)


@router.post("/analyze", response_model=AdvisoryAnalyzeResponse)
def analyze_advisory(
    request: AdvisoryAnalyzeRequest,
    _token: str = Depends(verify_admin_token),
):
    """
    Analyze advisory text and return structured summaries and requested localizations.
    Requires local admin bearer token.
    """
    try:
        return advisory_service.analyze_advisory(request)
    except LLMNotConfiguredError:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "error": {
                    "code": "LLM_NOT_CONFIGURED",
                    "message": "Configured LLM provider is not available. Please use processing_mode='fixture'.",
                }
            },
        )
