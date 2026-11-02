/**
 * SecurityOverview Component (Zone 1)
 *
 * Displays real-time security posture, proxy mode & readiness,
 * request telemetry counters, upstream lab status, and component readiness.
 * Conforms to docs/API.md (Section 3.A) and docs/DESIGN.md (Section 5).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { getOverview, getApiMode } from '../../services/apiClient.js'

export default function SecurityOverview() {
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const isMountedRef = useRef(true)

  const fetchOverview = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true)
    setError(null)

    try {
      const data = await getOverview()
      if (isMountedRef.current) {
        setOverview(data)
        setLastUpdated(new Date())
        setLoading(false)
        setIsRefreshing(false)
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err)
        setLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    fetchOverview(false)

    // 5-second automatic polling
    const intervalId = setInterval(() => {
      fetchOverview(false)
    }, 5000)

    return () => {
      isMountedRef.current = false
      clearInterval(intervalId)
    }
  }, [fetchOverview])

  const apiMode = getApiMode()

  // Format timestamp helper
  const formatTime = (date) => {
    if (!date) return '—'
    return date.toLocaleTimeString([], { hour12: false })
  }

  // 1. Loading State
  if (loading && !overview) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 bg-slate-800/60 rounded-lg w-1/3"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-slate-900/60 rounded-xl border border-slate-800/80 p-5"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-44 bg-slate-900/60 rounded-xl border border-slate-800/80"></div>
          <div className="h-44 bg-slate-900/60 rounded-xl border border-slate-800/80"></div>
        </div>
      </div>
    )
  }

  // 2. Error State (e.g. 401 unauthenticated or 502/network failure)
  if (error && !overview) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-300 flex items-center justify-center mx-auto text-xl font-bold">
          !
        </div>
        <div>
          <h2 className="text-base font-bold text-white">
            {error.code === 'UNAUTHORIZED' ? 'Authentication Required' : 'Overview Telemetry Unavailable'}
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-md mx-auto">
            {error.code === 'UNAUTHORIZED'
              ? 'Please unlock the dashboard using the local admin token in the top navigation.'
              : error.message || 'Unable to connect to the FastAPI management backend on 127.0.0.1:8000.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchOverview(true)}
          className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
        >
          Retry Connection
        </button>
      </div>
    )
  }

  const {
    environment = 'local_lab',
    is_simulated = true,
    proxy = {},
    traffic = {},
    lab = {},
    advisories = {},
    scanner = {},
    generated_at,
  } = overview || {}

  const proxyMode = proxy.mode || 'shadow'
  const isReadyForEnforce = Boolean(proxy.ready_for_enforce)

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Zone 1 — Security Overview
            </h2>
            <span
              className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded border ${
                is_simulated
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              }`}
            >
              {is_simulated ? 'Simulated Lab' : 'Observed Lab'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time proxy posture, telemetry counters, and upstream mock runtime health.
          </p>
        </div>

        {/* Polling & Manual Refresh */}
        <div className="flex items-center space-x-3 text-xs">
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Updated: <strong className="text-slate-300 font-mono">{formatTime(lastUpdated)}</strong>
            <span className="text-slate-400 ml-1.5">(auto-refresh 5s)</span>
          </span>
          <button
            type="button"
            onClick={() => fetchOverview(true)}
            disabled={isRefreshing}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
          >
            <span className={isRefreshing ? 'animate-spin inline-block' : ''}>🔄</span>
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Background Poll Error Alert */}
      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl text-xs flex items-center justify-between gap-3 bg-rose-500/10 text-rose-300 border border-rose-500/30 shadow-sm"
        >
          <div className="flex items-center space-x-2">
            <span>⚠️</span>
            <span>
              {error.code === 'UNAUTHORIZED'
                ? 'Session expired: Admin token cleared. Please unlock the dashboard again.'
                : `Telemetry refresh failed: ${error.message}`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-slate-800 transition"
            aria-label="Dismiss alert"
          >
            ✕
          </button>
        </div>
      )}

      {/* Primary Telemetry Grid: 4 Top Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Proxy Mode & Readiness */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Proxy Defense Mode
              </span>
              <span
                className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded border ${
                  proxyMode === 'enforce'
                    ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                    : proxyMode === 'shadow'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {proxyMode}
              </span>
            </div>
            <div className="text-2xl font-black text-white capitalize mb-1">
              {proxyMode} Mode
            </div>
            <p className="text-[11px] text-slate-400">
              {proxyMode === 'enforce'
                ? 'Active filtering: Harmless marker returns 403.'
                : proxyMode === 'shadow'
                ? 'Passive observation: Matched queries are logged & forwarded.'
                : 'Emergency passthrough: Rule evaluation disabled.'}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Enforce Gate:</span>
            <span
              className={`font-semibold font-mono ${
                isReadyForEnforce ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {isReadyForEnforce ? 'Ready (Replay Passed)' : 'Replay Required'}
            </span>
          </div>
        </div>

        {/* Card 2: Total Requests */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Total Requests
              </span>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                Port 8080
              </span>
            </div>
            <div className="text-3xl font-black text-white font-mono mb-1">
              {traffic.total_requests ?? 0}
            </div>
            <p className="text-[11px] text-slate-400">
              Total inspected HTTP transactions logged to local SQLite.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>Environment:</span>
            <span className="font-mono text-slate-300">{environment}</span>
          </div>
        </div>

        {/* Card 3: Shadow Matches */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Shadow Matches
              </span>
              <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                Observed
              </span>
            </div>
            <div className="text-3xl font-black text-amber-300 font-mono mb-1">
              {traffic.shadow_matches ?? 0}
            </div>
            <p className="text-[11px] text-slate-400">
              Harmless query markers matched while in non-blocking Shadow mode.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>Allowed Traffic:</span>
            <span className="font-mono text-emerald-400 font-semibold">{traffic.allowed_requests ?? 0}</span>
          </div>
        </div>

        {/* Card 4: Blocked Requests */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Blocked Requests
              </span>
              <span className="text-[10px] font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                HTTP 403
              </span>
            </div>
            <div className="text-3xl font-black text-rose-400 font-mono mb-1">
              {traffic.blocked_requests ?? 0}
            </div>
            <p className="text-[11px] text-slate-400">
              Simulated attack markers blocked directly by PatchPilot.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>Enforce Status:</span>
            <span className="font-mono text-slate-300">
              {proxyMode === 'enforce' ? 'Active' : 'Dormant'}
            </span>
          </div>
        </div>
      </div>

      {/* Secondary Information Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Lab Target Card */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <span>🎯</span>
              <span>Local Lab Target Status</span>
            </span>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold flex items-center space-x-1.5 ${
                lab.status === 'online'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  lab.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                }`}
              ></span>
              <span className="uppercase">{lab.status || 'unknown'}</span>
            </span>
          </div>

          <div className="space-y-2 text-xs text-slate-300 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80 font-mono">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Fixed Upstream:</span>
              <span className="text-sky-300 font-bold">{lab.upstream || '127.0.0.1:8081'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Simulated Stack:</span>
              <span className="text-slate-200">{lab.simulated_stack || 'Apache/2.4.52 + PHP/8.2.0'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Runtime Nature:</span>
              <span className="text-amber-400 text-[11px]">Python Mock (Inert Lab Target)</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">
            Upstream is pinned to 127.0.0.1:8081. Requests to third-party or arbitrary remote URLs are rejected by proxy architecture.
          </p>
        </div>

        {/* System Subsystems & Diagnostics Card */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <span>⚙️</span>
              <span>Module Health & Subsystems</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
              MODE: {apiMode.toUpperCase()}
            </span>
          </div>

          <div className="space-y-2 text-xs text-slate-300 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Security Advisories (Zone 4):</span>
              <span className="font-mono text-slate-200 font-bold">
                {advisories.total ?? 0} active notice(s)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">File Compromise Scanner:</span>
              <span className="font-mono text-amber-400 font-semibold">
                {scanner.status === 'not_implemented' ? 'Phase 2 — Coming soon' : scanner.status}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Management API:</span>
              <span className="font-mono text-emerald-400 font-semibold">
                Online (127.0.0.1:8000)
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            Telemetry snapshot generated at: <span className="font-mono text-slate-300">{generated_at || 'Live'}</span>
          </p>
        </div>
      </div>
    </div>
  )
}
