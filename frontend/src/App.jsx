import { useState, useEffect } from 'react'

export default function App() {
  const [backendStatus, setBackendStatus] = useState('checking')
  const [labStatus, setLabStatus] = useState('checking')
  const [backendDetails, setBackendDetails] = useState(null)
  const [labDetails, setLabDetails] = useState(null)

  const checkBackend = async () => {
    setBackendStatus('checking')
    try {
      const res = await fetch('http://127.0.0.1:8000/health')
      if (res.ok) {
        const data = await res.json()
        setBackendStatus('online')
        setBackendDetails(data)
      } else {
        setBackendStatus('offline')
        setBackendDetails(null)
      }
    } catch {
      setBackendStatus('offline')
      setBackendDetails(null)
    }
  }

  const checkLab = async () => {
    setLabStatus('checking')
    try {
      const res = await fetch('http://127.0.0.1:8081/health')
      if (res.ok) {
        const data = await res.json()
        setLabStatus('online')
        setLabDetails(data)
      } else {
        setLabStatus('offline')
        setLabDetails(null)
      }
    } catch {
      setLabStatus('offline')
      setLabDetails(null)
    }
  }

  useEffect(() => {
    checkBackend()
    checkLab()
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center font-bold text-white shadow-md shadow-sky-500/20">
              P
            </div>
            <span className="font-semibold text-lg tracking-tight text-white">PatchPilot</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono border border-slate-700">
              v0.1.0-alpha
            </span>
          </div>
          <div className="flex items-center space-x-2 text-xs text-slate-400">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Local Mode (Defensive)</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
        {/* Hero / Header */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            PatchPilot — Security Dashboard
          </h1>
          <p className="mt-2 text-slate-400 text-base max-w-2xl">
            A defensive security toolkit for self-hosted PHP web servers.
            Designed for local monitoring, vulnerability analysis, and hardening.
          </p>
        </div>

        {/* Status Overview Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {/* Card 1: Backend API */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-slate-400">FastAPI Backend</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    backendStatus === 'online'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : backendStatus === 'checking'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}
                >
                  {backendStatus.toUpperCase()}
                </span>
              </div>
              <h2 className="text-xl font-bold text-white mb-1">API Health (Port 8000)</h2>
              <p className="text-xs text-slate-400 mb-3">Endpoint: <code className="text-sky-400">GET /health</code></p>
              {backendDetails && (
                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 text-xs text-slate-300 font-mono mb-4">
                  <div>Service: {backendDetails.service}</div>
                  <div>Status: {backendDetails.status}</div>
                </div>
              )}
            </div>
            <button
              onClick={checkBackend}
              className="mt-4 w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
            >
              Recheck Backend
            </button>
          </div>

          {/* Card 2: Lab Target */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-slate-400">Isolated Lab Server</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    labStatus === 'online'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : labStatus === 'checking'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}
                >
                  {labStatus.toUpperCase()}
                </span>
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Mock PHP Target (Port 8081)</h2>
              <p className="text-xs text-slate-400 mb-3">Endpoint: <code className="text-sky-400">GET /health</code></p>
              {labDetails && (
                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 text-xs text-slate-300 font-mono mb-4">
                  <div>Service: {labDetails.service}</div>
                  <div>Stack: {labDetails.simulated_stack}</div>
                </div>
              )}
            </div>
            <button
              onClick={checkLab}
              className="mt-4 w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
            >
              Recheck Lab Server
            </button>
          </div>

          {/* Card 3: Defensive Mode */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-slate-400">Toolkit State</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  DEFENSIVE
                </span>
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Passive Defense Mode</h2>
              <p className="text-xs text-slate-400 mb-3">
                Non-intrusive security posture active.
              </p>
              <ul className="text-xs text-slate-400 space-y-1 mb-4">
                <li>• External scanning: <strong className="text-slate-300">Disabled</strong></li>
                <li>• Target scope: <strong className="text-slate-300">127.0.0.1 only</strong></li>
                <li>• Live exploitation: <strong className="text-slate-300">Disabled</strong></li>
              </ul>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400 text-center">
              Ready for defensive rules & audits
            </div>
          </div>
        </div>

        {/* Quick Instructions / Architecture overview */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/20 p-6">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
            Component Architecture
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800">
              <div className="font-semibold text-sky-400 mb-1">1. Backend (Python + FastAPI)</div>
              <p className="text-slate-400">Hosts defensive logic, health checks, and analysis API on <code className="text-slate-200">http://127.0.0.1:8000</code>.</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800">
              <div className="font-semibold text-sky-400 mb-1">2. Frontend (React + Vite)</div>
              <p className="text-slate-400">Security operator dashboard with Tailwind styling on <code className="text-slate-200">http://127.0.0.1:5173</code>.</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800">
              <div className="font-semibold text-sky-400 mb-1">3. Lab (Local Target)</div>
              <p className="text-slate-400">Isolated mock PHP environment on <code className="text-slate-200">http://127.0.0.1:8081</code> for zero-risk validation.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-4 px-6 text-center text-xs text-slate-500">
        PatchPilot Defensive Security Toolkit — Hackathon Prototype Setup
      </footer>
    </div>
  )
}

