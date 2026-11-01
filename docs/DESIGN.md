# PatchPilot — Frontend & Experience Design Specification

**Version:** 1.0 | **Owner:** Team B (Member 3 UI; Member 4 AI/advisory UI)  
**Framework:** React + Vite + Tailwind CSS | **Style:** Dark cyber command center  
**Status:** PROPOSED design specification, not an existing finished dashboard

## 1. Product experience

Goal: a beginner administrator should understand the **local lab's** current safety mode, request history, and recommended next action in under 30 seconds. Dark visuals are secondary to clarity. The MVP is an understandable security demonstration, **not a production protection claim**.

**Primary interaction order:** (1) unlock local demo, (2) inspect status, (3) replay rules, (4) choose Shadow/Enforce with explicit confirmation, (5) rollback immediately, (6) view requests, (7) read/translate advisory.

## 2. Information architecture — four zones

```text
┌────────────────────────────────────────────────────────────────────────┐
│ PatchPilot logo     LOCAL LAB / SIMULATED      Language   Theme  Admin │
├─────────────┬──────────────────────────────────────────────────────────┤
│ Sidebar     │ ZONE 1 — Security Overview                             │
│ Overview    │ [Proxy Mode] [Total] [Shadow Matches] [Blocked]        │
│ Traffic     ├──────────────────────────────────────────────────────────┤
│ Shield      │ ZONE 2 — Live Traffic Monitor                           │
│ Advisories  │ Filters + recent requests table + counts/trend         │
│ Scanner*    ├──────────────────────────────────────────────────────────┤
│ Inventory*  │ ZONE 3 — Shield Controls                                │
│ Settings    │ Rule, Replay Test, Shadow, Enforce, ROLLBACK            │
│             ├──────────────────────────────────────────────────────────┤
│             │ ZONE 4 — Advisory & Readiness                           │
│             │ Advisory summary + locales + TTS + Phase 2 placeholders│
└─────────────┴──────────────────────────────────────────────────────────┘
*Phase 2: visible only as clearly labeled 'Coming soon' or hidden until built.
```

On desktop, sidebar + grid/cards. On tablet/mobile, collapsible navigation, zones in one column, traffic table horizontally scrollable or becomes cards. Avoid 4 giant charts that crowd the MVP.

## 3. Components and ownership

| Component | Contents | State source | Owner |
|---|---|---|---|
| `AdminUnlock` | Admin token input, unlock/clear button, local-only warning | React memory only | Member 3 |
| `AppShell` | Sidebar, top bar, theme, language switch | UI state | Member 3 |
| `EnvironmentBanner` | "LOCAL LAB / SIMULATED" (visible on **every** dashboard state) | `/api/v1/overview` | Member 3 |
| `OverviewCards` | Mode, total, shadow matches, blocks | `/api/v1/overview` | Member 3 |
| `TrafficTable` | Time, method, redacted path, action, response status | `/api/v1/traffic` | Member 3 |
| `ShieldPanel` | Current mode, rules, replay result, Enforce confirmation, Rollback | `/api/v1/proxy/status`, `/rules` | Member 3 |
| `AdvisoryPanel` | Advisory form, source attribution, structured summary | advisory API | Member 4 |
| `LanguageSelector` | en, ur, ur-Latn, ar, es | UI state | Member 4 |
| `SpeechControl` | Play/Stop, unsupported voice fallback | Browser `speechSynthesis` | Member 4 |
| `ScannerPanel` | "Phase 2 — not implemented" until real scanner exists | no fake live API call | Member 3 |

**File boundary proposal:** Member 3 owns `src/App.jsx`, `src/features/dashboard/*`, `src/services/apiClient.js`, `src/components/*`. Member 4 owns `src/features/advisories/*` and proposes a small integration export for Member 3 to import. Avoid both editing `App.jsx` in parallel.

## 4. Typography, colors, accessibility

Use Tailwind with a restrained design system. No external component library is required unless reviewed.

| Token | Suggested value | Use |
|---|---|---|
| Page background | `#0B1120` | Deep navy |
| Surface | `#111C2F` | Cards/sidebar |
| Raised surface | `#192840` | Hover, panel |
| Text primary | `#F1F5F9` | Headings/body |
| Text secondary | `#94A3B8` | Descriptions |
| Accent | `#38BDF8` | Links and neutral interactive actions |
| Good | `#34D399` | Connected/allowed |
| Warning | `#FBBF24` | Shadow matches, incomplete checks |
| Danger | `#FB7185` | Blocked/action warnings |

- Use system sans-serif or bundled font; appropriate fallbacks for Arabic and Urdu scripts (do not depend on a remotely hosted font).
- WCAG-minded contrast, focus rings, `aria-label` for icon-only actions, tab/keyboard navigation, visible input labels, responsive layout.
- Do not communicate state only through color. Always show explicit `SHADOW`, `ENFORCE`, `OFF`, `DEMO`, `UNKNOWN`, or `NOT IMPLEMENTED` text.
- All controls with side effects require clear labels; no hidden destructive gesture.
- Charts are optional. Start with readable cards + table; no invented metric animations.

## 5. Four-zone behavior and data display

### Zone 1 — Overview

Display four top cards: `Proxy Mode`, `Total Requests`, `Shadow Matches`, `Blocked Requests`. Below them show `Lab upstream: Online/Offline/Unknown` and its **simulated** stack only if supplied by API.

- `blocked_requests` counts only `action=blocked`.
- `shadow_matches` counts only `action=shadow_match`; do not call them "blocked".
- If mock mode, prefix the whole dashboard with **DEMO DATA**; avoid hiding the label in a tooltip.
- If API offline, show "Backend unavailable" rather than cached mock values presented as live.

### Zone 2 — Traffic Monitor

Table columns: UTC time, method, path (without query), mode, action, HTTP status, matched rule. Sort newest first. Status text: `Allowed`, `Observed (shadow)`, `Blocked (enforce)`, `Upstream error`.

Filters: action, method, and an explicit Refresh button (polling every 5 seconds optional; do not add live sockets yet). Do not display client IP, cookies, headers or raw body.

### Zone 3 — Proxy Shield Controls

- Visible current mode and why `Enforce` is enabled/disabled.
- `Run Replay Test` button invokes `POST /api/v1/rules/{id}/replay`; show benign test count and matched count, simulated marker count and matched count, plus tested timestamp.
- `Enable Enforce` remains disabled until `ready_for_enforce=true`; if API returns `409`, show explanation.
- Clicking `Enable Enforce` opens a confirmation modal: "Only local lab traffic is affected. This is a simulated test rule, not a complete fix for PHP2Shell." Confirm before PUT.
- Prominent **Rollback to Shadow** always visible if management API is reachable; invokes `POST /api/v1/proxy/rollback`. Disable button while request is in flight and surface errors.
- `Off` available in mode dropdown as emergency non-filtering state; not the default or rollback outcome.

### Zone 4 — Advisory Center

- Textarea for pasted advisory; supported languages `English`, `اردو`, `Roman Urdu`, `العربية`, `Español`.
- Mode selector `Demo Fixture` or `Live AI` (live choice disabled/explained when LLM API not configured).
- Result: title, severity, source kind, provenance link if verified, summary, action. **Never label AI text as authoritative without source verification.**
- `Listen` uses `window.speechSynthesis` only when triggered by user. If no matching voice, show fallback text, not a fake audio player.
- Scanner/Inventory/Patch items may be visually listed as **Phase 2 / Coming soon**; do not populate them with arbitrary threatening files or a "secure" indicator.

## 6. UI state model

| State | UI action |
|---|---|
| Not unlocked | Unlock Demo panel; do not call protected endpoints without token |
| Loading | Skeleton and "Loading..."; never count zeros as live until fetched |
| Success/live | Render API values and `LOCAL LAB` label |
| Success/mock | Render fixture values and prominent `DEMO DATA` label |
| Unauthorized 401 | Clear in-memory token, re-open Unlock Demo |
| Backend offline | Explain unavailable backend, show retry; no invented healthy state |
| Replay gate failed 409 | Keep mode unchanged, explain what must be tested |
| Lab offline/502 | Lab status offline, keep controls safely visible |
| LLM unavailable 503 | Offer explicit, clearly labeled fixture mode |
| TTS voice missing | Display text and "Voice unavailable for this language" |

## 7. RTL and translations

- Language codes: `en`, `ur`, `ur-Latn`, `ar`, `es`.
- Layout direction: `rtl` for `ur` and `ar`; `ltr` for `en`, `ur-Latn`, `es`. Apply `dir` at a proper container/document level.
- Keep technical tokens (CVE IDs, port numbers, file paths, timestamps) legible using `dir="ltr"` on inline code spans even in RTL pages.
- Separate **UI strings** from **advisory content**. UI dictionary can be local/static; advice comes through API and carries `generated_by` provenance.
- Never rely on browser TTS to speak Roman Urdu or Urdu perfectly. Offer text when missing or low-quality voices.

## 8. API adapter + fixtures

Make every React component use a small data/service layer; never scatter hardcoded `http://127.0.0.1:8000` fetch calls across components. Use `fetch('/api/v1/...')` behind the Vite API proxy and add auth header in one place.

**Mode choice:** `VITE_DATA_MODE=mock|real` for development only. Mock responses must match `API.md` exactly. If the real backend fails, **do not silently fall back** to mock mode. Show an error and give the user a manual "Switch to Demo" choice.

## 9. Performance / UX guardrails

- Avoid unnecessary heavy chart libraries and animations until MVP functions are tested.
- Debounce text input where appropriate; do not auto-submit advisory text on every keystroke.
- Use an accessible toast/inline feedback for mode changes, never announce success before API returns HTTP 200.
- Sanitize/escape advisory text. Avoid `dangerouslySetInnerHTML` for untrusted AI responses.
- No real credentials in test screenshots or logs.

## 10. Frontend definition of done

- [ ] `npm run build` succeeds.
- [ ] UI navigable with keyboard and works in narrow viewport.
- [ ] Both mock and real API modes support the same typed shape.
- [ ] Shadow matches are visually distinct from blocked requests.
- [ ] Enforce requires replay and confirmation; rollback requests go to actual backend.
- [ ] English, Urdu/RTL, Arabic/RTL and Roman Urdu/LTR render correctly.
- [ ] Advisory provenance and demo labels are always visible.
- [ ] No backend secrets, tokens, or LLM credentials committed/embedded.
