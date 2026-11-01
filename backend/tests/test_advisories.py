"""
Unit and Integration Tests for PatchPilot Advisory & Multilingual Module.
Owned by Member 4 (Team B).
Tests schema validation, deterministic multilingual fixtures, and API endpoints.
"""
import os
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.advisories import (
    AdminAuthException,
    admin_auth_exception_handler,
    router as advisories_router,
)
from app.schemas.advisory import (
    AdvisoryAnalyzeRequest,
    AdvisoryAnalyzeResponse,
    AdvisoryListResponse,
)
from app.services.advisory_service import (
    AdvisoryService,
    LLMNotConfiguredError,
    MULTILINGUAL_FIXTURES,
)

# Test application mounting the advisory router in isolation (renamed from test_app)
app_under_test = FastAPI()
app_under_test.add_exception_handler(AdminAuthException, admin_auth_exception_handler)
app_under_test.include_router(advisories_router)
client = TestClient(app_under_test)

TEST_ADMIN_TOKEN = "patchpilot-test-strong-secret-token-32chars"
AUTH_HEADER = {"Authorization": f"Bearer {TEST_ADMIN_TOKEN}"}


@pytest.fixture(autouse=True)
def set_env_admin_token(monkeypatch):
    """Ensure PATCHPILOT_ADMIN_TOKEN is configured with a strong secret for all tests."""
    monkeypatch.setenv("PATCHPILOT_ADMIN_TOKEN", TEST_ADMIN_TOKEN)


# -----------------------------------------------------------------------------
# 1. Pydantic Schema Validation Tests
# -----------------------------------------------------------------------------

def test_advisory_request_valid():
    """Verify valid request parses correctly."""
    req = AdvisoryAnalyzeRequest(
        advisory_text="PHP security advisory regarding input handling.",
        languages=["en", "ur", "ur-Latn", "ar", "es"],
        processing_mode="fixture",
    )
    assert req.advisory_text == "PHP security advisory regarding input handling."
    assert len(req.languages) == 5
    assert req.processing_mode == "fixture"


def test_advisory_request_language_deduplication():
    """Verify language list deduplicates redundant codes."""
    req = AdvisoryAnalyzeRequest(
        advisory_text="Sample text",
        languages=["en", "en", "ur", "ur"],
    )
    assert req.languages == ["en", "ur"]


def test_advisory_request_empty_text_rejected():
    """Verify empty text raises validation error."""
    with pytest.raises(ValidationError):
        AdvisoryAnalyzeRequest(advisory_text="")


def test_advisory_request_text_too_long_rejected():
    """Verify text exceeding 12,000 characters is rejected."""
    with pytest.raises(ValidationError):
        AdvisoryAnalyzeRequest(advisory_text="A" * 12001)


def test_advisory_request_unsupported_language_rejected():
    """Verify unsupported language code (e.g. 'de') raises ValidationError."""
    with pytest.raises(ValidationError):
        AdvisoryAnalyzeRequest(
            advisory_text="Sample text",
            languages=["en", "de"],
        )


def test_advisory_request_default_language():
    """Verify default language is English when omitted."""
    req = AdvisoryAnalyzeRequest(advisory_text="Sample text")
    assert req.languages == ["en"]
    assert req.processing_mode == "fixture"


# -----------------------------------------------------------------------------
# 2. AdvisoryService Logic Tests
# -----------------------------------------------------------------------------

def test_advisory_service_multilingual_fixture():
    """Verify deterministic fixture returns accurate multilingual localizations."""
    service = AdvisoryService(llm_configured=False)
    req = AdvisoryAnalyzeRequest(
        advisory_text="Vulnerability notice for PHP.",
        languages=["en", "ur", "ur-Latn", "ar", "es"],
        processing_mode="fixture",
    )
    res = service.analyze_advisory(req)

    assert isinstance(res, AdvisoryAnalyzeResponse)
    assert res.is_simulated is True
    assert res.processing_mode == "fixture"
    assert res.advisory.generated_by == "fixture"
    assert res.advisory.verified is False
    assert res.advisory.source_kind == "demo"

    # Check that all 5 requested languages are returned with exact content
    assert len(res.localizations) == 5
    loc_map = {loc.language_code: loc for loc in res.localizations}

    for lang in ["en", "ur", "ur-Latn", "ar", "es"]:
        assert lang in loc_map
        assert loc_map[lang].title == MULTILINGUAL_FIXTURES[lang]["title"]
        assert loc_map[lang].summary == MULTILINGUAL_FIXTURES[lang]["summary"]
        assert loc_map[lang].recommended_action == MULTILINGUAL_FIXTURES[lang]["recommended_action"]


def test_advisory_service_unconfigured_llm_raises_error():
    """Verify requesting LLM mode when unconfigured raises LLMNotConfiguredError."""
    service = AdvisoryService(llm_configured=False)
    req = AdvisoryAnalyzeRequest(
        advisory_text="Sample",
        processing_mode="llm",
    )
    with pytest.raises(LLMNotConfiguredError):
        service.analyze_advisory(req)


def test_advisory_service_list_advisories():
    """Verify sample list of advisories uses demo source_kind, verified=False, and generated_by='fixture'."""
    service = AdvisoryService()
    res = service.list_advisories(limit=10, offset=0)
    assert isinstance(res, AdvisoryListResponse)
    assert res.total >= 1
    assert len(res.items) >= 1
    item = res.items[0]
    assert item.external_id == "CVE-2026-109618"
    assert item.source_kind == "demo"
    assert item.verified is False
    assert item.generated_by == "fixture"


# -----------------------------------------------------------------------------
# 3. API Router Integration & Error Contract Tests
# -----------------------------------------------------------------------------

def test_api_advisories_unauthorized_without_token():
    """Verify 401 and exact top-level error JSON when no token is provided."""
    response = client.get("/api/v1/advisories")
    assert response.status_code == 401
    assert response.json() == {
        "error": {
            "code": "UNAUTHORIZED",
            "message": "Missing or invalid Authorization header.",
        }
    }


def test_api_advisories_unauthorized_with_bad_token():
    """Verify 401 and exact top-level error JSON when wrong token is provided."""
    response = client.get(
        "/api/v1/advisories",
        headers={"Authorization": "Bearer wrong-token-xyz"},
    )
    assert response.status_code == 401
    assert response.json() == {
        "error": {
            "code": "UNAUTHORIZED",
            "message": "Invalid admin token.",
        }
    }


def test_api_advisories_fail_closed_when_token_unset(monkeypatch):
    """Verify 401 and fail-closed response when server PATCHPILOT_ADMIN_TOKEN is missing."""
    monkeypatch.delenv("PATCHPILOT_ADMIN_TOKEN", raising=False)
    response = client.get("/api/v1/advisories", headers=AUTH_HEADER)
    assert response.status_code == 401
    assert response.json() == {
        "error": {
            "code": "UNAUTHORIZED",
            "message": "Management authentication is not configured or token is weak.",
        }
    }


def test_api_advisories_fail_closed_when_token_weak(monkeypatch):
    """Verify 401 and fail-closed response when server PATCHPILOT_ADMIN_TOKEN is shorter than 16 chars."""
    monkeypatch.setenv("PATCHPILOT_ADMIN_TOKEN", "short-token")  # 11 chars < 16
    response = client.get(
        "/api/v1/advisories",
        headers={"Authorization": "Bearer short-token"},
    )
    assert response.status_code == 401
    assert response.json() == {
        "error": {
            "code": "UNAUTHORIZED",
            "message": "Management authentication is not configured or token is weak.",
        }
    }


def test_api_advisories_get_list_authorized():
    """Verify 200 and schema when authorized token is provided."""
    response = client.get("/api/v1/advisories", headers=AUTH_HEADER)
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    item = data["items"][0]
    assert item["external_id"] == "CVE-2026-109618"
    assert item["source_kind"] == "demo"
    assert item["verified"] is False
    assert item["generated_by"] == "fixture"


def test_api_advisories_analyze_success():
    """Verify POST /api/v1/advisories/analyze returns 200 and valid localizations."""
    payload = {
        "advisory_text": "Sample PHP vulnerability advisory text.",
        "languages": ["en", "ur", "ur-Latn", "ar", "es"],
        "processing_mode": "fixture",
    }
    response = client.post(
        "/api/v1/advisories/analyze",
        json=payload,
        headers=AUTH_HEADER,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["is_simulated"] is True
    assert data["processing_mode"] == "fixture"
    assert len(data["localizations"]) == 5
    assert data["advisory"]["source_kind"] == "demo"
    assert data["advisory"]["verified"] is False
    assert data["advisory"]["generated_by"] == "fixture"


def test_api_advisories_analyze_validation_error():
    """Verify 422 Unprocessable Entity when request fails schema validation."""
    payload = {
        "advisory_text": "A" * 12005,
        "languages": ["en"],
        "processing_mode": "fixture",
    }
    response = client.post(
        "/api/v1/advisories/analyze",
        json=payload,
        headers=AUTH_HEADER,
    )
    assert response.status_code == 422


def test_api_advisories_analyze_llm_mode_returns_503():
    """Verify 503 when processing_mode='llm' is requested while unconfigured."""
    payload = {
        "advisory_text": "Sample advisory text",
        "languages": ["en"],
        "processing_mode": "llm",
    }
    response = client.post(
        "/api/v1/advisories/analyze",
        json=payload,
        headers=AUTH_HEADER,
    )
    assert response.status_code == 503
    data = response.json()
    assert data["error"]["code"] == "LLM_NOT_CONFIGURED"
