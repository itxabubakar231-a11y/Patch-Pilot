"""
Unit and Integration Tests for PatchPilot Management API (port 8000).

Adheres strictly to docs/API.md (Section 3, endpoints A-G).
Verifies:
- All 7 management endpoints require local admin authentication.
- Standard 401 error envelope on missing, invalid, unset, or weak token.
- GET /api/v1/overview: exact contract shape, zero counts on fresh DB, offline/online lab probe.
- GET /api/v1/proxy/status: exact contract shape, readiness for enforce.
- PUT /api/v1/proxy/mode: validation, 409 when replay missing, 200 on accepted transitions.
- POST /api/v1/proxy/rollback: resets to shadow, exact response body, idempotent audit logging.
- GET /api/v1/rules: exact item fields, replay_passed status, pagination limits.
- POST /api/v1/rules/{rule_id}/replay: deterministic fixture evaluation, 404 on unknown rule,
  503 on unavailable/invalid fixtures without exposing paths.
- GET /api/v1/traffic: newest first, query-stripped path, exact fields, database-driven total.
- Cross-app integration: management replay -> PUT enforce -> proxy 403 block -> rollback -> proxy shadow.
- Zero live DB creation (backend/data/patchpilot.db).
"""

import json
from pathlib import Path
from typing import Any, Dict
from fastapi.testclient import TestClient
import httpx
import pytest

from app.core.config import DATABASE_PATH, LAB_HOST, LAB_PORT
from app.core.db import (
    compute_rule_digest,
    connect,
    get_proxy_mode,
    init_db,
    insert_traffic_event,
    set_proxy_mode,
)
from app.main import app as management_app
from app.proxy_app import app as proxy_app, proxy_service
from app.services import replay_service


TEST_ADMIN_TOKEN = "patchpilot-test-admin-secret-token-12345"
AUTH_HEADER = {"Authorization": f"Bearer {TEST_ADMIN_TOKEN}"}


@pytest.fixture(autouse=True)
def setup_management_test_environment(monkeypatch: pytest.MonkeyPatch):
    """
    Ensure the isolated database is initialized and valid admin token is configured.
    """
    init_db()
    monkeypatch.setenv("PATCHPILOT_ADMIN_TOKEN", TEST_ADMIN_TOKEN)


@pytest.fixture
def valid_test_fixture(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """
    Creates an official-conforming harmless lab-v1 test fixture in tmp_path
    and monkeypatches replay_service.CANONICAL_FIXTURE_PATH.
    Contains 7 benign and 3 attack requests.
    """
    fixture_content = {
        "_notice": "OFFICIAL LOCAL TEST FIXTURE (HARMLESS)",
        "fixture_version": "lab-v1",
        "is_simulated": True,
        "description": "Deterministic dataset for testing rule replay.",
        "benign_requests": [
            {"id": "b1", "path": "/", "query_params": {}, "expected_match": False},
            {"id": "b2", "path": "/index.php", "query_params": {"page": "home"}, "expected_match": False},
            {"id": "b3", "path": "/health", "query_params": {}, "expected_match": False},
            {"id": "b4", "path": "/about.php", "query_params": {"view": "summary"}, "expected_match": False},
            {"id": "b5", "path": "/contact", "query_params": {"lang": "en"}, "expected_match": False},
            {"id": "b6", "path": "/catalog", "query_params": {"category": "electronics"}, "expected_match": False},
            {"id": "b7", "path": "/blog", "query_params": {"post": "100"}, "expected_match": False},
        ],
        "attack_requests": [
            {"id": "a1", "path": "/index.php", "query_params": {"demo_attack": "true"}, "expected_match": True},
            {"id": "a2", "path": "/login.php", "query_params": {"demo_attack": "true", "x": "1"}, "expected_match": True},
            {"id": "a3", "path": "/api", "query_params": {"user": "admin", "demo_attack": "true"}, "expected_match": True},
        ],
    }

    fixture_file = tmp_path / "lab_v1.json"
    fixture_file.write_text(json.dumps(fixture_content, indent=2), encoding="utf-8")
    monkeypatch.setattr(replay_service, "CANONICAL_FIXTURE_PATH", fixture_file)
    return fixture_file


# =============================================================================
# 1. Authentication Checks on All 7 Management Endpoints
# =============================================================================

@pytest.mark.parametrize(
    "method,endpoint,payload",
    [
        ("GET", "/api/v1/overview", None),
        ("GET", "/api/v1/proxy/status", None),
        ("PUT", "/api/v1/proxy/mode", {"mode": "shadow"}),
        ("POST", "/api/v1/proxy/rollback", None),
        ("GET", "/api/v1/rules", None),
        ("POST", "/api/v1/rules/1/replay", None),
        ("GET", "/api/v1/traffic", None),
    ],
)
def test_management_routes_unauthorized_missing_token(method: str, endpoint: str, payload: Any):
    """Every management endpoint returns 401 UNAUTHORIZED when Authorization header is absent."""
    with TestClient(management_app) as client:
        resp = client.request(method, endpoint, json=payload)

    assert resp.status_code == 401
    data = resp.json()
    assert "error" in data
    assert data["error"]["code"] == "UNAUTHORIZED"
    assert data["error"]["message"] == "Missing or invalid Authorization header."


@pytest.mark.parametrize(
    "method,endpoint,payload",
    [
        ("GET", "/api/v1/overview", None),
        ("GET", "/api/v1/proxy/status", None),
        ("PUT", "/api/v1/proxy/mode", {"mode": "shadow"}),
        ("POST", "/api/v1/proxy/rollback", None),
        ("GET", "/api/v1/rules", None),
        ("POST", "/api/v1/rules/1/replay", None),
        ("GET", "/api/v1/traffic", None),
    ],
)
def test_management_routes_unauthorized_invalid_token(method: str, endpoint: str, payload: Any):
    """Every management endpoint returns 401 UNAUTHORIZED when Authorization token does not match."""
    with TestClient(management_app) as client:
        resp = client.request(
            method,
            endpoint,
            headers={"Authorization": "Bearer wrong-token-value-xyz"},
            json=payload,
        )

    assert resp.status_code == 401
    data = resp.json()
    assert "error" in data
    assert data["error"]["code"] == "UNAUTHORIZED"
    assert data["error"]["message"] == "Invalid admin token."


def test_management_routes_fail_closed_when_server_token_unset_or_weak(monkeypatch: pytest.MonkeyPatch):
    """Management endpoints fail closed (401) when server environment token is missing or short (<16 chars)."""
    with TestClient(management_app) as client:
        # Unset server token
        monkeypatch.delenv("PATCHPILOT_ADMIN_TOKEN", raising=False)
        resp1 = client.get("/api/v1/proxy/status", headers=AUTH_HEADER)
        assert resp1.status_code == 401
        assert resp1.json()["error"]["code"] == "UNAUTHORIZED"

        # Short/weak server token
        monkeypatch.setenv("PATCHPILOT_ADMIN_TOKEN", "short_token_15c")
        resp2 = client.get("/api/v1/proxy/status", headers={"Authorization": "Bearer short_token_15c"})
        assert resp2.status_code == 401
        assert resp2.json()["error"]["code"] == "UNAUTHORIZED"


# =============================================================================
# 2. Endpoint A: GET /api/v1/overview
# =============================================================================

def test_overview_exact_keys_fresh_db_zero_counts(monkeypatch: pytest.MonkeyPatch):
    """
    Overview returns exact documented keys, zero observed traffic counts on a fresh DB,
    and reflects offline status when the lab probe fails without contacting the network.
    """
    # Ensure probe fails without network
    monkeypatch.setattr(
        "app.api.traffic.probe_lab_health",
        lambda: ("offline", None),
    )

    with TestClient(management_app) as client:
        resp = client.get("/api/v1/overview", headers=AUTH_HEADER)

    assert resp.status_code == 200
    data = resp.json()

    # Exact top-level contract keys
    assert set(data.keys()) == {
        "environment",
        "is_simulated",
        "proxy",
        "traffic",
        "lab",
        "advisories",
        "scanner",
        "generated_at",
    }
    assert data["environment"] == "local_lab"
    assert data["is_simulated"] is True

    # Proxy block
    assert data["proxy"] == {"mode": "shadow", "ready_for_enforce": False}

    # Traffic block: all zeros on fresh DB
    assert data["traffic"] == {
        "total_requests": 0,
        "allowed_requests": 0,
        "shadow_matches": 0,
        "blocked_requests": 0,
    }

    # Lab block: offline when probe fails
    assert data["lab"] == {
        "upstream": f"{LAB_HOST}:{LAB_PORT}",
        "status": "offline",
        "simulated_stack": None,
    }

    # Advisories and scanner
    assert data["advisories"] == {"total": 0}
    assert data["scanner"] == {"status": "not_implemented"}
    assert data["generated_at"].endswith("Z")


def test_overview_lab_probe_online_when_successful(monkeypatch: pytest.MonkeyPatch):
    """Overview reports online lab status and simulated stack when probe succeeds."""
    monkeypatch.setattr(
        "app.api.traffic.probe_lab_health",
        lambda: ("online", "Apache/2.4.52 + PHP/8.2.0"),
    )

    with TestClient(management_app) as client:
        resp = client.get("/api/v1/overview", headers=AUTH_HEADER)

    assert resp.status_code == 200
    lab = resp.json()["lab"]
    assert lab["status"] == "online"
    assert lab["simulated_stack"] == "Apache/2.4.52 + PHP/8.2.0"


# =============================================================================
# 3. Endpoint B: GET /api/v1/proxy/status
# =============================================================================

def test_proxy_status_shape_and_readiness_transition(valid_test_fixture: Path):
    """Status reports mode, enabled_rule_count, readiness false before replay, true after."""
    with TestClient(management_app) as client:
        # Initially ready_for_enforce is False and last_replay_at is None
        resp1 = client.get("/api/v1/proxy/status", headers=AUTH_HEADER)
        assert resp1.status_code == 200
        data1 = resp1.json()

        assert set(data1.keys()) == {
            "mode",
            "ready_for_enforce",
            "enabled_rule_count",
            "upstream",
            "last_replay_at",
            "updated_at",
        }
        assert data1["mode"] == "shadow"
        assert data1["ready_for_enforce"] is False
        assert data1["enabled_rule_count"] == 1
        assert data1["upstream"] == f"{LAB_HOST}:{LAB_PORT}"
        assert data1["last_replay_at"] is None

        # Execute passing replay for rule 1
        replay_resp = client.post("/api/v1/rules/1/replay", headers=AUTH_HEADER)
        assert replay_resp.status_code == 200

        # Now ready_for_enforce is True and last_replay_at is set
        resp2 = client.get("/api/v1/proxy/status", headers=AUTH_HEADER)
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["ready_for_enforce"] is True
        assert data2["last_replay_at"] is not None


# =============================================================================
# 4. Endpoint C: PUT /api/v1/proxy/mode
# =============================================================================

def test_proxy_mode_put_validation_and_rejected_enforce():
    """
    PUT /api/v1/proxy/mode rejects invalid modes, rejects extra fields,
    and returns 409 REPLAY_REQUIRED if enforce is requested without passing replay.
    """
    with TestClient(management_app) as client:
        # 1. Invalid mode -> 422
        resp_invalid = client.put(
            "/api/v1/proxy/mode",
            headers=AUTH_HEADER,
            json={"mode": "unsupported_mode"},
        )
        assert resp_invalid.status_code == 422

        # 2. Extra fields forbidden -> 422
        resp_extra = client.put(
            "/api/v1/proxy/mode",
            headers=AUTH_HEADER,
            json={"mode": "shadow", "unexpected": "value"},
        )
        assert resp_extra.status_code == 422

        # 3. Enforce without passing replay -> 409 REPLAY_REQUIRED
        resp_enforce = client.put(
            "/api/v1/proxy/mode",
            headers=AUTH_HEADER,
            json={"mode": "enforce"},
        )
        assert resp_enforce.status_code == 409
        err = resp_enforce.json()["error"]
        assert err["code"] == "REPLAY_REQUIRED"
        assert "replay" in err["message"].lower()

    # Verify mode is still shadow and no audit event was created
    assert get_proxy_mode() == "shadow"
    conn = connect()
    try:
        count = conn.execute(
            "SELECT COUNT(*) FROM audit_events WHERE event_type = 'PROXY_MODE_CHANGE'"
        ).fetchone()[0]
        assert count == 0
    finally:
        conn.close()


def test_proxy_mode_put_accepted_transitions(valid_test_fixture: Path):
    """
    Accepted mode changes (off, shadow, enforce with replay) return 200
    with proxy status shape and record a PROXY_MODE_CHANGE audit event.
    """
    with TestClient(management_app) as client:
        # 1. Switch to 'off'
        resp_off = client.put(
            "/api/v1/proxy/mode",
            headers=AUTH_HEADER,
            json={"mode": "off"},
        )
        assert resp_off.status_code == 200
        assert resp_off.json()["mode"] == "off"
        assert get_proxy_mode() == "off"

        # 2. Switch to 'shadow'
        resp_shadow = client.put(
            "/api/v1/proxy/mode",
            headers=AUTH_HEADER,
            json={"mode": "shadow"},
        )
        assert resp_shadow.status_code == 200
        assert resp_shadow.json()["mode"] == "shadow"

        # 3. Execute replay, then switch to 'enforce'
        client.post("/api/v1/rules/1/replay", headers=AUTH_HEADER)
        resp_enforce = client.put(
            "/api/v1/proxy/mode",
            headers=AUTH_HEADER,
            json={"mode": "enforce"},
        )
        assert resp_enforce.status_code == 200
        assert resp_enforce.json()["mode"] == "enforce"
        assert get_proxy_mode() == "enforce"

    # Verify PROXY_MODE_CHANGE audit events
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT * FROM audit_events WHERE event_type = 'PROXY_MODE_CHANGE' ORDER BY id ASC"
        ).fetchall()
        assert len(rows) == 3
        # Check safe metadata of last transition
        meta = json.loads(rows[-1]["safe_metadata_json"])
        assert meta["previous_mode"] == "shadow"
        assert meta["new_mode"] == "enforce"
    finally:
        conn.close()


# =============================================================================
# 5. Endpoint D: POST /api/v1/proxy/rollback
# =============================================================================

def test_proxy_rollback_resets_to_shadow_and_audits():
    """Rollback resets mode to shadow, returns exact message, audits every call, leaves rules/traffic untouched."""
    set_proxy_mode("enforce")

    with TestClient(management_app) as client:
        # First call from enforce
        resp1 = client.post("/api/v1/proxy/rollback", headers=AUTH_HEADER)
        assert resp1.status_code == 200
        assert resp1.json() == {
            "mode": "shadow",
            "rolled_back": True,
            "message": "Enforcement disabled; shadow logging continues.",
        }
        assert get_proxy_mode() == "shadow"

        # Second call when already shadow (idempotent)
        resp2 = client.post("/api/v1/proxy/rollback", headers=AUTH_HEADER)
        assert resp2.status_code == 200
        assert resp2.json()["mode"] == "shadow"

    # Verify exactly 2 PROXY_ROLLBACK audit rows were written
    conn = connect()
    try:
        audit_rows = conn.execute(
            "SELECT * FROM audit_events WHERE event_type = 'PROXY_ROLLBACK' ORDER BY id ASC"
        ).fetchall()
        assert len(audit_rows) == 2
        meta1 = json.loads(audit_rows[0]["safe_metadata_json"])
        assert meta1 == {"previous_mode": "enforce", "new_mode": "shadow"}
        meta2 = json.loads(audit_rows[1]["safe_metadata_json"])
        assert meta2 == {"previous_mode": "shadow", "new_mode": "shadow"}

        # Confirm rules and traffic were untouched
        rule_count = conn.execute("SELECT COUNT(*) FROM security_rules").fetchone()[0]
        assert rule_count == 1
        traffic_count = conn.execute("SELECT COUNT(*) FROM traffic_events").fetchone()[0]
        assert traffic_count == 0
    finally:
        conn.close()


# =============================================================================
# 6. Endpoint E: GET /api/v1/rules
# =============================================================================

def test_rules_list_pagination_and_digest(valid_test_fixture: Path):
    """Rules list returns exact item keys, computes digest, reflects replay_passed, validates limit/offset."""
    with TestClient(management_app) as client:
        # 1. Initial listing: replay_passed is False
        resp1 = client.get("/api/v1/rules", headers=AUTH_HEADER)
        assert resp1.status_code == 200
        data1 = resp1.json()
        assert data1["total"] == 1
        assert data1["limit"] == 50
        assert data1["offset"] == 0
        assert len(data1["items"]) == 1

        item = data1["items"][0]
        assert set(item.keys()) == {
            "id",
            "name",
            "matcher_type",
            "match_config",
            "enabled",
            "human_approved",
            "source_kind",
            "replay_passed",
            "rule_digest",
        }
        assert item["replay_passed"] is False
        expected_digest = compute_rule_digest(item["matcher_type"], item["match_config"])
        assert item["rule_digest"] == expected_digest

        # 2. Trigger replay: replay_passed becomes True
        client.post(f"/api/v1/rules/{item['id']}/replay", headers=AUTH_HEADER)
        resp2 = client.get("/api/v1/rules", headers=AUTH_HEADER)
        assert resp2.json()["items"][0]["replay_passed"] is True

        # 3. Limit > 100 rejected with 422
        resp_limit_exceeded = client.get("/api/v1/rules?limit=101", headers=AUTH_HEADER)
        assert resp_limit_exceeded.status_code == 422

        # 4. Offset past total returns empty items with accurate total
        resp_offset = client.get("/api/v1/rules?offset=10", headers=AUTH_HEADER)
        assert resp_offset.status_code == 200
        data_off = resp_offset.json()
        assert data_off["items"] == []
        assert data_off["total"] == 1
        assert data_off["offset"] == 10


# =============================================================================
# 7. Endpoint F: POST /api/v1/rules/{rule_id}/replay
# =============================================================================

def test_rule_replay_success_and_error_handling(
    valid_test_fixture: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    """Replay succeeds on valid fixture, returns 404 for unknown rule, 503 without file path for missing/invalid fixture."""
    with TestClient(management_app) as client:
        # 1. Passing replay run
        resp = client.post("/api/v1/rules/1/replay", headers=AUTH_HEADER)
        assert resp.status_code == 200
        res = resp.json()
        assert set(res.keys()) == {
            "run_id",
            "rule_id",
            "fixture_version",
            "benign_total",
            "benign_matches",
            "attack_total",
            "attack_matches",
            "passed",
            "tested_at",
        }
        assert res["rule_id"] == 1
        assert res["fixture_version"] == "lab-v1"
        assert res["benign_total"] == 7
        assert res["benign_matches"] == 0
        assert res["attack_total"] == 3
        assert res["attack_matches"] == 3
        assert res["passed"] is True

        # 2. Unknown rule -> 404
        resp_404 = client.post("/api/v1/rules/99999/replay", headers=AUTH_HEADER)
        assert resp_404.status_code == 404
        assert resp_404.json()["error"]["code"] == "RULE_NOT_FOUND"

        # 3. Missing fixture file -> 503 FIXTURE_UNAVAILABLE without file path
        non_existent_path = tmp_path / "does_not_exist.json"
        monkeypatch.setattr(replay_service, "CANONICAL_FIXTURE_PATH", non_existent_path)
        resp_missing = client.post("/api/v1/rules/1/replay", headers=AUTH_HEADER)
        assert resp_missing.status_code == 503
        missing_err = resp_missing.json()["error"]
        assert missing_err["code"] == "FIXTURE_UNAVAILABLE"
        # Must NOT expose any filesystem paths
        assert "does_not_exist" not in missing_err["message"]
        assert "/" not in missing_err["message"] and "\\" not in missing_err["message"]

        # 4. Corrupted/invalid fixture -> 503 FIXTURE_INVALID without file path
        corrupt_file = tmp_path / "corrupt.json"
        corrupt_file.write_text('{"bad_key": true}', encoding="utf-8")
        monkeypatch.setattr(replay_service, "CANONICAL_FIXTURE_PATH", corrupt_file)
        resp_corrupt = client.post("/api/v1/rules/1/replay", headers=AUTH_HEADER)
        assert resp_corrupt.status_code == 503
        assert resp_corrupt.json()["error"]["code"] == "FIXTURE_INVALID"


# =============================================================================
# 8. Endpoint G: GET /api/v1/traffic
# =============================================================================

def test_traffic_log_pagination_ordering_and_privacy_path():
    """Traffic list returns newest first, sanitized paths (query stripped), exact fields, and database total."""
    # Seed two traffic records
    id1 = insert_traffic_event(
        method="GET",
        path="/public/search?secret_key=xyz_secret#frag",
        mode="shadow",
        action="shadow_match",
        status_code=200,
        duration_ms=4.5,
        matched_rule_id=1,
    )
    id2 = insert_traffic_event(
        method="POST",
        path="/api/submit",
        mode="enforce",
        action="blocked",
        status_code=403,
        duration_ms=1.2,
        matched_rule_id=1,
    )

    with TestClient(management_app) as client:
        resp = client.get("/api/v1/traffic?limit=50&offset=0", headers=AUTH_HEADER)
        assert resp.status_code == 200
        data = resp.json()

        assert data["total"] == 2
        assert len(data["items"]) == 2

        # Newest first: id2 before id1
        first = data["items"][0]
        second = data["items"][1]
        assert first["id"] == id2
        assert first["method"] == "POST"
        assert first["path"] == "/api/submit"
        assert first["action"] == "blocked"

        assert second["id"] == id1
        assert second["method"] == "GET"
        # Query string and fragment stripped
        assert second["path"] == "/public/search"
        assert "secret_key" not in second["path"]
        assert second["action"] == "shadow_match"

        # Exact item fields
        assert set(first.keys()) == {
            "id",
            "method",
            "path",
            "mode",
            "action",
            "status_code",
            "matched_rule_id",
            "duration_ms",
            "created_at",
        }

        # Offset past end returns empty list with total=2
        resp_offset = client.get("/api/v1/traffic?offset=10", headers=AUTH_HEADER)
        assert resp_offset.json()["items"] == []
        assert resp_offset.json()["total"] == 2


# =============================================================================
# 9. Cross-Application Integration: Management API ↔ Proxy Enforcement
# =============================================================================

def test_cross_app_management_to_proxy_workflow(valid_test_fixture: Path):
    """
    Demonstrates full end-to-end integration across both apps:
    1. Management API runs fixture replay.
    2. Management API switches mode to enforce.
    3. Proxy app receives an attack request and returns HTTP 403 (blocked, upstream not called).
    4. Management API triggers emergency rollback to shadow.
    5. Proxy app receives the same attack request and forwards it (200, logged as shadow_match).
    """
    upstream_called = False

    def upstream_handler(request: httpx.Request) -> httpx.Response:
        nonlocal upstream_called
        upstream_called = True
        return httpx.Response(200, json={"status": "ok", "service": "lab-target"})

    # Setup proxy mock transport
    transport = httpx.MockTransport(upstream_handler)
    mock_client = httpx.AsyncClient(transport=transport, follow_redirects=False)

    with TestClient(management_app) as mgmt_client:
        # Step 1: Replay test passing
        replay_resp = mgmt_client.post("/api/v1/rules/1/replay", headers=AUTH_HEADER)
        assert replay_resp.status_code == 200
        assert replay_resp.json()["passed"] is True

        # Step 2: Switch to enforce mode
        mode_resp = mgmt_client.put(
            "/api/v1/proxy/mode",
            headers=AUTH_HEADER,
            json={"mode": "enforce"},
        )
        assert mode_resp.status_code == 200
        assert mode_resp.json()["mode"] == "enforce"

    # Step 3: Send attack request to proxy app
    with TestClient(proxy_app) as px_client:
        orig = proxy_service._client
        proxy_service._client = mock_client
        try:
            resp_blocked = px_client.get("/test?demo_attack=true")
            assert resp_blocked.status_code == 403
            assert resp_blocked.json()["error"]["code"] == "REQUEST_BLOCKED"
            assert upstream_called is False
        finally:
            proxy_service._client = orig

    # Verify newest traffic event is blocked in enforce mode
    with TestClient(management_app) as mgmt_client:
        t_resp1 = mgmt_client.get("/api/v1/traffic", headers=AUTH_HEADER)
        assert t_resp1.status_code == 200
        newest1 = t_resp1.json()["items"][0]
        assert newest1["action"] == "blocked"
        assert newest1["status_code"] == 403
        assert newest1["mode"] == "enforce"
        assert newest1["path"] == "/test"

    # Step 4: Management API triggers rollback
    with TestClient(management_app) as mgmt_client:
        rb_resp = mgmt_client.post("/api/v1/proxy/rollback", headers=AUTH_HEADER)
        assert rb_resp.status_code == 200
        assert rb_resp.json()["mode"] == "shadow"
        assert get_proxy_mode() == "shadow"

    # Step 5: Send same request to proxy app; forwarded as shadow
    upstream_called = False
    with TestClient(proxy_app) as px_client:
        orig = proxy_service._client
        proxy_service._client = mock_client
        try:
            resp_allowed = px_client.get("/test?demo_attack=true")
            assert resp_allowed.status_code == 200
            assert resp_allowed.json() == {"status": "ok", "service": "lab-target"}
            assert upstream_called is True
        finally:
            proxy_service._client = orig

    # Verify newest traffic event is shadow_match in shadow mode
    with TestClient(management_app) as mgmt_client:
        t_resp2 = mgmt_client.get("/api/v1/traffic", headers=AUTH_HEADER)
        assert t_resp2.status_code == 200
        newest2 = t_resp2.json()["items"][0]
        assert newest2["action"] == "shadow_match"
        assert newest2["status_code"] == 200
        assert newest2["mode"] == "shadow"
        assert newest2["path"] == "/test"


def test_large_integer_overflow_validation():
    """
    Integers larger than 64-bit/32-bit limits return 422 Unprocessable Entity
    via FastAPI parameter validation, avoiding SQLite OverflowError (500).
    """
    huge_int = "99999999999999999999999"
    with TestClient(management_app) as client:
        # GET /api/v1/traffic?offset=...
        resp1 = client.get(f"/api/v1/traffic?offset={huge_int}", headers=AUTH_HEADER)
        assert resp1.status_code == 422

        # GET /api/v1/rules?offset=...
        resp2 = client.get(f"/api/v1/rules?offset={huge_int}", headers=AUTH_HEADER)
        assert resp2.status_code == 422

        # POST /api/v1/rules/.../replay
        resp3 = client.post(f"/api/v1/rules/{huge_int}/replay", headers=AUTH_HEADER)
        assert resp3.status_code == 422


def test_safety_guard_no_live_database_created():
    """Verify live database backend/data/patchpilot.db is protected from creation or modification."""
    existed_before = DATABASE_PATH.exists()
    mtime_before = DATABASE_PATH.stat().st_mtime_ns if existed_before else None
    size_before = DATABASE_PATH.stat().st_size if existed_before else None

    # Verify management database operations run safely against isolated database
    init_db()
    assert get_proxy_mode() == "shadow"

    if not existed_before:
        assert not DATABASE_PATH.exists(), (
            f"CRITICAL SAFETY VIOLATION: Test created live database file at {DATABASE_PATH}"
        )
    else:
        assert DATABASE_PATH.exists(), (
            f"CRITICAL SAFETY VIOLATION: Test deleted live database file at {DATABASE_PATH}"
        )
        stat_after = DATABASE_PATH.stat()
        assert stat_after.st_mtime_ns == mtime_before, (
            f"CRITICAL SAFETY VIOLATION: Test modified live database file at {DATABASE_PATH}"
        )
        assert stat_after.st_size == size_before, (
            f"CRITICAL SAFETY VIOLATION: Test modified live database file size at {DATABASE_PATH}"
        )
