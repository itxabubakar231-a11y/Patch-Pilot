"""
Tests for PatchPilot SQLite Data Layer.

Verifies:
- All 7 MVP tables and 4 indexes exist in the schema.
- Idempotent schema initialization (init_db twice leaves 1 settings row and 1 rule).
- Default seed proxy_mode is 'shadow'.
- CHECK constraints reject invalid proxy_mode, invalid traffic action, etc.
- PRAGMAs: foreign_keys=ON, journal_mode=WAL, busy_timeout=5000, user_version=1.
- compute_rule_digest is stable and changes when config or matcher changes.
- Privacy path redaction (query string and fragment stripped, long path truncated to 200).
- traffic_counts returns accurate totals for all action types.
- match_config is returned as a dict and booleans as bool.
- Timestamps follow UTC ISO-8601 RFC3339 format (ending in 'Z').
- set_proxy_mode('bad') raises ValueError before touching the DB.
- Tests NEVER touch backend/data/patchpilot.db.
"""

import re
import sqlite3
from pathlib import Path
import pytest

from app.core.config import DATABASE_PATH
from app.core.db import (
    connect,
    init_db,
    compute_rule_digest,
    sanitize_path,
    utc_now_iso,
    get_proxy_mode,
    set_proxy_mode,
    list_rules,
    get_rule,
    insert_traffic_event,
    list_traffic_events,
    traffic_counts,
    insert_replay_run,
    get_latest_replay,
    add_audit_event,
)

UTC_ISO_REGEX = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


@pytest.fixture(autouse=True)
def guard_live_database():
    """Safety guard ensuring tests never create or touch backend/data/patchpilot.db."""
    yield
    assert not DATABASE_PATH.exists(), (
        f"CRITICAL: Test touched or created live database file at {DATABASE_PATH}"
    )


@pytest.fixture
def temp_db_path(tmp_path: Path) -> Path:
    """Provides an isolated temporary database path for each test."""
    db_file = tmp_path / "test_patchpilot.db"
    init_db(db_file)
    return db_file


def test_all_seven_mvp_tables_and_indexes_exist(temp_db_path: Path):
    """Verify all 7 MVP tables and 4 indexes exist exactly as in DATABASE.md."""
    conn = connect(temp_db_path)
    try:
        tables_res = conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
        existing_tables = {row["name"] for row in tables_res}

        expected_tables = {
            "app_settings",
            "security_rules",
            "rule_replay_runs",
            "traffic_events",
            "advisories",
            "advisory_localizations",
            "audit_events",
        }
        assert existing_tables == expected_tables

        # Verify 4 required indexes
        indexes_res = conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
        existing_indexes = {row["name"] for row in indexes_res}

        expected_indexes = {
            "idx_traffic_created",
            "idx_traffic_action",
            "idx_replay_rule_time",
            "idx_audit_created",
        }
        for idx in expected_indexes:
            assert idx in existing_indexes

        # Verify PRAGMA user_version is 1
        user_version = conn.execute("PRAGMA user_version").fetchone()[0]
        assert user_version == 1
    finally:
        conn.close()


def test_init_db_idempotent_seed(tmp_path: Path):
    """Verify running init_db twice leaves exactly 1 settings row and 1 rule, and no fake traffic."""
    db_file = tmp_path / "idempotent.db"
    init_db(db_file)
    init_db(db_file)  # Second run must not duplicate records

    conn = connect(db_file)
    try:
        settings_count = conn.execute("SELECT COUNT(*) FROM app_settings").fetchone()[0]
        assert settings_count == 1

        rules_count = conn.execute("SELECT COUNT(*) FROM security_rules").fetchone()[0]
        assert rules_count == 1

        # Confirm no fake live traffic was seeded
        traffic_count = conn.execute("SELECT COUNT(*) FROM traffic_events").fetchone()[0]
        assert traffic_count == 0

        # Confirm other tables are empty on seed
        replay_count = conn.execute("SELECT COUNT(*) FROM rule_replay_runs").fetchone()[0]
        assert replay_count == 0
        advisories_count = conn.execute("SELECT COUNT(*) FROM advisories").fetchone()[0]
        assert advisories_count == 0
        audit_count = conn.execute("SELECT COUNT(*) FROM audit_events").fetchone()[0]
        assert audit_count == 0
    finally:
        conn.close()


def test_seed_mode_is_shadow(temp_db_path: Path):
    """Verify default initial seed mode is 'shadow'."""
    mode = get_proxy_mode(temp_db_path)
    assert mode == "shadow"


def test_check_constraints_reject_invalid_proxy_mode(temp_db_path: Path):
    """Verify SQLite CHECK constraint rejects an invalid proxy_mode directly in SQL."""
    conn = connect(temp_db_path)
    try:
        with pytest.raises(sqlite3.IntegrityError):
            with conn:
                conn.execute("UPDATE app_settings SET proxy_mode = 'invalid_mode' WHERE id = 1")
    finally:
        conn.close()


def test_check_constraints_reject_invalid_app_settings_id(temp_db_path: Path):
    """Verify app_settings CHECK (id = 1) prevents creating rows other than id 1."""
    conn = connect(temp_db_path)
    try:
        with pytest.raises(sqlite3.IntegrityError):
            with conn:
                conn.execute(
                    "INSERT INTO app_settings (id, proxy_mode, updated_at) VALUES (2, 'shadow', ?)",
                    (utc_now_iso(),),
                )
    finally:
        conn.close()


def test_check_constraints_reject_invalid_traffic_action(temp_db_path: Path):
    """Verify SQLite CHECK constraint rejects an invalid action in traffic_events."""
    conn = connect(temp_db_path)
    try:
        with pytest.raises(sqlite3.IntegrityError):
            with conn:
                conn.execute(
                    """
                    INSERT INTO traffic_events (
                        method, path, mode, action, status_code, duration_ms, created_at
                    ) VALUES ('GET', '/api/test', 'shadow', 'unauthorized_action', 200, 1.5, ?)
                    """,
                    (utc_now_iso(),),
                )
    finally:
        conn.close()


def test_foreign_keys_pragma_enforced(temp_db_path: Path):
    """Verify PRAGMA foreign_keys is ON and rejects dangling foreign key references."""
    conn = connect(temp_db_path)
    try:
        fk_status = conn.execute("PRAGMA foreign_keys").fetchone()[0]
        assert fk_status == 1

        # Inserting a replay run for a non-existent rule_id must fail
        with pytest.raises(sqlite3.IntegrityError):
            with conn:
                conn.execute(
                    """
                    INSERT INTO rule_replay_runs (
                        rule_id, rule_digest, fixture_version,
                        benign_total, benign_matches, attack_total, attack_matches,
                        passed, tested_at
                    ) VALUES (99999, 'dummy_digest', 'lab-v1', 5, 0, 1, 1, 1, ?)
                    """,
                    (utc_now_iso(),),
                )
    finally:
        conn.close()


def test_journal_mode_wal_and_busy_timeout(temp_db_path: Path):
    """Verify journal_mode is WAL and busy_timeout is 5000ms."""
    conn = connect(temp_db_path)
    try:
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        assert mode.lower() == "wal"

        timeout = conn.execute("PRAGMA busy_timeout").fetchone()[0]
        assert timeout == 5000
    finally:
        conn.close()


def test_rule_digest_stability_and_sensitivity():
    """Verify compute_rule_digest is deterministic, key-order independent, and changes on diffs."""
    config1 = {"name": "demo_attack", "value": "true"}
    config1_reversed = {"value": "true", "name": "demo_attack"}
    config2 = {"name": "demo_attack", "value": "false"}

    d1 = compute_rule_digest("query_param_equals", config1)
    d1_rev = compute_rule_digest("query_param_equals", config1_reversed)
    d2 = compute_rule_digest("query_param_equals", config2)
    d_diff_matcher = compute_rule_digest("header_equals", config1)

    # 64 hex chars
    assert len(d1) == 64
    assert re.match(r"^[0-9a-f]{64}$", d1)

    # Stability and key-order invariance
    assert d1 == d1_rev

    # String input vs dict input invariance
    assert d1 == compute_rule_digest("query_param_equals", '{"name":"demo_attack","value":"true"}')

    # Changes when config changes
    assert d1 != d2

    # Changes when matcher_type changes
    assert d1 != d_diff_matcher


def test_privacy_path_redaction_and_truncation(temp_db_path: Path):
    """
    Verify privacy sanitization:
    - Strips query string and fragment.
    - Truncates long paths to max 200 chars.
    - Never stores sensitive query parameters or fragments.
    """
    raw_path_with_secrets = "/api/v1/auth/login?token=SUPER_SECRET_12345&password=raw#private_frag"
    ev_id = insert_traffic_event(
        method="GET",
        path=raw_path_with_secrets,
        mode="shadow",
        action="shadow_match",
        status_code=200,
        duration_ms=4.5,
        db_path=temp_db_path,
    )

    events = list_traffic_events(limit=1, db_path=temp_db_path)
    assert len(events) == 1
    assert events[0]["id"] == ev_id
    assert events[0]["path"] == "/api/v1/auth/login"
    assert "token" not in events[0]["path"]
    assert "SUPER_SECRET" not in events[0]["path"]
    assert "private_frag" not in events[0]["path"]

    # Test truncation of long paths
    long_path = "/" + "a" * 250
    insert_traffic_event(
        method="POST",
        path=long_path,
        mode="enforce",
        action="blocked",
        status_code=403,
        duration_ms=2.1,
        db_path=temp_db_path,
    )

    events = list_traffic_events(limit=2, db_path=temp_db_path)
    newest = events[0]
    assert len(newest["path"]) == 200
    assert newest["path"] == "/" + "a" * 199


def test_sanitize_path_edge_cases():
    """Verify path sanitizer handles edge cases (empty, query-only, full URL)."""
    assert sanitize_path("") == "/"
    assert sanitize_path("?demo_attack=true") == "/"
    assert sanitize_path("#fragment_only") == "/"
    assert sanitize_path("test/path") == "/test/path"
    assert sanitize_path("http://127.0.0.1:8080/dashboard?a=1#b") == "/dashboard"


def test_traffic_counts_accuracy(temp_db_path: Path):
    """Verify traffic_counts returns accurate totals for all 4 action kinds."""
    initial = traffic_counts(temp_db_path)
    assert initial == {
        "total": 0,
        "shadow_match": 0,
        "blocked": 0,
        "allowed": 0,
        "upstream_error": 0,
    }

    # Insert events across different actions
    insert_traffic_event("GET", "/a", "shadow", "allowed", 200, 1.0, db_path=temp_db_path)
    insert_traffic_event("GET", "/b", "shadow", "allowed", 200, 2.0, db_path=temp_db_path)
    insert_traffic_event("GET", "/c", "shadow", "shadow_match", 200, 3.0, db_path=temp_db_path)
    insert_traffic_event("GET", "/d", "enforce", "blocked", 403, 1.5, db_path=temp_db_path)
    insert_traffic_event("GET", "/e", "shadow", "upstream_error", 502, 5.0, db_path=temp_db_path)

    counts = traffic_counts(temp_db_path)
    assert counts["total"] == 5
    assert counts["allowed"] == 2
    assert counts["shadow_match"] == 1
    assert counts["blocked"] == 1
    assert counts["upstream_error"] == 1


def test_rules_return_dict_and_booleans(temp_db_path: Path):
    """Verify list_rules and get_rule return match_config as a dict and booleans as bool."""
    rules = list_rules(temp_db_path)
    assert len(rules) == 1

    rule = rules[0]
    assert rule["name"] == "Demo query marker"
    assert rule["matcher_type"] == "query_param_equals"
    assert isinstance(rule["match_config"], dict)
    assert rule["match_config"] == {"name": "demo_attack", "value": "true"}
    assert rule["enabled"] is True
    assert rule["human_approved"] is True
    assert rule["source_kind"] == "demo"
    assert isinstance(rule["rule_digest"], str)
    assert len(rule["rule_digest"]) == 64

    # Verify get_rule matches
    single = get_rule(rule["id"], temp_db_path)
    assert single is not None
    assert single == rule

    # Non-existent rule returns None
    assert get_rule(99999, temp_db_path) is None


def test_timestamp_utc_format(temp_db_path: Path):
    """Verify utc_now_iso and stored timestamps adhere strictly to UTC RFC3339 format."""
    now = utc_now_iso()
    assert UTC_ISO_REGEX.match(now)
    assert now.endswith("Z")

    # Check timestamps on seeded rule and settings
    rules = list_rules(temp_db_path)
    assert UTC_ISO_REGEX.match(rules[0]["created_at"])
    assert UTC_ISO_REGEX.match(rules[0]["updated_at"])

    # Check traffic event timestamp
    insert_traffic_event("GET", "/time-test", "shadow", "allowed", 200, 1.0, db_path=temp_db_path)
    events = list_traffic_events(limit=1, db_path=temp_db_path)
    assert UTC_ISO_REGEX.match(events[0]["created_at"])


def test_set_proxy_mode_validation_and_update(temp_db_path: Path):
    """
    Verify set_proxy_mode:
    - Rejects invalid modes before touching the DB.
    - Updates and returns valid modes correctly.
    """
    # Invalid values must raise ValueError
    for bad_mode in ("bad", "ENFORCE", "SHADOW", "invalid", "1", ""):
        with pytest.raises(ValueError):
            set_proxy_mode(bad_mode, db_path=temp_db_path)

    # Valid values
    assert set_proxy_mode("enforce", db_path=temp_db_path) == "enforce"
    assert get_proxy_mode(temp_db_path) == "enforce"

    assert set_proxy_mode("off", db_path=temp_db_path) == "off"
    assert get_proxy_mode(temp_db_path) == "off"

    assert set_proxy_mode("shadow", db_path=temp_db_path) == "shadow"
    assert get_proxy_mode(temp_db_path) == "shadow"


def test_rule_replay_runs_insert_and_retrieval(temp_db_path: Path):
    """Verify insert_replay_run and get_latest_replay."""
    rule = list_rules(temp_db_path)[0]
    rule_id = rule["id"]
    digest = rule["rule_digest"]

    # Initial replay is None
    assert get_latest_replay(rule_id, digest, "lab-v1", db_path=temp_db_path) is None

    run_id1 = insert_replay_run(
        rule_id=rule_id,
        rule_digest=digest,
        fixture_version="lab-v1",
        benign_total=5,
        benign_matches=0,
        attack_total=1,
        attack_matches=1,
        passed=True,
        tested_at="2026-11-01T08:00:00Z",
        db_path=temp_db_path,
    )
    assert run_id1 > 0

    replay = get_latest_replay(rule_id, digest, "lab-v1", db_path=temp_db_path)
    assert replay is not None
    assert replay["id"] == run_id1
    assert replay["rule_id"] == rule_id
    assert replay["passed"] is True
    assert replay["fixture_version"] == "lab-v1"
    assert replay["benign_total"] == 5
    assert replay["attack_total"] == 1

    # Insert a newer replay run
    run_id2 = insert_replay_run(
        rule_id=rule_id,
        rule_digest=digest,
        fixture_version="lab-v1",
        benign_total=5,
        benign_matches=1,
        attack_total=1,
        attack_matches=0,
        passed=False,
        tested_at="2026-11-01T09:00:00Z",
        db_path=temp_db_path,
    )

    latest = get_latest_replay(rule_id, digest, "lab-v1", db_path=temp_db_path)
    assert latest is not None
    assert latest["id"] == run_id2
    assert latest["passed"] is False


def test_add_audit_event(temp_db_path: Path):
    """Verify add_audit_event safely persists audit log records."""
    audit_id = add_audit_event(
        event_type="PROXY_MODE_CHANGE",
        resource_type="proxy",
        resource_id=1,
        safe_metadata={"previous_mode": "shadow", "new_mode": "enforce"},
        db_path=temp_db_path,
    )
    assert audit_id > 0

    conn = connect(temp_db_path)
    try:
        row = conn.execute("SELECT * FROM audit_events WHERE id = ?", (audit_id,)).fetchone()
        assert row is not None
        assert row["event_type"] == "PROXY_MODE_CHANGE"
        assert row["resource_type"] == "proxy"
        assert row["resource_id"] == 1
        assert UTC_ISO_REGEX.match(row["created_at"])
    finally:
        conn.close()
