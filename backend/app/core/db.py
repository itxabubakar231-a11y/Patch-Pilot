"""
PatchPilot SQLite Data Access Layer.

Authoritative implementation of the SQLite data model defined in docs/DATABASE.md.
All queries are parameterized and transactions are kept short.
Connections enforce:
  - PRAGMA foreign_keys = ON;
  - PRAGMA journal_mode = WAL;
  - PRAGMA busy_timeout = 5000;
"""

import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from urllib.parse import urlsplit

try:
    from app.core.config import DATABASE_PATH
except ImportError:
    from backend.app.core.config import DATABASE_PATH  # type: ignore

# Permitted proxy modes according to architectural and schema contract
ALLOWED_PROXY_MODES = ("off", "shadow", "enforce")

# MVP Schema DDL as specified in docs/DATABASE.md (Phase 2 tables excluded)
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  proxy_mode TEXT NOT NULL DEFAULT 'shadow'
    CHECK (proxy_mode IN ('off', 'shadow', 'enforce')),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS security_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  matcher_type TEXT NOT NULL CHECK (matcher_type IN ('query_param_equals')),
  match_config_json TEXT NOT NULL,
  rule_digest TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  human_approved INTEGER NOT NULL DEFAULT 0 CHECK (human_approved IN (0,1)),
  source_kind TEXT NOT NULL DEFAULT 'demo'
    CHECK (source_kind IN ('demo','manual')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rule_replay_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL REFERENCES security_rules(id),
  rule_digest TEXT NOT NULL,
  fixture_version TEXT NOT NULL,
  benign_total INTEGER NOT NULL CHECK (benign_total >= 0),
  benign_matches INTEGER NOT NULL CHECK (benign_matches >= 0),
  attack_total INTEGER NOT NULL CHECK (attack_total >= 0),
  attack_matches INTEGER NOT NULL CHECK (attack_matches >= 0),
  passed INTEGER NOT NULL CHECK (passed IN (0,1)),
  tested_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS traffic_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('off','shadow','enforce')),
  action TEXT NOT NULL CHECK
    (action IN ('allowed','shadow_match','blocked','upstream_error')),
  status_code INTEGER NOT NULL,
  matched_rule_id INTEGER REFERENCES security_rules(id),
  duration_ms REAL NOT NULL CHECK (duration_ms >= 0),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS advisories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT,
  title TEXT NOT NULL,
  severity TEXT NOT NULL
    CHECK (severity IN ('critical','high','medium','low','unknown')),
  summary TEXT NOT NULL,
  source_url TEXT,
  source_kind TEXT NOT NULL
    CHECK (source_kind IN ('demo','official','user_supplied')),
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  generated_by TEXT NOT NULL CHECK (generated_by IN ('fixture','llm','manual')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS advisory_localizations (
  advisory_id INTEGER NOT NULL REFERENCES advisories(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  generated_by TEXT NOT NULL CHECK (generated_by IN ('fixture','llm','manual')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (advisory_id, language_code)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id INTEGER,
  safe_metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_traffic_created ON traffic_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_action ON traffic_events(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_replay_rule_time ON rule_replay_runs(rule_id, tested_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at DESC);
"""


def utc_now_iso() -> str:
    """Returns the current UTC time as an RFC3339/ISO-8601 string, e.g. '2026-11-01T08:00:00Z'."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def compute_rule_digest(matcher_type: str, match_config: Union[Dict[str, Any], str]) -> str:
    """
    Computes a canonical SHA-256 hex digest of matcher_type and match_config.
    
    Uses canonical JSON serialization (sort_keys=True, compact separators=(',', ':')).
    Any change to matcher_type or match_config changes the digest.
    Key order in match_config dictionaries does not affect the digest.
    """
    if isinstance(match_config, str):
        config_obj = json.loads(match_config)
    else:
        config_obj = dict(match_config)

    canonical_payload = {
        "match_config": config_obj,
        "matcher_type": str(matcher_type),
    }
    canonical_json = json.dumps(canonical_payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest().lower()


def sanitize_path(raw_path: str) -> str:
    """
    Extracts and sanitizes the pathname from an arbitrary URL or path string.

    Privacy requirement:
    - Strips query string and fragment.
    - Limits path to a maximum of 200 characters.
    - Guarantees leading '/' and never stores query, headers, body, or IP.
    """
    if not raw_path:
        return "/"
    parts = urlsplit(str(raw_path))
    clean_path = parts.path
    if not clean_path:
        clean_path = "/"
    if not clean_path.startswith("/"):
        clean_path = "/" + clean_path
    return clean_path[:200]


def connect(db_path: Union[str, Path, None] = None) -> sqlite3.Connection:
    """
    Returns an open sqlite3 connection configured for PatchPilot.

    Configures:
      - row_factory = sqlite3.Row
      - PRAGMA foreign_keys = ON;
      - PRAGMA journal_mode = WAL;
      - PRAGMA busy_timeout = 5000;
    """
    target = Path(db_path) if db_path is not None else DATABASE_PATH
    if str(target) != ":memory:":
        target.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(target))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    return conn


def init_db(db_path: Union[str, Path, None] = None) -> None:
    """
    Initializes the SQLite schema idempotently.
    Creates parent directories if necessary, executes MVP table and index DDL,
    sets PRAGMA user_version = 1, and creates seed data if not present.
    Running init_db multiple times is idempotent and never duplicates records.
    """
    target = Path(db_path) if db_path is not None else DATABASE_PATH
    if str(target) != ":memory:":
        target.parent.mkdir(parents=True, exist_ok=True)

    conn = connect(target)
    try:
        with conn:
            conn.executescript(SCHEMA_SQL)
            conn.execute("PRAGMA user_version = 1;")

            now = utc_now_iso()

            # Seed app_settings row id=1 with proxy_mode 'shadow'
            conn.execute(
                """
                INSERT OR IGNORE INTO app_settings (id, proxy_mode, updated_at)
                VALUES (1, 'shadow', ?)
                """,
                (now,),
            )

            # Seed exactly one DEMO rule (idempotent check)
            existing_rule = conn.execute(
                "SELECT id FROM security_rules WHERE name = ? AND source_kind = 'demo'",
                ("Demo query marker",),
            ).fetchone()

            if not existing_rule:
                demo_config = {"name": "demo_attack", "value": "true"}
                demo_config_json = json.dumps(demo_config, sort_keys=True, separators=(",", ":"))
                digest = compute_rule_digest("query_param_equals", demo_config)
                conn.execute(
                    """
                    INSERT INTO security_rules (
                        name, matcher_type, match_config_json, rule_digest,
                        enabled, human_approved, source_kind, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, 1, 1, 'demo', ?, ?)
                    """,
                    (
                        "Demo query marker",
                        "query_param_equals",
                        demo_config_json,
                        digest,
                        now,
                        now,
                    ),
                )
    finally:
        conn.close()


def get_proxy_mode(db_path: Union[str, Path, None] = None) -> str:
    """Returns the current proxy_mode ('off', 'shadow', or 'enforce')."""
    conn = connect(db_path)
    try:
        row = conn.execute("SELECT proxy_mode FROM app_settings WHERE id = 1").fetchone()
        if row:
            return str(row["proxy_mode"])
        return "shadow"
    finally:
        conn.close()


def set_proxy_mode(mode: str, db_path: Union[str, Path, None] = None) -> str:
    """
    Sets the proxy_mode.
    Rejects any value outside ('off', 'shadow', 'enforce') before touching the DB.
    """
    if mode not in ALLOWED_PROXY_MODES:
        raise ValueError(
            f"Invalid proxy mode: {mode!r}. Must be one of {ALLOWED_PROXY_MODES}"
        )
    now = utc_now_iso()
    conn = connect(db_path)
    try:
        with conn:
            cur = conn.execute(
                "UPDATE app_settings SET proxy_mode = ?, updated_at = ? WHERE id = 1",
                (mode, now),
            )
            if cur.rowcount == 0:
                conn.execute(
                    "INSERT INTO app_settings (id, proxy_mode, updated_at) VALUES (1, ?, ?)",
                    (mode, now),
                )
        return mode
    finally:
        conn.close()


def _format_rule_row(row: sqlite3.Row) -> Dict[str, Any]:
    """Helper to convert a security_rules Row into dict with match_config parsed and bool types."""
    rule = dict(row)
    raw_config = rule.pop("match_config_json", "{}")
    if isinstance(raw_config, str):
        rule["match_config"] = json.loads(raw_config)
    elif isinstance(raw_config, dict):
        rule["match_config"] = raw_config
    else:
        rule["match_config"] = {}
    rule["enabled"] = bool(rule["enabled"])
    rule["human_approved"] = bool(rule["human_approved"])
    return rule


def list_rules(db_path: Union[str, Path, None] = None) -> List[Dict[str, Any]]:
    """Returns all security_rules with match_config as dict and booleans as bool."""
    conn = connect(db_path)
    try:
        rows = conn.execute("SELECT * FROM security_rules ORDER BY id ASC").fetchall()
        return [_format_rule_row(r) for r in rows]
    finally:
        conn.close()


def get_rule(rule_id: int, db_path: Union[str, Path, None] = None) -> Optional[Dict[str, Any]]:
    """Returns a single security rule by id, or None if not found."""
    conn = connect(db_path)
    try:
        row = conn.execute("SELECT * FROM security_rules WHERE id = ?", (rule_id,)).fetchone()
        if not row:
            return None
        return _format_rule_row(row)
    finally:
        conn.close()


def insert_traffic_event(
    method: str,
    path: str,
    mode: str,
    action: str,
    status_code: int,
    duration_ms: float,
    matched_rule_id: Optional[int] = None,
    created_at: Optional[str] = None,
    db_path: Union[str, Path, None] = None,
) -> int:
    """
    Inserts a redacted traffic event.
    Stores only the sanitized pathname (no query, fragment, headers, body, or client IP).
    Returns the newly created event id.
    """
    clean_path = sanitize_path(path)
    ts = created_at or utc_now_iso()
    conn = connect(db_path)
    try:
        with conn:
            cur = conn.execute(
                """
                INSERT INTO traffic_events (
                    method, path, mode, action, status_code, matched_rule_id, duration_ms, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    method.upper(),
                    clean_path,
                    mode,
                    action,
                    int(status_code),
                    matched_rule_id,
                    float(duration_ms),
                    ts,
                ),
            )
            return int(cur.lastrowid)
    finally:
        conn.close()


def list_traffic_events(
    limit: int = 50,
    offset: int = 0,
    db_path: Union[str, Path, None] = None,
) -> List[Dict[str, Any]]:
    """Returns traffic events ordered by newest first."""
    conn = connect(db_path)
    try:
        rows = conn.execute(
            """
            SELECT id, method, path, mode, action, status_code, matched_rule_id, duration_ms, created_at
            FROM traffic_events
            ORDER BY created_at DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def traffic_counts(db_path: Union[str, Path, None] = None) -> Dict[str, int]:
    """Returns aggregated traffic counts: total, shadow_match, blocked, allowed, upstream_error."""
    conn = connect(db_path)
    try:
        row = conn.execute(
            """
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN action = 'shadow_match' THEN 1 ELSE 0 END) AS shadow_match,
                SUM(CASE WHEN action = 'blocked' THEN 1 ELSE 0 END) AS blocked,
                SUM(CASE WHEN action = 'allowed' THEN 1 ELSE 0 END) AS allowed,
                SUM(CASE WHEN action = 'upstream_error' THEN 1 ELSE 0 END) AS upstream_error
            FROM traffic_events
            """
        ).fetchone()
        return {
            "total": int(row["total"] or 0),
            "shadow_match": int(row["shadow_match"] or 0),
            "blocked": int(row["blocked"] or 0),
            "allowed": int(row["allowed"] or 0),
            "upstream_error": int(row["upstream_error"] or 0),
        }
    finally:
        conn.close()


def insert_replay_run(
    rule_id: int,
    rule_digest: str,
    fixture_version: str,
    benign_total: int,
    benign_matches: int,
    attack_total: int,
    attack_matches: int,
    passed: bool,
    tested_at: Optional[str] = None,
    db_path: Union[str, Path, None] = None,
) -> int:
    """Inserts a rule replay run test record. Returns the new record id."""
    ts = tested_at or utc_now_iso()
    passed_int = 1 if passed else 0
    conn = connect(db_path)
    try:
        with conn:
            cur = conn.execute(
                """
                INSERT INTO rule_replay_runs (
                    rule_id, rule_digest, fixture_version,
                    benign_total, benign_matches, attack_total, attack_matches,
                    passed, tested_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    rule_id,
                    rule_digest,
                    fixture_version,
                    int(benign_total),
                    int(benign_matches),
                    int(attack_total),
                    int(attack_matches),
                    passed_int,
                    ts,
                ),
            )
            return int(cur.lastrowid)
    finally:
        conn.close()


def get_latest_replay(
    rule_id: int,
    rule_digest: str,
    fixture_version: Optional[str] = None,
    db_path: Union[str, Path, None] = None,
) -> Optional[Dict[str, Any]]:
    """Returns the most recent replay run for the given rule and digest."""
    conn = connect(db_path)
    try:
        if fixture_version is not None:
            row = conn.execute(
                """
                SELECT * FROM rule_replay_runs
                WHERE rule_id = ? AND rule_digest = ? AND fixture_version = ?
                ORDER BY tested_at DESC, id DESC
                LIMIT 1
                """,
                (rule_id, rule_digest, fixture_version),
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT * FROM rule_replay_runs
                WHERE rule_id = ? AND rule_digest = ?
                ORDER BY tested_at DESC, id DESC
                LIMIT 1
                """,
                (rule_id, rule_digest),
            ).fetchone()
        if not row:
            return None
        res = dict(row)
        res["passed"] = bool(res["passed"])
        return res
    finally:
        conn.close()


def add_audit_event(
    event_type: str,
    resource_type: str,
    resource_id: Optional[int] = None,
    safe_metadata: Optional[Dict[str, Any]] = None,
    created_at: Optional[str] = None,
    db_path: Union[str, Path, None] = None,
) -> int:
    """Appends an event to the audit_events log. safe_metadata must contain no secrets."""
    ts = created_at or utc_now_iso()
    meta_dict = safe_metadata if isinstance(safe_metadata, dict) else {}
    safe_metadata_json = json.dumps(meta_dict, sort_keys=True)
    conn = connect(db_path)
    try:
        with conn:
            cur = conn.execute(
                """
                INSERT INTO audit_events (
                    event_type, resource_type, resource_id, safe_metadata_json, created_at
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (event_type, resource_type, resource_id, safe_metadata_json, ts),
            )
            return int(cur.lastrowid)
    finally:
        conn.close()
