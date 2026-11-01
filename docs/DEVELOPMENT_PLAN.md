# PatchPilot — Development Plan & Antigravity Agent Rules

**Version:** 1.0 | **Project team:** 4 beginners, 2 collaborative teams, individual module ownership  
**Status:** APPROVED WORKFLOW — start implementation only after GitHub access is ready.

## 1. Team structure (canonical ownership)

**Approach: Team-based collaboration + individual module ownership.** Everyone reads all six docs, but each contributor edits only their assigned component unless jointly agreed.

| Member | Team | Branch | Primary files / deliverables |
|---|---|---|---|
| Member 1 | A — Backend/Security | `feature/proxy` | `backend/app/proxy_app.py`, `services/proxy_service.py`, `services/rule_engine.py`, `services/replay_service.py`, `api/proxy.py`, `api/traffic.py`, core auth/db and proxy tests |
| Member 2 | A — Security/QA | `feature/scanner` | Phase 1 lab fixtures, proxy/false-positive tests and evidence; Phase 2 inventory and `scanner` services + tests |
| Member 3 (dashboard lead) | B — Frontend/AI | `feature/dashboard` | `frontend/src/App.jsx`, `features/dashboard/`, `components/`, `services/apiClient.js`, mock fixtures |
| Member 4 | B — AI/Language | `feature/ai` | `backend/app/services/advisory_service.py`, `backend/app/api/advisories.py`, `frontend/src/features/advisories/` + advisory tests |

**Important shared-file rule:** Member 1 owns `backend/app/main.py` router registration, and `backend/app/core/db.py` migrations. Member 4 submits isolated router/service changes; Member 1 (or an agreed integrator) connects the advisory router and adds advisory migrations. Member 3 owns `frontend/src/App.jsx`; Member 4 exports advisory components rather than independently rewriting App. Member 2 should add test fixtures instead of editing proxy core without coordination.

**Priority:** Member 2's scanner/inventory work is Phase 2. During MVP, Member 2 contributes replay fixtures, safety review and tests—important work that prevents Member 1 being overloaded.

## 2. GitHub setup and collaboration rules

Repository: `https://github.com/itxabubakar231-a11y/Patch-Pilot`

1. Three invited collaborators **accept their GitHub invitations** before first push.
2. Every teammate installs Git, Python and Node.js as needed, clones repository into their laptop, opens folder in Antigravity.
3. Create branch from current `main`, not from another feature branch.
4. Use commits with short meaningful messages, e.g. `feat(proxy): add shadow logging`.
5. Open a pull request (PR) into `main`. Another teammate checks functionality, tests, and scope; then merge.
6. Never force push to shared branches; never commit `.env`, API keys, `backend/data/*.db`, `.venv`, `node_modules`, or generated artifacts.
7. Before starting new work: fetch/pull newest `main` and check for relevant merged contract changes.

Example commands for each member (replace branch name):

```powershell
git clone https://github.com/itxabubakar231-a11y/Patch-Pilot.git
cd Patch-Pilot
git switch main
git pull --ff-only origin main
git switch -c feature/dashboard
git push -u origin feature/dashboard
```

For the person whose current local project is already the repository, **do not clone again**; start with `git status`, confirm correct project path, then create a branch from current `main`.

## 3. Agent operating instructions (MANDATORY)

**Paste these rules into every Antigravity coding task:**

> You are implementing PatchPilot, a local defensive hackathon prototype. Before editing, read `PRD.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/API.md`, `docs/DESIGN.md` and `docs/DEVELOPMENT_PLAN.md`. Identify the current task's owner and exact file boundaries. Follow existing contract names and ports literally. Distinguish IMPLEMENTED from PROPOSED and DEMO from OBSERVED. If a decision is missing or documents contradict, STOP and report the question; do not invent a new endpoint or schema. Work in the feature branch, make one small cohesive change, run relevant tests, report exact files modified, commands, results and any remaining limitations. Do not quietly change other members' files.

**Security rules for every agent:**

- Operate only inside the owned local project and isolated lab; do not scan third-party systems, send exploit payloads, or connect to production servers.
- No unchecked LLM regex rules or auto-blocking derived from advisories; use only the inert `demo_attack=true` fixture for MVP.
- Never claim filtering is a complete mitigation of PHP2Shell; PHP official guidance says patching is necessary.
- No automatic deletion/quarantine, no secret logging, no embedding API tokens in React, no `.env` commit.
- Do not change ports, endpoint names, JSON keys, directory ownership, database models, or authentication strategy without an agreed documentation change.
- Never run destructive shell commands, force pushes, dependency upgrades, or external-service integrations without explicit approval.
- If a test fails, report it; do not manufacture PASS results.
- Keep new dependencies minimal and explain why each is needed.
- Prefer code that's readable to beginners; comments for non-obvious security behavior are valuable.

**Antigravity task format:**

```text
TASK: [one feature only]
OWNER: [Member 1/2/3/4]
BRANCH: feature/[...]
READ: PRD.md and all 5 docs/*.md
ALLOWED FILES: [explicit list]
MUST IMPLEMENT: [API/behavior exact contract]
DO NOT TOUCH: [other members' files; any unrelated setup]
TESTS: [specific smoke/unit cases]
REPORT: changed files, exact commands, actual output, status/limitations
```

## 4. Recommended sequence (no guessed deadline)

### Sprint 0 — Repository and contract freeze

- [ ] All three collaborator invitations accepted.
- [ ] All members can clone and run their assigned local environment.
- [ ] Merge six documentation files into `main` as one reviewed PR.
- [ ] Each member creates own feature branch **from the updated main**.
- [ ] Agree on `API.md` v1 JSON keys, supported locale codes, status enums, and token design.
- [ ] Resolve any mismatch in the source README (e.g., PowerShell activation line) in a small reviewed PR.

### Sprint 1 — Independently running pieces

| Member | Task | Evidence to share |
|---|---|---|
| 1 | Separate proxy ASGI app on 8080 forwarding GET/POST to fixed 8081 | Curl: /health reaches lab via proxy; upstream errors handled |
| 2 | `lab-v1` fixtures (5+ benign, 1+ harmless marker) and proxy tests | Pytest report with tests; no real exploit payloads |
| 3 | Four-zone React dark dashboard in explicit mock mode | Screenshot + `npm run build` pass |
| 4 | Pydantic advisory schema and deterministic `fixture` response; language UI skeleton | Advisory JSON matches API contract and renders in UI |

### Sprint 2 — Protection workflow + integration

| Member | Task | Acceptance |
|---|---|---|
| 1 | SQLite mode/rules/traffic/audit, auth, replay gate, mode/rollback/traffic APIs | Shadow forwards and logs; enforce only after passing replay; rollback logs change |
| 2 | Edge tests: bad tokens, benign request compatibility, stale replay digest, 502, no raw-query logging | Automated tests; 409 gate confirmed |
| 3 | Real API adapter `/api/v1`, unlock demo, status/traffic/rule actions, loading/error handling | UI works against FastAPI + demo label; no mock fallback on network failure |
| 4 | Advisory API fixture/optional LLM structured output, localization and user-initiated TTS | Fixture clearly labeled; no provider token in browser |

### Sprint 3 — End-to-end demo and hardening

- [ ] Run lab, backend, proxy, React concurrently on the four agreed ports.
- [ ] Exercise harmless marker in Shadow; verify `shadow_match` and upstream success.
- [ ] Run `lab-v1` replay; show zero benign matches, all marker fixtures matched.
- [ ] Enable Enforce; verify marker returns 403, benign request still reaches lab.
- [ ] Rollback; verify marker once more reaches lab and is logged in Shadow.
- [ ] Show traffic counters, dashboard state, advisory source and language/TTS.
- [ ] Stop lab server; proxy returns controlled 502; UI displays offline state.
- [ ] Review evidence, README, screenshots, demo script and limitations.

### Sprint 4 — Optional Phase 2 only if MVP is stable

Member 2: local inventory and scanner (read-only first), bounded files, inert fixtures, human-approved quarantine. Member 1: patch-verification API with vendor evidence and safe rule retirement recommendation. Member 3: corresponding UI screens. Member 4: advisory enrichment/translation reliability. No one should block the working MVP waiting for Phase 2.

## 5. Dependencies and integration order

```text
Document contract + fixtures
  |-- Member 1 builds proxy/API/db/token -------> real backend data
  |-- Member 2 builds replay fixtures/tests ----> evidence for enforcement gate
  |-- Member 3 builds UI with identical mocks --> switch to real API adapter
  `-- Member 4 builds advisory service/UI -----> integrate router + UI component

   Pair testing / PR review / merge --> full local demonstration
```

**Integration checkpoints:**

- **A↔B:** Team A and Team B agree endpoint/schema before either implements it.
- **Member 1↔4:** Auth and DB API conventions confirmed before AI endpoint merge.
- **Member 3↔4:** Advisory component export props agreed (`advisory`, `localizations`, `onAnalyze`, `loading`) before UI integration.
- **Member 1↔2:** Rule digest and `lab-v1` replay pass criteria agreed before enforcement test.

## 6. Testing matrix (minimum)

| Test | Owner | Expected |
|---|---|---|
| Backend `/health` | 1 | 200, expected JSON |
| Lab `/health` | 2 | 200 with simulated label |
| GET/POST proxy forwarding | 1 | Same method/body to fixed local upstream; safe response |
| Upstream offline | 1/2 | 502 and `upstream_error` event; no traceback exposed |
| Shadow marker | 1/2 | Lab receives request; `shadow_match`; not 403 |
| Replay fixtures | 2 | >=5 benign, zero benign matches; >=1 marker, 100% matches |
| Enforce without current replay | 1/2 | HTTP 409; mode unchanged |
| Enforce after replay | 1/2 | Marker request gets 403; normal request passes |
| Rollback | 1/3 | Mode Shadow and audit event; traffic forwarded again |
| Unauthenticated management | 1/2 | 401 for every `/api/v1` route |
| Secrets/logging | 1/2 | Never persist token, full query, cookie, request body |
| React build | 3 | `npm run build` success |
| Mock vs live | 3 | Demo labels persist; real outage never silently becomes mock |
| RTL and TTS | 4 | Urdu/Arabic RTL, Roman Urdu LTR; voice fallback works |
| LLM unavailable | 4 | 503 for explicit `llm`; fixture mode visibly separate |

### Mandatory peer-review questions

1. Is this feature **in MVP scope**, or did the agent quietly add Phase 2?
2. Do route names, JSON keys, modes and enum values **exactly** match `API.md`?
3. Are data, claims, and indicators explicitly **demo / observed / verified**?
4. Are tokens and files safe? Are privileged actions authenticated, audited and reversible?
5. Did tests actually run, and can a different teammate reproduce them?

## 7. Definition of complete PR

A PR should include: purpose, files modified, commands run, actual test outputs, screenshots (for UI), known limitations, related doc updates, and reviewer sign-off. **No feature goes straight into `main` because an AI agent says it works.** Review it.

## 8. Team communication template

```text
Module:
Owner / branch:
What is working (verified):
What is still planned:
API endpoints and exact JSON used:
Tests run + results:
Files changed:
Help needed from other member:
```

## 9. Final hackathon story

> PatchPilot demonstrates a **local, reversible security workflow**: incoming traffic is observed in Shadow mode, deterministic demo rules are replay-tested against benign fixtures, a human can enable limited local blocking and instantly roll back, and administrators can read accessible multilingual advisories. The demonstrated filter does not claim to fix PHP2Shell; official PHP updates remain the proper remediation.

**Start small, verify each claim, and only then expand.**
