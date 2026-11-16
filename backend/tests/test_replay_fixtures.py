"""
Unit and Replay Fixture Verification Tests for PatchPilot.

Owned by Team A, Member 2 (Security Testing & Scanner Developer).
Branch: feature/scanner

This test module verifies the integrity, schema compliance, and safety
guarantees of the `lab-v1` replay request dataset defined in:
  - backend/app/fixtures/replay/lab_v1.json
  - lab/fixtures/lab_v1.json

Adheres strictly to:
  - PRD.md (Section 3 M4: Replay against fixtures; Section 2 Non-negotiable principles)
  - docs/API.md (Section 3.F: POST /api/v1/rules/{rule_id}/replay)
  - docs/DATABASE.md (rule_replay_runs schema & replay gate)
  - docs/DEVELOPMENT_PLAN.md (Sprint 1 Member 2 deliverables)
"""

import json
from pathlib import Path
import pytest

# Resolve absolute repository root regardless of current working directory
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_FIXTURE_PATH = REPO_ROOT / "backend" / "app" / "fixtures" / "replay" / "lab_v1.json"
LAB_FIXTURE_PATH = REPO_ROOT / "lab" / "fixtures" / "lab_v1.json"


@pytest.fixture(scope="module")
def backend_fixture_data() -> dict:
    """Load and parse the canonical backend replay fixture file."""
    assert BACKEND_FIXTURE_PATH.is_file(), f"Missing backend fixture: {BACKEND_FIXTURE_PATH}"
    with open(BACKEND_FIXTURE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def lab_fixture_data() -> dict:
    """Load and parse the mirrored lab replay fixture file."""
    assert LAB_FIXTURE_PATH.is_file(), f"Missing lab fixture: {LAB_FIXTURE_PATH}"
    with open(LAB_FIXTURE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


# ==============================================================================
# Requirement 1: Verify both fixture files exist
# ==============================================================================
def test_both_fixture_files_exist():
    """
    Ensure both fixture locations exist on disk:
    1. backend/app/fixtures/replay/lab_v1.json (for backend service & tests)
    2. lab/fixtures/lab_v1.json (for lab architecture contract)
    """
    assert BACKEND_FIXTURE_PATH.is_file(), (
        f"Backend replay fixture not found at expected path: {BACKEND_FIXTURE_PATH}"
    )
    assert LAB_FIXTURE_PATH.is_file(), (
        f"Lab replay fixture not found at expected path: {LAB_FIXTURE_PATH}"
    )


# ==============================================================================
# Requirement 2: Verify both files contain valid JSON
# ==============================================================================
def test_both_files_contain_valid_json():
    """
    Confirm that both files can be parsed without syntax or encoding errors
    using the standard library JSON parser.
    """
    for path in (BACKEND_FIXTURE_PATH, LAB_FIXTURE_PATH):
        content = path.read_text(encoding="utf-8")
        parsed = json.loads(content)
        assert isinstance(parsed, dict), f"Fixture at {path} must parse into a JSON object/dict."
        assert "fixture_version" in parsed, f"Fixture at {path} missing 'fixture_version' key."
        assert "benign_requests" in parsed, f"Fixture at {path} missing 'benign_requests' list."
        assert "attack_requests" in parsed, f"Fixture at {path} missing 'attack_requests' list."


# ==============================================================================
# Requirement 3: Verify both fixture files are identical
# ==============================================================================
def test_both_fixture_files_are_identical():
    """
    Ensure that the backend fixture and the lab fixture contain exact identical
    content, preventing drift between the backend service and the lab environment.
    """
    backend_raw = BACKEND_FIXTURE_PATH.read_text(encoding="utf-8")
    lab_raw = LAB_FIXTURE_PATH.read_text(encoding="utf-8")

    assert backend_raw == lab_raw, (
        "backend/app/fixtures/replay/lab_v1.json and lab/fixtures/lab_v1.json "
        "must have identical content."
    )


# ==============================================================================
# Requirement 4: Verify fixture version and simulated-data notice
# ==============================================================================
def test_fixture_version_and_simulated_notice(backend_fixture_data: dict):
    """
    Verify metadata requirements per PRD non-negotiables:
    - fixture_version must strictly equal 'lab-v1'.
    - is_simulated flag must be boolean True.
    - _notice must clearly state that data is SIMULATED for local testing.
    """
    assert backend_fixture_data.get("fixture_version") == "lab-v1", (
        "fixture_version must strictly equal 'lab-v1' as mandated by docs/API.md."
    )
    assert backend_fixture_data.get("is_simulated") is True, (
        "is_simulated must be True to prevent misrepresenting mock data."
    )
    notice = backend_fixture_data.get("_notice", "")
    assert "SIMULATED" in notice, (
        "Fixture must include a prominent '_notice' indicating simulated data."
    )


# ==============================================================================
# Requirement 5: Verify there are at least 5 benign requests
# ==============================================================================
def test_at_least_five_benign_requests(backend_fixture_data: dict):
    """
    Per PRD.md (M4) and docs/API.md:
    Replay evaluation requires benign_total >= 5.
    Confirm the dataset satisfies this baseline.
    """
    benign_list = backend_fixture_data.get("benign_requests", [])
    assert isinstance(benign_list, list), "'benign_requests' must be a list."
    assert len(benign_list) >= 5, (
        f"Expected at least 5 benign requests per PRD criteria, got {len(benign_list)}."
    )


# ==============================================================================
# Requirement 6: Verify there is at least 1 harmless simulated marker request
# ==============================================================================
def test_at_least_one_simulated_attack_marker(backend_fixture_data: dict):
    """
    Per PRD.md (M4) and docs/API.md:
    Replay evaluation requires attack_total >= 1.
    Confirm the dataset includes at least one harmless simulated marker.
    """
    attack_list = backend_fixture_data.get("attack_requests", [])
    assert isinstance(attack_list, list), "'attack_requests' must be a list."
    assert len(attack_list) >= 1, (
        f"Expected at least 1 attack marker per PRD criteria, got {len(attack_list)}."
    )


# ==============================================================================
# Requirement 7: Verify all benign requests have expected_match set to false
# ==============================================================================
def test_all_benign_requests_have_expected_match_false(backend_fixture_data: dict):
    """
    Zero False-Positive Gate:
    Every benign request in the dataset must have expected_match == False,
    its category set to 'benign', and must not contain the active attack marker.
    """
    benign_list = backend_fixture_data.get("benign_requests", [])

    for req in benign_list:
        req_id = req.get("id", "unknown")
        assert req.get("expected_match") is False, (
            f"Benign request '{req_id}' must have expected_match=False to prevent false positives."
        )
        assert req.get("category") == "benign", (
            f"Request '{req_id}' category must be 'benign'."
        )
        # Ensure harmless benign requests do not accidentally include demo_attack=true
        query_params = req.get("query_params", {})
        assert query_params.get("demo_attack") != "true", (
            f"Benign request '{req_id}' must not contain demo_attack='true'."
        )


# ==============================================================================
# Requirement 8: Verify all simulated markers have expected_match set to true
# ==============================================================================
def test_all_simulated_markers_have_expected_match_true(backend_fixture_data: dict):
    """
    Marker Detection Gate:
    Every simulated attack request must have expected_match == True,
    category == 'attack_marker', and must carry the exact harmless query
    parameter demo_attack=true without any real exploit payloads.
    """
    attack_list = backend_fixture_data.get("attack_requests", [])

    for marker in attack_list:
        marker_id = marker.get("id", "unknown")
        assert marker.get("expected_match") is True, (
            f"Marker '{marker_id}' must have expected_match=True."
        )
        assert marker.get("category") == "attack_marker", (
            f"Marker '{marker_id}' category must be 'attack_marker'."
        )
        # Verify query parameters contain the harmless demo_attack marker
        query_params = marker.get("query_params", {})
        assert query_params.get("demo_attack") == "true", (
            f"Marker '{marker_id}' must contain query parameter 'demo_attack': 'true'."
        )


# ==============================================================================
# Requirement 9: Include a test for the harmless near-miss case
# ==============================================================================
def test_harmless_near_miss_case(backend_fixture_data: dict):
    """
    Near-Miss Edge Case (benign_07):
    Verifies that requests containing substrings 'demo' or 'attack' in normal context
    (e.g., topic='defense_against_attacks' and demo='preview') are strictly
    treated as benign and NOT flagged as the attack marker.

    Protects against simplistic regex / substring false positives.
    """
    benign_list = backend_fixture_data.get("benign_requests", [])
    near_miss = next((r for r in benign_list if r.get("id") == "benign_07"), None)

    assert near_miss is not None, "Missing near-miss edge case fixture 'benign_07'."
    assert near_miss.get("path") == "/blog"
    query = near_miss.get("query_params", {})

    # Confirm the substrings are present in the benign parameters
    assert "attacks" in query.get("topic", "")
    assert query.get("demo") == "preview"

    # Confirm the exact demo_attack parameter is absent
    assert "demo_attack" not in query

    # Must be expected_match=False
    assert near_miss.get("expected_match") is False


# ==============================================================================
# Additional Safety & Protocol Checks
# ==============================================================================
def test_post_fixtures_headers_and_payload_isolation(backend_fixture_data: dict):
    """
    Protocol Compliance Checks:
    1. POST fixtures containing JSON bodies must specify Content-Type: application/json.
    2. marker_03 must carry demo_attack=true strictly in query parameters,
       with its request body containing legitimate JSON.
    """
    benign_list = backend_fixture_data.get("benign_requests", [])
    attack_list = backend_fixture_data.get("attack_requests", [])

    # Check benign_05 (POST request with JSON body)
    benign_05 = next((r for r in benign_list if r.get("id") == "benign_05"), None)
    assert benign_05 is not None, "Missing fixture 'benign_05'."
    assert benign_05.get("method") == "POST"
    headers = benign_05.get("headers", {})
    assert headers.get("Content-Type") == "application/json"
    assert isinstance(benign_05.get("body"), dict)

    # Check marker_03 (POST request with query marker)
    marker_03 = next((r for r in attack_list if r.get("id") == "marker_03"), None)
    assert marker_03 is not None, "Missing fixture 'marker_03'."
    assert marker_03.get("method") == "POST"
    # demo_attack=true must be in query_params, NOT in body
    assert marker_03.get("query_params", {}).get("demo_attack") == "true"
    body = marker_03.get("body", {})
    assert isinstance(body, dict)
    assert "demo_attack" not in body
    assert marker_03.get("headers", {}).get("Content-Type") == "application/json"
