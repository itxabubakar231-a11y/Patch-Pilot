"""
Offline Request Replay Service and Enforce Gate Validator for PatchPilot.

Enforces:
1. Deterministic offline fixture evaluation against harmless test datasets.
2. Canonical fixture path resolution from project root (lab/fixtures/lab_v1.json).
3. Strict fixture schema and metadata validation (is_simulated=True, query_params mapping, expected_match bool).
4. Replay pass criteria: fixture_version='lab-v1', benign_total>=5, benign_matches=0,
   attack_total>=1, attack_matches=attack_total.
5. Fail-closed Enforce gate: all enabled rules must be human-approved, digest must match current config,
   and latest replay on lab-v1 must be passing.
6. Persistence of replay runs and audit trail using core database functions.
"""

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Union

from app.core.config import BACKEND_DIR
from app.core.db import (
    add_audit_event,
    compute_rule_digest,
    get_latest_replay,
    get_rule,
    insert_replay_run,
    list_rules,
    utc_now_iso,
)
from app.services.rule_engine import evaluate_rule

# Canonical fixture file path per docs/ARCHITECTURE.md Section 2 (line 81)
PROJECT_ROOT = BACKEND_DIR.parent
CANONICAL_FIXTURE_PATH = PROJECT_ROOT / "lab" / "fixtures" / "lab_v1.json"


class FixtureValidationError(ValueError):
    """Raised when fixture data is malformed, untrusted, or does not meet schema rules."""
    pass


class RuleNotFoundError(ValueError):
    """Raised when the specified rule_id cannot be found in the database."""
    pass


@dataclass(frozen=True)
class GateCheckResult:
    """
    Immutable result of the Enforce-mode readiness check across all enabled rules.
    """
    ready: bool
    error_code: Optional[str] = None
    message: str = ""
    failed_rule_id: Optional[int] = None


def validate_fixture_data(
    data: Dict[str, Any],
    expected_version: str = "lab-v1",
) -> Dict[str, Any]:
    """
    Validates fixture metadata and request item structures.
    Fails closed if fixture is malformed or unverified.
    """
    if not isinstance(data, dict):
        raise FixtureValidationError("Fixture data must be a JSON object (dict).")

    version = data.get("fixture_version")
    if version != expected_version:
        raise FixtureValidationError(
            f"Fixture version mismatch: expected '{expected_version}', got '{version}'."
        )

    # Architectural invariant: must explicitly flag simulated status
    if data.get("is_simulated") is not True:
        raise FixtureValidationError(
            "Fixture metadata violation: 'is_simulated' must be boolean True."
        )

    benign_requests = data.get("benign_requests")
    if not isinstance(benign_requests, list):
        raise FixtureValidationError("'benign_requests' must be a valid list.")

    attack_requests = data.get("attack_requests")
    if not isinstance(attack_requests, list):
        raise FixtureValidationError("'attack_requests' must be a valid list.")

    # Validate each request item structure
    for req_idx, req in enumerate(benign_requests):
        if not isinstance(req, dict):
            raise FixtureValidationError(f"Benign request #{req_idx} must be a dictionary.")
        if "query_params" not in req or not isinstance(req["query_params"], Mapping):
            raise FixtureValidationError(
                f"Benign request #{req_idx} missing valid 'query_params' mapping."
            )
        if "expected_match" not in req or not isinstance(req["expected_match"], bool):
            raise FixtureValidationError(
                f"Benign request #{req_idx} missing boolean 'expected_match'."
            )

    for req_idx, req in enumerate(attack_requests):
        if not isinstance(req, dict):
            raise FixtureValidationError(f"Attack request #{req_idx} must be a dictionary.")
        if "query_params" not in req or not isinstance(req["query_params"], Mapping):
            raise FixtureValidationError(
                f"Attack request #{req_idx} missing valid 'query_params' mapping."
            )
        if "expected_match" not in req or not isinstance(req["expected_match"], bool):
            raise FixtureValidationError(
                f"Attack request #{req_idx} missing boolean 'expected_match'."
            )

    return data


def load_fixture(
    fixture_version: str = "lab-v1",
    fixture_path: Optional[Union[str, Path]] = None,
    fixture_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Loads and validates the offline fixture dataset.
    Uses canonical lab/fixtures/ path by default.
    Accepts explicit fixture_path or in-memory fixture_data (used by tests).
    """
    if fixture_data is not None:
        return validate_fixture_data(fixture_data, expected_version=fixture_version)

    target_path = Path(fixture_path) if fixture_path is not None else CANONICAL_FIXTURE_PATH
    if not target_path.exists():
        raise FileNotFoundError(
            f"Canonical fixture file not found at: {target_path}. "
            f"Replay evaluation requires the official lab fixture."
        )

    try:
        with open(target_path, "r", encoding="utf-8") as f:
            raw_data = json.load(f)
    except Exception as exc:
        raise FixtureValidationError(f"Failed to read fixture file: {exc}") from exc

    return validate_fixture_data(raw_data, expected_version=fixture_version)


def evaluate_rule_against_fixture(
    rule: Dict[str, Any],
    fixture_data: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Evaluates benign and attack fixture sets against a security rule using rule_engine.py.
    Calculates benign_total, benign_matches, attack_total, attack_matches, and passed verdict.
    """
    benign_requests: List[Dict[str, Any]] = fixture_data.get("benign_requests", [])
    attack_requests: List[Dict[str, Any]] = fixture_data.get("attack_requests", [])

    benign_total = 0
    benign_matches = 0
    for req in benign_requests:
        benign_total += 1
        query_params = req.get("query_params", {})
        if evaluate_rule(rule, query_params):
            benign_matches += 1

    attack_total = 0
    attack_matches = 0
    for req in attack_requests:
        attack_total += 1
        query_params = req.get("query_params", {})
        if evaluate_rule(rule, query_params):
            attack_matches += 1

    fixture_version = str(fixture_data.get("fixture_version", ""))

    # Replay pass gate: exactly as defined in docs/DATABASE.md and docs/API.md
    passed = (
        fixture_version == "lab-v1"
        and benign_total >= 5
        and benign_matches == 0
        and attack_total >= 1
        and attack_matches == attack_total
    )

    return {
        "fixture_version": fixture_version,
        "benign_total": benign_total,
        "benign_matches": benign_matches,
        "attack_total": attack_total,
        "attack_matches": attack_matches,
        "passed": bool(passed),
    }


def execute_rule_replay(
    rule_id: int,
    fixture_version: str = "lab-v1",
    fixture_path: Optional[Union[str, Path]] = None,
    fixture_data: Optional[Dict[str, Any]] = None,
    db_path: Optional[Union[str, Path]] = None,
) -> Dict[str, Any]:
    """
    Runs deterministic offline replay evaluation for a rule and persists results to SQLite.
    Returns the replay run dictionary adhering strictly to the docs/API.md contract.
    """
    rule = get_rule(rule_id, db_path=db_path)
    if not rule:
        raise RuleNotFoundError(f"Rule with id={rule_id} does not exist.")

    # Load and validate fixtures
    fixtures = load_fixture(
        fixture_version=fixture_version,
        fixture_path=fixture_path,
        fixture_data=fixture_data,
    )

    # Compute canonical rule digest for current matcher and configuration
    current_digest = compute_rule_digest(rule["matcher_type"], rule["match_config"])

    # Evaluate all fixture requests
    eval_res = evaluate_rule_against_fixture(rule, fixtures)

    now = utc_now_iso()

    # Persist replay run to database
    run_id = insert_replay_run(
        rule_id=rule_id,
        rule_digest=current_digest,
        fixture_version=eval_res["fixture_version"],
        benign_total=eval_res["benign_total"],
        benign_matches=eval_res["benign_matches"],
        attack_total=eval_res["attack_total"],
        attack_matches=eval_res["attack_matches"],
        passed=eval_res["passed"],
        tested_at=now,
        db_path=db_path,
    )

    # Audit the replay execution
    add_audit_event(
        event_type="RULE_REPLAY_TEST",
        resource_type="security_rule",
        resource_id=rule_id,
        safe_metadata={
            "run_id": run_id,
            "fixture_version": eval_res["fixture_version"],
            "passed": eval_res["passed"],
            "benign_total": eval_res["benign_total"],
            "benign_matches": eval_res["benign_matches"],
            "attack_total": eval_res["attack_total"],
            "attack_matches": eval_res["attack_matches"],
        },
        created_at=now,
        db_path=db_path,
    )

    return {
        "run_id": run_id,
        "rule_id": rule_id,
        "fixture_version": eval_res["fixture_version"],
        "benign_total": eval_res["benign_total"],
        "benign_matches": eval_res["benign_matches"],
        "attack_total": eval_res["attack_total"],
        "attack_matches": eval_res["attack_matches"],
        "passed": eval_res["passed"],
        "tested_at": now,
    }


def check_enforce_gate(db_path: Optional[Union[str, Path]] = None) -> GateCheckResult:
    """
    Evaluates whether PatchPilot is safe to enter 'enforce' mode.

    Fails closed if:
    - There are no enabled security rules.
    - Any enabled rule has human_approved == 0.
    - Any enabled rule has a config/digest mismatch.
    - Any enabled rule is missing a passing replay run on fixture 'lab-v1'.
    - Any enabled rule's latest replay failed any criteria.
    """
    rules = list_rules(db_path=db_path)
    enabled_rules = [r for r in rules if r.get("enabled")]

    if not enabled_rules:
        return GateCheckResult(
            ready=False,
            error_code="NO_ENABLED_RULES",
            message="No enabled security rules found to enforce.",
        )

    for rule in enabled_rules:
        rule_id = rule["id"]
        rule_name = rule["name"]

        # Condition 1: human_approved must be True (1)
        if not rule.get("human_approved"):
            return GateCheckResult(
                ready=False,
                error_code="RULE_NOT_APPROVED",
                message=f"Rule '{rule_name}' (id={rule_id}) is not human-approved.",
                failed_rule_id=rule_id,
            )

        # Condition 2: stored digest must match current config
        current_digest = compute_rule_digest(rule["matcher_type"], rule["match_config"])
        stored_digest = rule.get("rule_digest", "")
        if stored_digest != current_digest:
            return GateCheckResult(
                ready=False,
                error_code="DIGEST_MISMATCH",
                message=f"Rule '{rule_name}' (id={rule_id}) stored digest does not match current config.",
                failed_rule_id=rule_id,
            )

        # Condition 3: must have a replay run for the current digest and lab-v1
        latest_replay = get_latest_replay(
            rule_id=rule_id,
            rule_digest=current_digest,
            fixture_version="lab-v1",
            db_path=db_path,
        )

        if not latest_replay:
            return GateCheckResult(
                ready=False,
                error_code="REPLAY_REQUIRED",
                message=f"Rule '{rule_name}' (id={rule_id}) has no replay run for fixture version 'lab-v1'.",
                failed_rule_id=rule_id,
            )

        # Condition 4: latest replay run must have passed all criteria
        if (
            not latest_replay.get("passed")
            or latest_replay.get("benign_total", 0) < 5
            or latest_replay.get("benign_matches", 1) != 0
            or latest_replay.get("attack_total", 0) < 1
            or latest_replay.get("attack_matches", 0) != latest_replay.get("attack_total", 0)
        ):
            return GateCheckResult(
                ready=False,
                error_code="REPLAY_REQUIRED",
                message=f"Rule '{rule_name}' (id={rule_id}) latest replay run did not satisfy all pass criteria.",
                failed_rule_id=rule_id,
            )

    return GateCheckResult(
        ready=True,
        error_code=None,
        message="All enabled rules approved with current passing lab-v1 replay.",
    )


class ReplayService:
    """Service wrapper for offline fixture replays and Enforce gate validation."""

    @staticmethod
    def load_fixtures(
        fixture_version: str = "lab-v1",
        fixture_path: Optional[Union[str, Path]] = None,
        fixture_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return load_fixture(fixture_version, fixture_path, fixture_data)

    @staticmethod
    def run_replay(
        rule_id: int,
        fixture_version: str = "lab-v1",
        fixture_path: Optional[Union[str, Path]] = None,
        fixture_data: Optional[Dict[str, Any]] = None,
        db_path: Optional[Union[str, Path]] = None,
    ) -> Dict[str, Any]:
        return execute_rule_replay(
            rule_id=rule_id,
            fixture_version=fixture_version,
            fixture_path=fixture_path,
            fixture_data=fixture_data,
            db_path=db_path,
        )

    @staticmethod
    def evaluate_enforce_gate(
        db_path: Optional[Union[str, Path]] = None
    ) -> GateCheckResult:
        return check_enforce_gate(db_path=db_path)
