# PatchPilot

> **Defensive Security Proxy & Management Prototype for Isolated PHP Lab Environments**

PatchPilot is an experimental, local-only defensive security toolkit built to monitor, evaluate, and demonstrate reversible query parameter filtering in an isolated testbed. It pairs an asynchronous Python reverse proxy with an authenticated FastAPI management service and a React cyber command-center dashboard.

---

> [!IMPORTANT]
> **Safety & Scope Invariant:** PatchPilot is a local research prototype and educational demonstration. It is **not** a production Web Application Firewall (WAF), is not intended for external internet facing deployments, and is **never a replacement for official vendor security patches**. All request evaluation operates strictly on harmless demo query markers (`demo_attack=true`) against an inert loopback dummy server. No actual exploit payloads or automated attacks are included, and no external networks are ever scanned.

---

## 📁 Repository Structure

```text
PatchPilot/
├── backend/                  # Python 3.10+ ASGI backend services
│   ├── app/
│   │   ├── api/              # Management routers (proxy, traffic, advisories)
│   │   ├── core/             # Auth, loopback configuration, SQLite DAL
│   │   ├── fixtures/         # Local benchmark advisory fixtures
│   │   ├── schemas/          # Pydantic request/response models
│   │   ├── services/         # Proxy forwarding, rule engine, replay gate, advisory analyzer
│   │   ├── main.py           # Management API service (port 8000)
│   │   └── proxy_app.py      # Security reverse proxy service (port 8080)
│   ├── data/                 # SQLite live database directory (git-ignored)
│   ├── tests/                # Automated pytest suite (uses isolated temp DBs)
│   └── requirements.txt
├── frontend/                 # React 18 + Vite + Tailwind CSS dashboard
│   ├── src/
│   │   ├── components/       # AppShell, AdminUnlock, EnvironmentBanner, Icons
│   │   ├── features/
│   │   │   ├── dashboard/    # Zones 1–3: Overview, Traffic Monitor, Shield Controls
│   │   │   └── advisories/   # Zone 4: Multilingual Advisory Panel & Web Speech TTS
│   │   ├── mocks/            # Static fixtures for offline UI demonstration
│   │   └── services/         # API client & data adapter (mock vs real mode)
│   ├── package.json
│   └── vite.config.js
├── lab/                      # Isolated dummy HTTP upstream testbed
│   ├── server.py             # Minimal Python HTTP dummy target (port 8081)
│   ├── index.php             # Inert PHP code artifact (not a running runtime)
│   └── fixtures/
│       └── lab_v1.json       # Harmless replay test fixture dataset (7 benign, 3 marker)
├── docs/                     # Authoritative design, API, and architectural contracts
│   ├── API.md                # Source-of-truth API specification
│   ├── ARCHITECTURE.md       # Component architecture and boundaries
│   ├── DATABASE.md           # SQLite schema and query specifications
│   ├── DEMO_SCRIPT.md        # Step-by-step presentation demonstration guide
│   └── DEVELOPMENT_PLAN.md   # Sprint roadmap and acceptance criteria
└── README.md
```

---

## 🏗️ Architecture & Network Ports

All services bind strictly to loopback (`127.0.0.1`). Port numbers are fixed across the project:

| Service | Port | Description |
|---|---|---|
| **Upstream Lab** | `8081` | Safe dummy HTTP target (`lab/server.py`) simulating an Apache/PHP environment banner. |
| **Security Proxy** | `8080` | Asynchronous reverse proxy (`app.proxy_app:app`) inspecting allowlisted query parameters. |
| **Management API** | `8000` | Authenticated FastAPI service (`app.main:app`) managing rules, replays, traffic, and advisories. |
| **Frontend UI** | `5173` | React dashboard (`Vite dev server`) providing four command-center zones. |

### Component Data Flow

```text
       [ Demonstration Client / curl ]
                      |
                      | (HTTP Requests)
                      v
      +-------------------------------+
      |  Security Proxy (Port 8080)   | <=== Re-checks Replay Gate on EVERY request
      +-------------------------------+
         |                         |
         | (If Blocked in Enforce) | (If Allowed / Shadow)
         v                         v
     [HTTP 403]       +-------------------------+
                      |   Upstream Dummy Lab    |
                      |       (Port 8081)       |
                      +-------------------------+
                                   ^
                                   | Health probe (/health)
+------------------------+         |
|   Frontend Dashboard   |         |
|      (Port 5173)       |         |
+------------------------+         |
           |                       |
           | (/api/v1 via Vite proxy)
           v                       |
+------------------------------------+
|    Management API (Port 8000)      |---+
+------------------------------------+   |
                   |                     |
                   v                     v
          [ SQLite Database: backend/data/patchpilot.db ]
```

---

## 🚀 Quick Start Guide (Windows PowerShell)

To observe and operate live services, open **five separate Windows PowerShell terminals** (one per process plus a test terminal).

### Prerequisites
* **Python 3.10+** (accessible via `python` or `py`)
* **Node.js 18+** & **npm**

---

### Step 1: Environment Setup (Run once before starting services)

In a PowerShell terminal, prepare the backend Python virtual environment:
```powershell
cd <repo-root>\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Prepare the frontend dependencies:
```powershell
cd <repo-root>\frontend
npm ci
```

---

### Step 2: Start the Five Terminals

#### Terminal 1 — Upstream Dummy Lab (Port 8081)
Starts the inert Python dummy target simulating an Apache/PHP web application:
```powershell
cd <repo-root>
python lab/server.py
```
*Listens strictly on `http://127.0.0.1:8081`.*

#### Terminal 2 — Security Reverse Proxy (Port 8080)
Starts the ASGI reverse proxy forwarding traffic to port 8081:
```powershell
cd <repo-root>\backend
.\.venv\Scripts\Activate.ps1
uvicorn app.proxy_app:app --host 127.0.0.1 --port 8080 --no-access-log
```
> [!NOTE]
> **Why `--no-access-log` is required:** Default uvicorn access logging prints the complete raw URL—including full query strings—to the terminal. PatchPilot strictly enforces privacy redaction; passing `--no-access-log` ensures that raw query parameters are never leaked to stdout. The application logs only sanitized HTTP methods and pathnames.

#### Terminal 3 — Management API (Port 8000)
Starts the administrative control plane. The user picks any private token of at least 16 characters and sets it only in that terminal session:
```powershell
cd <repo-root>\backend
.\.venv\Scripts\Activate.ps1
$env:PATCHPILOT_ADMIN_TOKEN = "<YOUR_ADMIN_TOKEN>"
uvicorn app.main:app --host 127.0.0.1 --port 8000
```
*Listens on `http://127.0.0.1:8000`. Management routes require `Authorization: Bearer <PATCHPILOT_ADMIN_TOKEN>`.*

#### Terminal 4 — Frontend Dashboard (Port 5173)
Starts the React command-center interface in live API mode:
```powershell
cd <repo-root>\frontend
$env:VITE_DATA_MODE = "real"
npm run dev
```
Open `http://127.0.0.1:5173/` in your browser. Click **Unlock Admin** in the top navigation, enter your configured admin token (`<YOUR_ADMIN_TOKEN>`), and click **Unlock**. Do not use the **Quick Demo Unlock** button, which is intended only for testing the simulated mock dashboard.

> [!TIP]
> **Mock vs. Real Mode:**
> * `VITE_DATA_MODE="mock"` (default): Runs offline against in-memory mock fixtures without contacting port 8000. The interface displays `Data: Mock Fixture`.
> * `VITE_DATA_MODE="real"`: Connects through Vite's dev proxy to the FastAPI backend on `127.0.0.1:8000`. The header displays `Transport: API (127.0.0.1:8000)` and Zone 2 displays `Data: Live Backend` with verified SQLite live telemetry.

#### Terminal 5 — Test & Demonstration Client
Use this terminal to send test traffic through the proxy and management API:
```powershell
# 1. Verify health endpoints
curl.exe http://127.0.0.1:8081/health
curl.exe http://127.0.0.1:8080/health
curl.exe http://127.0.0.1:8000/health

# 2. Test proxy forwarding in default Shadow mode
curl.exe http://127.0.0.1:8080/
curl.exe "http://127.0.0.1:8080/?demo_attack=true"
```

---

## 💾 Database Location & Reset Procedure

* **File Location:** `backend/data/patchpilot.db`
* **Auto-Initialization:** The database file, tables, and seeded demo rule (`demo_attack=true`) are created automatically on service startup by `init_db()`.
* **Git Status:** The entire `backend/data/` directory is ignored by Git (`.gitignore`) to prevent committing local state or logs.

### How to Reset the Database
To restore a completely pristine state:
1. Stop the proxy (Terminal 2) and management API (Terminal 3) using `Ctrl + C`.
2. Delete the `backend/data` directory in PowerShell:
   ```powershell
   Remove-Item -Recurse -Force backend\data
   ```
3. Restart Terminals 2 and 3. The schema and default demo rule will be re-seeded cleanly.

---

## 🧪 Running the Automated Test Suite

All tests execute from the `backend/` directory:

```powershell
cd <repo-root>\backend
.\.venv\Scripts\Activate.ps1
python -m pytest tests -q
```

### Test Isolation Invariant
Pytest runs under strict database isolation:
* The global test fixture (`backend/tests/conftest.py`) sets `PATCHPILOT_DB_PATH` to a clean temporary file (`tmp_path`) for every test.
* Test execution snapshots file metadata (`st_mtime_ns` and `st_size`) and verifies during teardown that the live database file (`backend/data/patchpilot.db`) was **never created, deleted, or modified** by the test suite.

---

## 📡 Management API Summary (`/api/v1`)

All `/api/v1` routes require `Authorization: Bearer <PATCHPILOT_ADMIN_TOKEN>`. The authoritative specification is maintained in [`docs/API.md`](docs/API.md).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/overview` | High-level system posture, proxy mode, traffic totals, and lab health status. |
| `GET` | `/api/v1/proxy/status` | Current proxy defense mode, rule count, and replay gate readiness. |
| `PUT` | `/api/v1/proxy/mode` | Sets proxy mode (`off`, `shadow`, `enforce`). Requires passing replay gate to enter `enforce`. |
| `POST` | `/api/v1/proxy/rollback` | Reverts mode to `shadow` and logs an audit record. Idempotent. |
| `GET` | `/api/v1/rules` | Paginated list of security rules, match configurations, and SHA-256 rule digests. |
| `POST` | `/api/v1/rules/{id}/replay` | Runs deterministic offline replay of `lab-v1` fixtures against the rule. |
| `GET` | `/api/v1/traffic` | Paginated, chronologically ordered, privacy-redacted traffic event logs. |
| `GET` | `/api/v1/advisories` | List of security advisories (served from deterministic fixture by default) and evaluation metadata. |
| `POST` | `/api/v1/advisories/analyze` | Generates structured multilingual advisories via deterministic offline fixture by default (or optional LLM). |

### Standard Non-422 Error Envelope
```json
{
  "error": {
    "code": "REPLAY_REQUIRED",
    "message": "Enforce mode requires a current passing replay."
  }
}
```

---

## 🛡️ Security & Privacy Invariants

1. **Strict Loopback Binding:** Every server binds strictly to `127.0.0.1`. Remote network interfaces (`0.0.0.0`) are forbidden.
2. **Fixed Upstream Target:** The proxy forwards only to `http://127.0.0.1:8081`. Arbitrary upstream destination parameters or dynamic target proxying are rejected by design.
3. **Fail-Closed Management Auth:** If `PATCHPILOT_ADMIN_TOKEN` is unset or shorter than 16 characters, the management API fails closed and rejects all requests with HTTP 401. Comparison uses constant-time `secrets.compare_digest`.
4. **Privacy-Preserving Logs:** Traffic logs in SQLite store only sanitized HTTP method, normalized path (maximum 200 characters), proxy mode, action, status code, and duration. Query strings, request bodies, cookies, client IP addresses, and Authorization headers are **strictly stripped and never saved to disk**.
5. **Per-Request Gate Verification & Fail-Back:** In `enforce` mode, the proxy re-checks rule approval, config digests, and replay status on **every incoming request**. If any condition is violated (e.g. an unapproved rule or stale replay), the proxy immediately executes an atomic fail-back (`downgrade_enforce_to_shadow`), logs an audit event, and forwards the request safely in Shadow mode rather than dropping traffic.

---

## ⚠️ Known Limitations & Scope Boundaries

* **Query Parameter Matcher Only:** PatchPilot only implements the exact `query_param_equals` matcher. It evaluates allowlisted query parameters. Regular expressions, request bodies, and headers are not inspected by rules.
* **PHP Parameter Normalization Differences:** Standard PHP runtimes normalize certain characters in query keys (e.g., converting spaces and dots `.` into underscores `_`) and support array bracket syntax (`demo_attack[]=true`). PatchPilot’s exact matcher uses standard URL parsing and does not emulate PHP's internal parameter mangling.
* **Simulated Upstream Lab:** `lab/server.py` is a lightweight Python script that returns simulated Apache/PHP headers (`X-Powered-By: PHP/8.2.0`). It only implements `do_GET`. It does not execute real PHP, and returns HTTP 501 for POST requests (which the proxy forwards unchanged).
* **Single Local Admin Token:** Authentication relies on a single shared secret in memory. There is no multi-user role-based access control (RBAC), database user table, or persistent session management.
* **Seeded Demo Rule Only:** The MVP includes one seeded demonstration rule (`demo_attack=true`). There is no rule creation, editing, or deletion API endpoint in the MVP.
* **Advisory AI Integration is Optional:** Advisory analysis defaults to deterministic local benchmark fixtures (`processing_mode=fixture`). The optional `processing_mode=llm` requires a valid third-party API key (`GROQ_API_KEY`) and transmits input text to an external cloud provider.
* **Deferred Phase 2 Modules:** As specified in project planning, Phase 2 features (file compromise scanner, runtime vendor inventory, and automated patch retirement recommendations) are placeholders and not implemented.
* **Defensive Prototype Only:** Parameter filtering is an illustrative demonstration of reversible operational workflow. It is **never a substitute for applying official vendor security updates**.
