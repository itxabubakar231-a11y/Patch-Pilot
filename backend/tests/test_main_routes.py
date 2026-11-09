"""
Tests for root FastAPI management application route mounting and auth handling.
Owned by Member 1 (Team A).
Verifies that:
- GET /health and GET / remain functional.
- The advisory router (/api/v1/advisories) is correctly mounted on the root management app.
- AdminAuthException handler is registered and returns standard error envelopes.
- Bearer token authentication fails closed when missing/invalid.
- Advisory fixture analysis works through the root management app without network calls.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.advisories import AdminAuthException

TEST_TOKEN = "patchpilot-test-ephemeral-admin-token-123456"
AUTH_HEADERS = {"Authorization": f"Bearer {TEST_TOKEN}"}


@pytest.fixture(autouse=True)
def ensure_no_groq_key(monkeypatch):
    """Ensure GROQ_API_KEY is not set so all tests stay in fixture mode with zero network calls."""
    monkeypatch.delenv("GROQ_API_KEY", raising=False)


def test_main_health():
    """Confirm GET /health on root app returns 200 with expected baseline response."""
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "PatchPilot Backend",
        "version": "0.1.0",
    }


def test_main_root():
    """Confirm GET / on root app returns 200 with service information."""
    with TestClient(app) as client:
        response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert "endpoints" in data


def test_advisories_routes_registered():
    """Confirm advisory routes are registered in the main application's route table."""
    paths = list(app.openapi()["paths"].keys())
    assert "/api/v1/advisories" in paths
    assert "/api/v1/advisories/analyze" in paths


def test_advisories_unauthorized_without_token(monkeypatch):
    """Confirm accessing /api/v1/advisories without auth header returns 401 error envelope."""
    monkeypatch.setenv("PATCHPILOT_ADMIN_TOKEN", TEST_TOKEN)
    with TestClient(app) as client:
        response = client.get("/api/v1/advisories")
    assert response.status_code == 401
    assert response.json() == {
        "error": {
            "code": "UNAUTHORIZED",
            "message": "Missing or invalid Authorization header.",
        }
    }


def test_advisories_unauthorized_with_invalid_token(monkeypatch):
    """Confirm accessing /api/v1/advisories with wrong token returns 401 error envelope."""
    monkeypatch.setenv("PATCHPILOT_ADMIN_TOKEN", TEST_TOKEN)
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/advisories",
            headers={"Authorization": "Bearer wrong-token-1234567890"},
        )
    assert response.status_code == 401
    assert response.json() == {
        "error": {
            "code": "UNAUTHORIZED",
            "message": "Invalid admin token.",
        }
    }


def test_advisories_fail_closed_when_server_token_unset(monkeypatch):
    """Confirm accessing /api/v1/advisories fails closed when server token is unset."""
    monkeypatch.delenv("PATCHPILOT_ADMIN_TOKEN", raising=False)
    with TestClient(app) as client:
        response = client.get("/api/v1/advisories", headers=AUTH_HEADERS)
    assert response.status_code == 401
    assert response.json() == {
        "error": {
            "code": "UNAUTHORIZED",
            "message": "Management authentication is not configured or token is weak.",
        }
    }


def test_advisories_fail_closed_when_server_token_weak(monkeypatch):
    """Confirm accessing /api/v1/advisories fails closed when server token is <16 chars."""
    monkeypatch.setenv("PATCHPILOT_ADMIN_TOKEN", "short")
    with TestClient(app) as client:
        response = client.get("/api/v1/advisories", headers={"Authorization": "Bearer short"})
    assert response.status_code == 401
    assert response.json() == {
        "error": {
            "code": "UNAUTHORIZED",
            "message": "Management authentication is not configured or token is weak.",
        }
    }


def test_admin_auth_exception_handler_registered():
    """Verify that AdminAuthException is mapped to the custom error envelope on the root app."""
    assert AdminAuthException in app.exception_handlers


def test_advisories_get_list_authorized(monkeypatch):
    """Confirm authorized GET /api/v1/advisories returns advisory list through main app."""
    monkeypatch.setenv("PATCHPILOT_ADMIN_TOKEN", TEST_TOKEN)
    with TestClient(app) as client:
        response = client.get("/api/v1/advisories", headers=AUTH_HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)
    assert data["total"] >= 1


def test_advisories_analyze_fixture_mode_authorized(monkeypatch):
    """Confirm authorized POST /api/v1/advisories/analyze returns structured advisory in fixture mode."""
    monkeypatch.setenv("PATCHPILOT_ADMIN_TOKEN", TEST_TOKEN)
    payload = {
        "advisory_text": "PHP-CGI argument injection vulnerability CVE-2024-4577 allows remote code execution on Windows systems.",
        "languages": ["en", "es"],
        "processing_mode": "fixture",
    }
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/advisories/analyze",
            json=payload,
            headers=AUTH_HEADERS,
        )
    assert response.status_code == 200
    data = response.json()
    assert data["processing_mode"] == "fixture"
    assert "advisory" in data
    assert "localizations" in data
    assert len(data["localizations"]) == 2
    assert data["advisory"]["title"] is not None
