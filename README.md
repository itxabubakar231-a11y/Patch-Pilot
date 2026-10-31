# PatchPilot

> **Defensive Security Toolkit for Self-Hosted PHP Web Servers**

PatchPilot is a defensive security toolkit built to monitor, audit, and safeguard self-hosted PHP web applications against common misconfigurations and threats.

---

## 📁 Project Structure

```text
PatchPilot/
├── backend/       # Python + FastAPI backend service (defensive analysis & API)
│   ├── app/
│   │   ├── __init__.py
│   │   └── main.py
│   └── requirements.txt
├── frontend/      # React + Vite + Tailwind CSS dashboard
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── lab/           # Isolated local dummy HTTP test server
│   ├── server.py
│   ├── index.php
│   └── README.md
├── .gitignore
└── README.md
```

---

## 🔒 Security & Scope Guidelines

- **Strictly Local**: All components bind strictly to loopback (`127.0.0.1` / `localhost`).
- **No External Scanning**: PatchPilot does not scan, probe, or contact any external or third-party web servers.
- **Defensive Focus**: No exploit payloads, reverse-proxy filtering, or automated attacks are included.

---

## 🚀 Quick Start Guide

### Prerequisites
- **Python 3.10+** (accessible via `py` or `python`)
- **Node.js 18+** & **npm** (for the frontend dashboard)

---

### 1. Lab Server (Local Dummy Target)

The lab provides an isolated dummy HTTP server that simulates a PHP/Apache web application on port `8081` (port `8080` is reserved for the future PatchPilot reverse proxy).

```bash
# Navigate to project root or lab/ directory
py lab/server.py
# or: python lab/server.py
```
- **Target URL**: `http://127.0.0.1:8081/`
- **Health Check**: `http://127.0.0.1:8081/health`

---

### 2. Backend (FastAPI)

The backend provides defensive inspection endpoints and a health check API on port `8000`.

```bash
# 1. Navigate to the backend directory
cd backend

# 2. Create and activate a virtual environment
py -m venv .venv
# On Windows PowerShell:
.venv\Scripts\Activate.ps1

# 3. Install dependencies
pip install -r requirements.txt

# 4. Start the FastAPI development server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
- **Backend API**: `http://127.0.0.1:8000/`
- **Health Check**: `http://127.0.0.1:8000/health`
- **Interactive OpenAPI Docs**: `http://127.0.0.1:8000/docs`

---

### 3. Frontend (React + Vite + Tailwind CSS)

The frontend provides the "PatchPilot — Security Dashboard" interface for monitoring services.

```bash
# 1. Navigate to the frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Start the Vite development server
npm run dev
```
- **Dashboard URL**: `http://127.0.0.1:5173/`

---

## 🩺 Verifying the Setup

You can verify that all services are operational using PowerShell or curl:

```powershell
# Test Backend Health
curl http://127.0.0.1:8000/health

# Test Lab Dummy Server Health
curl http://127.0.0.1:8081/health
```

Both return a JSON response with status `"ok"`.

