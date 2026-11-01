"""
FastAPI Router for Security Advisories and Multilingual Localization.
Owned by Member 4 (Team B).
Conforms strictly to docs/API.md (Sections 3.H and 3.I).
"""
import os
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
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


def verify_admin_token(authorization: Optional[str] = Header(None)) -> str:
    """
    Local admin token verification dependency.
    Validates Authorization: Bearer <PATCHPILOT_ADMIN_TOKEN>.
    Designed to integrate smoothly with Member 1's core/auth.py.
    """
    expected_token = os.getenv("PATCHPILOT_ADMIN_TOKEN", "demo-token")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "UNAUTHORIZED", "message": "Missing or invalid admin token."}},
        )
    token = authorization.split("Bearer ", 1)[1].strip()
    if token != expected_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "UNAUTHORIZED", "message": "Invalid admin token."}},
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

