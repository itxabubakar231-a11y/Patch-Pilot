"""
Unit tests for deterministic allowlisted query parameter rule engine (app.services.rule_engine).

Verifies:
- Exact parsed query parameter matching (matcher_type == 'query_param_equals').
- Case sensitivity and exact equality (no regex, no substring false positives).
- Dict, string, bytes, and URL-path query source formats.
- Fail-closed behavior for disabled rules, unknown matcher types, and malformed rule configs.
- RuleMatchResult structure and RuleEngine wrapper methods.
"""

from app.services.rule_engine import (
    RuleEngine,
    RuleMatchResult,
    evaluate_rule,
    evaluate_rules,
    find_matching_rule,
    parse_query_params,
)

SAMPLE_DEMO_RULE = {
    "id": 1,
    "name": "Demo query marker",
    "matcher_type": "query_param_equals",
    "match_config": {"name": "demo_attack", "value": "true"},
    "enabled": True,
    "human_approved": True,
    "source_kind": "demo",
    "rule_digest": "abcdef1234567890",
}


def test_parse_query_params_various_inputs():
    """Verify parse_query_params parses str, bytes, mapping, and URI paths."""
    # Mapping
    assert parse_query_params({"a": "1", "b": ["2", "3"]}) == {"a": ["1"], "b": ["2", "3"]}

    # Raw query string
    assert parse_query_params("a=1&b=2") == {"a": ["1"], "b": ["2"]}

    # Leading question mark
    assert parse_query_params("?demo_attack=true") == {"demo_attack": ["true"]}

    # Bytes
    assert parse_query_params(b"demo_attack=true&mode=test") == {
        "demo_attack": ["true"],
        "mode": ["test"],
    }

    # Full URI path
    assert parse_query_params("/api/v1/test?demo_attack=true") == {"demo_attack": ["true"]}

    # Empty / None
    assert parse_query_params("") == {}
    assert parse_query_params(None) == {}


def test_exact_match_success():
    """Verify demo_attack=true matches across various valid request representations."""
    # Plain query string
    assert evaluate_rule(SAMPLE_DEMO_RULE, "demo_attack=true") is True

    # Preceding question mark
    assert evaluate_rule(SAMPLE_DEMO_RULE, "?demo_attack=true") is True

    # Multiple parameters
    assert evaluate_rule(SAMPLE_DEMO_RULE, "page=1&demo_attack=true&tab=summary") is True

    # Bytes input
    assert evaluate_rule(SAMPLE_DEMO_RULE, b"demo_attack=true") is True

    # Mapping input (as in fixture JSON files)
    assert evaluate_rule(SAMPLE_DEMO_RULE, {"demo_attack": "true"}) is True
    assert evaluate_rule(SAMPLE_DEMO_RULE, {"page": "home", "demo_attack": "true"}) is True

    # Multiple values for same key where one matches
    assert evaluate_rule(SAMPLE_DEMO_RULE, "demo_attack=other&demo_attack=true") is True


def test_mismatched_values_fail():
    """Verify values other than exact 'true' do not match."""
    assert evaluate_rule(SAMPLE_DEMO_RULE, "demo_attack=false") is False
    assert evaluate_rule(SAMPLE_DEMO_RULE, "demo_attack=TRUE") is False  # Exact case
    assert evaluate_rule(SAMPLE_DEMO_RULE, "demo_attack=1") is False
    assert evaluate_rule(SAMPLE_DEMO_RULE, "demo_attack=") is False
    assert evaluate_rule(SAMPLE_DEMO_RULE, {"demo_attack": "false"}) is False


def test_mismatched_keys_and_substring_near_misses_fail():
    """Verify near-miss key names and values inside other keys do not match."""
    # Near miss parameter name
    assert evaluate_rule(SAMPLE_DEMO_RULE, "demo_attack_marker=true") is False
    assert evaluate_rule(SAMPLE_DEMO_RULE, "prefix_demo_attack=true") is False

    # Near miss values (from benign_07 fixture)
    assert evaluate_rule(SAMPLE_DEMO_RULE, "topic=defense_against_attacks&demo=preview") is False

    # Value of another parameter containing the marker
    assert evaluate_rule(SAMPLE_DEMO_RULE, "q=demo_attack%3Dtrue") is False

    # Empty query
    assert evaluate_rule(SAMPLE_DEMO_RULE, "") is False
    assert evaluate_rule(SAMPLE_DEMO_RULE, None) is False


def test_percent_encoded_path_not_treated_as_query():
    """Verify %3F in the path is not treated as a query delimiter."""
    # In /x%3Fdemo_attack%3Dtrue, the %3F is part of the path, not an unencoded '?'
    assert evaluate_rule(SAMPLE_DEMO_RULE, "/x%3Fdemo_attack%3Dtrue") is False


def test_disabled_rules_never_match():
    """Disabled rules (enabled=False or 0) must never match."""
    disabled_rule = dict(SAMPLE_DEMO_RULE, enabled=False)
    assert evaluate_rule(disabled_rule, "demo_attack=true") is False

    disabled_rule_int = dict(SAMPLE_DEMO_RULE, enabled=0)
    assert evaluate_rule(disabled_rule_int, "demo_attack=true") is False


def test_unsupported_matcher_fails_closed():
    """Unrecognized matcher types fail closed and return False."""
    regex_rule = dict(SAMPLE_DEMO_RULE, matcher_type="regex_match")
    assert evaluate_rule(regex_rule, "demo_attack=true") is False


def test_malformed_rule_configs_fail_closed():
    """Missing or corrupted match_config fails closed without exceptions."""
    assert evaluate_rule(dict(SAMPLE_DEMO_RULE, match_config=None), "demo_attack=true") is False
    assert evaluate_rule(dict(SAMPLE_DEMO_RULE, match_config={}), "demo_attack=true") is False
    assert evaluate_rule(dict(SAMPLE_DEMO_RULE, match_config={"name": "demo_attack"}), "demo_attack=true") is False
    assert evaluate_rule(dict(SAMPLE_DEMO_RULE, match_config="not_a_dict"), "demo_attack=true") is False


def test_find_matching_rule():
    """Verify find_matching_rule returns the first matching enabled rule in sequence."""
    rule1 = dict(SAMPLE_DEMO_RULE, id=1, enabled=False)  # Disabled
    rule2 = dict(SAMPLE_DEMO_RULE, id=2, enabled=True)   # Enabled match
    rule3 = dict(SAMPLE_DEMO_RULE, id=3, enabled=True)   # Also matching, but comes second

    matched = find_matching_rule([rule1, rule2, rule3], "demo_attack=true")
    assert matched is not None
    assert matched["id"] == 2

    no_match = find_matching_rule([rule1, rule2], "demo_attack=false")
    assert no_match is None


def test_evaluate_rules_result_structure():
    """Verify evaluate_rules returns structured RuleMatchResult."""
    result = evaluate_rules([SAMPLE_DEMO_RULE], "demo_attack=true")
    assert isinstance(result, RuleMatchResult)
    assert result.matched is True
    assert result.rule_id == 1
    assert result.rule_name == "Demo query marker"
    assert result.param_name == "demo_attack"
    assert result.param_value == "true"
    assert result.matched_rule == SAMPLE_DEMO_RULE

    # Non-matching result
    no_match_res = evaluate_rules([SAMPLE_DEMO_RULE], "safe=1")
    assert no_match_res.matched is False
    assert no_match_res.rule_id is None
    assert no_match_res.matched_rule is None


def test_rule_engine_class_methods():
    """Verify RuleEngine class wrapper methods behave identically to functions."""
    assert RuleEngine.evaluate(SAMPLE_DEMO_RULE, "demo_attack=true") is True
    assert RuleEngine.find_match([SAMPLE_DEMO_RULE], "demo_attack=true") == SAMPLE_DEMO_RULE

    res = RuleEngine.evaluate_request([SAMPLE_DEMO_RULE], "demo_attack=true")
    assert res.matched is True
    assert res.param_name == "demo_attack"
