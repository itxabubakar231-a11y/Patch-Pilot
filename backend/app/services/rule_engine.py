"""
Deterministic Allowlisted Query Parameter Rule Engine for PatchPilot.

Enforces:
1. Deterministic evaluation of allowlisted query parameters (strictly 'query_param_equals').
2. Rejection of unbounded regular expressions or arbitrary pattern matching.
3. Safe extraction and parsing of query parameters from strings, bytes, dictionaries, or URLs.
4. Fail-closed behavior: disabled rules, invalid configs, or unrecognized matchers never match.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional, Sequence, Union
import urllib.parse

# Supported matcher types in MVP (matches database CHECK constraint)
SUPPORTED_MATCHER_TYPES = {"query_param_equals"}


@dataclass(frozen=True)
class RuleMatchResult:
    """
    Immutable result representing the evaluation of rules against an HTTP request.
    """
    matched: bool
    rule_id: Optional[int] = None
    rule_name: Optional[str] = None
    matched_rule: Optional[Dict[str, Any]] = None
    param_name: Optional[str] = None
    param_value: Optional[str] = None

    @classmethod
    def no_match(cls) -> "RuleMatchResult":
        return cls(matched=False)

    @classmethod
    def match(
        cls,
        rule: Dict[str, Any],
        param_name: str,
        param_value: str,
    ) -> "RuleMatchResult":
        return cls(
            matched=True,
            rule_id=rule.get("id"),
            rule_name=rule.get("name"),
            matched_rule=rule,
            param_name=param_name,
            param_value=param_value,
        )


def parse_query_params(
    query_source: Union[str, bytes, Mapping[str, Any], None]
) -> Dict[str, List[str]]:
    """
    Normalizes and parses arbitrary query input into a Dict[str, List[str]].

    Supports:
    - Dict / Mapping: e.g. {"demo_attack": "true"} or {"key": ["v1", "v2"]}
    - Raw query string: e.g. "demo_attack=true&page=1" or "?demo_attack=true"
    - ASGI bytes query string: e.g. b"demo_attack=true"
    - Full URI / path: e.g. "/api/v1?demo_attack=true" (properly separated from path)
    """
    if query_source is None:
        return {}

    # Pre-parsed Mapping (e.g. from fixture or request.query_params)
    if isinstance(query_source, Mapping):
        parsed: Dict[str, List[str]] = {}
        for k, v in query_source.items():
            key_str = str(k)
            if isinstance(v, (list, tuple, set)):
                parsed[key_str] = [str(item) for item in v]
            else:
                parsed[key_str] = [str(v)]
        return parsed

    # Decode bytes from ASGI scope if needed
    if isinstance(query_source, bytes):
        raw = query_source.decode("latin-1")
    else:
        raw = str(query_source)

    raw = raw.strip()
    if not raw:
        return {}

    # If full URL or path passed, extract only the query portion after the first unencoded '?'
    # Note: %3F must NOT be treated as a query delimiter
    if "?" in raw:
        _, raw = raw.split("?", 1)

    return urllib.parse.parse_qs(raw, keep_blank_values=True)


def evaluate_rule(
    rule: Dict[str, Any],
    query_source: Union[str, bytes, Mapping[str, Any], None],
) -> bool:
    """
    Evaluates a single security rule against incoming query parameters.

    Invariants:
    - Disabled rules (enabled=False or enabled=0) NEVER match.
    - Matcher must be 'query_param_equals'. Unrecognized matchers fail closed (return False).
    - Requires exact matching of parameter name and parameter value.
    - Never uses regular expressions.
    """
    if not rule or not rule.get("enabled", True):
        return False

    matcher_type = rule.get("matcher_type")
    if matcher_type not in SUPPORTED_MATCHER_TYPES:
        return False

    match_config = rule.get("match_config")
    if not isinstance(match_config, dict):
        return False

    target_name = match_config.get("name")
    target_value = match_config.get("value")

    # Both name and value must be specified as non-None strings
    if target_name is None or target_value is None:
        return False

    target_name_str = str(target_name)
    target_value_str = str(target_value)

    parsed_params = parse_query_params(query_source)

    # Check if target_name is present in parsed parameters
    if target_name_str not in parsed_params:
        return False

    # Check if any value for target_name matches target_value exactly
    param_values = parsed_params[target_name_str]
    return target_value_str in param_values


def find_matching_rule(
    rules: Sequence[Dict[str, Any]],
    query_source: Union[str, bytes, Mapping[str, Any], None],
) -> Optional[Dict[str, Any]]:
    """
    Evaluates a sequence of rules against query parameters in order.
    Returns the first matching enabled rule, or None if no match.
    """
    parsed_params = parse_query_params(query_source)
    for rule in rules:
        if evaluate_rule(rule, parsed_params):
            return rule
    return None


def evaluate_rules(
    rules: Sequence[Dict[str, Any]],
    query_source: Union[str, bytes, Mapping[str, Any], None],
) -> RuleMatchResult:
    """
    Evaluates rules and returns a structured RuleMatchResult.
    """
    parsed_params = parse_query_params(query_source)
    matching_rule = find_matching_rule(rules, parsed_params)
    if matching_rule is None:
        return RuleMatchResult.no_match()

    config = matching_rule.get("match_config", {})
    return RuleMatchResult.match(
        rule=matching_rule,
        param_name=str(config.get("name", "")),
        param_value=str(config.get("value", "")),
    )


class RuleEngine:
    """
    Service wrapper for query parameter rule evaluation.
    """

    @staticmethod
    def parse_params(
        query_source: Union[str, bytes, Mapping[str, Any], None]
    ) -> Dict[str, List[str]]:
        return parse_query_params(query_source)

    @staticmethod
    def evaluate(
        rule: Dict[str, Any],
        query_source: Union[str, bytes, Mapping[str, Any], None],
    ) -> bool:
        return evaluate_rule(rule, query_source)

    @staticmethod
    def find_match(
        rules: Sequence[Dict[str, Any]],
        query_source: Union[str, bytes, Mapping[str, Any], None],
    ) -> Optional[Dict[str, Any]]:
        return find_matching_rule(rules, query_source)

    @staticmethod
    def evaluate_request(
        rules: Sequence[Dict[str, Any]],
        query_source: Union[str, bytes, Mapping[str, Any], None],
    ) -> RuleMatchResult:
        return evaluate_rules(rules, query_source)
