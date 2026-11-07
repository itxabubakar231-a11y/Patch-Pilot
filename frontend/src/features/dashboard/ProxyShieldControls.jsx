/**
 * ProxyShieldControls Component (Zone 3)
 *
 * Provides proxy mode switching (OFF / SHADOW / ENFORCE), replay evaluation gate,
 * rule inspection, and instant emergency rollback to Shadow mode.
 * Conforms strictly to docs/API.md (Sections 3.B, 3.C, 3.D, 3.E, 3.F) and docs/DESIGN.md (Section 5).
 * Owned by Member 3 (Team B).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getProxyStatus,
  getRules,
  runRuleReplay,
  setProxyMode,
  rollbackProxy,
  hasAdminToken,
  getApiMode,
} from '../../services/apiClient.js'

export default function ProxyShieldControls() {
  const [proxyStatus, setProxyStatus] = useState(null)
  const [rules, setRules] = useState([])
  const [replayResult, setReplayResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [actionFeedback, setActionFeedback] = useState(null)
  const [isUpdatingMode, setIsUpdatingMode] = useState(false)
  const [isRunningReplay, setIsRunningReplay] = useState(false)
  const [isRollingBack, setIsRollingBack] = useState(false)
  const [isLiveConnected, setIsLiveConnected] = useState(false)

  // Confirmation Modals State
  const [pendingMode, setPendingMode] = useState(null) // 'off' | 'shadow' | 'enforce'
  const [showRollbackModal, setShowRollbackModal] = useState(false)

  // Race condition protection: track latest request ID to safely ignore stale async responses
  const isMountedRef = useRef(true)
  const latestRequestIdRef = useRef(0)

  // Keyboard navigation: Escape key closes active modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (pendingMode) setPendingMode(null)
        if (showRollbackModal) setShowRollbackModal(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pendingMode, showRollbackModal])

  const fetchShieldData = useCallback(async (isInitial = false) => {
    const requestId = ++latestRequestIdRef.current
    if (isInitial) setLoading(true)
    setError(null)

    const activeMode = getApiMode()

    try {
      const [statusData, rulesData] = await Promise.all([
        getProxyStatus(),
        getRules({ limit: 50, offset: 0 }),
      ])

      // Discard response if component unmounted or a newer request was dispatched
      if (!isMountedRef.current || requestId !== latestRequestIdRef.current) {
        return
      }

      setProxyStatus(statusData)
      setRules(rulesData?.items || [])
      setIsLiveConnected(activeMode === 'real')
      setLastUpdated(new Date())
      setLoading(false)
    } catch (err) {
      if (!isMountedRef.current || requestId !== latestRequestIdRef.current) {
        return
      }

      setIsLiveConnected(false)
      setError(err)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    fetchShieldData(true)

    // 5-second polling interval
    const intervalId = setInterval(() => {
      fetchShieldData(false)
    }, 5000)

    return () => {
      isMountedRef.current = false
      clearInterval(intervalId)
    }
  }, [fetchShieldData])

  const apiMode = getApiMode()
  const isMockMode = apiMode === 'mock'

  // Format local client clock time
  const formatTime = (date) => {
    if (!date) return '—'
    return date.toLocaleTimeString([], { hour12: false })
  }

  // Mode change request handler with local pre-validation
  const handleRequestModeChange = (targetMode) => {
    setActionFeedback(null)

    if (targetMode === proxyStatus?.mode) return

    // Prevent transitions while already in flight
    if (isUpdatingMode) return

    // Admin unlock check in real mode
    if (!hasAdminToken() && getApiMode() === 'real') {
      setActionFeedback({
        type: 'error',
        message: 'Admin Unlock Required: Please unlock the dashboard with your admin token in the top navigation before changing proxy modes.',
      })
      return
    }

    // Client-side Enforce Gate check (mirrors backend 409 gate)
    if (targetMode === 'enforce' && !proxyStatus?.ready_for_enforce) {
      setActionFeedback({
        type: 'error',
        message: 'Replay Gate Locked (409 Pre-check): ENFORCE mode requires a current passing replay test. Run the fixture evaluation on Rule #1 first.',
      })
      return
    }

    // Open confirmation modal for explicit user consent
    setPendingMode(targetMode)
  }

  // Mode change execution after user confirmation in modal
  const handleConfirmModeChange = async () => {
    if (!pendingMode || isUpdatingMode) return
    const modeToSet = pendingMode
    setPendingMode(null)
    setIsUpdatingMode(true)
    setActionFeedback(null)

    try {
      const updatedStatus = await setProxyMode(modeToSet)
      if (isMountedRef.current) {
        setProxyStatus(updatedStatus)
        setActionFeedback({
          type: 'success',
          message: isMockMode
            ? `[Demo Simulation] Proxy mode updated to ${modeToSet.toUpperCase()}. (Simulated in-memory state).`
            : `Proxy mode successfully transitioned to ${modeToSet.toUpperCase()} via backend confirmation.`,
        })
        setIsUpdatingMode(false)
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errorDetail =
          err.code === 'REPLAY_REQUIRED' || err.status === 409
            ? `Replay Gate Failed (409): ${err.message}`
            : err.message || `Failed to transition proxy mode to ${modeToSet}.`
        setActionFeedback({
          type: 'error',
          message: errorDetail,
        })
        setIsUpdatingMode(false)
      }
    }
  }

  // Emergency Rollback handler
  const handleConfirmRollback = async () => {
    if (isRollingBack) return
    setShowRollbackModal(false)
    setIsRollingBack(true)
    setActionFeedback(null)

    try {
      const rollbackResponse = await rollbackProxy()
      if (isMountedRef.current) {
        // Refresh proxy status
        await fetchShieldData(false)
        setActionFeedback({
          type: 'success',
          message: isMockMode
            ? `[Demo Simulation] Emergency rollback complete: Mode restored to SHADOW.`
            : rollbackResponse.message || 'Emergency rollback confirmed: Enforcement disabled; Shadow logging restored.',
        })
        setIsRollingBack(false)
      }
    } catch (err) {
      if (isMountedRef.current) {
        setActionFeedback({
          type: 'error',
          message: err.message || 'Failed to execute rollback to Shadow mode.',
        })
        setIsRollingBack(false)
      }
    }
  }

  // Run Replay Test against harmless offline fixtures
  const handleRunReplay = async (ruleId) => {
    if (!ruleId || isRunningReplay) return
    setIsRunningReplay(true)
    setActionFeedback(null)

    try {
      const result = await runRuleReplay(ruleId)
      if (isMountedRef.current) {
        setReplayResult(result)
        // Refresh proxy status to reflect updated ready_for_enforce
        await fetchShieldData(false)
        setActionFeedback({
          type: 'success',
          message: isMockMode
            ? `[Demo Fixture Replay] Evaluation passed! Benign: ${result.benign_total} tested (0 false positives), Attack: ${result.attack_total} tested (${result.attack_matches} matched). Gate Ready.`
            : `Replay evaluation passed! Benign: ${result.benign_total} tested (0 FP), Attack: ${result.attack_total} tested (${result.attack_matches} matched). Enforce Gate Ready.`,
        })
        setIsRunningReplay(false)
      }
    } catch (err) {
      if (isMountedRef.current) {
        setActionFeedback({
          type: 'error',
          message: err.message || 'Failed to execute rule replay fixture evaluation.',
        })
        setIsRunningReplay(false)
      }
    }
  }

  const currentMode = proxyStatus?.mode || 'shadow'
  const isReadyForEnforce = Boolean(proxyStatus?.ready_for_enforce)

  // 1. Initial Loading Skeleton
  if (loading && !proxyStatus) {
    return (
      <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading shield controls">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="space-y-2">
            <div className="h-6 bg-slate-800/70 rounded-md w-64"></div>
            <div className="h-4 bg-slate-800/40 rounded-md w-96 max-w-full"></div>
          </div>
          <div className="h-8 bg-slate-800/60 rounded-lg w-28"></div>
        </div>
        <div className="h-44 bg-slate-900/60 rounded-xl border border-slate-800/80"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-48 bg-slate-900/60 rounded-xl border border-slate-800/80"></div>
          <div className="h-48 bg-slate-900/60 rounded-xl border border-slate-800/80"></div>
        </div>
      </div>
    )
  }

  // 2. Fatal Error state when initial fetch fails
  if (error && !proxyStatus) {
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
            {isUnauthorized ? 'Authentication Required' : 'Shield Controls Unavailable'}
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
            {isUnauthorized
              ? 'Please unlock the dashboard using the local admin token in the top navigation to view proxy shield status.'
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
            onClick={() => fetchShieldData(true)}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            Retry Connection
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 1. Header & Live Status Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Zone 3 — Proxy Shield Controls
            </h2>
            {/* Mode badge */}
            <span
              className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded border ${
                currentMode === 'enforce'
                  ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                  : currentMode === 'shadow'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              ACTIVE: {currentMode.toUpperCase()}
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
            Reversible request filtering controls. Mode transitions are authenticated, gated by replay fixtures, and auditable.
          </p>
        </div>

        {/* Replay Gate Status & UI Polling time */}
        <div className="flex items-center space-x-3 text-xs shrink-0">
          <div className="text-[11px] text-slate-400 hidden sm:inline" aria-live="polite">
            UI Polled:{' '}
            <strong className="text-slate-300 font-mono tabular-nums">{formatTime(lastUpdated)}</strong>
            <span className="text-slate-500 ml-1.5">(client 5s refresh)</span>
          </div>
          <div className="flex items-center space-x-1.5 text-xs">
            <span className="text-slate-400 text-[11px]">Gate:</span>
            <span
              className={`font-mono font-semibold text-[11px] px-2.5 py-0.5 rounded border ${
                isReadyForEnforce
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              }`}
              title={
                isReadyForEnforce
                  ? 'All approved rules passed replay testing. Eligible for Enforce mode.'
                  : 'Enforce mode blocked until offline test suite passes.'
              }
            >
              {isReadyForEnforce ? '✓ READY FOR ENFORCE' : '⏳ REPLAY REQUIRED'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Mock vs Live Accuracy Disclosure Banner */}
      {isMockMode ? (
        <div
          role="note"
          aria-label="Demo shield controls disclosure"
          className="rounded-xl border border-sky-500/30 bg-sky-950/30 p-3.5 text-xs flex flex-wrap items-center justify-between gap-2.5 text-sky-200 shadow-sm"
        >
          <div className="flex items-center space-x-2.5">
            <span className="text-base">ℹ️</span>
            <div>
              <span className="font-bold text-sky-300">DEMO FIXTURE MODE ACTIVE:</span>{' '}
              <span>
                Proxy shield controls and replay testing are simulated in-memory using local fixtures. No live proxy mode transitions or kernel-level packet filtering are performed.
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
              <span className="font-bold text-emerald-300">LIVE PROXY MANAGEMENT CONNECTED:</span>{' '}
              <span>
                Mode transitions, replay evaluations, and rollbacks are executed by the FastAPI service on <code className="text-white font-mono">http://127.0.0.1:8000</code>.
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

      {/* 3. Background Poll Error Alert */}
      {error && proxyStatus && (
        <div
          role="alert"
          aria-live="polite"
          className="p-3.5 rounded-xl text-xs flex items-center justify-between gap-3 bg-rose-500/10 text-rose-300 border border-rose-500/30 shadow-sm"
        >
          <div className="flex items-center space-x-2">
            <span>⚠️</span>
            <span>
              {error.code === 'UNAUTHORIZED'
                ? 'Session expired: Admin token cleared. Please unlock the dashboard again in the top navigation.'
                : `Proxy status refresh failed: ${error.message || 'Check backend connection.'}`}
            </span>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={() => fetchShieldData(false)}
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

      {/* 4. Action Notification Feedback Banner */}
      {actionFeedback && (
        <div
          role="alert"
          aria-live="assertive"
          className={`p-4 rounded-xl text-xs flex items-start justify-between gap-3 border shadow-sm ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
          }`}
        >
          <div className="flex items-start space-x-2.5">
            <span className="text-base leading-none">{actionFeedback.type === 'success' ? '✓' : '⚠️'}</span>
            <div className="space-y-1">
              <span className="font-semibold block">
                {actionFeedback.type === 'success' ? 'Operation Completed' : 'Operation Denied'}
              </span>
              <p className="text-[11px] leading-relaxed">{actionFeedback.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-slate-400 hover:text-white text-xs p-1 rounded hover:bg-slate-800/60 transition focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
            aria-label="Dismiss feedback"
          >
            ✕
          </button>
        </div>
      )}

      {/* 5. Main Defense Posture Selection Card */}
      <section
        aria-label="Defense posture selector"
        className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-6 space-y-5 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <span>🛡️</span>
              <span>1. Select Defense Posture</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose the inspection and enforcement behavior of the reverse proxy on port 8080.
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {isMockMode ? 'Fixture Timestamp: ' : 'Backend Updated: '}
            <span className="text-slate-300 tabular-nums">
              {proxyStatus?.updated_at ? `${proxyStatus.updated_at}${isMockMode ? ' (mock)' : ''}` : 'Recently'}
            </span>
          </span>
        </div>

        {/* Three-Button Mode Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* OFF Mode Button */}
          <button
            type="button"
            onClick={() => handleRequestModeChange('off')}
            disabled={isUpdatingMode || currentMode === 'off'}
            aria-pressed={currentMode === 'off'}
            className={`p-4 rounded-xl border text-left transition relative flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
              currentMode === 'off'
                ? 'bg-slate-800/90 border-slate-600 text-white shadow-md ring-1 ring-slate-500'
                : 'bg-slate-950/50 border-slate-800/80 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold font-mono tracking-wider">OFF</span>
                {currentMode === 'off' && (
                  <span className="text-[10px] font-mono bg-slate-700 text-slate-200 px-2 py-0.5 rounded font-bold">
                    ACTIVE
                  </span>
                )}
              </div>
              <h4 className="text-sm font-bold text-slate-200 mb-1">Emergency Passthrough</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Emergency option. Rule evaluation is disabled. Traffic forwards directly to the lab target uninspected.
              </p>
            </div>
            <span className="text-[10px] text-slate-400 mt-4 block pt-2 border-t border-slate-800/60 font-mono">
              Action: No rule evaluation
            </span>
          </button>

          {/* SHADOW Mode Button */}
          <button
            type="button"
            onClick={() => handleRequestModeChange('shadow')}
            disabled={isUpdatingMode || currentMode === 'shadow'}
            aria-pressed={currentMode === 'shadow'}
            className={`p-4 rounded-xl border text-left transition relative flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
              currentMode === 'shadow'
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-200 shadow-md ring-1 ring-amber-500/40'
                : 'bg-slate-950/50 border-slate-800/80 text-slate-400 hover:border-amber-500/30 hover:text-amber-300'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold font-mono tracking-wider text-amber-400">
                  SHADOW (Default)
                </span>
                {currentMode === 'shadow' && (
                  <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-bold">
                    ACTIVE
                  </span>
                )}
              </div>
              <h4 className="text-sm font-bold text-slate-200 mb-1">Non-Blocking Observation</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Matches demo queries and logs them as <code className="text-amber-300">shadow_match</code>. Requests safely reach the lab target with 0% false interruption.
              </p>
            </div>
            <span className="text-[10px] text-amber-400/80 mt-4 block pt-2 border-t border-slate-800/60 font-mono">
              Action: Log & forward (Zero blocking)
            </span>
          </button>

          {/* ENFORCE Mode Button */}
          <button
            type="button"
            onClick={() => handleRequestModeChange('enforce')}
            disabled={isUpdatingMode || currentMode === 'enforce' || !isReadyForEnforce}
            aria-pressed={currentMode === 'enforce'}
            className={`p-4 rounded-xl border text-left transition relative flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
              currentMode === 'enforce'
                ? 'bg-rose-500/15 border-rose-500/50 text-rose-200 shadow-md ring-1 ring-rose-500/50'
                : !isReadyForEnforce
                ? 'bg-slate-950/30 border-slate-800/50 text-slate-500 cursor-not-allowed opacity-60'
                : 'bg-slate-950/50 border-slate-800/80 text-slate-400 hover:border-rose-500/40 hover:text-rose-300'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold font-mono tracking-wider text-rose-400">
                  ENFORCE
                </span>
                {currentMode === 'enforce' ? (
                  <span className="text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded font-bold">
                    ACTIVE
                  </span>
                ) : !isReadyForEnforce ? (
                  <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20 font-bold">
                    GATED
                  </span>
                ) : null}
              </div>
              <h4 className="text-sm font-bold text-slate-200 mb-1">Active 403 Enforcement</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Actively intercepts requests matching verified rules, returning HTTP 403 Forbidden. Requires passing offline replay test.
              </p>
            </div>
            <span className="text-[10px] text-rose-400/80 mt-4 block pt-2 border-t border-slate-800/60 font-mono">
              {isReadyForEnforce ? 'Action: Block matching (403)' : 'Gate: Replay test required'}
            </span>
          </button>
        </div>
      </section>

      {/* 6. Emergency Rollback & Safety Card */}
      <section
        aria-label="Emergency rollback control"
        className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div className="space-y-1 max-w-2xl">
          <div className="flex items-center space-x-2">
            <span className="text-amber-400 text-base">⏪</span>
            <h3 className="text-sm font-bold text-white">Emergency Rollback Control</h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Immediately disables active enforcement and restores safe <strong>Shadow Mode</strong>. Preserves all configured rules and audit logs in SQLite without modifying historical data.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowRollbackModal(true)}
          disabled={isRollingBack}
          aria-busy={isRollingBack}
          className="shrink-0 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:opacity-50"
        >
          {isRollingBack ? (
            <span className="flex items-center space-x-1.5">
              <span className="animate-spin inline-block">🔄</span>
              <span>Rolling back...</span>
            </span>
          ) : (
            '⏪ Rollback to Shadow'
          )}
        </button>
      </section>

      {/* 7. Replay Gate & Security Rules Table */}
      <section
        aria-label="Security rules and replay evaluation"
        className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-6 space-y-4 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <span>📋</span>
              <span>2. Seeded Security Rules & Replay Gate</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Every rule must pass offline replay testing against harmless lab fixtures before Enforce mode is permitted.
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Fixture Version: <strong className="text-slate-300">lab-v1</strong>
          </span>
        </div>

        {/* Rules Table */}
        <div className="overflow-x-auto border border-slate-800 rounded-lg">
          <table className="w-full min-w-[640px] text-left text-xs border-collapse">
            <caption className="sr-only">Seeded security detection rules and replay verification state</caption>
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                <th scope="col" className="px-4 py-3">ID</th>
                <th scope="col" className="px-4 py-3">Rule Name</th>
                <th scope="col" className="px-4 py-3">Matcher Pattern</th>
                <th scope="col" className="px-4 py-3">Approval</th>
                <th scope="col" className="px-4 py-3">Replay Status</th>
                <th scope="col" className="px-4 py-3 text-right">Gate Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-slate-200">
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500 font-sans">
                    No security rules currently configured. Seeded demo rules will be populated upon backend initialization.
                  </td>
                </tr>
              ) : (
                rules.map((rule) => {
                  const passed = rule.replay_passed || replayResult?.passed
                  return (
                    <tr key={rule.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-slate-400 font-bold">#{rule.id}</td>
                      <td className="px-4 py-3 font-sans font-medium text-white">
                        <div>
                          <span>{rule.name}</span>
                          {rule.rule_digest && (
                            <span
                              className="block text-[10px] text-slate-500 font-mono truncate max-w-xs"
                              title={`Digest: ${rule.rule_digest}`}
                            >
                              Digest: {rule.rule_digest.slice(0, 16)}...
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-sky-300">
                          {rule.match_config?.name}={rule.match_config?.value}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                          {rule.human_approved ? 'Approved Demo' : 'Pending Review'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {passed ? (
                          <span className="inline-flex items-center space-x-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                            <span>✓</span>
                            <span>Passed (Gate Ready)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-[10px] font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                            <span>⏳</span>
                            <span>Replay Required</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleRunReplay(rule.id)}
                          disabled={isRunningReplay}
                          aria-busy={isRunningReplay}
                          className="px-3 py-1 rounded bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-600 text-white font-sans text-xs font-semibold transition shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                        >
                          {isRunningReplay ? (
                            <span className="flex items-center space-x-1">
                              <span className="animate-spin inline-block">🔄</span>
                              <span>Evaluating...</span>
                            </span>
                          ) : (
                            'Run Replay Test'
                          )}
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Replay Details Subcard */}
        {replayResult && (
          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-slate-300 font-bold">
              <span className="flex items-center space-x-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>
                  Replay Run #{replayResult.run_id} Results{' '}
                  <span className="text-slate-400 font-normal">
                    {isMockMode ? '(Simulated lab-v1 Fixture)' : '(Offline Fixture Evaluation)'}
                  </span>
                </span>
              </span>
              <span className="font-mono text-slate-400 text-[11px] tabular-nums">
                Tested: {replayResult.tested_at}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block text-[10px] font-sans">Benign Fixtures:</span>
                <span className="text-white font-bold tabular-nums">{replayResult.benign_total} requests</span>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block text-[10px] font-sans">Benign Matches:</span>
                <span className="text-emerald-400 font-bold tabular-nums">
                  {replayResult.benign_matches} (0 FP required)
                </span>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block text-[10px] font-sans">Attack Markers:</span>
                <span className="text-white font-bold tabular-nums">{replayResult.attack_total} marker</span>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block text-[10px] font-sans">Attack Matches:</span>
                <span className="text-sky-400 font-bold tabular-nums">
                  {replayResult.attack_matches} (100% matched)
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 8. Confirmation Modal: Mode Transition */}
      {pendingMode && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mode-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isUpdatingMode) setPendingMode(null)
          }}
        >
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-slate-800 bg-[#111C2F] p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 pb-3 border-b border-slate-800">
              <span className="text-2xl">
                {pendingMode === 'enforce' ? '🛡️' : pendingMode === 'shadow' ? '👁' : '⏸️'}
              </span>
              <div>
                <h3 id="mode-modal-title" className="text-base font-bold text-white">
                  Confirm Mode Transition to {pendingMode.toUpperCase()}
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">
                  {isMockMode ? 'Simulated Transition (Mock Mode)' : 'Requires Admin Authorization'}
                </span>
              </div>
            </div>

            <div className="text-xs text-slate-300 leading-relaxed space-y-2">
              {pendingMode === 'enforce' ? (
                <>
                  <p>
                    You are switching PatchPilot into <strong>ENFORCE</strong> mode. Only local lab traffic through port 8080 will be affected. Requests matching approved demo rules will receive HTTP 403.
                  </p>
                  <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px]">
                    <strong>Important Safety Disclosure:</strong> This is a local hackathon defensive prototype and not a certified WAF or production fix for PHP2Shell vulnerabilities.
                  </div>
                </>
              ) : pendingMode === 'shadow' ? (
                <p>
                  You are switching PatchPilot into <strong>SHADOW</strong> mode. Matched queries will be recorded as <code>shadow_match</code> and forwarded to the lab target without blocking.
                </p>
              ) : (
                <p>
                  You are switching PatchPilot to <strong>OFF</strong> mode. Rule evaluation will be disabled. All requests will pass through uninspected.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPendingMode(null)}
                disabled={isUpdatingMode}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmModeChange}
                disabled={isUpdatingMode}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold text-white transition shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
                  pendingMode === 'enforce'
                    ? 'bg-rose-500 hover:bg-rose-400 focus-visible:ring-rose-400'
                    : 'bg-sky-500 hover:bg-sky-400 focus-visible:ring-sky-400'
                }`}
              >
                {isUpdatingMode ? 'Updating...' : `Confirm ${pendingMode.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. Confirmation Modal: Emergency Rollback */}
      {showRollbackModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rollback-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isRollingBack) setShowRollbackModal(false)
          }}
        >
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-amber-500/30 bg-[#111C2F] p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 pb-3 border-b border-slate-800">
              <span className="text-2xl text-amber-400">⏪</span>
              <div>
                <h3 id="rollback-modal-title" className="text-base font-bold text-white">
                  Confirm Emergency Rollback
                </h3>
                <span className="text-[11px] text-amber-400 font-mono">Restores Safe Shadow Mode</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to trigger an immediate emergency rollback? This will revert the proxy from <strong>{currentMode.toUpperCase()}</strong> back to <strong>SHADOW</strong> mode and log an auditable event. No rules will be deleted.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowRollbackModal(false)}
                disabled={isRollingBack}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRollback}
                disabled={isRollingBack}
                className="px-4 py-1.5 rounded-lg text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 transition shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                {isRollingBack ? 'Rolling back...' : 'Confirm Rollback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
