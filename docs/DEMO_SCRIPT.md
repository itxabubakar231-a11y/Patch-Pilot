# PatchPilot — End-to-End Live Demonstration Script

> **Role:** Member 1 (Proxy & Core Lead)  
> **Target Audience:** Technical evaluators, hackathon judges, peer reviewers  
> **Environment:** Windows PowerShell, Localhost only (`127.0.0.1`)  
> **Reference Plan:** `docs/DEVELOPMENT_PLAN.md` (Sprint 3 Checklist)

---

## 📋 Demonstration Overview

This script provides an exact, step-by-step walkthrough demonstrating PatchPilot's defensive capabilities in an isolated local testbed:
1. Multi-service startup across fixed loopback ports.
2. Passive observation and privacy-redacted logging in **Shadow** mode.
3. Automated regression evaluation against benign/attack fixtures (**Replay Gate**).
4. Deterministic query-parameter filtering in **Enforce** mode.
5. Immediate, auditable **Rollback** to Shadow mode.
6. Honest telemetry, honest advisory provenance, and multilingual browser TTS.
7. Controlled HTTP 502 error handling during upstream lab outages.
8. Clean workspace teardown and database reset.

---

> [!IMPORTANT]
> **Before the Demo (Preparation & Setup):**
> * **Reset local database:** Stop all running services (`Ctrl + C`) and delete the local database directory:
>   ```powershell
>   Remove-Item -Recurse -Force backend\data
>   ```
>   This ensures that Rule #1 starts in the initial `Replay Required` state and ENFORCE mode starts locked (`GATED (REPLAY REQUIRED)`).
> * **Dashboard authentication:** In real mode (`VITE_DATA_MODE=real`), open the unlock modal, type your configured admin token (`<YOUR_ADMIN_TOKEN>`), and click **Unlock**. Do **NOT** use the **Quick Demo Unlock** button—that button is intended exclusively for the simulated mock dashboard.
> * **UI polling refresh:** Wait about 5 seconds after each request for the dashboard to refresh (the frontend uses a 5-second automatic polling interval).

---

## 🖥️ Terminal Layout Setup

Open **five separate Windows PowerShell terminals** positioned side-by-side:

* **Terminal 1:** Upstream Dummy Lab (`127.0.0.1:8081`)
* **Terminal 2:** Security Reverse Proxy (`127.0.0.1:8080`)
* **Terminal 3:** Management API Service (`127.0.0.1:8000`)
* **Terminal 4:** Frontend Command Center (`127.0.0.1:5173`)
* **Terminal 5:** Demonstration Client (curl commands & manual verification)

---

## Step 1: Start the Four Services & Unlock the Dashboard

### Terminal 1 — Start the Dummy Upstream Lab (Port 8081)
Starts the inert Python dummy target simulating an Apache/PHP web application:
```powershell
cd <repo-root>
python lab/server.py
```
* **Expected Output:**
  ```text
  ============================================================
  [*] PatchPilot Dummy HTTP Lab Server started successfully
  [*] Listening on: http://127.0.0.1:8081
  [*] Health Check: http://127.0.0.1:8081/health
  [*] Local only - No external networking
  ============================================================
  ```

---

### Terminal 2 — Start the Security Reverse Proxy (Port 8080)
Starts the ASGI reverse proxy forwarding traffic to port 8081:
```powershell
cd <repo-root>\backend
.\.venv\Scripts\Activate.ps1
uvicorn app.proxy_app:app --host 127.0.0.1 --port 8080 --no-access-log
```
* **Expected Output:**
  ```text
  INFO:patchpilot.proxy_app:Initializing database schema on proxy startup...
  INFO:patchpilot.proxy_app:Starting PatchPilot Security Proxy on http://127.0.0.1:8080
  INFO:     Uvicorn running on http://127.0.0.1:8080 (Press CTRL+C to quit)
  ```
* **Speaker Note:** *"We run uvicorn with `--no-access-log` because default ASGI access logging dumps raw query strings to the terminal. To uphold strict privacy, our proxy never logs or stores query strings; it records only the method and the sanitized path."*

---

### Terminal 3 — Start the Management API Service (Port 8000)
The user picks any private token of at least 16 characters and sets it only in that terminal session:
```powershell
cd <repo-root>\backend
.\.venv\Scripts\Activate.ps1
$env:PATCHPILOT_ADMIN_TOKEN = "<YOUR_ADMIN_TOKEN>"
uvicorn app.main:app --host 127.0.0.1 --port 8000
```
* **Expected Output:**
  ```text
  INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
  ```
* **Speaker Note:** *"The management API gates all administrative routes behind constant-time Bearer authentication. If the token is missing or under 16 characters, the server fails closed with HTTP 401."*

---

### Terminal 4 — Start the React Frontend Dashboard (Port 5173)
Launch the Vite development server in real API transport mode:
```powershell
cd <repo-root>\frontend
$env:VITE_DATA_MODE = "real"
npm run dev
```
* **Expected Output:**
  ```text
  VITE v5.2.11  ready in ... ms
  ➜  Local:   http://127.0.0.1:5173/
  ```

---

### Browser Action — Authenticate on the Dashboard
1. Open `http://127.0.0.1:5173/` in Google Chrome or Microsoft Edge.
2. Observe the top header badge: it shows `Transport: API (127.0.0.1:8000)`.
3. Click the **Unlock Admin** button in the top navigation bar.
4. In the dialog, enter the admin token configured in Terminal 3:
   ```text
   <YOUR_ADMIN_TOKEN>
   ```
5. Click **Unlock** (do not click the **Quick Demo Unlock** button, which is for mock mode).
* **Expected Result:**
  * The modal closes and the button transitions to the `UNLOCKED` status badge with a `Lock` button.
  * Zone 1 (Security Overview) connects to SQLite and displays live telemetry.
  * In Zone 2 (Traffic Monitor), the data source indicator updates to `Data: Live Backend`.
* **Speaker Note:** *"Notice that the token is stored strictly in React memory—never in `localStorage`, cookies, or browser URLs. Refreshing the browser or clicking 'Lock' immediately purges the credential."*

---

## Step 2: Shadow Mode — Passive Inspection Without Blocking

By default on startup, the proxy operates in **Shadow** mode (`proxy_mode = 'shadow'`).

### In Terminal 5 (Client), send a normal benign request:
```powershell
curl.exe -i http://127.0.0.1:8080/
```
* **Expected Result:**
  * HTTP 200 OK.
  * Server banner: `Server: Apache/2.4.52 (Ubuntu)`, `X-Powered-By: PHP/8.2.0`.
  * HTML body: `<title>PatchPilot Isolated Lab Target</title>`.

### In Terminal 5 (Client), send the simulated attack query marker:
```powershell
curl.exe -i "http://127.0.0.1:8080/?demo_attack=true"
```
* **Expected Result:**
  * HTTP 200 OK.
  * The response is identical to the normal request; the lab target receives the request unharmed.

### Dashboard Verification:
1. Navigate to **Zone 2 (Traffic Monitor)** by clicking "Traffic Monitor" in the sidebar.
2. Inspect the audit log table:
   * **Row 1:** `GET /`, Action badge: `Shadow Match`, Status: `200`, Matched Rule: `Rule #1`.
   * **Row 2:** `GET /`, Action badge: `Allowed`, Status: `200`.
3. Inspect the four summary metric cards:
   * **Total Requests:** shows loaded count with unit `events`.
   * **Allowed Requests:** shows loaded count with unit `forwarded`.
   * **Shadow Matches:** shows loaded count with unit `matches`.
   * **Blocked Requests:** shows loaded count with unit `intercepts` (0).
4. **Speaker Note:** *"Notice two critical details in Zone 2: First, in Shadow mode, traffic is never blocked. Second, look at the Path column: it stores strictly `/`. The raw query string `?demo_attack=true` is completely stripped prior to SQLite insertion to protect end-user privacy."*

---

## Step 3: Run the `lab-v1` Replay Gate

Before entering Enforce mode, PatchPilot requires automated regression evaluation against offline fixtures.

1. Navigate to **Zone 3 (Shield Controls)** by clicking "Shield Controls" in the sidebar.
2. Point out the **ENFORCE** mode button card: it is disabled with the badge:
   ```text
   GATED (REPLAY REQUIRED)
   ```
   In the rules table, Rule #1 shows the status badge `Replay Required`.
3. Locate **Rule #1: Demo query marker** (`query_param_equals: demo_attack=true`).
4. Click **Run Replay Test** (or execute via Terminal 5):
   ```powershell
   curl.exe -X POST -H "Authorization: Bearer <YOUR_ADMIN_TOKEN>" http://127.0.0.1:8000/api/v1/rules/1/replay
   ```
* **Expected Result:**
  * The dashboard rules table updates the status badge to `Passed (Gate Ready)`.
  * The evaluation numbers come from the API response of `POST /api/v1/rules/1/replay`; the Terminal 5 curl output displays the results:
    * **Benign Fixtures:** 7 total, 0 matched
    * **Marker Fixtures:** 3 total, 3 matched
    * **Verdict:** `PASSED` (`passed: true`)
    *(Confirm during rehearsal if the dashboard also surfaces these numbers).*
  * The **ENFORCE** mode button card becomes active and ready to engage.
* **Speaker Note:** *"On the lab-v1 fixtures: 0 of 7 benign requests matched and 3 of 3 marker requests matched; the replay is a regression check on a small fixture set, not proof of safety. The replay run record stores the rule's SHA-256 config digest in SQLite, so any configuration change invalidates prior replay results and re-locks the gate."*

---

## Step 4: Switch to Enforce Mode & Verify Active Blocking

With the replay gate satisfied, active enforcement can be safely engaged.

1. In **Zone 3 (Shield Controls)**, click the **ENFORCE** mode card.
2. A confirmation modal appears titled:
   `Confirm Mode Transition to ENFORCE`
   with warning details and a confirmation button:
   `Confirm ENFORCE`
3. Click **Confirm ENFORCE**.
4. The proxy mode pill updates to `ENFORCE`.

### In Terminal 5 (Client), verify that normal traffic still passes:
```powershell
curl.exe -i http://127.0.0.1:8080/
```
* **Expected Result:**
  * HTTP 200 OK. Upstream lab receives request and responds normally.

### In Terminal 5 (Client), send the simulated attack marker:
```powershell
curl.exe -i "http://127.0.0.1:8080/?demo_attack=true"
```
* **Expected Result:**
  * **HTTP/1.1 403 Forbidden**
  * Content-Type: `application/json`
  * Response Body:
    ```json
    {
      "error": {
        "code": "REQUEST_BLOCKED",
        "message": "Request blocked by PatchPilot security rule."
      }
    }
    ```
  * In Terminal 1 (Lab), notice that **no log entry appears**. The proxy returned the 403 itself and never called the upstream lab.

### In Terminal 5 (Client), test query delimiter handling:
Send the marker followed by an additional query parameter containing a trailing question mark:
```powershell
curl.exe -i "http://127.0.0.1:8080/?demo_attack=true&z=?"
```
* **Expected Result:**
  * **HTTP/1.1 403 Forbidden** (`REQUEST_BLOCKED`).
* **Speaker Note:** *"An earlier version stopped reading the query at the first '?', so '?demo_attack=true&z=?' slipped through; the proxy now parses the raw query string itself using `urllib.parse.parse_qs`."*

### Dashboard Verification:
* In **Zone 2 (Traffic Monitor)**, locate the filter toolbar.
* In the **Action** dropdown (`All Actions`), select **Blocked (403)**, or use the **Search traffic events** search box (there are no tabs).
* The blocked request is recorded with badge `Blocked (403)`, status `403`, and rule ID `Rule #1`.
* The summary card for `intercepts` (Blocked Requests) increments to 1 (or 2).

---

## Step 5: Instant Rollback to Shadow Mode

Demonstrate emergency operational rollback when an operator needs to disable filtering immediately.

1. In **Zone 3 (Shield Controls)**, locate the amber button **Rollback to Shadow** (or execute via Terminal 5):
   ```powershell
   curl.exe -X POST -H "Authorization: Bearer <YOUR_ADMIN_TOKEN>" http://127.0.0.1:8000/api/v1/proxy/rollback
   ```
2. In the dashboard, clicking **Rollback to Shadow** opens a confirmation modal:
   * Dialog title: `Confirm Emergency Rollback`
   * Confirm button: `Confirm Rollback`
3. Click **Confirm Rollback**.
* **Expected Result:**
  * Mode immediately reverts to `shadow`.
  * The feedback alert displays:
    `Operation Completed: Enforcement disabled; shadow logging continues.`
  * An audit entry is persisted in SQLite table `audit_events`.

### In Terminal 5 (Client), re-test the attack marker:
```powershell
curl.exe -i "http://127.0.0.1:8080/?demo_attack=true"
```
* **Expected Result:**
  * HTTP 200 OK. The request is once again forwarded to the upstream lab and logged as `shadow_match`.
* **Speaker Note:** *"Rollback is immediate and idempotent. Notice it fails back to Shadow mode rather than Off, ensuring security teams maintain traffic observability while investigating."*

---

## Step 6: Telemetry, Honest Provenance & Multilingual Advisories

### Zone 1 (Security Overview)
1. Navigate to **Zone 1 (Security Overview)** by clicking "Security Overview" in the sidebar.
2. Review the four cards:
   * **Proxy Mode:** Displays active mode (`SHADOW`).
   * **Traffic:** Shows total request count with label `requests`.
   * **Upstream Stack:** Shows `Apache / PHP` when the lab is online.
   * **AI Intelligence:** Shows advisory count with label `advisories`.
3. In the topology panel, observe the lab badge: displays `Lab Unverified`.
4. **Speaker Note:** *"Notice the numbers: PatchPilot never populates fake telemetry. If there have been zero blocked requests on a clean database, it honestly displays 0 rather than simulating fake activity."*

### Zone 4 (AI Advisories & Web Speech TTS)
1. Navigate to **Zone 4 (AI Advisories)** by clicking "AI Advisories" in the sidebar.
2. Under Analysis Configuration, select the radio:
   `Deterministic Fixture (Safe)`
3. Click the button:
   `Analyze Advisory`
4. Review the generated results:
   * **Provenance Banner:**
     `Deterministic Demo Fixture: Displaying pre-canned simulation output. Input text was not processed by live AI.`
   * **Status Badges:**
     * `FIXTURE ACTIVE`
     * `MODE: fixture`
     * `Source: demo (fixture)`
5. **Language Selector:** Switch between the 5 supported locales:
   * `en` (English)
   * `ur` (Urdu — native Nastaliq/Arabic Right-to-Left script)
   * `ur-Latn` (Roman Urdu — Latin Left-to-Right script)
   * `ar` (Arabic — Right-to-Left script)
   * `es` (Spanish)
6. **Speech Synthesis:** Click the speaker icon button (**Listen**) next to any translation.
   * A badge indicates `System Voice`.
   * The browser Web Speech API speaks the title and recommended actions out loud using local synthesis.
7. **Speaker Note:** *"Notice our strict provenance rules: when using the local fixture, the UI prominently displays that no live AI inference occurred. If the optional Groq LLM integration is enabled, it sends data to the cloud only with explicit user opt-in, and all outputs are validated against strict Pydantic schemas."*

---

## Step 7: Upstream Lab Outage & Graceful 502 Handling

Demonstrate how PatchPilot behaves when the backend target service crashes or goes offline.

### In Terminal 1 (Lab):
Press `Ctrl + C` to stop `lab/server.py`.

### In Terminal 5 (Client), send a request through the proxy:
```powershell
curl.exe -i http://127.0.0.1:8080/
```
* **Expected Result:**
  * **HTTP/1.1 502 Bad Gateway**
  * Content-Type: `application/json`
  * Response Body:
    ```json
    {
      "error": {
        "code": "UPSTREAM_UNAVAILABLE",
        "message": "Lab server unavailable"
      }
    }
    ```
  * No Python traceback or internal host paths are leaked to the client.

### Dashboard Verification:
1. In **Zone 2 (Traffic Monitor)**, a new event is recorded:
   * Method: `GET` | Path: `/` | Action badge: `Upstream Error (502)` | Status: `502`
   * Duration: longer response time (about 2 s on Windows due to connection timeout).
2. In **Zone 1 (Security Overview)**:
   * The backend reports `lab.status = "offline"`.
   * The **Upstream Stack** card changes from `Apache / PHP` (lab online) to `Upstream Lab` (`Target: 127.0.0.1:8081`).
   * The topology badge stays `Lab Unverified` in both states.

> [!NOTE]
> **Known issue:** The dashboard reads `lab.verified`, a property that `docs/API.md` does not define. As a result, the topology badge remains `Lab Unverified` regardless of whether the lab is online or offline (reported to Member 3).

When `lab/server.py` is restarted in Terminal 1, the proxy recovers automatically by itself.

3. **Speaker Note:** *"The proxy handles target outages with an audit-safe 502 Bad Gateway. It never crashes, never drops its management connection, and preserves accurate failure records in SQLite. When the lab service restarts, the proxy recovers automatically."*

---

## Step 8: Clean Teardown & Reset

1. **Stop Services:** Press `Ctrl + C` in Terminals 1, 2, 3, and 4.
2. **Reset Database:** Delete the git-ignored database directory in PowerShell:
   ```powershell
   Remove-Item -Recurse -Force backend\data
   ```
3. **Clear Session Environment Variables:**
   ```powershell
   Remove-Item env:PATCHPILOT_ADMIN_TOKEN -ErrorAction SilentlyContinue
   Remove-Item env:VITE_DATA_MODE -ErrorAction SilentlyContinue
   ```

---

## 📸 Evidence Checklist (Presentation Screenshots)

Capture these specific screenshots during the rehearsal or presentation for documentation evidence:

| # | Item to Capture | Screen / Terminal | Key Visual Indicator to Verify |
|---|---|---|---|
| **E1** | Admin Authentication | Browser (Top Nav) | `UNLOCKED` status badge and `Transport: API (127.0.0.1:8000)` badge. |
| **E2** | Shadow Mode Telemetry | Zone 2 (Traffic Monitor) | Action badges `Allowed` and `Shadow Match`; metric cards `events`, `forwarded`, `matches`, `intercepts`. |
| **E3** | Replay Evaluation Proof | Zone 3 (Shield Controls) & Terminal 5 | Status badge shows `Passed (Gate Ready)` in Zone 3; Terminal 5 curl API response displays evaluation numbers (7 benign / 0 matched, 3 marker / 3 matched; confirm during rehearsal if dashboard also surfaces numbers). |
| **E4** | Enforce Blocking in Action | Terminal 5 (curl) | Terminal output showing `HTTP/1.1 403 Forbidden` and `REQUEST_BLOCKED` JSON envelope. |
| **E5** | Trailing Delimiter Handling | Terminal 5 (curl) | `curl.exe -i "http://127.0.0.1:8080/?demo_attack=true&z=?"` returning HTTP 403. |
| **E6** | Instant Rollback | Zone 3 (Shield Controls) | Amber button `Rollback to Shadow`, modal `Confirm Emergency Rollback` -> `Confirm Rollback`, feedback `Operation Completed: Enforcement disabled; shadow logging continues.`. |
| **E7** | Multilingual & Audio Provenance | Zone 4 (AI Advisories) | Radio `Deterministic Fixture (Safe)`, button `Analyze Advisory`, banner `Deterministic Demo Fixture ... Input text was not processed by live AI.`, badges `FIXTURE ACTIVE`, `MODE: fixture`, `Source: demo (fixture)`, button `Listen`, badge `System Voice`. |
| **E8** | Upstream Lab Outage | Terminal 5 & Zone 2 | Terminal showing `502 Bad Gateway` and Zone 2 displaying `Upstream Error (502)`. |

---

## 🎙️ What to Say About Limitations (Closing Script)

When concluding the demonstration, deliver this statement to maintain complete architectural integrity:

> *"To summarize: PatchPilot demonstrates that defensive query parameter filtering can be operated in a safe, transparent, and completely reversible manner. We’ve shown that operators can passively monitor traffic in Shadow mode, run automated regression checks against benign and attack fixtures before enforcing, block simulated attack markers without leaking query privacy, and roll back immediately with an audit trail.*
>
> *However, we must emphasize what PatchPilot is and is not: It is a local research prototype running in an isolated loopback lab. It evaluates exact parameter matches (`demo_attack=true`) and does not inspect request bodies or headers. Most importantly, temporary proxy filtering is never a substitute for official vendor security patches. For CVE-2026-109618, applying the official PHP release remains the only true remediation. PatchPilot simply gives defenders an operational breathing window while testing and scheduling updates."*
