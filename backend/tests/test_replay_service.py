"""
Unit tests for PatchPilot Offline Replay Service and Enforce Gate Validator.

Verifies:
- Valid replay evaluation and DB persistence matching docs/API.md contract.
- Benign false positives causing replay failure (benign_matches > 0).
- Attack marker missed causing replay failure (attack_matches < attack_total).
- Insufficient sample counts (benign_total < 5 or attack_total < 1).
- Fixture schema and metadata validation (is_simulated, expected_match, query_params mapping).
- Enforce gate fail-closed states: unapproved rule, missing replay, stale digest, failed replay.
- Enforce gate success when all enabled rules are approved and have current passing replays.
- Canonical fixture path resolution and FileNotFoundError handling.
- Zero pollution of backend/data/patchpilot.db.
"""

import json
from pathlib import Path
from typing import Any, Dict
import pytest

from app.core.config import DATABASE_PATH
from app.core.db import (
    compute_rule_digest,
    connect,
    get_latest_replay,
    get_rule,
    init_db,
    utc_now_iso,
)
from app.services.replay_service import (
    CANONICAL_FIXTURE_PATH,
    FixtureValidationError,
    GateCheckResult,
    ReplayService,
    RuleNotFoundError,
    check_enforce_gate,
    evaluate_rule_against_fixture,
    execute_rule_replay,
    load_fixture,
    validate_fixture_data,
)


@pytest.fixture(autouse=True)
def guard_live_database():
    """Safety guard ensuring tests never create or touch backend/data/patchpilot.db."""
    yield
    assert not DATABASE_PATH.exists(), (
        f"CRITICAL: Test touched or created live database file at {DATABASE_PATH}"
    )


@pytest.fixture
def temp_db_path(tmp_path: Path) -> Path:
    """Provides an isolated temporary database initialized with seed rule."""
    db_file = tmp_path / "test_replay.db"
    init_db(db_file)
    return db_file


@pytest.fixture
def valid_fixture_dict() -> Dict[str, Any]:
    """Provides a valid, in-memory fixture dataset conforming to lab-v1 requirements."""
    return {
        "_notice": "SIMULATED TEST FIXTURE",
        "fixture_version": "lab-v1",
        "is_simulated": True,
        "description": "Test dataset for unit testing replay evaluation.",
        "benign_requests": [
            {"id": "b1", "path": "/", "query_params": {}, "expected_match": False},
            {"id": "b2", "path": "/health", "query_params": {}, "expected_match": False},
            {"id": "b3", "path": "/items", "query_params": {"q": "search"}, "expected_match": False},
            {"id": "b4", "path": "/about", "query_params": {"page": "1"}, "expected_match": False},
            {"id": "b5", "path": "/contact", "query_params": {"lang": "en"}, "expected_match": False},
        ],
        "attack_requests": [
            {
                "id": "a1",
                "path": "/",
                "query_params": {"demo_attack": "true"},
                "expected_match": True,
            }
        ],
    }


# ==============================================================================
# 1. Replay Evaluation & Database Persistence Tests
# ==============================================================================

def test_execute_rule_replay_valid(temp_db_path: Path, valid_fixture_dict: Dict[str, Any]):
    """Verify successful offline replay against valid fixtures and check DB persistence."""
    result = execute_rule_replay(
        rule_id=1,
        fixture_version="lab-v1",
        fixture_data=valid_fixture_dict,
        db_path=temp_db_path,
    )

    # Verify return dictionary shape matching docs/API.md Section 3.F
    assert result["run_id"] > 0
    assert result["rule_id"] == 1
    assert result["fixture_version"] == "lab-v1"
    assert result["benign_total"] == 5
    assert result["benign_matches"] == 0
    assert result["attack_total"] == 1
    assert result["attack_matches"] == 1
    assert result["passed"] is True
    assert result["tested_at"].endswith("Z")

    # Verify persisted in rule_replay_runs table
    rule = get_rule(1, db_path=temp_db_path)
    latest = get_latest_replay(
        rule_id=1,
        rule_digest=rule["rule_digest"],
        fixture_version="lab-v1",
        db_path=temp_db_path,
    )
    assert latest is not None
    assert latest["id"] == result["run_id"]
    assert latest["passed"] is True
    assert latest["benign_total"] == 5
    assert latest["benign_matches"] == 0
    assert latest["attack_total"] == 1
    assert latest["attack_matches"] == 1

    # Verify audit event was logged
    conn = connect(temp_db_path)
    try:
        audit_row = conn.execute(
            "SELECT * FROM audit_events WHERE event_type = 'RULE_REPLAY_TEST'"
        ).fetchone()
        assert audit_row is not None
        assert audit_row["resource_id"] == 1
        assert "lab-v1" in audit_row["safe_metadata_json"]
    finally:
        conn.close()


def test_rule_not_found_raises(temp_db_path: Path, valid_fixture_dict: Dict[str, Any]):
    """Attempting replay for a non-existent rule_id raises RuleNotFoundError."""
    with pytest.raises(RuleNotFoundError):
        execute_rule_replay(
            rule_id=99999,
            fixture_version="lab-v1",
            fixture_data=valid_fixture_dict,
            db_path=temp_db_path,
        )


# ==============================================================================
# 2. Replay Pass / Fail Criteria Tests
# ==============================================================================

def test_replay_fails_on_benign_false_positive(valid_fixture_dict: Dict[str, Any]):
    """A benign request triggering a rule match must fail the replay."""
    rule = {"matcher_type": "query_param_equals", "match_config": {"name": "demo_attack", "value": "true"}, "enabled": True}
    
    # Introduce a false positive into benign set
    bad_fixture = dict(valid_fixture_dict)
    bad_fixture["benign_requests"] = list(valid_fixture_dict["benign_requests"]) + [
        {"id": "b_fp", "path": "/safe", "query_params": {"demo_attack": "true"}, "expected_match": False}
    ]

    eval_res = evaluate_rule_against_fixture(rule, bad_fixture)
    assert eval_res["benign_total"] == 6
    assert eval_res["benign_matches"] == 1
    assert eval_res["passed"] is False


def test_replay_fails_on_attack_marker_missed(valid_fixture_dict: Dict[str, Any]):
    """An attack request that fails to trigger the rule must fail the replay."""
    rule = {"matcher_type": "query_param_equals", "match_config": {"name": "different_marker", "value": "true"}, "enabled": True}

    eval_res = evaluate_rule_against_fixture(rule, valid_fixture_dict)
    assert eval_res["attack_total"] == 1
    assert eval_res["attack_matches"] == 0
    assert eval_res["passed"] is False


def test_replay_fails_on_insufficient_benign_samples(valid_fixture_dict: Dict[str, Any]):
    """Replay must fail if benign_total < 5 even if all matches align."""
    rule = {"matcher_type": "query_param_equals", "match_config": {"name": "demo_attack", "value": "true"}, "enabled": True}
    
    # Cut benign requests down to 4
    short_fixture = dict(valid_fixture_dict)
    short_fixture["benign_requests"] = valid_fixture_dict["benign_requests"][:4]

    eval_res = evaluate_rule_against_fixture(rule, short_fixture)
    assert eval_res["benign_total"] == 4
    assert eval_res["benign_matches"] == 0
    assert eval_res["passed"] is False  # Must have >= 5


def test_replay_fails_on_zero_attack_samples(valid_fixture_dict: Dict[str, Any]):
    """Replay must fail if attack_total < 1."""
    rule = {"matcher_type": "query_param_equals", "match_config": {"name": "demo_attack", "value": "true"}, "enabled": True}

    no_attack_fixture = dict(valid_fixture_dict)
    no_attack_fixture["attack_requests"] = []

    eval_res = evaluate_rule_against_fixture(rule, no_attack_fixture)
    assert eval_res["attack_total"] == 0
    assert eval_res["passed"] is False


def test_replay_fails_on_wrong_fixture_version(valid_fixture_dict: Dict[str, Any]):
    """Replay must fail if fixture_version is not 'lab-v1'."""
    rule = {"matcher_type": "query_param_equals", "match_config": {"name": "demo_attack", "value": "true"}, "enabled": True}

    wrong_ver_fixture = dict(valid_fixture_dict, fixture_version="lab-v2")
    eval_res = evaluate_rule_against_fixture(rule, wrong_ver_fixture)
    assert eval_res["passed"] is False


# ==============================================================================
# 3. Fixture Metadata & Schema Validation Tests
# ==============================================================================

def test_fixture_validation_rejects_missing_or_bad_fields(valid_fixture_dict: Dict[str, Any]):
    """Verify validate_fixture_data rejects malformed data safely."""
    # Not a dict
    with pytest.raises(FixtureValidationError):
        validate_fixture_data("not-a-dict")

    # Wrong version
    with pytest.raises(FixtureValidationError):
        validate_fixture_data(dict(valid_fixture_dict, fixture_version="lab-v2"))

    # is_simulated missing or not True
    with pytest.raises(FixtureValidationError):
        validate_fixture_data(dict(valid_fixture_dict, is_simulated=False))

    # benign_requests not a list
    with pytest.raises(FixtureValidationError):
        validate_fixture_data(dict(valid_fixture_dict, benign_requests="bad"))

    # attack_requests not a list
    with pytest.raises(FixtureValidationError):
        validate_fixture_data(dict(valid_fixture_dict, attack_requests=123))

    # Missing query_params mapping inside a request
    bad_reqs = [{"id": "b1", "path": "/", "expected_match": False}]
    with pytest.raises(FixtureValidationError):
        validate_fixture_data(dict(valid_fixture_dict, benign_requests=bad_reqs))

    # Missing boolean expected_match
    bad_reqs2 = [{"id": "b1", "path": "/", "query_params": {}, "expected_match": "not-bool"}]
    with pytest.raises(FixtureValidationError):
        validate_fixture_data(dict(valid_fixture_dict, benign_requests=bad_reqs2))


def test_fixture_validation_expected_match_strict_boolean(valid_fixture_dict: Dict[str, Any]):
    """Strictly require expected_match is False for benign and True for attack requests."""
    # Benign with True
    bad_benign_true = [{"id": "b1", "path": "/", "query_params": {}, "expected_match": True}]
    with pytest.raises(FixtureValidationError) as exc:
        validate_fixture_data(dict(valid_fixture_dict, benign_requests=bad_benign_true))
    assert "must be boolean False" in str(exc.value)

    # Benign with integer 0 (not bool False)
    bad_benign_zero = [{"id": "b1", "path": "/", "query_params": {}, "expected_match": 0}]
    with pytest.raises(FixtureValidationError) as exc:
        validate_fixture_data(dict(valid_fixture_dict, benign_requests=bad_benign_zero))
    assert "must be boolean False" in str(exc.value)

    # Attack with False
    bad_attack_false = [{"id": "a1", "path": "/", "query_params": {}, "expected_match": False}]
    with pytest.raises(FixtureValidationError) as exc:
        validate_fixture_data(dict(valid_fixture_dict, attack_requests=bad_attack_false))
    assert "must be boolean True" in str(exc.value)

    # Attack with integer 1 (not bool True)
    bad_attack_one = [{"id": "a1", "path": "/", "query_params": {}, "expected_match": 1}]
    with pytest.raises(FixtureValidationError) as exc:
        validate_fixture_data(dict(valid_fixture_dict, attack_requests=bad_attack_one))
    assert "must be boolean True" in str(exc.value)


def test_load_fixture_from_file_and_file_not_found(tmp_path: Path, valid_fixture_dict: Dict[str, Any]):
    """Verify loading fixtures from a filesystem path and handling missing files."""
    # Custom temp fixture file
    test_file = tmp_path / "temp_lab_v1.json"
    test_file.write_text(json.dumps(valid_fixture_dict), encoding="utf-8")

    loaded = load_fixture(fixture_path=test_file)
    assert loaded["fixture_version"] == "lab-v1"

    # Missing file
    non_existent = tmp_path / "does_not_exist.json"
    with pytest.raises(FileNotFoundError) as exc_info:
        load_fixture(fixture_path=non_existent)
    assert "not found at" in str(exc_info.value)

    # Canonical path missing test (when lab/fixtures/lab_v1.json does not exist)
    if not CANONICAL_FIXTURE_PATH.exists():
        with pytest.raises(FileNotFoundError):
            load_fixture()


# ==============================================================================
# 4. Enforce Gate Validation Tests
# ==============================================================================

def test_enforce_gate_fails_initially_without_replay(temp_db_path: Path):
    """Initially on clean seed, no replay has run yet; gate must reject with REPLAY_REQUIRED."""
    gate = check_enforce_gate(db_path=temp_db_path)
    assert gate.ready is False
    assert gate.error_code == "REPLAY_REQUIRED"
    assert gate.failed_rule_id == 1


def test_enforce_gate_succeeds_after_passing_replay(temp_db_path: Path, valid_fixture_dict: Dict[str, Any]):
    """Once a passing replay on lab-v1 is recorded, gate succeeds with ready=True."""
    # Execute passing replay
    execute_rule_replay(
        rule_id=1,
        fixture_version="lab-v1",
        fixture_data=valid_fixture_dict,
        db_path=temp_db_path,
    )

    gate = check_enforce_gate(db_path=temp_db_path)
    assert gate.ready is True
    assert gate.error_code is None
    assert gate.failed_rule_id is None


def test_enforce_gate_fails_when_rule_unapproved(temp_db_path: Path, valid_fixture_dict: Dict[str, Any]):
    """If an enabled rule is human_approved=0, gate rejects with RULE_NOT_APPROVED."""
    # Set human_approved = 0 directly in DB
    conn = connect(temp_db_path)
    try:
        with conn:
            conn.execute("UPDATE security_rules SET human_approved = 0 WHERE id = 1")
    finally:
        conn.close()

    gate = check_enforce_gate(db_path=temp_db_path)
    assert gate.ready is False
    assert gate.error_code == "RULE_NOT_APPROVED"
    assert gate.failed_rule_id == 1


def test_enforce_gate_fails_when_all_rules_disabled(temp_db_path: Path):
    """If no enabled rules exist, gate rejects with NO_ENABLED_RULES."""
    conn = connect(temp_db_path)
    try:
        with conn:
            conn.execute("UPDATE security_rules SET enabled = 0 WHERE id = 1")
    finally:
        conn.close()

    gate = check_enforce_gate(db_path=temp_db_path)
    assert gate.ready is False
    assert gate.error_code == "NO_ENABLED_RULES"


def test_enforce_gate_fails_when_latest_replay_failed(temp_db_path: Path, valid_fixture_dict: Dict[str, Any]):
    """If the latest replay failed (e.g. benign false positive), gate must reject."""
    # First, record a failed replay
    bad_fixture = dict(valid_fixture_dict)
    bad_fixture["benign_requests"] = list(valid_fixture_dict["benign_requests"]) + [
        {"id": "b_fp", "path": "/fp", "query_params": {"demo_attack": "true"}, "expected_match": False}
    ]

    execute_rule_replay(
        rule_id=1,
        fixture_version="lab-v1",
        fixture_data=bad_fixture,
        db_path=temp_db_path,
    )

    gate = check_enforce_gate(db_path=temp_db_path)
    assert gate.ready is False
    assert gate.error_code == "REPLAY_REQUIRED"
    assert gate.failed_rule_id == 1


def test_enforce_gate_fails_when_rule_digest_mismatch(temp_db_path: Path, valid_fixture_dict: Dict[str, Any]):
    """If the rule config was changed in the database without updating stored digest, gate fails."""
    # Change match_config without updating rule_digest
    conn = connect(temp_db_path)
    try:
        with conn:
            conn.execute(
                """
                UPDATE security_rules
                SET match_config_json = '{"name":"tampered_attack","value":"true"}'
                WHERE id = 1
                """
            )
    finally:
        conn.close()

    gate = check_enforce_gate(db_path=temp_db_path)
    assert gate.ready is False
    assert gate.error_code == "DIGEST_MISMATCH"
    assert gate.failed_rule_id == 1


def test_enforce_gate_fails_when_config_change_invalidates_previous_replay(
    temp_db_path: Path, valid_fixture_dict: Dict[str, Any]
):
    """
    If a rule is replayed, but subsequently its config and digest are modified,
    the previous replay is invalidated and gate must reject with REPLAY_REQUIRED.
    """
    # 1. Run passing replay on initial rule
    execute_rule_replay(
        rule_id=1,
        fixture_version="lab-v1",
        fixture_data=valid_fixture_dict,
        db_path=temp_db_path,
    )
    assert check_enforce_gate(db_path=temp_db_path).ready is True

    # 2. Update rule configuration and update its digest to the new value
    new_config = {"name": "demo_attack_v2", "value": "true"}
    new_config_json = json.dumps(new_config, sort_keys=True)
    new_digest = compute_rule_digest("query_param_equals", new_config)

    conn = connect(temp_db_path)
    try:
        with conn:
            conn.execute(
                """
                UPDATE security_rules
                SET match_config_json = ?, rule_digest = ?, updated_at = ?
                WHERE id = 1
                """,
                (new_config_json, new_digest, utc_now_iso()),
            )
    finally:
        conn.close()

    # 3. Gate must reject because no replay exists for the new digest
    gate = check_enforce_gate(db_path=temp_db_path)
    assert gate.ready is False
    assert gate.error_code == "REPLAY_REQUIRED"
    assert gate.failed_rule_id == 1


def test_enforce_gate_multiple_rules_one_missing_replay(
    temp_db_path: Path, valid_fixture_dict: Dict[str, Any]
):
    """
    When multiple rules are enabled and approved, ALL must have passing replays.
    Rule A (id=1) has a passing replay, Rule B (id=2) has no replay: gate must reject and report Rule B.
    """
    # 1. Pass Rule A replay
    execute_rule_replay(
        rule_id=1,
        fixture_version="lab-v1",
        fixture_data=valid_fixture_dict,
        db_path=temp_db_path,
    )

    # 2. Insert Rule B as enabled and human_approved, but without a replay run
    rule_b_config = {"name": "rule_b_marker", "value": "true"}
    rule_b_config_json = json.dumps(rule_b_config, sort_keys=True)
    rule_b_digest = compute_rule_digest("query_param_equals", rule_b_config)
    now = utc_now_iso()

    conn = connect(temp_db_path)
    try:
        with conn:
            cur = conn.execute(
                """
                INSERT INTO security_rules (
                    name, matcher_type, match_config_json, rule_digest,
                    enabled, human_approved, source_kind, created_at, updated_at
                ) VALUES ('Rule B', 'query_param_equals', ?, ?, 1, 1, 'manual', ?, ?)
                """,
                (rule_b_config_json, rule_b_digest, now, now),
            )
            rule_b_id = cur.lastrowid
    finally:
        conn.close()

    # 3. Check gate: must fail and explicitly identify Rule B as failed_rule_id
    gate = check_enforce_gate(db_path=temp_db_path)
    assert gate.ready is False
    assert gate.error_code == "REPLAY_REQUIRED"
    assert gate.failed_rule_id == rule_b_id


def test_replay_service_wrapper_methods(temp_db_path: Path, valid_fixture_dict: Dict[str, Any]):
    """Verify ReplayService static wrapper methods mirror functional interfaces."""
    fixtures = ReplayService.load_fixtures(fixture_data=valid_fixture_dict)
    assert fixtures["fixture_version"] == "lab-v1"

    replay_res = ReplayService.run_replay(
        rule_id=1,
        fixture_version="lab-v1",
        fixture_data=valid_fixture_dict,
        db_path=temp_db_path,
    )
    assert replay_res["passed"] is True

    gate = ReplayService.evaluate_enforce_gate(db_path=temp_db_path)
    assert gate.ready is True
