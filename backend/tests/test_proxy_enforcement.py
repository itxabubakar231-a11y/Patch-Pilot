"""
Integration tests for PatchPilot Security Proxy Enforcement and Shadow Workflow.

Verifies:
- Mode 'shadow': match is forwarded (not blocked) and logged as 'shadow_match'; non-match logged as 'allowed'.
- Mode 'off': no rule evaluation, forwarded, logged as 'allowed'.
- Mode 'enforce': valid replay + matching rule returns HTTP 403, upstream is NOT called.
- Mode 'enforce': non-match is forwarded and logged as 'allowed'.
- Mode 'enforce' fail-safe downgrade: missing replay, stale digest, or unapproved rule triggers
  atomic downgrade to 'shadow', writes exactly one PROXY_MODE_DOWNGRADE audit event, and forwards.
- Consecutive requests after downgrade produce only one audit event.
- Multiple enabled rules where one lacks replay triggers downgrade.
- Parameter matching: POST query marker, encoded keys, duplicate params, and near-miss rejections.
- Privacy verification: query strings, header values, bodies, and client IPs are never stored in DB or logs.
- Upstream failure logged as 'upstream_error' with status 502.
- Database read failure fails open (forwards without breaking response).
- Lifespan init_db is idempotent.
"""

from contextlib import contextmanager
import json
import logging
from pathlib import Path
from typing import Callable, Generator
from fastapi.testclient import TestClient
import httpx
import pytest

from app.core.db import (
    compute_rule_digest,
    connect,
    get_proxy_mode,
    init_db,
    insert_replay_run,
    list_traffic_events,
    set_proxy_mode,
    utc_now_iso,
)
from app.proxy_app import app as proxy_app, proxy_service


@pytest.fixture(autouse=True)
def setup_test_database():
    """Ensure the isolated test database is initialized with tables and seed rule."""
    init_db()


@contextmanager
def mock_upstream(
    handler: Callable[[httpx.Request], httpx.Response]
) -> Generator[TestClient, None, None]:
    """
    Context manager providing a TestClient for proxy_app and injecting an in-memory
    httpx.MockTransport client into proxy_service.
    """
    transport = httpx.MockTransport(handler)
    mock_client = httpx.AsyncClient(transport=transport, follow_redirects=False)

    with TestClient(proxy_app) as client:
        orig_client = proxy_service._client
        proxy_service._client = mock_client
        try:
            yield client
        finally:
            proxy_service._client = orig_client


def seed_passing_replay(rule_id: int = 1) -> None:
    """Helper to record a valid passing replay run for the seed rule."""
    now = utc_now_iso()
    demo_config = {"name": "demo_attack", "value": "true"}
    digest = compute_rule_digest("query_param_equals", demo_config)

    insert_replay_run(
        rule_id=rule_id,
        rule_digest=digest,
        fixture_version="lab-v1",
        benign_total=5,
        benign_matches=0,
        attack_total=1,
        attack_matches=1,
        passed=True,
        tested_at=now,
    )


def standard_ok_handler(request: httpx.Request) -> httpx.Response:
    """Standard mock upstream response."""
    return httpx.Response(
        status_code=200,
        headers={"Content-Type": "application/json"},
        json={"status": "ok", "service": "lab-target"},
    )


# ==============================================================================
# 1. Shadow Mode Tests
# ==============================================================================

def test_shadow_mode_match_forwarded_and_logged():
    """In shadow mode, matching requests are forwarded (not blocked) and logged as shadow_match."""
    set_proxy_mode("shadow")
    upstream_called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal upstream_called
        upstream_called = True
        return standard_ok_handler(request)

    with mock_upstream(handler) as client:
        resp = client.get("/index.php?demo_attack=true")

    assert resp.status_code == 200
    assert upstream_called is True
    assert resp.json() == {"status": "ok", "service": "lab-target"}

    events = list_traffic_events(limit=5)
    assert len(events) >= 1
    ev = events[0]
    assert ev["path"] == "/index.php"
    assert ev["mode"] == "shadow"
    assert ev["action"] == "shadow_match"
    assert ev["status_code"] == 200
    assert ev["matched_rule_id"] == 1


def test_shadow_mode_non_match_forwarded_and_logged_allowed():
    """In shadow mode, non-matching requests are forwarded and logged as allowed."""
    set_proxy_mode("shadow")

    with mock_upstream(standard_ok_handler) as client:
        resp = client.get("/safe-page")

    assert resp.status_code == 200
    events = list_traffic_events(limit=5)
    assert len(events) >= 1
    ev = events[0]
    assert ev["path"] == "/safe-page"
    assert ev["mode"] == "shadow"
    assert ev["action"] == "allowed"
    assert ev["matched_rule_id"] is None


# ==============================================================================
# 2. Mode 'Off' Tests
# ==============================================================================

def test_mode_off_does_no_rule_evaluation():
    """In 'off' mode, requests are forwarded without rule evaluation and logged as allowed."""
    set_proxy_mode("off")

    with mock_upstream(standard_ok_handler) as client:
        resp = client.get("/api/test?demo_attack=true")

    assert resp.status_code == 200
    events = list_traffic_events(limit=5)
    ev = events[0]
    assert ev["mode"] == "off"
    assert ev["action"] == "allowed"
    assert ev["matched_rule_id"] is None


# ==============================================================================
# 3. Enforce Mode Tests (Blocking & Non-Match)
# ==============================================================================

def test_enforce_mode_valid_replay_blocks_matching_request():
    """
    In enforce mode with a passing replay, matching requests receive HTTP 403,
    the upstream is NOT contacted, and the event is logged as 'blocked'.
    """
    seed_passing_replay(rule_id=1)
    set_proxy_mode("enforce")

    upstream_called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal upstream_called
        upstream_called = True
        return standard_ok_handler(request)

    with mock_upstream(handler) as client:
        resp = client.get("/sensitive-endpoint?demo_attack=true")

    assert resp.status_code == 403
    assert upstream_called is False  # Upstream MUST NOT be called
    assert resp.json() == {
        "error": {
            "code": "REQUEST_BLOCKED",
            "message": "Request blocked by PatchPilot security rule.",
        }
    }

    events = list_traffic_events(limit=5)
    ev = events[0]
    assert ev["path"] == "/sensitive-endpoint"
    assert ev["mode"] == "enforce"
    assert ev["action"] == "blocked"
    assert ev["status_code"] == 403
    assert ev["matched_rule_id"] == 1


def test_enforce_mode_non_match_forwarded():
    """In enforce mode with valid replay, non-matching requests reach upstream and log allowed."""
    seed_passing_replay(rule_id=1)
    set_proxy_mode("enforce")

    with mock_upstream(standard_ok_handler) as client:
        resp = client.get("/benign-resource?page=1")

    assert resp.status_code == 200
    events = list_traffic_events(limit=5)
    ev = events[0]
    assert ev["path"] == "/benign-resource"
    assert ev["mode"] == "enforce"
    assert ev["action"] == "allowed"
    assert ev["matched_rule_id"] is None


# ==============================================================================
# 4. Fail-Safe Downgrade Tests (Invalid Enforce Conditions)
# ==============================================================================

def test_enforce_mode_missing_replay_downgrades_to_shadow():
    """
    If in enforce mode but replay evidence is missing, the proxy must:
    1. Downgrade mode to 'shadow'.
    2. Write an audit event.
    3. Forward the request (never block).
    4. Log the traffic event under shadow mode.
    """
    set_proxy_mode("enforce")  # No replay seeded

    upstream_called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal upstream_called
        upstream_called = True
        return standard_ok_handler(request)

    with mock_upstream(handler) as client:
        resp = client.get("/test?demo_attack=true")

    # Forwarded, not blocked
    assert resp.status_code == 200
    assert upstream_called is True

    # Mode in DB was downgraded to shadow
    assert get_proxy_mode() == "shadow"

    # Audit event was written
    conn = connect()
    try:
        audit_rows = conn.execute(
            "SELECT * FROM audit_events WHERE event_type = 'PROXY_MODE_DOWNGRADE'"
        ).fetchall()
        assert len(audit_rows) == 1
        meta = json.loads(audit_rows[0]["safe_metadata_json"])
        assert meta["previous_mode"] == "enforce"
        assert meta["new_mode"] == "shadow"
    finally:
        conn.close()

    # Traffic was recorded as shadow_match in shadow mode
    events = list_traffic_events(limit=5)
    ev = events[0]
    assert ev["mode"] == "shadow"
    assert ev["action"] == "shadow_match"


def test_enforce_mode_stale_digest_downgrades_to_shadow():
    """If rule configuration changes after replay, digest is stale; gate downgrades to shadow."""
    seed_passing_replay(rule_id=1)
    set_proxy_mode("enforce")

    # Mutate rule config and digest
    new_config = {"name": "demo_attack_v2", "value": "true"}
    new_digest = compute_rule_digest("query_param_equals", new_config)
    conn = connect()
    try:
        with conn:
            conn.execute(
                """
                UPDATE security_rules
                SET match_config_json = ?, rule_digest = ?
                WHERE id = 1
                """,
                (json.dumps(new_config), new_digest),
            )
    finally:
        conn.close()

    with mock_upstream(standard_ok_handler) as client:
        resp = client.get("/check?demo_attack=true")

    assert resp.status_code == 200
    assert get_proxy_mode() == "shadow"


def test_unapproved_rule_never_blocks():
    """If an enabled rule is human_approved=0, enforce downgrades to shadow and forwards."""
    seed_passing_replay(rule_id=1)
    set_proxy_mode("enforce")

    # Mark rule as unapproved
    conn = connect()
    try:
        with conn:
            conn.execute("UPDATE security_rules SET human_approved = 0 WHERE id = 1")
    finally:
        conn.close()

    with mock_upstream(standard_ok_handler) as client:
        resp = client.get("/test?demo_attack=true")

    assert resp.status_code == 200
    assert get_proxy_mode() == "shadow"


def test_multiple_enabled_rules_one_missing_replay_downgrades():
    """If Rule 1 has a replay but Rule 2 is missing a replay, enforce mode downgrades."""
    seed_passing_replay(rule_id=1)
    set_proxy_mode("enforce")

    # Insert second enabled rule without replay
    now = utc_now_iso()
    rule2_cfg = {"name": "other_marker", "value": "true"}
    rule2_digest = compute_rule_digest("query_param_equals", rule2_cfg)
    conn = connect()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO security_rules (
                    name, matcher_type, match_config_json, rule_digest,
                    enabled, human_approved, source_kind, created_at, updated_at
                ) VALUES ('Rule 2', 'query_param_equals', ?, ?, 1, 1, 'manual', ?, ?)
                """,
                (json.dumps(rule2_cfg), rule2_digest, now, now),
            )
    finally:
        conn.close()

    with mock_upstream(standard_ok_handler) as client:
        resp = client.get("/test?demo_attack=true")

    assert resp.status_code == 200
    assert get_proxy_mode() == "shadow"


def test_consecutive_requests_after_downgrade_produce_only_one_audit_event():
    """Two requests sent after mode is set to enforce without replay produce only ONE downgrade event."""
    set_proxy_mode("enforce")

    with mock_upstream(standard_ok_handler) as client:
        client.get("/first?demo_attack=true")
        client.get("/second?demo_attack=true")

    conn = connect()
    try:
        audit_rows = conn.execute(
            "SELECT * FROM audit_events WHERE event_type = 'PROXY_MODE_DOWNGRADE'"
        ).fetchall()
        assert len(audit_rows) == 1
    finally:
        conn.close()


# ==============================================================================
# 5. Query Parameter Edge Cases in Proxy
# ==============================================================================

def test_post_request_with_query_marker_is_blocked_in_enforce():
    """POST request with the attack marker in the URL query string is blocked in enforce mode."""
    seed_passing_replay(rule_id=1)
    set_proxy_mode("enforce")

    with mock_upstream(standard_ok_handler) as client:
        resp = client.post("/submit?demo_attack=true", json={"action": "save"})

    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "REQUEST_BLOCKED"


def test_percent_encoded_key_is_matched():
    """Encoded query parameter key (demo%5Fattack=true) is matched by rule engine in enforce mode."""
    seed_passing_replay(rule_id=1)
    set_proxy_mode("enforce")

    with mock_upstream(standard_ok_handler) as client:
        resp = client.get("/query?demo%5Fattack=true")

    assert resp.status_code == 403


def test_duplicate_query_params_are_matched():
    """Duplicate parameters where one matches (demo_attack=false&demo_attack=true) are matched."""
    seed_passing_replay(rule_id=1)
    set_proxy_mode("enforce")

    with mock_upstream(standard_ok_handler) as client:
        resp = client.get("/query?demo_attack=false&demo_attack=true")

    assert resp.status_code == 403


def test_near_miss_query_params_are_not_matched():
    """Near-miss parameter names or values do NOT match and pass through to upstream."""
    seed_passing_replay(rule_id=1)
    set_proxy_mode("enforce")

    with mock_upstream(standard_ok_handler) as client:
        resp1 = client.get("/query?demo_attack=truee")
        resp2 = client.get("/query?xdemo_attack=true")
        resp3 = client.get("/query?topic=defense_against_attacks&demo=preview")

    assert resp1.status_code == 200
    assert resp2.status_code == 200
    assert resp3.status_code == 200


def test_shadow_mode_question_mark_inside_query_string():
    """
    Shadow mode: query strings with '?' inside values or keys are parsed correctly,
    forwarded to upstream, and logged as shadow_match with matched_rule_id.
    """
    set_proxy_mode("shadow")
    upstream_urls = []

    def handler(request: httpx.Request) -> httpx.Response:
        upstream_urls.append(str(request.url))
        return standard_ok_handler(request)

    urls = [
        "/?demo_attack=true&z=?",
        "/?demo_attack=true&next=/a?b=1",
        "/?a?b&demo_attack=true",
    ]

    with mock_upstream(handler) as client:
        for url in urls:
            resp = client.get(url)
            assert resp.status_code == 200

    assert len(upstream_urls) == 3

    events = list_traffic_events(limit=10)
    matching_events = [e for e in events if e["action"] == "shadow_match"]
    assert len(matching_events) >= 3
    for ev in matching_events[:3]:
        assert ev["mode"] == "shadow"
        assert ev["action"] == "shadow_match"
        assert ev["matched_rule_id"] == 1


def test_enforce_mode_question_mark_inside_query_string_blocked():
    """
    Enforce mode with passing replay: query strings with '?' inside values or keys
    are blocked with 403, and the mock upstream is NOT called.
    """
    seed_passing_replay(rule_id=1)
    set_proxy_mode("enforce")
    upstream_called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal upstream_called
        upstream_called = True
        return standard_ok_handler(request)

    urls = [
        "/?demo_attack=true&z=?",
        "/?demo_attack=true&next=/a?b=1",
        "/?a?b&demo_attack=true",
    ]

    with mock_upstream(handler) as client:
        for url in urls:
            resp = client.get(url)
            assert resp.status_code == 403
            assert resp.json()["error"]["code"] == "REQUEST_BLOCKED"

    assert upstream_called is False

    events = list_traffic_events(limit=10)
    blocked_events = [e for e in events if e["action"] == "blocked"]
    assert len(blocked_events) >= 3
    for ev in blocked_events[:3]:
        assert ev["mode"] == "enforce"
        assert ev["matched_rule_id"] == 1


def test_enforce_mode_encoded_question_mark_still_blocked():
    """Enforce mode: query string with percent-encoded question mark still returns 403."""
    seed_passing_replay(rule_id=1)
    set_proxy_mode("enforce")
    upstream_called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal upstream_called
        upstream_called = True
        return standard_ok_handler(request)

    with mock_upstream(handler) as client:
        resp = client.get("/?demo_attack=true&x=%3F")

    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "REQUEST_BLOCKED"
    assert upstream_called is False


def test_enforce_mode_question_mark_in_value_not_matching_key_is_forwarded():
    """
    Enforce mode: /?next=/a?demo_attack=true is NOT blocked because the key is 'next',
    not 'demo_attack'. Upstream is called and status is 200.
    """
    seed_passing_replay(rule_id=1)
    set_proxy_mode("enforce")
    upstream_called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal upstream_called
        upstream_called = True
        return standard_ok_handler(request)

    with mock_upstream(handler) as client:
        resp = client.get("/?next=/a?demo_attack=true")

    assert resp.status_code == 200
    assert upstream_called is True


# ==============================================================================
# 6. Privacy & Redaction Verification
# ==============================================================================

def test_privacy_redaction_in_database_and_logs(caplog: pytest.LogCaptureFixture):
    """
    Prove query strings, headers, bodies, and client IPs are NEVER stored in
    any database column or emitted into captured application logs.
    """
    caplog.set_level(logging.INFO)
    set_proxy_mode("shadow")

    secret_token = "SUPER_SECRET_TOKEN_XYZ_987"
    secret_body = "private_password_content_123"
    client_ip = "192.168.1.99"

    with mock_upstream(standard_ok_handler) as client:
        resp = client.post(
            f"/api/v1/auth/login?sensitive_token={secret_token}&demo_attack=true",
            content=secret_body.encode("utf-8"),
            headers={
                "Authorization": f"Bearer {secret_token}",
                "X-Forwarded-For": client_ip,
                "Content-Type": "text/plain",
            },
        )

    assert resp.status_code == 200

    # 1. Assert secrets never appear in logs
    assert secret_token not in caplog.text
    assert secret_body not in caplog.text
    assert client_ip not in caplog.text

    # 2. Assert secrets never appear in database traffic events
    events = list_traffic_events(limit=5)
    ev = events[0]
    assert ev["path"] == "/api/v1/auth/login"
    assert secret_token not in json.dumps(ev)
    assert secret_body not in json.dumps(ev)
    assert client_ip not in json.dumps(ev)

    # 3. Assert long paths are truncated to 200 chars
    long_path = "/" + "a" * 250
    with mock_upstream(standard_ok_handler) as client:
        client.get(long_path)

    events = list_traffic_events(limit=1)
    assert len(events[0]["path"]) == 200


# ==============================================================================
# 7. Upstream Error & DB Failure Handling
# ==============================================================================

def test_upstream_error_logged_as_upstream_error_with_502():
    """When upstream is unreachable, 502 is returned and logged as upstream_error."""
    set_proxy_mode("shadow")

    def failing_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Lab offline", request=request)

    with mock_upstream(failing_handler) as client:
        resp = client.get("/health")

    assert resp.status_code == 502
    assert resp.json()["error"]["code"] == "UPSTREAM_UNAVAILABLE"

    events = list_traffic_events(limit=5)
    ev = events[0]
    assert ev["action"] == "upstream_error"
    assert ev["status_code"] == 502


def test_database_failure_fails_open_without_breaking_response(monkeypatch):
    """If database read fails (e.g. disk error), request is forwarded without breaking."""
    import sqlite3
    from app.services import proxy_service as ps_module

    def bad_get_mode(*args, **kwargs):
        raise sqlite3.OperationalError("Database disk I/O error")

    monkeypatch.setattr(ps_module, "get_proxy_mode", bad_get_mode)

    with mock_upstream(standard_ok_handler) as client:
        resp = client.get("/health")

    # Forwards safely without unhandled 500 error
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "service": "lab-target"}


def test_lifespan_init_db_idempotent():
    """Verify proxy lifespan initialization can run repeatedly without duplicating seed rows."""
    init_db()
    init_db()
    conn = connect()
    try:
        settings_cnt = conn.execute("SELECT COUNT(*) FROM app_settings").fetchone()[0]
        rules_cnt = conn.execute("SELECT COUNT(*) FROM security_rules").fetchone()[0]
        assert settings_cnt == 1
        assert rules_cnt == 1
    finally:
        conn.close()
