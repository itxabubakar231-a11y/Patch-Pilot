/**
 * SecurityOverview Component (Zone 1)
 *
 * Displays real-time security posture, proxy defense mode & readiness,
 * request telemetry counters, upstream lab status, and subsystem diagnostics.
 * Conforms to docs/API.md (Section 3.A) and docs/DESIGN.md (Section 5).
 * Owned by Member 3 (Team B).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { getOverview, getApiMode } from '../../services/apiClient.js'

export default function SecurityOverview() {
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLiveConnected, setIsLiveConnected] = useState(false)

  // Race condition protection: track latest request ID to safely ignore stale async responses
  const isMountedRef = useRef(true)
  const latestRequestIdRef = useRef(0)

  const fetchOverview = useCallback(async (isManual = false) => {
    const requestId = ++latestRequestIdRef.current
    if (isManual) setIsRefreshing(true)
    setError(null)

    const activeMode = getApiMode()

    try {
      const data = await getOverview()

      // Discard response if component unmounted or a newer request was dispatched
      if (!isMountedRef.current || requestId !== latestRequestIdRef.current) {
        return
      }

      setOverview(data)
      // Only set live connected when an actual API response is successfully returned in real mode
      setIsLiveConnected(activeMode === 'real')
      setLastUpdated(new Date())
      setLoading(false)
      setIsRefreshing(false)
    } catch (err) {
      if (!isMountedRef.current || requestId !== latestRequestIdRef.current) {
        return
      }

      setIsLiveConnected(false)
      setError(err)
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    fetchOverview(false)

    // 5-second automatic telemetry polling
    const intervalId = setInterval(() => {
      fetchOverview(false)
    }, 5000)

    return () => {
      isMountedRef.current = false
      clearInterval(intervalId)
    }
  }, [fetchOverview])

  const apiMode = getApiMode()
  const isMockMode = apiMode === 'mock'

  // Format local client clock time
  const formatTime = (date) => {
    if (!date) return '—'
    return date.toLocaleTimeString([], { hour12: false })
  }

  // 1. Initial Loading State Skeleton
  if (loading && !overview) {
    return (
      <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading security overview telemetry">
        {/* Header Skeleton */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="space-y-2">
            <div className="h-6 bg-slate-800/70 rounded-md w-64"></div>
            <div className="h-4 bg-slate-800/40 rounded-md w-96 max-w-full"></div>
          </div>
          <div className="h-8 bg-slate-800/60 rounded-lg w-28"></div>
        </div>

        {/* 4 Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-36 bg-slate-900/60 rounded-xl border border-slate-800/80 p-5 space-y-3">
              <div className="h-4 bg-slate-800/60 rounded w-1/2"></div>
              <div className="h-8 bg-slate-800/80 rounded w-1/3"></div>
              <div className="h-3 bg-slate-800/40 rounded w-3/4"></div>
            </div>
          ))}
        </div>

        {/* Subsystems Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-56 bg-slate-900/60 rounded-xl border border-slate-800/80 p-5"></div>
          <div className="h-56 bg-slate-900/60 rounded-xl border border-slate-800/80 p-5"></div>
        </div>
      </div>
    )
  }

  // 2. Fatal / Initial Error State (e.g. 401 unauthenticated or backend unreachable when no cached overview)
  if (error && !overview) {
    const isUnauthorized = error.code === 'UNAUTHORIZED' || error.status === 401
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-8 text-center space-y-4 max-w-2xl mx-auto my-8 shadow-lg shadow-rose-950/20"
      >
        <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-300 flex items-center justify-center mx-auto text-xl font-bold border border-rose-500/40">
          !
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-white tracking-tight">
            {isUnauthorized ? 'Authentication Required' : 'Overview Telemetry Unavailable'}
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
            {isUnauthorized
              ? 'Protected endpoint access requires unlocking the demo in the top navigation bar with your local admin token.'
              : error.message || 'Unable to connect to the FastAPI management backend on http://127.0.0.1:8000.'}
          </p>
          {error.code && (
            <div className="pt-1">
              <span className="font-mono text-[10px] text-rose-300 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800/60">
                ERROR CODE: {error.code}
              </span>
            </div>
          )}
        </div>
        <div className="pt-2">
          <button
            type="button"
            onClick={() => fetchOverview(true)}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            Retry Connection
          </button>
        </div>
      </div>
    )
  }

  // Extract payload conforming strictly to docs/API.md Section 3.A
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

  // Format helper for numbers (tabular digits)
  const formatCount = (val) => (typeof val === 'number' ? val.toLocaleString() : '0')

  return (
    <div className="space-y-6">
      {/* 1. Header & Live Telemetry Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Zone 1 — Security Overview
            </h2>
            {/* Environment Badge */}
            <span
              className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded border ${
                is_simulated
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              }`}
              title={
                is_simulated
                  ? 'Local sandbox target simulating vulnerable PHP behavior on 127.0.0.1:8081'
                  : 'Live connected lab environment'
              }
            >
              {is_simulated ? 'Simulated Lab' : 'Observed Lab'}
            </span>

            {/* Mock vs Live Data Mode Badge */}
            <span
              className={`text-[10px] font-mono uppercase font-semibold px-2 py-0.5 rounded border ${
                isMockMode
                  ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                  : isLiveConnected
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              }`}
            >
              {isMockMode
                ? 'Data: Mock Fixture'
                : isLiveConnected
                ? 'Data: Live Backend'
                : 'Data: Real Mode (Unverified)'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time defensive proxy posture, HTTP request inspection metrics, and mock PHP lab runtime status.
          </p>
        </div>

        {/* Polling indicator & Manual Refresh Button */}
        <div className="flex items-center space-x-3 text-xs shrink-0">
          <div className="text-[11px] text-slate-400 hidden sm:inline" aria-live="polite">
            UI Polled:{' '}
            <strong className="text-slate-300 font-mono tabular-nums">{formatTime(lastUpdated)}</strong>
            <span className="text-slate-500 ml-1.5">(client 5s refresh)</span>
          </div>
          <button
            type="button"
            onClick={() => fetchOverview(true)}
            disabled={isRefreshing}
            aria-busy={isRefreshing}
            aria-label="Refresh UI telemetry view"
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50"
          >
            <span className={`inline-block ${isRefreshing ? 'animate-spin' : ''}`}>🔄</span>
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 2. Mock vs Live Accuracy Disclosure Banner */}
      {isMockMode ? (
        <div
          role="note"
          aria-label="Demo mode disclosure"
          className="rounded-xl border border-sky-500/30 bg-sky-950/30 p-3.5 text-xs flex flex-wrap items-center justify-between gap-2.5 text-sky-200 shadow-sm"
        >
          <div className="flex items-center space-x-2.5">
            <span className="text-base">ℹ️</span>
            <div>
              <span className="font-bold text-sky-300">DEMO FIXTURE MODE ACTIVE:</span>{' '}
              <span>
                Displaying deterministic benchmark telemetry for hackathon evaluation. No live HTTP requests to port 8000 or port 8081 are performed.
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-sky-400 bg-sky-900/50 px-2 py-0.5 rounded border border-sky-700/60 uppercase">
            VITE_DATA_MODE=mock
          </span>
        </div>
      ) : isLiveConnected ? (
        <div
          role="note"
          aria-label="Live backend mode active"
          className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 text-xs flex flex-wrap items-center justify-between gap-2.5 text-emerald-200 shadow-sm"
        >
          <div className="flex items-center space-x-2.5">
            <span className="text-base">⚡</span>
            <div>
              <span className="font-bold text-emerald-300">LIVE MANAGEMENT API CONNECTED:</span>{' '}
              <span>
                Authenticated telemetry response verified from FastAPI management service on <code className="text-white font-mono">http://127.0.0.1:8000</code>.
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-900/50 px-2 py-0.5 rounded border border-emerald-700/60 uppercase">
            Verified Port 8000
          </span>
        </div>
      ) : (
        <div
          role="note"
          aria-label="Real mode unverified"
          className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 text-xs flex flex-wrap items-center justify-between gap-2.5 text-amber-200 shadow-sm"
        >
          <div className="flex items-center space-x-2.5">
            <span className="text-base">⏳</span>
            <div>
              <span className="font-bold text-amber-300">REAL MODE CONFIGURED (CONNECTION UNVERIFIED):</span>{' '}
              <span>
                Configured for live API, but an authenticated response from <code className="text-white font-mono">http://127.0.0.1:8000</code> has not been established yet.
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-amber-400 bg-amber-900/50 px-2 py-0.5 rounded border border-amber-700/60 uppercase">
            Awaiting 8000 Response
          </span>
        </div>
      )}

      {/* 3. Background Refresh Failure Alert (when cached overview exists) */}
      {error && overview && (
        <div
          role="alert"
          aria-live="polite"
          className="p-3.5 rounded-xl text-xs flex items-center justify-between gap-3 bg-rose-500/10 text-rose-300 border border-rose-500/30 shadow-sm"
        >
          <div className="flex items-center space-x-2">
            <span>⚠️</span>
            <span>
              {error.code === 'UNAUTHORIZED'
                ? 'Session expired: Admin token was cleared. Please unlock the dashboard in top navigation.'
                : `Telemetry background poll failed: ${error.message || 'Check backend connection.'}`}
            </span>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={() => fetchOverview(true)}
              className="text-xs px-2 py-0.5 rounded bg-rose-900/40 hover:bg-rose-850 text-rose-200 border border-rose-700/60 transition"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-slate-800 transition"
              aria-label="Dismiss alert"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 4. Primary Telemetry Grid: 4 Top Cards */}
      <section aria-label="Key security indicators" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Proxy Defense Mode */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 shadow-sm flex flex-col justify-between hover:border-slate-700/80 transition">
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
            <div className="text-2xl font-black text-white capitalize mb-1 flex items-center space-x-2">
              <span>{proxyMode === 'enforce' ? '🛡️' : proxyMode === 'shadow' ? '👁️' : '⚪'}</span>
              <span>{proxyMode} Mode</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed min-h-[34px]">
              {isMockMode ? (
                <span>
                  Mock fixture profile for {proxyMode} mode. (In live operation: {proxyMode === 'enforce' ? 'simulated marker returns 403.' : 'queries logged while traffic passes.'})
                </span>
              ) : proxyMode === 'enforce' ? (
                'Active defense: Simulated attacks and markers receive HTTP 403 blocks.'
              ) : proxyMode === 'shadow' ? (
                'Passive observation: Matched queries are logged while traffic passes safely.'
              ) : (
                'Emergency bypass: Rule matching disabled; traffic passes unmodified.'
              )}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Enforce Gate:</span>
            <span
              className={`font-semibold font-mono ${
                isReadyForEnforce ? 'text-emerald-400' : 'text-amber-400'
              }`}
              title={
                isReadyForEnforce
                  ? 'Rule evaluation passed offline replay tests; eligible for Enforce'
                  : 'Enforce mode blocked until offline test suite passes'
              }
            >
              {isReadyForEnforce ? '✓ Ready (Replay Passed)' : '⏳ Replay Required'}
            </span>
          </div>
        </div>

        {/* Card 2: Total Requests Inspected */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 shadow-sm flex flex-col justify-between hover:border-slate-700/80 transition">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Total Requests
              </span>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                Port 8080
              </span>
            </div>
            <div className="text-3xl font-black text-white font-mono tabular-nums mb-1">
              {formatCount(traffic.total_requests)}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed min-h-[34px]">
              {isMockMode
                ? 'Mock fixture dataset representing inspected HTTP requests planned for SQLite logging.'
                : 'Observed HTTP transactions inspected by reverse proxy and logged to local SQLite.'}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>{isMockMode ? 'Fixture Allowed:' : 'Allowed Traffic:'}</span>
            <span className="font-mono text-emerald-400 font-semibold tabular-nums">
              {formatCount(traffic.allowed_requests)} reqs
            </span>
          </div>
        </div>

        {/* Card 3: Shadow Matches (Observed) */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 shadow-sm flex flex-col justify-between hover:border-slate-700/80 transition">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Shadow Matches
              </span>
              <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                Observed
              </span>
            </div>
            <div className="text-3xl font-black text-amber-300 font-mono tabular-nums mb-1">
              {formatCount(traffic.shadow_matches)}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed min-h-[34px]">
              {isMockMode
                ? 'Simulated harmless marker matches from mock fixtures. Forwarded to mock lab target without blocking.'
                : 'Observed query markers matching detection rules. Forwarded to lab server without blocking.'}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>Disposition:</span>
            <span className="font-mono text-amber-400 font-medium">
              {isMockMode ? 'Logged & Forwarded (Fixture)' : 'Logged & Forwarded'}
            </span>
          </div>
        </div>

        {/* Card 4: Blocked Requests (Enforce) */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 shadow-sm flex flex-col justify-between hover:border-slate-700/80 transition">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Blocked Requests
              </span>
              <span className="text-[10px] font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                HTTP 403
              </span>
            </div>
            <div className="text-3xl font-black text-rose-400 font-mono tabular-nums mb-1">
              {formatCount(traffic.blocked_requests)}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed min-h-[34px]">
              {isMockMode
                ? 'Mock fixture baseline (0 blocks in default Shadow mode; increments only when Enforce is enabled).'
                : 'Simulated attack markers intercepted and rejected with HTTP 403 in Enforce mode.'}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>Enforcement:</span>
            <span className="font-mono text-slate-300">
              {proxyMode === 'enforce' ? (
                <span className="text-rose-400 font-bold">
                  {isMockMode ? 'Enforce Mode (Fixture)' : 'Active 403 Gate'}
                </span>
              ) : (
                <span className="text-slate-400">
                  {isMockMode ? 'Dormant (Shadow Fixture)' : 'Dormant (Shadow)'}
                </span>
              )}
            </span>
          </div>
        </div>
      </section>

      {/* 5. Subsystems, Lab Health, and Architecture Diagnostics */}
      <section aria-label="Subsystems and lab health" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Subsystem 1: Fixed Lab Target Details */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-5 space-y-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <span>🎯</span>
                <span>Isolated Lab Target Status</span>
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
                <span className="uppercase">
                  {isMockMode ? `Mock Lab (${lab.status || 'online'})` : lab.status || 'unknown'}
                </span>
              </span>
            </div>

            <div className="space-y-2.5 text-xs text-slate-300 bg-slate-950/60 p-4 rounded-lg border border-slate-800/80 font-mono">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-sans">Fixed Upstream:</span>
                <span className="text-sky-300 font-bold">{lab.upstream || '127.0.0.1:8081'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-sans">Simulated Stack:</span>
                <span className="text-slate-200">{lab.simulated_stack || 'Apache/2.4.52 + PHP/8.2.0'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-sans">Target Isolation:</span>
                <span className="text-amber-400 text-[11px]">Strict Loopback (No External Routing)</span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            {isMockMode
              ? 'Local mock environment configured for port 8081. In live testing, the reverse proxy exclusively forwards traffic to loopback upstream (127.0.0.1:8081).'
              : 'The security proxy exclusively forwards requests to the pinned loopback upstream (127.0.0.1:8081). Arbitrary target URLs or remote hosts are rejected by architectural design.'}
          </p>
        </div>

        {/* Subsystem 2: Module Health & Diagnostics */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-5 space-y-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <span>⚙️</span>
                <span>Module Health & Subsystems</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                MODE: {apiMode.toUpperCase()}
              </span>
            </div>

            <div className="space-y-2.5 text-xs text-slate-300 bg-slate-950/60 p-4 rounded-lg border border-slate-800/80">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Security Advisories (Zone 4):</span>
                <span className="font-mono text-slate-200 font-bold tabular-nums">
                  {advisories.total ?? 0} active notice(s)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">File Compromise Scanner:</span>
                <span className="font-mono text-amber-400 font-semibold text-[11px]">
                  {scanner.status === 'not_implemented' ? 'Phase 2 — Scheduled' : scanner.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Management API (Port 8000):</span>
                <span className="font-mono font-semibold text-[11px]">
                  {isLiveConnected ? (
                    <span className="text-emerald-400">Connected (Authenticated HTTP 200)</span>
                  ) : apiMode === 'real' ? (
                    <span className="text-amber-400">Unreachable / Pending (127.0.0.1:8000)</span>
                  ) : (
                    <span className="text-sky-400">Mock Fixture Mode (Not Queried)</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-1">
            <span>
              {isMockMode ? 'Fixture Baseline Timestamp: ' : 'Telemetry Timestamp: '}
              <span className="font-mono text-slate-300 tabular-nums">
                {generated_at ? `${generated_at}${isMockMode ? ' (pre-recorded baseline)' : ''}` : 'Live stream'}
              </span>
            </span>
            <span className="text-slate-500 font-mono text-[10px]">
              {isMockMode ? 'Source: mock fixture' : `Environment: ${environment}`}
            </span>
          </div>
        </div>
      </section>

      {/* 6. System Architecture Topology Guide (Clarity for Hackathon Judges) */}
      <section
        aria-label="PatchPilot loopback network topology"
        className="rounded-xl border border-slate-800/60 bg-slate-900/20 p-4"
      >
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800/60">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
            <span>🗺️</span>
            <span>Local Network Topology & Port Bindings</span>
          </span>
          <span className="text-[10px] font-mono text-slate-500">127.0.0.1 Loopback Only</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-mono text-sky-400 font-bold block mb-1">PORT 5173</span>
              <span className="font-semibold text-slate-200">Operator Dashboard</span>
              <p className="text-[11px] text-slate-400 mt-1">React + Vite operator interface (active).</p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-mono text-emerald-400 font-bold block mb-1">PORT 8000</span>
              <span className="font-semibold text-slate-200">Management API</span>
              <p className="text-[11px] text-slate-400 mt-1">FastAPI service (health check active; telemetry APIs planned for Sprint 2).</p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-mono text-amber-400 font-bold block mb-1">PORT 8080</span>
              <span className="font-semibold text-slate-200">Reverse Proxy</span>
              <p className="text-[11px] text-slate-400 mt-1">Sprint 1 reverse proxy forwarder to 8081; inline rule filtering planned for Sprint 2.</p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-mono text-rose-400 font-bold block mb-1">PORT 8081</span>
              <span className="font-semibold text-slate-200">Isolated Lab Target</span>
              <p className="text-[11px] text-slate-400 mt-1">Mock vulnerable PHP web server environment.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
