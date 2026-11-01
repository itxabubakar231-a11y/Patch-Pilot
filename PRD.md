# PatchPilot — Product Requirements Document (PRD)

**Version:** 1.0 (architecture baseline)  
**Date:** 2026-11-01  
**Status:** APPROVED DESIGN BASELINE — specifications, not a claim of implementation  
**Owner:** Four-person hackathon team (Team A: Backend & Security; Team B: Frontend & AI)

> **Read this first.** PatchPilot is a **local defensive prototype**, not a certified WAF, vulnerability fix, or production incident-response system. The application must always distinguish **SIMULATED**, **OBSERVED**, **AI-GENERATED**, and **VERIFIED** data. Never claim that request filtering completely mitigates PHP2Shell.

## 1. Product definition

**Name:** PatchPilot  
**Tagline:** Safe, Tested Temporary Mitigation and Compromise Detection for Self-Hosted Web Servers  
**One-liner:** PatchPilot helps administrators understand PHP risk, evaluate reversible request filters in a controlled environment, identify suspicious files, and verify permanent fixes—with clear multilingual guidance.

**Primary users:** Small organizations running self-hosted or legacy PHP applications: schools, NGOs, clinics, and small businesses with limited security staffing.

**Core user problem:** After a serious vulnerability disclosure, administrators need understandable advice, visibility into their local server, reversible interim controls, evidence of potential compromise, and confirmation that a permanent fix was applied. They must not assume a demo filtering rule provides complete protection against a runtime memory corruption vulnerability.

### Verified security context (as of 2026-11-01)

- PHP2Shell refers to **CVE-2026-109618** and **CVE-2026-109619**. The PHP project published fixes in **8.5.12, 8.4.27, 8.3.36 and 8.2.35** on 2026-10-21. See https://www.php.net/archive/2026.php and https://www.php.net/?p=6507 .
- **The PHP project states that there are no complete mitigations for these issues; upgrading is the only safe choice.** A generic HTTP regex rule must NOT be presented as a proven prevention of the underlying PHP memory corruption flaws.
- Vendor-backported PHP packages require **vendor advisory/build verification**; do not decide patch state from upstream version number alone.
- The initial lab's `Apache/PHP` banner is **simulated**. `lab/index.php` is an inert artifact; the currently implemented lab server is Python, not a running PHP interpreter.

## 2. Non-negotiable product principles

1. **Local-only by default:** Backend `127.0.0.1:8000`, proxy `127.0.0.1:8080`, lab `127.0.0.1:8081`, Vite frontend `127.0.0.1:5173`.
2. **Never test third-party targets.** All request/replay tests use the local inert lab and fixture data.
3. **Shadow before enforcement:** Evaluate deterministic rules without blocking; preserve an easy rollback to Shadow mode.
4. **No automatic enforcement from LLM output.** AI creates summaries and translations; rule activation requires explicit human review and a passing deterministic replay gate.
5. **Human approval for filesystem changes:** No automatic file removal/quarantine. Scanner is read-only until the operator explicitly confirms a specific file action.
6. **Sensitive data minimized:** Do not log bodies, credentials, cookies, authorization headers, full query strings, or scanner file contents.
7. **Honest status labels:** Working code = IMPLEMENTED; mock = DEMO; unbuilt feature = PLANNED; externally validated security claim = VERIFIED only with evidence.

## 3. Scope and priority

### MVP — build this first (required hackathon demonstration)

| ID | Module | Acceptance criterion | Primary owner |
|---|---|---|---|
| M1 | Local async reverse proxy | GET/POST from port 8080 reach fixed lab 8081 with expected status/body; no arbitrary upstream | Team A / Member 1 |
| M2 | Deterministic demo filtering | Exact harmless query parameter `demo_attack=true` matches one preapproved demo rule | Team A / Member 1 |
| M3 | Shadow / Enforce / Rollback | Shadow logs but forwards; Enforce returns 403 **only after replay passes**; Rollback immediately returns to Shadow | Team A / Member 1 |
| M4 | Replay against fixtures | Tests >=5 benign requests and >=1 simulated attack marker; zero benign matches, all attack fixtures matched | Team A / Member 1, reviewed by Member 2 |
| M5 | SQLite persistence and admin gate | Stores mode, rules, replay results, redacted traffic, and audit events; all `/api/v1` endpoints require local admin token | Team A / Member 1 |
| M6 | React command center | Four-zone responsive dark dashboard, clear DEMO labels, live mode/traffic display via API adapter | Team B / Member 3 |
| M7 | Advisory + translation demo | Parses one supplied advisory or safe example, validates structured output, provides plain-language localized summaries; fixture fallback clearly marked | Team B / Member 4 |
| M8 | Browser voice alert | User-initiated browser TTS for available voices with graceful unsupported-language fallback | Team B / Member 4 |

### Phase 2 — only after MVP tests pass

| ID | Feature | Constraint |
|---|---|---|
| P1 | Local PHP/OS/web-root inventory | Local scope; version and vendor/build provenance; clear simulated-vs-real tagging |
| P2 | CVE exposure matching | Verified advisory source and vendor-aware version ranges; uncertainty = `unknown`, never guessed |
| P3 | File compromise scanner | Signatures + Shannon entropy + optional AI triage; read-only first; bounded local `lab/www/` |
| P4 | Human-approved quarantine and restore | Realpath boundary, hashing, audit, explicit file selection, preserve restore path; no unattended changes |
| P5 | Patch verification and rule retirement recommendation | Compare actual installed runtime/vendor build to authoritative fixed guidance; never auto-retire rules |
| P6 | Richer rules/benign replay datasets | Strong validation and conservative rule syntax, no arbitrary unchecked regex from LLM |

**Explicitly out of scope for MVP:** Deploying to public/production sites; scanning the internet; running exploit payloads; claiming full PHP2Shell protection; customer account system; cloud WAF; Kubernetes; automated patch installation; autonomous quarantine; MCP servers; multi-tenant SaaS.

## 4. Users and stories

- **Administrator:** “I want to see whether our local demo protection is running and immediately revert blocking if a rule causes problems.”
- **Operator:** “I want to replay benign requests before enabling an allowlisted filter.”
- **Non-English-speaking user:** “I want a plain-language advisory in Urdu/Arabic/Spanish and an audio option when my browser supports it.”
- **Security reviewer (Phase 2):** “I want evidence behind a suspicious-file finding before approving quarantine.”
- **Patch maintainer (Phase 2):** “I want a version/vendor-specific patch verification report before deciding whether to retire a temporary rule.”

## 5. Demo journey (judge-facing)

1. Open the frontend and unlock with a **local demo admin token**; show **LOCAL LAB / SIMULATED** badge.
2. Start three services: lab `8081`, backend `8000`, proxy `8080`; frontend `5173`.
3. In **Shadow** mode request `/` and `/?demo_attack=true` through port `8080`. Both reach the lab; the latter is logged as `shadow_match`.
4. Trigger **Replay Test** on the seeded rule; show at least five benign fixtures with zero false positives and one simulated marker matching.
5. Change to **Enforce** only if the replay test is current and passes. Repeating the harmless marker returns `403` from PatchPilot; a normal request is still forwarded.
6. Hit **Rollback**; mode becomes Shadow again, with an audit record.
7. Show traffic events on the React dashboard. Submit/read a verified-source advisory or marked demo sample; show structured summary, translations, and optional browser TTS.
8. Describe scanner, inventory, and patch verification honestly as Phase 2 unless implemented and independently tested.

## 6. Nonfunctional requirements

- **Reliability:** Existing lab/backend health checks remain functional; unreachable upstream yields controlled `502` with an audit-safe log, not a crash.
- **Latency:** Development proxy should not block the async event loop; no performance SLA is claimed for MVP.
- **Accessibility:** Keyboard navigation, readable contrast, explicit text statuses (not colors alone), RTL support for Urdu/Arabic, optional speech with user initiation.
- **Security:** Bind only to loopback; fail closed on management authentication; strict fixed upstream; request/response privacy; admin mode changes auditable.
- **Maintainability:** Single source of truth is `docs/API.md` for JSON field names; `docs/DATABASE.md` for tables; `docs/ARCHITECTURE.md` for boundaries.
- **Developer workflow:** Four contributors, four feature branches, pull requests into `main`, no direct pushes to main for feature work.

## 7. Definitions of done

**Feature DONE** means: code committed in own branch, automated and manual tests pass, README or relevant doc updated, UI correctly labels demo/real data, no secrets or local database added to Git, and teammate reviewed its pull request.

**MVP DONE** means all M1–M8 acceptance criteria pass end-to-end in the isolated lab. If no live LLM API key is configured, the advisory demo may run on a **clearly labeled fixture**; it must not claim an actual AI inference occurred.

## 8. Known risks and decisions

| Risk | Decision |
|---|---|
| CVE does not have a safely testable HTTP signature | Do not pretend to mitigate it; demo rule is a harmless marker unrelated to PHP2Shell |
| LLM outputs mistaken CVE facts | Preserve source metadata, validate schema, show source/verification status, never use for auto-enforcement |
| Enforce mode blocks benign requests | Mandatory benign-fixture replay; immediate rollback; audit logging |
| All teammates use different assumptions | Six canonical documents; no undocumented API or database changes |
| Beginner team builds too much | MVP first; Phase 2 conditional on test completion |
| API key leaks | Backend-only environment variables; never embed in React bundle or source code |

## 9. Document precedence

1. This PRD defines **scope and safety requirements**.
2. `docs/ARCHITECTURE.md` defines components, trust boundaries and ports.
3. `docs/API.md` is authoritative for endpoint and JSON contracts.
4. `docs/DATABASE.md` is authoritative for persistence schema.
5. `docs/DESIGN.md` defines UI behavior and design conventions.
6. `docs/DEVELOPMENT_PLAN.md` defines ownership, agent instructions and merge discipline.

If documents conflict, **stop and raise a documented decision**; do not let an AI agent silently invent the missing behavior.
