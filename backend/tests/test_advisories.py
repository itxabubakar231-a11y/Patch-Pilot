"""
Unit and Integration Tests for PatchPilot Advisory & Multilingual Module.
Owned by Member 4 (Team B).
Tests schema validation, deterministic multilingual fixtures, Groq AI integration, and API endpoints.
"""
import json
import pytest
from unittest.mock import MagicMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

import httpx
from groq import (
    AuthenticationError as GroqAuthError,
    RateLimitError as GroqRateLimitError,
    APITimeoutError as GroqTimeoutError,
    APIConnectionError as GroqConnError,
)

from app.api.advisories import (
    AdminAuthException,
    admin_auth_exception_handler,
    router as advisories_router,
    advisory_service as default_advisory_service,
)
from app.schemas.advisory import (
    AdvisoryAnalyzeRequest,
    AdvisoryAnalyzeResponse,
    AdvisoryListResponse,
)
from app.services.advisory_service import (
    AdvisoryService,
    LLMAuthError,
    LLMInvalidResponseError,
    LLMNotConfiguredError,
    LLMProviderError,
    LLMRateLimitError,
    LLMTimeoutError,
    MULTILINGUAL_FIXTURES,
)

# Test application mounting the advisory router in isolation
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


def create_mock_groq_client(json_content: str):
    """Helper to produce a mocked Groq client returning structured text."""
    mock_client = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = json_content
    mock_completion = MagicMock()
    mock_completion.choices = [mock_choice]
    mock_client.chat.completions.create.return_value = mock_completion
    return mock_client


SAMPLE_GROQ_JSON = json.dumps({
    "title": "PHP Input Boundary Handling Advisory",
    "severity": "high",
    "summary": "Improper input boundary validation in PHP web stack can cause unexpected behavior.",
    "external_id": "CVE-2026-109618",
    "localizations": [
        {"language_code": "en", "title": "PHP Advisory", "summary": "Input validation risk.", "recommended_action": "Update PHP to latest release."},
        {"language_code": "ur", "title": "پی ایچ پی سیکیورٹی نوٹس", "summary": "ان پٹ کی جانچ کا خطرہ۔", "recommended_action": "سافٹ ویئر کو اپ ڈیٹ کریں۔"},
        {"language_code": "ur-Latn", "title": "PHP Security Ittila", "summary": "Input validation ka masla hai.", "recommended_action": "PHP runtime update karein."},
        {"language_code": "ar", "title": "إشعار أمني لـ PHP", "summary": "خطر التحقق من المدخلات.", "recommended_action": "قم بترقية بيئة تشغيل PHP فوراً."},
        {"language_code": "es", "title": "Aviso de PHP", "summary": "Riesgo de validación de entrada.", "recommended_action": "Actualice el entorno de ejecución PHP."}
    ]
})


SAMPLE_GROQ_JSON_EN_UR = json.dumps({
    "title": "PHP Input Boundary Handling Advisory",
    "severity": "high",
    "summary": "Improper input boundary validation in PHP web stack can cause unexpected behavior.",
    "external_id": "CVE-2026-109618",
    "localizations": [
        {"language_code": "en", "title": "PHP Advisory", "summary": "Input validation risk.", "recommended_action": "Follow vendor remediation guidance."},
        {"language_code": "ur", "title": "پی ایچ پی سیکیورٹی نوٹس", "summary": "ان پٹ کی جانچ کا خطرہ۔", "recommended_action": "وینڈر کی ہدایات پر عمل کریں۔"}
    ]
})


# =============================================================================
# 1. Pydantic Schema Validation Tests (Preserved from Phase 1)
# =============================================================================

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


# =============================================================================
# 2. AdvisoryService Logic Tests (Preserved from Phase 1)
# =============================================================================

def test_advisory_service_multilingual_fixture():
    """Verify deterministic fixture returns accurate multilingual localizations."""
    service = AdvisoryService()
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


def test_advisory_service_unconfigured_llm_raises_error(monkeypatch):
    """Verify requesting LLM mode when unconfigured raises LLMNotConfiguredError."""
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    service = AdvisoryService(groq_client=None)
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


# =============================================================================
# 3. API Router Auth & Contract Tests (Preserved from Phase 1)
# =============================================================================

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
    monkeypatch.setenv("PATCHPILOT_ADMIN_TOKEN", "short-token")
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
    """Verify POST /api/v1/advisories/analyze returns 200 and valid localizations in fixture mode."""
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


def test_api_advisories_analyze_llm_mode_returns_503(monkeypatch):
    """Verify 503 when processing_mode='llm' is requested while unconfigured."""
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    # Ensure default service doesn't have an injected client
    default_advisory_service._groq_client = None

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


# =============================================================================
# 4. Phase 2 — Groq AI Integration Tests (Mocked / Offline)
# =============================================================================

def test_groq_llm_analysis_success():
    """Verify successful Groq analysis returns structured Pydantic response with honest tagging."""
    mock_client = create_mock_groq_client(SAMPLE_GROQ_JSON)
    service = AdvisoryService(groq_client=mock_client)

    req = AdvisoryAnalyzeRequest(
        advisory_text="PHP advisory notice mentioning CVE-2026-109618 in request parsing.",
        languages=["en", "ur", "ur-Latn", "ar", "es"],
        processing_mode="llm",
    )
    res = service.analyze_advisory(req)

    assert isinstance(res, AdvisoryAnalyzeResponse)
    assert res.processing_mode == "llm"
    assert res.is_simulated is False
    assert res.advisory.generated_by == "llm"
    assert res.advisory.source_kind == "user_supplied"
    assert res.advisory.verified is False
    assert res.advisory.external_id == "CVE-2026-109618"
    assert res.advisory.severity == "high"

    # Confirm all 5 localizations generated with 'llm' label
    assert len(res.localizations) == 5
    for loc in res.localizations:
        assert loc.generated_by == "llm"
        assert len(loc.title) > 0
        assert len(loc.summary) > 0
        assert len(loc.recommended_action) > 0


# -----------------------------------------------------------------------------
# FIX 1 Regression Tests: CVE Sanitization & Hallucination Prevention
# -----------------------------------------------------------------------------

def test_groq_llm_cve_sanitization_rejects_invalid_format():
    """Verify CVE identifiers not matching CVE-YYYY-NNNN format are sanitized to None."""
    payload_bad_cve = json.dumps({
        "title": "Generic Notice",
        "severity": "medium",
        "summary": "Testing invalid CVE format rejection.",
        "external_id": "NOT-A-REAL-CVE-123",
        "localizations": [
            {"language_code": "en", "title": "Notice", "summary": "Summary", "recommended_action": "Action"}
        ]
    })
    mock_client = create_mock_groq_client(payload_bad_cve)
    service = AdvisoryService(groq_client=mock_client)

    req = AdvisoryAnalyzeRequest(
        advisory_text="Notice mentioning NOT-A-REAL-CVE-123.",
        languages=["en"],
        processing_mode="llm",
    )
    res = service.analyze_advisory(req)
    assert res.advisory.external_id is None


def test_groq_llm_cve_sanitization_rejects_hallucinated_valid_format():
    """Verify valid-format CVE hallucinated by LLM but absent in user text is rejected."""
    payload_hallucinated_cve = json.dumps({
        "title": "PHP Memory Safety Advisory",
        "severity": "high",
        "summary": "Improper memory management under heavy load.",
        "external_id": "CVE-2024-99999",  # Valid format, but absent in user text!
        "localizations": [
            {"language_code": "en", "title": "Notice", "summary": "Summary", "recommended_action": "Action"}
        ]
    })
    mock_client = create_mock_groq_client(payload_hallucinated_cve)
    service = AdvisoryService(groq_client=mock_client)

    # Source text contains NO CVE identifier
    req = AdvisoryAnalyzeRequest(
        advisory_text="A memory safety issue was reported in the legacy string parser module under high concurrency.",
        languages=["en"],
        processing_mode="llm",
    )
    res = service.analyze_advisory(req)
    assert res.advisory.external_id is None
    assert res.advisory.verified is False
    assert res.advisory.source_kind == "user_supplied"


def test_groq_llm_cve_sanitization_accepts_source_cve_case_insensitive():
    """Verify valid CVE present in source text (case-insensitive) is accepted but remains unverified."""
    payload_valid_cve = json.dumps({
        "title": "PHP Bulletin",
        "severity": "high",
        "summary": "Summary of bug.",
        "external_id": "CVE-2024-10101",
        "localizations": [
            {"language_code": "en", "title": "Notice", "summary": "Summary", "recommended_action": "Action"}
        ]
    })
    mock_client = create_mock_groq_client(payload_valid_cve)
    service = AdvisoryService(groq_client=mock_client)

    # Source text mentions lowercase cve-2024-10101
    req = AdvisoryAnalyzeRequest(
        advisory_text="PHP advisory fixes buffer overflow tracked as cve-2024-10101 in string module.",
        languages=["en"],
        processing_mode="llm",
    )
    res = service.analyze_advisory(req)
    assert res.advisory.external_id == "CVE-2024-10101"
    assert res.advisory.verified is False
    assert res.advisory.source_kind == "user_supplied"
    assert res.advisory.generated_by == "llm"


def test_groq_llm_cve_sanitization_rejects_partial_cve_match():
    """Verify partial word substring match for CVE is rejected."""
    payload_partial_cve = json.dumps({
        "title": "PHP Bulletin",
        "severity": "medium",
        "summary": "Summary.",
        "external_id": "CVE-2024-1234",  # Substring of CVE-2024-1234567
        "localizations": [
            {"language_code": "en", "title": "Notice", "summary": "Summary", "recommended_action": "Action"}
        ]
    })
    mock_client = create_mock_groq_client(payload_partial_cve)
    service = AdvisoryService(groq_client=mock_client)

    req = AdvisoryAnalyzeRequest(
        advisory_text="Advisory notes fix for CVE-2024-1234567 in main branch.",
        languages=["en"],
        processing_mode="llm",
    )
    res = service.analyze_advisory(req)
    assert res.advisory.external_id is None


# -----------------------------------------------------------------------------
# FIX 2 Regression Tests: Strict Localization Validation
# -----------------------------------------------------------------------------

def test_groq_llm_missing_language_raises_invalid_response():
    """Verify missing requested translation raises LLMInvalidResponseError instead of silent fallback."""
    payload_missing_ur = json.dumps({
        "title": "PHP Advisory",
        "severity": "low",
        "summary": "Summary.",
        "external_id": None,
        "localizations": [
            {"language_code": "en", "title": "Notice", "summary": "Summary", "recommended_action": "Action"}
        ]
    })
    mock_client = create_mock_groq_client(payload_missing_ur)
    service = AdvisoryService(groq_client=mock_client)

    # Request requires both 'en' and 'ur'
    req = AdvisoryAnalyzeRequest(
        advisory_text="Sample text",
        languages=["en", "ur"],
        processing_mode="llm",
    )
    with pytest.raises(LLMInvalidResponseError) as exc_info:
        service.analyze_advisory(req)
    assert "missing required localizations" in str(exc_info.value).lower()


def test_groq_llm_duplicate_language_raises_invalid_response():
    """Verify duplicate language codes raise LLMInvalidResponseError."""
    payload_duplicate = json.dumps({
        "title": "PHP Advisory",
        "severity": "low",
        "summary": "Summary.",
        "external_id": None,
        "localizations": [
            {"language_code": "en", "title": "Notice 1", "summary": "Summary 1", "recommended_action": "Action 1"},
            {"language_code": "en", "title": "Notice 2", "summary": "Summary 2", "recommended_action": "Action 2"}
        ]
    })
    mock_client = create_mock_groq_client(payload_duplicate)
    service = AdvisoryService(groq_client=mock_client)

    req = AdvisoryAnalyzeRequest(
        advisory_text="Sample text",
        languages=["en"],
        processing_mode="llm",
    )
    with pytest.raises(LLMInvalidResponseError) as exc_info:
        service.analyze_advisory(req)
    assert "duplicate" in str(exc_info.value).lower()


def test_groq_llm_unexpected_language_raises_invalid_response():
    """Verify unexpected language code returned by LLM raises LLMInvalidResponseError."""
    payload_unexpected = json.dumps({
        "title": "PHP Advisory",
        "severity": "low",
        "summary": "Summary.",
        "external_id": None,
        "localizations": [
            {"language_code": "en", "title": "Notice", "summary": "Summary", "recommended_action": "Action"},
            {"language_code": "es", "title": "Aviso", "summary": "Resumen", "recommended_action": "Acción"}
        ]
    })
    mock_client = create_mock_groq_client(payload_unexpected)
    service = AdvisoryService(groq_client=mock_client)

    # Request only asked for 'en'
    req = AdvisoryAnalyzeRequest(
        advisory_text="Sample text",
        languages=["en"],
        processing_mode="llm",
    )
    with pytest.raises(LLMInvalidResponseError) as exc_info:
        service.analyze_advisory(req)
    assert "unexpected" in str(exc_info.value).lower()


def test_groq_llm_all_five_supported_languages_exact_match():
    """Verify all 5 supported languages are validated and preserved in exact requested order."""
    # LLM returns all 5 languages in reverse order
    payload_5langs_reversed = json.dumps({
        "title": "PHP Advisory",
        "severity": "critical",
        "summary": "Critical vulnerability.",
        "external_id": None,
        "localizations": [
            {"language_code": "es", "title": "Aviso", "summary": "Resumen", "recommended_action": "Acción"},
            {"language_code": "ar", "title": "إشعار", "summary": "ملخص", "recommended_action": "إجراء"},
            {"language_code": "ur-Latn", "title": "Ittila", "summary": "Khulasa", "recommended_action": "Iqdaam"},
            {"language_code": "ur", "title": "نوٹس", "summary": "خلاصہ", "recommended_action": "کارروائی"},
            {"language_code": "en", "title": "Notice", "summary": "Summary", "recommended_action": "Action"}
        ]
    })
    mock_client = create_mock_groq_client(payload_5langs_reversed)
    service = AdvisoryService(groq_client=mock_client)

    req = AdvisoryAnalyzeRequest(
        advisory_text="Critical advisory notice.",
        languages=["en", "ur", "ur-Latn", "ar", "es"],
        processing_mode="llm",
    )
    res = service.analyze_advisory(req)
    assert len(res.localizations) == 5
    # Order must match request order: en, ur, ur-Latn, ar, es
    assert [loc.language_code for loc in res.localizations] == ["en", "ur", "ur-Latn", "ar", "es"]
    for loc in res.localizations:
        assert loc.generated_by == "llm"


def test_api_advisories_analyze_llm_missing_language_returns_502():
    """Verify API endpoint returns 502 with LLM_INVALID_RESPONSE when LLM omits a requested language."""
    payload_missing = json.dumps({
        "title": "PHP Advisory",
        "severity": "low",
        "summary": "Summary.",
        "external_id": None,
        "localizations": [
            {"language_code": "en", "title": "Notice", "summary": "Summary", "recommended_action": "Action"}
        ]
    })
    mock_client = create_mock_groq_client(payload_missing)
    default_advisory_service._groq_client = mock_client

    try:
        response = client.post(
            "/api/v1/advisories/analyze",
            json={
                "advisory_text": "Sample text",
                "languages": ["en", "ur"],
                "processing_mode": "llm",
            },
            headers=AUTH_HEADER,
        )
        assert response.status_code == 502
        data = response.json()
        assert data["error"]["code"] == "LLM_INVALID_RESPONSE"
        assert "missing" in data["error"]["message"].lower()
    finally:
        default_advisory_service._groq_client = None


# -----------------------------------------------------------------------------
# Realistic Groq SDK Exception Handling Tests
# -----------------------------------------------------------------------------

def test_groq_llm_auth_error_with_sdk_exception():
    """Verify realistic Groq AuthenticationError raises LLMAuthError."""
    req_http = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    resp_http = httpx.Response(401, request=req_http)
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = GroqAuthError("Invalid API Key", response=resp_http, body=None)
    service = AdvisoryService(groq_client=mock_client)

    req = AdvisoryAnalyzeRequest(
        advisory_text="Sample text",
        languages=["en"],
        processing_mode="llm",
    )
    with pytest.raises(LLMAuthError):
        service.analyze_advisory(req)


def test_groq_llm_rate_limit_error_with_sdk_exception():
    """Verify realistic Groq RateLimitError raises LLMRateLimitError."""
    req_http = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    resp_http = httpx.Response(429, request=req_http)
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = GroqRateLimitError("Rate limit exceeded", response=resp_http, body=None)
    service = AdvisoryService(groq_client=mock_client)

    req = AdvisoryAnalyzeRequest(
        advisory_text="Sample text",
        languages=["en"],
        processing_mode="llm",
    )
    with pytest.raises(LLMRateLimitError):
        service.analyze_advisory(req)


def test_groq_llm_timeout_error_with_sdk_exception():
    """Verify realistic Groq APITimeoutError raises LLMTimeoutError."""
    req_http = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = GroqTimeoutError(request=req_http)
    service = AdvisoryService(groq_client=mock_client)

    req = AdvisoryAnalyzeRequest(
        advisory_text="Sample text",
        languages=["en"],
        processing_mode="llm",
    )
    with pytest.raises(LLMTimeoutError):
        service.analyze_advisory(req)


def test_groq_llm_connection_error_with_sdk_exception():
    """Verify realistic Groq APIConnectionError raises LLMProviderError."""
    req_http = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = GroqConnError(request=req_http)
    service = AdvisoryService(groq_client=mock_client)

    req = AdvisoryAnalyzeRequest(
        advisory_text="Sample text",
        languages=["en"],
        processing_mode="llm",
    )
    with pytest.raises(LLMProviderError):
        service.analyze_advisory(req)


def test_groq_llm_invalid_json_handling():
    """Verify invalid JSON response from LLM raises LLMInvalidResponseError."""
    mock_client = create_mock_groq_client("MALFORMED NOT JSON {[[")
    service = AdvisoryService(groq_client=mock_client)

    req = AdvisoryAnalyzeRequest(
        advisory_text="Sample text",
        languages=["en"],
        processing_mode="llm",
    )
    with pytest.raises(LLMInvalidResponseError):
        service.analyze_advisory(req)


def test_api_advisories_analyze_llm_mode_success_with_mock():
    """Verify API endpoint returns 200 and schema for LLM mode with injected Groq client."""
    mock_client = create_mock_groq_client(SAMPLE_GROQ_JSON_EN_UR)
    default_advisory_service._groq_client = mock_client

    try:
        payload = {
            "advisory_text": "Sample text mentioning CVE-2026-109618.",
            "languages": ["en", "ur"],
            "processing_mode": "llm",
        }
        response = client.post(
            "/api/v1/advisories/analyze",
            json=payload,
            headers=AUTH_HEADER,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["processing_mode"] == "llm"
        assert data["is_simulated"] is False
        assert data["advisory"]["generated_by"] == "llm"
        assert data["advisory"]["source_kind"] == "user_supplied"
        assert data["advisory"]["verified"] is False
        assert data["advisory"]["external_id"] == "CVE-2026-109618"
        assert len(data["localizations"]) == 2
        assert [loc["language_code"] for loc in data["localizations"]] == ["en", "ur"]
    finally:
        default_advisory_service._groq_client = None


def test_api_advisories_analyze_llm_rate_limit_returns_429():
    """Verify API endpoint returns 429 when Groq encounters a rate limit."""
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = Exception("RateLimitError: 429 Too Many Requests")
    default_advisory_service._groq_client = mock_client

    try:
        payload = {
            "advisory_text": "Sample text",
            "languages": ["en"],
            "processing_mode": "llm",
        }
        response = client.post(
            "/api/v1/advisories/analyze",
            json=payload,
            headers=AUTH_HEADER,
        )
        assert response.status_code == 429
        data = response.json()
        assert data["error"]["code"] == "RATE_LIMIT_EXCEEDED"
    finally:
        default_advisory_service._groq_client = None
