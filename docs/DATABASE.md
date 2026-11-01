# PatchPilot — SQLite Data Model

**Version:** 1.0 | **Source of truth for table definitions**  
**Implementation status:** PROPOSED; initial repository does not yet contain this schema.

## 1. Decisions

- Database engine: **SQLite**, not PostgreSQL, Firebase, or MongoDB.
- File: `backend/data/patchpilot.db`; do not commit database or WAL/shm files.
- Both management API (:8000) and proxy (:8080) open this **same absolute file path**. Compute from backend project root, not the process working directory.
- Use parameterized queries, named data-access functions, `PRAGMA foreign_keys=ON`, `PRAGMA journal_mode=WAL`, `PRAGMA busy_timeout=5000` and short transactions. Initialize schema idempotently.
- API and DB timestamps are **UTC RFC3339-style strings** such as `2026-11-01T08:00:00Z`. Use text UTC dates consistently. Database stores no secrets or full HTTP request contents.
- Strings use `snake_case` in DB and JSON. Enum values are lowercase and defined below.
- Schema changes require migration and coordinated update of `API.md` and tests. Do not have separate agents independently edit the same schema.

## 2. MVP schema (7 tables)

The following SQLite DDL is the authoritative **MVP target schema**, not evidence of existing migrations. Implement in `backend/app/core/db.py` or a controlled migration script. `PRAGMA` must be set per connection where applicable.

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

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
```

### Seed data (one-time, idempotent)

- `app_settings.id = 1`, `proxy_mode = 'shadow'`.
- One **DEMO** rule: `name = 'Demo query marker'`, `matcher_type = 'query_param_equals'`, `match_config_json = '{"name":"demo_attack","value":"true"}'`, `enabled = 1`.
- Seeded lab rule may be marked `human_approved = 1` *only as a visibly demo-scoped, reviewed example*. **Enforce is still forbidden until a current passing replay exists.** No generated CVE rule is autoapproved.
- `rule_digest` = SHA-256 hex of canonical matcher type/config/rule revision (serialized consistently with sorted JSON keys). Changing any matching semantics changes digest.
- Do not seed fake live traffic data in the backend as if it were observed. Frontend mock data lives separately in `frontend/src/mocks/` with explicit **DEMO** labels.

### Relationships

```text
security_rules (1) ─── (*) rule_replay_runs
security_rules (1) ─── (*) traffic_events [nullable match]
advisories (1) ─── (*) advisory_localizations
app_settings (singleton) + audit_events (append-only log)
```

## 3. Record semantics

| Field / enum | Exact meaning |
|---|---|
| `proxy_mode = off` | No rule evaluation; proxy forwards to lab unless upstream error; emergency option |
| `proxy_mode = shadow` | Evaluate and log matches; never block based on rules |
| `proxy_mode = enforce` | May block only human-approved enabled rules with valid passing replay |
| `action = allowed` | No configured rule blocked or shadow-matched this request |
| `action = shadow_match` | Demo rule matched but request was forwarded |
| `action = blocked` | PatchPilot returned 403 itself |
| `action = upstream_error` | Lab unavailable; PatchPilot returned 502 |
| `verified` | Proven source provenance (not AI's own assertion); not a guarantee that exposure was remediated |
| `generated_by = fixture` | Explicit demo content, not an LLM call |

**Replay gate:** Enforce allowed only when every currently enabled rule has `human_approved=1` and its latest replay for the **current digest** and fixture version `lab-v1` passed: `benign_total>=5`, `benign_matches=0`, `attack_total>=1`, `attack_matches=attack_total`. Reject otherwise with HTTP 409. Check the gate when switching modes **and** before blocking on the proxy path, so changed rules cannot bypass it. If replay becomes invalid while in Enforce, proxy must fail back to Shadow (with audit event) or refuse the unvalidated rule; never silently enforce an untested rule.

**Redacted path:** Store only pathname such as `/login`, limited length; not the raw query string, sensitive headers, body, or client IP. Use `matched_rule_id` to describe what matched. `safe_metadata_json` must contain no secrets.

## 4. Phase 2 schema — add later, not in MVP

The following field-level models are planned and require their own tested migration. Do not create them merely to make the dashboard look complete.

| Table | Key fields | Purpose |
|---|---|---|
| `server_inventory` | `id`, `os_name`, `php_version`, `php_build`, `php_sapi`, `vendor`, `web_root`, `is_simulated`, `observed_at` | Local runtime evidence and provenance |
| `scan_runs` | `id`, `root_rel_path`, `status`, `started_at`, `completed_at`, `files_scanned` | Auditable local-only scanner execution |
| `scan_findings` | `id`, `scan_run_id`, `relative_path`, `sha256`, `reason_codes_json`, `entropy`, `verdict`, `review_status`, `created_at` | Evidence, not destructive action |
| `quarantine_records` | `id`, `finding_id`, `original_rel_path`, `quarantined_rel_path`, `sha256_before`, `approved_at`, `restored_at` | Explicitly authorized reversible file movement |
| `patch_checks` | `id`, `advisory_id`, `inventory_id`, `result`, `vendor_basis`, `evidence_json`, `checked_at` | Version/vendor-specific patch verification |

**Scanner security constraints (Phase 2):**
- Restrict root to configured isolated `lab/www/` and resolve canonical paths; reject `..`, symlinks escaping root, path traversal and special device files.
- Enforce maximum file size, scan depth and total file count; perform read-only scan first.
- Shannon entropy is a triage signal, not proof of maliciousness; static signatures can false-positive; LLM verdict never overrides human review.
- Quarantine requires per-file selection, explicit approval, hash verification, separate quarantine directory outside web root, immutable audit trail, and reversible restore.

## 5. Example rows (illustrative; not real detections)

```json
{
  "security_rules": {
    "id": 1,
    "name": "Demo query marker",
    "matcher_type": "query_param_equals",
    "match_config_json": {"name": "demo_attack", "value": "true"},
    "human_approved": true,
    "enabled": true
  },
  "traffic_events": {
    "id": 8,
    "method": "GET",
    "path": "/",
    "mode": "shadow",
    "action": "shadow_match",
    "status_code": 200,
    "matched_rule_id": 1,
    "duration_ms": 9.2,
    "created_at": "2026-11-01T08:00:00Z"
  }
}
```

`match_config_json` is stored as JSON text in SQLite and exposed as a JSON **object** through the API; conversion belongs in the data-access layer. Boolean columns are integers 0/1 in SQLite, booleans in API JSON.

## 6. Migration, retention and safety

- Use schema versioning (`PRAGMA user_version`) for migration tracking; always backup test DB before incompatible changes.
- Limit traffic retention for demo, e.g. keep latest 5,000 events or last 7 days; make deletion a deliberate maintenance task rather than an automatic unreviewed action.
- Never delete audit history as part of rollback. Rollback changes **mode**, not rules or data.
- Tests must use an isolated temporary SQLite file, not the developer's live `patchpilot.db`.
- Build API responses using typed Pydantic schemas so untrusted persisted values are not rendered as executable HTML.
