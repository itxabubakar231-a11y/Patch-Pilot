# PatchPilot — System Architecture

**Version:** 1.0 | **Scope:** MVP baseline plus explicit Phase 2 boundaries  
**Cross-reference:** `../PRD.md`, `API.md`, `DATABASE.md`, `DESIGN.md`, `DEVELOPMENT_PLAN.md`

## 1. Architecture in one diagram

```text
Browser / React + Vite (127.0.0.1:5173)
   |
   | GET/POST /api/v1/* with Authorization: Bearer <local admin token>
   | (Vite dev proxy forwards /api to 127.0.0.1:8000)
   v
FastAPI MANAGEMENT API (127.0.0.1:8000)
   |-- auth dependency + audit --> SQLite (backend/data/patchpilot.db)
   |-- proxy status / replay / rollback
   |-- traffic query + overview
   `-- advisory parser -> optional LLM provider (explicit opt-in)
                           [NO user-controlled network URL]

Demo HTTP client --> PROXY app (127.0.0.1:8080)
                       |-- read mode + approved rules from SQLite
                       |-- inspect defined query marker only
                       |-- append redacted traffic event
                       |-- if enforce and approved+replay passed: 403
                       `-- otherwise -> fixed lab upstream
                                        127.0.0.1:8081
                                        Python dummy HTTP server
                                        (NOT a real PHP runtime)

Phase 2 local-only: inventory, scanning of lab/www, approved quarantine,
                    vendor-aware patch verification (never auto-upgrade)
```

**Ports are fixed for the hackathon:** frontend `5173`, management API `8000`, security proxy `8080`, lab upstream `8081`. Bind server listeners to `127.0.0.1`, not `0.0.0.0`.

## 2. Current repository vs planned code

**Already present in repository (verified from its published README, 2026-11-01):**

```text
backend/app/main.py          # FastAPI health endpoint (management app)
backend/requirements.txt
frontend/src/App.jsx         # starter React UI
frontend/src/main.jsx
frontend/src/index.css
lab/server.py                # Python mock target; 8081
lab/index.php                # inert example file, not a PHP runtime
README.md
.gitignore
```

**PROPOSED additions; agents must implement incrementally, not assume they exist:**

```text
backend/app/
  main.py                   # management FastAPI app, include routers
  proxy_app.py              # distinct FastAPI/ASGI app on port 8080
  api/
    proxy.py                # status, change mode, rollback, replay
    traffic.py              # overview, traffic records
    advisories.py           # advisory analysis and translations
  core/
    config.py               # env configuration and fixed paths
    auth.py                 # constant-time bearer token validation
    db.py                   # SQLite connections, schema initialization
  services/
    proxy_service.py        # httpx forwarding; never arbitrary upstream
    rule_engine.py          # deterministic query-param matcher
    replay_service.py       # local fixture evaluation and test gate
    advisory_service.py     # schema validation, demo/LLM selection
  data/                     # SQLite database at runtime; git-ignored
  tests/
frontend/src/
  components/               # shared presentational components
  features/
    dashboard/              # overview and traffic UI (Member 3)
    advisories/             # advisory/translation/TTS (Member 4)
  services/apiClient.js     # single fetch boundary, mock/real adapter
  mocks/                    # clearly labeled static fixture JSON
lab/fixtures/               # harmless request-replay fixtures
```

Avoid unnecessary abstractions, Docker, queues or microservices for MVP.

## 3. Responsibilities and trust boundaries

| Component | May do | Must not do |
|---|---|---|
| React frontend | Render statuses, mock mode for UI, send authorized admin API requests | Read/write SQLite, embed real API keys, directly change local files |
| Management API :8000 | Authenticate, validate, audit, read/write DB, execute local fixture replay, delegate advisory parser | Accept remote targets, trust LLM as a policy source, expose unauthenticated management data |
| Proxy :8080 | Inspect allowlisted parts of requests, apply tested demo rules, forward to exactly `127.0.0.1:8081` | Proxy arbitrary URLs, run exploit payloads, scan external services |
| Lab :8081 | Return harmless responses and a **simulated** server banner | Execute arbitrary PHP or pretend to be real Apache/PHP |
| Optional LLM provider | Convert supplied advisory text to schema-validated explanatory data | Supply activated blocking rules, write files, change security settings |
| SQLite | Persist state, redacted traffic, replay and audit evidence | Store credentials, raw HTTP bodies, web-shell contents |

The only optional external network call in MVP is a user-initiated, configured LLM API request. Default fixture mode needs no internet. No public-web CVE fetching or uncontrolled URL retrieval in MVP.

## 4. Data flows

### A. Normal request

1. Request enters `127.0.0.1:8080`.
2. Rule engine checks only an allowlisted, parsed query parameter (`demo_attack`); not raw unbounded regular expressions.
3. If no match, forward request to **fixed** `http://127.0.0.1:8081` with `httpx.AsyncClient` and return upstream response.
4. Write a redacted traffic record to SQLite (`allowed`, status code, elapsed milliseconds, path only).

### B. Shadow match

1. Rule matches `demo_attack=true`.
2. If mode `shadow`, still forward to the lab, and record `shadow_match`.
3. Dashboard reflects the match as **observed, not blocked**.

### C. Enforce match

1. Authorized administrator requests mode `enforce`.
2. Backend checks that each enabled rule is approved and has a **passing replay for its current digest and fixture version**. Otherwise reject with HTTP `409`.
3. Matched demo request receives `403` from PatchPilot, not from the lab, and is recorded as `blocked`.
4. Rollback endpoint immediately switches mode to `shadow`, creates an audit event, and leaves rules stored for review.

### D. Advisory

1. User submits textual advisory input (maximum 12,000 chars) with requested locales.
2. Backend uses either a deterministic **DEMO** fixture or the configured LLM provider; it validates returned JSON with Pydantic.
3. AI output includes attribution and `processing_mode: fixture | llm`; source-vs-model assertions remain distinct.
4. React shows localization and browser TTS where available. AI text does not change proxy configuration.

## 5. HTTP proxy engineering constraints

- Use a **single long-lived** `httpx.AsyncClient` managed by ASGI lifespan; set connect/read timeouts and connection limits.
- Preserve safe request method, path, query string, body and response semantics for the lab (support at minimum GET/POST). Keep request/response streaming and upload-size limits under review.
- **Strip hop-by-hop headers** (`Connection`, headers nominated by `Connection`, `Keep-Alive`, `Proxy-Authenticate`, `Proxy-Authorization`, `TE`, `Trailer`, `Transfer-Encoding`, `Upgrade`); let the HTTP client calculate `Host`/body framing.
- Never forward hop-by-hop headers from the upstream response. Avoid blindly forwarding `Content-Length` after any body transformation. Preserve status codes and safe end-to-end response headers.
- Reject non-loopback outbound destinations by using an immutable configured base URL; do not accept `url=`, `host=`, or `upstream=` from any request.
- Do not log `Authorization`, cookies, payloads or raw query strings; strip query from saved path.
- Unreachable upstream -> `502 Bad Gateway` with a generic response; log `upstream_error`.
- MVP rule matches `demo_attack=true` as an **exact parsed query-parameter value**; not an arbitrary regex over a URL.
- For MVP testing, no claim is made that the proxy resists high traffic or all HTTP ambiguity cases. Production hardening is out of scope.

## 6. Database and process model

- SQLite lives at `backend/data/patchpilot.db`, always ignored by Git.
- Backend :8000 and proxy :8080 are **separate processes** sharing one local SQLite DB. State **must be persisted**, not stored in separate process-local globals.
- Initialize database schema once (idempotent migration/startup), use WAL + busy timeout and brief transactions.
- Mode defaults to `shadow` on first initialization. The proxy must read updated mode promptly (per request or bounded refresh); rollback cannot rely on restarting the process.
- Use UTC ISO-8601 strings in API and database; `Z` in API examples.

## 7. Authentication and authorization — MVP choice

**No full signup/login system in MVP.** A single local admin bearer token gates **all** `/api/v1/*` endpoints (reads and writes). `GET /health` is public.

- Backend reads `PATCHPILOT_ADMIN_TOKEN` from its private environment at startup; fail startup or refuse management access if missing/weak.
- Frontend shows **Unlock Demo** input; user types token. React keeps it **in memory only** (not localStorage, sessionStorage, URL or repo files) and sends `Authorization: Bearer <token>` on API requests.
- Vite dev proxy routes `/api` to `http://127.0.0.1:8000` to avoid ad hoc cross-origin behavior. If CORS is used directly, allow only the explicit local dev origin; never `*` with credentials.
- No accounts, password resets, JWT issuance, refresh tokens, or remote access in MVP.
- Mutations (mode changes, replay, future quarantine) must log audit events; all failures avoid exposing token details.
- A local bearer token is a **demo-only admin gate**. Review authentication, network isolation, TLS, CSRF/session design and authorization before any wider deployment.

## 8. Invariants and ownership boundaries

- **Every security-modifying API call is authenticated and audited.**
- **Rule replay MUST precede enabling Enforce.** Editing a rule changes its digest and invalidates previous replay approvals.
- **No external scanning, and no automated irreversible filesystem changes.**
- **All UI numbers come from API or clearly labeled fixture data.**
- **Team A owns proxy, auth core and DB bootstrap. Team B's AI member owns only advisory router/service plus advisory UI; coordinate router registration and shared DB changes with Team A.** See `DEVELOPMENT_PLAN.md`.

## 9. Security limits of the demonstration

PHP2Shell is a PHP runtime issue. Blocking the harmless demo query marker establishes that our **reversible filtering mechanism works in the local lab**; it does not establish effective mitigation of CVE-2026-109618/109619. The official PHP security advisory recommends patching promptly and says no complete mitigation exists. Do not report the lab as protected against these CVEs. Source: https://www.php.net/archive/2026.php .
