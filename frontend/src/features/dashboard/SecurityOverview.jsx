/**
 * SecurityOverview Component (Zone 1)
 *
 * Displays real-time security posture, proxy defense mode & readiness,
 * request telemetry counters, upstream lab status, and subsystem diagnostics.
 * Conforms to docs/API.md (Section 3.A) and docs/DESIGN.md (Section 5).
 * Enhanced in SmoothUI Sprint 3 with premium cyber command-center aesthetics,
 * honest capability descriptions, and robust timer lifecycle management.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { getOverview, getApiMode } from '../../services/apiClient.js'
import GlowCard from '../../components/GlowCard.jsx'

export default function SecurityOverview() {
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLiveConnected, setIsLiveConnected] = useState(false)
  const [metricChanged, setMetricChanged] = useState(false)

  // Race condition protection: track latest request ID to safely ignore stale async responses
  const isMountedRef = useRef(true)
  const latestRequestIdRef = useRef(0)
  const previousDataRef = useRef(null)
  // FIX 3: Manage metric-change highlight timeout through ref with proper cancellation & unmount cleanup
  const metricHighlightTimerRef = useRef(null)

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

      // FIX 3: Check if actual metrics changed between polls (without animating static fixtures)
      if (previousDataRef.current && data) {
        const prevTraffic = previousDataRef.current.traffic || {}
        const newTraffic = data.traffic || {}
        if (
          prevTraffic.total_requests !== newTraffic.total_requests ||
          prevTraffic.blocked_requests !== newTraffic.blocked_requests ||
          prevTraffic.shadow_matches !== newTraffic.shadow_matches
        ) {
          // Cancel any older timeout before starting a new one
          if (metricHighlightTimerRef.current) {
            clearTimeout(metricHighlightTimerRef.current)
          }
          setMetricChanged(true)
          metricHighlightTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              setMetricChanged(false)
            }
          }, 1000)
        }
      }
      previousDataRef.current = data

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
      // FIX 3: Clear metric highlight timer on component unmount
      if (metricHighlightTimerRef.current) {
        clearTimeout(metricHighlightTimerRef.current)
        metricHighlightTimerRef.current = null
      }
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
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.15)]'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.15)]'
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
            {isMockMode
              ? 'Defensive proxy posture and request telemetry overview (displaying benchmark mock fixture metrics).'
              : 'Defensive proxy posture and request inspection metrics from live backend.'}
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
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-xs font-semibold text-slate-200 border border-slate-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50 shadow-sm"
          >
            <span className={`inline-block transition-transform duration-500 ${isRefreshing ? 'animate-spin' : ''}`}>🔄</span>
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 2. Mock vs Live Accuracy Disclosure Banner */}
      {isMockMode ? (
        <div
          role="note"
          aria-label="Demo mode disclosure"
          className="rounded-xl border border-sky-500/30 bg-sky-950/30 p-3.5 text-xs flex flex-wrap items-center justify-between gap-2.5 text-sky-200 shadow-sm transition-all duration-200"
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

      {/* 4. Primary Telemetry Grid: 4 Top Cards (Preserved SmoothUI Glow Cards) */}
      <section
        aria-label="Key security indicators"
        className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 transition-all duration-300 ${
          metricChanged ? 'ring-1 ring-sky-400/40 rounded-2xl shadow-[0_0_20px_rgba(56,189,248,0.15)]' : ''
        }`}
      >
        {/* Card 1: Proxy Defense Mode */}
        <GlowCard color={proxyMode === 'enforce' ? 'rose' : proxyMode === 'shadow' ? 'amber' : 'slate'}>
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
            {/* FIX 1: Honest security capability description & clear mode conditions */}
            <p className="text-[11px] text-slate-400 leading-relaxed min-h-[34px]">
              {isMockMode ? (
                <span>
                  Mock fixture profile illustrating {proxyMode} mode. In Shadow mode, traffic passes while query markers are observed; in Enforce mode, matched markers are rejected with HTTP 403 once verified by offline replay.
                </span>
              ) : proxyMode === 'enforce' ? (
                'Live enforce mode: Detection rules intercept and reject matched attack markers with HTTP 403 blocks once verified by offline replay.'
              ) : proxyMode === 'shadow' ? (
                'Live shadow mode: Detection rules observe and log matched query markers while requests pass safely.'
              ) : (
                'Bypass mode: Rule matching disabled; traffic passes unmodified.'
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
        </GlowCard>

        {/* Card 2: Total Requests Inspected */}
        <GlowCard color="cyan">
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
        </GlowCard>

        {/* Card 3: Shadow Matches (Observed) */}
        <GlowCard color="amber">
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
        </GlowCard>

        {/* Card 4: Blocked Requests (Enforce) */}
        <GlowCard color="rose">
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
            {/* FIX 1: Honest blocked requests description */}
            <p className="text-[11px] text-slate-400 leading-relaxed min-h-[34px]">
              {isMockMode
                ? 'Mock fixture baseline (0 blocks in default Shadow mode; increments only when Enforce is enabled).'
                : 'Telemetry counter for rejected requests. Active 403 blocking applies only when Enforce mode is verified and running.'}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>Enforcement:</span>
            <span className="font-mono text-slate-300">
              {proxyMode === 'enforce' ? (
                <span className="text-rose-400 font-bold">
                  {isMockMode ? 'Enforce Mode (Fixture)' : isLiveConnected ? 'Enforce Gate (Live)' : 'Enforce (Configured)'}
                </span>
              ) : (
                <span className="text-slate-400">
                  {isMockMode ? 'Dormant (Shadow Fixture)' : 'Dormant (Shadow Mode)'}
                </span>
              )}
            </span>
          </div>
        </GlowCard>
      </section>

      {/* 5. Subsystems, Lab Health, and Architecture Diagnostics (Sprint 3 Enhanced) */}
      <section aria-label="Subsystems and lab health" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Subsystem 1: Fixed Lab Target Details */}
        <div className="group rounded-2xl border border-slate-800/80 hover:border-sky-500/40 bg-gradient-to-br from-[#0F172A]/90 via-[#0B132B]/80 to-[#0F172A]/90 p-5 space-y-4 flex flex-col justify-between shadow-lg shadow-black/20 transition-all duration-300 hover:shadow-[0_0_25px_rgba(56,189,248,0.08)]">
          <div>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800/60">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <span className="text-base group-hover:scale-110 transition-transform duration-200 motion-reduce:transform-none">🎯</span>
                <span>Isolated Lab Target Status</span>
              </span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold flex items-center space-x-1.5 transition-colors ${
                  lab.status === 'online'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.15)]'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    lab.status === 'online' ? 'bg-emerald-400 animate-pulse motion-reduce:animate-none' : 'bg-rose-400'
                  }`}
                />
                <span className="uppercase">
                  {isMockMode ? `Mock Lab (${lab.status || 'online'})` : lab.status || 'unknown'}
                </span>
              </span>
            </div>

            <div className="space-y-2.5 text-xs text-slate-300 bg-[#070D18]/80 p-4 rounded-xl border border-slate-800/90 font-mono shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-sans">Target Binding:</span>
                <span className="text-sky-300 font-bold flex items-center space-x-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                  <span>{lab.upstream || '127.0.0.1:8081'}</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-sans">Simulated Stack:</span>
                <span className="text-slate-200 bg-slate-800/50 px-2 py-0.5 rounded border border-slate-700/60 text-[11px]">
                  {lab.simulated_stack || 'Apache/2.4.52 + PHP/8.2.0'}
                </span>
              </div>
              {/* FIX 1: Honest target scope description (distinguishing proxy forward binding from host OS egress) */}
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-sans">Target Scope:</span>
                <span className="text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/25 text-[11px] font-semibold">
                  Localhost Upstream (127.0.0.1)
                </span>
              </div>
            </div>
          </div>

          {/* FIX 1: Honest lab target note */}
          <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
            {isMockMode
              ? 'Local mock environment pinned to upstream port 8081. In live setup, proxy forwards exclusively to 127.0.0.1:8081; host-level outbound egress filtering is managed by the system environment.'
              : 'The security proxy is architected to forward requests strictly to 127.0.0.1:8081. Host network egress controls depend on operating system configuration and are outside proxy application scope.'}
          </p>
        </div>

        {/* Subsystem 2: Module Health & Diagnostics */}
        <div className="group rounded-2xl border border-slate-800/80 hover:border-amber-500/40 bg-gradient-to-br from-[#0F172A]/90 via-[#0B132B]/80 to-[#0F172A]/90 p-5 space-y-4 flex flex-col justify-between shadow-lg shadow-black/20 transition-all duration-300 hover:shadow-[0_0_25px_rgba(245,158,11,0.08)]">
          <div>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800/60">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <span className="text-base group-hover:scale-110 transition-transform duration-200 motion-reduce:transform-none">⚙️</span>
                <span>Module Health & Subsystems</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                MODE: {apiMode.toUpperCase()}
              </span>
            </div>

            <div className="space-y-2.5 text-xs text-slate-300 bg-[#070D18]/80 p-4 rounded-xl border border-slate-800/90 shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Security Advisories (Zone 4):</span>
                <span className="font-mono text-sky-300 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/25 font-bold tabular-nums text-[11px]">
                  {advisories.total ?? 0} active notice(s)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">File Compromise Scanner:</span>
                <span className="font-mono text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/25 font-semibold text-[11px]">
                  {scanner.status === 'not_implemented' ? 'Phase 2 — Scheduled' : scanner.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Management API (Port 8000):</span>
                <span className="font-mono font-semibold text-[11px]">
                  {isLiveConnected ? (
                    <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/25">
                      Connected (HTTP 200)
                    </span>
                  ) : apiMode === 'real' ? (
                    <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/25">
                      Unverified / Pending (127.0.0.1:8000)
                    </span>
                  ) : (
                    <span className="text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700/60">
                      Mock Fixture Mode
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-1">
            <span>
              {isMockMode ? 'Fixture Baseline: ' : 'Telemetry Time: '}
              <span className="font-mono text-slate-300 tabular-nums">
                {generated_at ? `${generated_at}${isMockMode ? ' (baseline)' : ''}` : 'Live stream'}
              </span>
            </span>
            <span className="text-slate-500 font-mono text-[10px]">
              {isMockMode ? 'Source: mock fixture' : `Environment: ${environment}`}
            </span>
          </div>
        </div>
      </section>

      {/* 6. System Architecture Topology Guide (Sprint 3 Enhanced Flow Visualization) */}
      <section
        aria-label="PatchPilot loopback network topology"
        className="rounded-2xl border border-slate-800/80 bg-gradient-to-br from-[#0F172A]/70 via-[#0B132B]/50 to-[#0F172A]/70 p-5 shadow-lg shadow-black/20"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800/80">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_#38BDF8]" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Local Network Topology & Port Architecture
            </span>
          </div>
          {/* FIX 1: Honest architecture title badge */}
          <span className="text-[10px] font-mono text-slate-400 bg-slate-800/60 px-2.5 py-0.5 rounded-full border border-slate-700">
            Configured 127.0.0.1 Architecture
          </span>
        </div>

        {/* Cohesive Architecture Grid with Visual Role Flow */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Node 1: Operator Dashboard (5173) */}
          <div className="group p-3.5 rounded-xl bg-[#070D18]/90 border border-slate-800/90 hover:border-sky-500/50 transition-all duration-200 flex flex-col justify-between hover:shadow-[0_0_15px_rgba(56,189,248,0.12)]">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/25">
                  PORT 5173
                </span>
                <span className="text-[10px] font-mono text-emerald-400 font-semibold flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Active</span>
                </span>
              </div>
              <span className="font-bold text-slate-200 text-sm block">Operator Dashboard</span>
              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                React + Vite operator interface. Visualizes defensive posture and planned proxy controls; displays mock benchmark data in demo mode.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/60 text-[10px] text-slate-500 flex items-center justify-between font-mono">
              <span>Binding: 127.0.0.1</span>
              <span className="text-sky-400">UI Client</span>
            </div>
          </div>

          {/* Node 2: Management API (8000) - FIX 1: Honest control plane description */}
          <div className="group p-3.5 rounded-xl bg-[#070D18]/90 border border-slate-800/90 hover:border-emerald-500/50 transition-all duration-200 flex flex-col justify-between hover:shadow-[0_0_15px_rgba(16,185,129,0.12)]">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/25">
                  PORT 8000
                </span>
                <span className="text-[10px] font-mono text-slate-400 font-semibold">
                  FastAPI
                </span>
              </div>
              <span className="font-bold text-slate-200 text-sm block">Management API</span>
              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                Planned control plane interface. Architecture specifies bearer auth for policy updates, rule definitions, and advisory triage (backend integration in progress).
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/60 text-[10px] text-slate-500 flex items-center justify-between font-mono">
              <span>Binding: 127.0.0.1</span>
              <span className="text-emerald-400">Control Plane</span>
            </div>
          </div>

          {/* Node 3: Reverse Proxy (8080) - FIX 1: Honest proxy gate description */}
          <div className="group p-3.5 rounded-xl bg-[#070D18]/90 border border-slate-800/90 hover:border-amber-500/50 transition-all duration-200 flex flex-col justify-between hover:shadow-[0_0_15px_rgba(245,158,11,0.12)]">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/25">
                  PORT 8080
                </span>
                <span className="text-[10px] font-mono text-amber-300 font-semibold">
                  Forwarder Gate
                </span>
              </div>
              <span className="font-bold text-slate-200 text-sm block">Reverse Proxy Shield</span>
              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                Configured reverse proxy gateway forwarding to port 8081. Architecture planned for inline marker evaluation and 403 enforcement once offline replay tests pass.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/60 text-[10px] text-slate-500 flex items-center justify-between font-mono">
              <span>Binding: 127.0.0.1</span>
              <span className="text-amber-400">Proxy Ingress</span>
            </div>
          </div>

          {/* Node 4: Isolated Lab Target (8081) - FIX 1: Honest target description */}
          <div className="group p-3.5 rounded-xl bg-[#070D18]/90 border border-slate-800/90 hover:border-rose-500/50 transition-all duration-200 flex flex-col justify-between hover:shadow-[0_0_15px_rgba(244,63,94,0.12)]">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/25">
                  PORT 8081
                </span>
                <span className="text-[10px] font-mono text-rose-300 font-semibold">
                  Designated Upstream
                </span>
              </div>
              <span className="font-bold text-slate-200 text-sm block">Isolated Lab Target</span>
              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                Target architecture for mock vulnerable PHP lab on local port 8081. Designated upstream destination for proxy; runtime process availability is verified separately.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/60 text-[10px] text-slate-500 flex items-center justify-between font-mono">
              <span>Binding: 127.0.0.1</span>
              <span className="text-rose-400">Upstream Lab</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
