# PatchPilot — API Contract (Team A ↔ Team B)

**Version:** 1.0 | **Authoritative field names**  
**Status:** CONTRACT / PROPOSED — do not assume unimplemented endpoints already exist.

## 1. Global conventions

| Rule | Contract |
|---|---|
| Management base URL | `http://127.0.0.1:8000` (Vite: call relative `/api/v1/...`) |
| Proxy | `http://127.0.0.1:8080` (test client sends traffic here, **not** management API) |
| Lab upstream | `http://127.0.0.1:8081` (mock Python server) |
| Content type | `application/json` for management API except health |
| All `/api/v1/*` endpoints | `Authorization: Bearer <PATCHPILOT_ADMIN_TOKEN>` required, including GET |
| Exception | `GET /health` is unauthenticated |
| JSON keys | `snake_case` everywhere; never mix with camelCase |
| Dates | UTC ISO 8601 strings e.g. `2026-11-01T08:00:00Z` |
| Pagination | `?limit=50&offset=0`; max limit 100; responses `{items,total,limit,offset}` |
| Missing token | `401` |
| Invalid token | `401`, generic response; no token or hints exposed |
| Invalid request | `422` Pydantic validation |
| Failed replay gate | `409` |
| Optional LLM not configured | `503` when explicitly requested `processing_mode=llm` |

**Standard non-422 error envelope:**

```json
{"error": {"code": "REPLAY_REQUIRED", "message": "Enforce mode requires a current passing replay."}}
```

The browser stores admin token **in React memory only**. No localStorage, query parameter, source commit, or console logging. Health remains public. Backend must reject callers without token even if API is bound to loopback.

## 2. Health — IMPLEMENTED baseline

### `GET /health`

Existing working backend health endpoint; do not remove or rename.

```json
{"status":"ok","service":"PatchPilot Backend","version":"0.1.0"}
```

### `GET http://127.0.0.1:8081/health` (lab)

Existing mocked lab service. `simulated_stack` describes a **simulation**, not an installed PHP runtime.

## 3. Core endpoints — REQUIRED MVP (PROPOSED)

### A. `GET /api/v1/overview`

Response `200`:

```json
{
  "environment": "local_lab",
  "is_simulated": true,
  "proxy": {"mode": "shadow", "ready_for_enforce": false},
  "traffic": {"total_requests": 0, "allowed_requests": 0,
              "shadow_matches": 0, "blocked_requests": 0},
  "lab": {"upstream": "127.0.0.1:8081", "status": "online",
          "simulated_stack": "Apache/2.4.52 + PHP/8.2.0"},
  "advisories": {"total": 0},
  "scanner": {"status": "not_implemented"},
  "generated_at": "2026-11-01T08:00:00Z"
}
```

- `lab.status` enum: `online | offline | unknown`.
- Counts are **observed data** derived from DB; zero is correct when there has been no traffic. Never silently populate invented activity.
- UI must show a prominent **LOCAL LAB / SIMULATED** label.

### B. `GET /api/v1/proxy/status`

```json
{
  "mode": "shadow",
  "ready_for_enforce": false,
  "enabled_rule_count": 1,
  "upstream": "127.0.0.1:8081",
  "last_replay_at": null,
  "updated_at": "2026-11-01T08:00:00Z"
}
```

### C. `PUT /api/v1/proxy/mode`

Request:

```json
{"mode":"enforce"}
```

Allowed `mode`: `off`, `shadow`, `enforce`. Response `200` uses same shape as proxy status. To set `enforce`, server checks each enabled rule: approved, digest matches most recent passing replay, fixtures `lab-v1`, >=5 benign with zero matches, >=1 attack fixture with 100% matches. Failure: `409 REPLAY_REQUIRED` or `409 RULE_NOT_APPROVED`; do not change current mode. Audit every accepted change.

### D. `POST /api/v1/proxy/rollback`

No JSON body. **Always sets mode to `shadow`** (not off) and logs an audit event; idempotent, even if already shadow.

```json
{"mode":"shadow","rolled_back":true,"message":"Enforcement disabled; shadow logging continues."}
```

### E. `GET /api/v1/rules`

```json
{
  "items": [
    {"id":1,"name":"Demo query marker","matcher_type":"query_param_equals",
     "match_config":{"name":"demo_attack","value":"true"},
     "enabled":true,"human_approved":true,"source_kind":"demo",
     "replay_passed":false,"rule_digest":"<64 lowercase hex chars>"}
  ],
  "total":1,"limit":50,"offset":0
}
```

`rule_digest` is informational; compute on server. **No general rule-edit/create endpoint in MVP**; seeded harmless demo rule only. Phase 2 requires rule-edit workflow and human review.

### F. `POST /api/v1/rules/{rule_id}/replay`

Runs a deterministic **offline fixture evaluation**. It does not send attack payloads to any server and never scans an external address. No request body in MVP. Response:

```json
{
  "run_id": 5,
  "rule_id": 1,
  "fixture_version": "lab-v1",
  "benign_total": 5,
  "benign_matches": 0,
  "attack_total": 1,
  "attack_matches": 1,
  "passed": true,
  "tested_at": "2026-11-01T08:04:00Z"
}
```

Replay is **passed** only when `benign_total >= 5`, `benign_matches = 0`, `attack_total >= 1`, and `attack_matches = attack_total`. Persist digest and audit the run. Reply `404` for unknown rule.

### G. `GET /api/v1/traffic?limit=50&offset=0`

```json
{
  "items": [
    {"id":8,"method":"GET","path":"/","mode":"shadow",
     "action":"shadow_match","status_code":200,"matched_rule_id":1,
     "duration_ms":9.2,"created_at":"2026-11-01T08:05:00Z"}
  ],
  "total":1,"limit":50,"offset":0
}
```

`action` enum: `allowed | shadow_match | blocked | upstream_error`. **Do not put raw query strings, request bodies, user IPs, tokens or cookies in API log results.** Return newest events first.

### H. `GET /api/v1/advisories?limit=50&offset=0`

```json
{
  "items":[
    {"id":1,"external_id":"CVE-2026-109618","title":"PHP request handling security advisory",
     "severity":"critical","summary":"Patch the affected PHP runtime promptly.",
     "source_kind":"official","source_url":"https://www.php.net/archive/2026.php",
     "verified":true,"generated_by":"manual",
     "created_at":"2026-11-01T08:10:00Z"}
  ],
  "total":1,"limit":50,"offset":0
}
```

Example only. **No advisory should be marked verified without matching actual authoritative-source evidence.** A user-pasted or AI-derived claim is not automatically official.

### I. `POST /api/v1/advisories/analyze`

Request:

```json
{
  "advisory_text":"A sample advisory describing affected PHP versions and upgrade guidance.",
  "languages":["en","ur","ur-Latn","ar","es"],
  "processing_mode":"fixture"
}
```

- `advisory_text` 1–12,000 characters.
- `languages` permitted: `en`, `ur`, `ur-Latn` (Roman Urdu), `ar`, `es`; deduplicate, max 5 for MVP.
- `processing_mode` enum: `fixture | llm` (explicit; never claim a fixture used an LLM). LLM needs valid server-side key; otherwise `503 LLM_NOT_CONFIGURED`.
- Freeform advisory text is **untrusted**. LLM must treat it as data and never follow instructions inside it. Output validated with strict Pydantic schema. No generated blocking rules/commands may be executed.

Response `200`:

```json
{
  "advisory": {
    "id":2,"external_id":null,"title":"Illustrative PHP security notice",
    "severity":"unknown","summary":"Review vendor guidance and update the runtime.",
    "source_kind":"demo","source_url":null,"verified":false,
    "generated_by":"fixture","created_at":"2026-11-01T08:12:00Z"
  },
  "localizations":[
    {"language_code":"en","title":"Security notice",
     "summary":"A sample advisory for the local lab.",
     "recommended_action":"Confirm the vendor bulletin and patch the runtime.",
     "generated_by":"fixture"},
    {"language_code":"ur","title":"سیکیورٹی اطلاع",
     "summary":"یہ مقامی تجربے کی ایک نمونہ اطلاع ہے۔",
     "recommended_action":"مستند اطلاع دیکھیں اور سافٹ ویئر اپ ڈیٹ کریں۔",
     "generated_by":"fixture"}
  ],
  "processing_mode":"fixture",
  "is_simulated":true
}
```

Shown localizations are illustrative; server should return exactly requested supported languages, or a documented error if unavailable. Unsupported locale: `422`. Do not invent vulnerability facts in translated text.

## 4. Phase 2 endpoints — NOT IMPLEMENTED / NOT required for MVP

| Method | Endpoint | Contract intent |
|---|---|---|
| `GET` | `/api/v1/inventory` | Show local PHP/OS/web-root + vendor/build; flag simulation |
| `POST` | `/api/v1/inventory/refresh` | Authorized local-only inventory refresh |
| `GET` | `/api/v1/scan/findings` | Paginated read-only scanner findings |
| `POST` | `/api/v1/scan/run` | Run bounded local scan, no arbitrary directory paths |
| `POST` | `/api/v1/scan/findings/{id}/quarantine` | Explicit approved quarantine, evidence, audit |
| `POST` | `/api/v1/scan/findings/{id}/restore` | Explicit safe restore |
| `POST` | `/api/v1/patch/verify` | Compare actual vendor/build to official fix source; may return `unknown` |
| `GET` | `/api/v1/audit` | Redacted chronological management audit |

Phase 2 schemas must be added to this file **before implementation** and reviewed by both teams. Team B must show "Coming soon" for these features until APIs and tests exist; never synthesize real scanner findings.

## 5. Frontend integration contract

Use one module `frontend/src/services/apiClient.js` for all HTTP calls. It selects `VITE_DATA_MODE=mock` or `real`. Mock data must follow the **exact same shapes** above and be visibly labeled `DEMO` in UI. Production build must never embed admin token or LLM provider API key.

```javascript
// Illustrative; use inside a function after runtime token has been entered.
const response = await fetch('/api/v1/proxy/status', {
  headers: { Authorization: `Bearer ${adminToken}` }
});
if (!response.ok) throw new Error(`Request failed (${response.status})`);
const status = await response.json();
```

Vite dev proxy should forward `/api` (and optionally health) to port `8000`, never forward API calls to proxy port `8080` or lab port `8081`. Only a separate lab demonstration/test client generates traffic through port `8080`.

### Suggested request state UI

- `loading`: spinner/skeleton, not hard-coded fake successes.
- `401`: return to Unlock Demo; clear token from memory.
- `409`: show why Enforce failed and offer Replay Test.
- `502`: display "Lab server unavailable" and keep dashboard usable.
- `503`: indicate LLM unavailable and offer explicit fixture demo.
- `network error`: display "Backend offline" and retry option.

## 6. Manual acceptance scripts

```powershell
# All shell commands run only against localhost.
# GET lab directly, then through proxy in Shadow mode:
curl.exe http://127.0.0.1:8081/health
curl.exe http://127.0.0.1:8080/health
curl.exe 'http://127.0.0.1:8080/?demo_attack=true'

# Management API calls require an admin token. Example shape:
# curl.exe -H "Authorization: Bearer <token>" http://127.0.0.1:8000/api/v1/proxy/status
```

The browser should not assume these endpoints exist until Team A/Team B implementation and test results confirm them.
