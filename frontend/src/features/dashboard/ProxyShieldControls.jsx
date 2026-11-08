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
  const [isVerifyingReadiness, setIsVerifyingReadiness] = useState(false)
  const [isReadinessUnverified, setIsReadinessUnverified] = useState(false)
  const [isRollingBack, setIsRollingBack] = useState(false)
  const [isLiveConnected, setIsLiveConnected] = useState(false)

  // Confirmation Modals State
  const [pendingMode, setPendingMode] = useState(null) // 'off' | 'shadow' | 'enforce'
  const [showRollbackModal, setShowRollbackModal] = useState(false)

  // Accessibility & Focus Management Refs
  const triggerRef = useRef(null)
  const modeModalRef = useRef(null)
  const rollbackModalRef = useRef(null)

  // Race condition protection: track latest request ID and generation to safely ignore stale async responses
  const isMountedRef = useRef(true)
  const latestRequestIdRef = useRef(0)
  const statusGenerationRef = useRef(0)
  const isReplayActiveRef = useRef(false)
  const isReadinessUnverifiedRef = useRef(false)

  // Close modals safely and restore focus to the trigger button
  const handleCloseModeModal = useCallback(() => {
    if (isUpdatingMode) return
    setPendingMode(null)
    if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
      triggerRef.current.focus()
      triggerRef.current = null
    }
  }, [isUpdatingMode])

  const handleCloseRollbackModal = useCallback(() => {
    if (isRollingBack) return
    setShowRollbackModal(false)
    if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
      triggerRef.current.focus()
      triggerRef.current = null
    }
  }, [isRollingBack])

  // Move keyboard focus into active modal on open
  useEffect(() => {
    if (pendingMode && modeModalRef.current) {
      const focusable = modeModalRef.current.querySelectorAll(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length > 0) {
        focusable[0].focus()
      }
    }
  }, [pendingMode])

  useEffect(() => {
    if (showRollbackModal && rollbackModalRef.current) {
      const focusable = rollbackModalRef.current.querySelectorAll(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length > 0) {
        focusable[0].focus()
      }
    }
  }, [showRollbackModal])

  // Keyboard navigation & Tab trapping inside active modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeModalRef = pendingMode ? modeModalRef : showRollbackModal ? rollbackModalRef : null
      if (!activeModalRef || !activeModalRef.current) return

      // Escape closes cancellable modals
      if (e.key === 'Escape') {
        e.preventDefault()
        if (pendingMode && !isUpdatingMode) {
          handleCloseModeModal()
        } else if (showRollbackModal && !isRollingBack) {
          handleCloseRollbackModal()
        }
        return
      }

      // Tab trap
      if (e.key === 'Tab') {
        const focusableElements = Array.from(
          activeModalRef.current.querySelectorAll(
            'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        )
        if (focusableElements.length === 0) return

        const firstEl = focusableElements[0]
        const lastEl = focusableElements[focusableElements.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === firstEl || !activeModalRef.current.contains(document.activeElement)) {
            e.preventDefault()
            lastEl.focus()
          }
        } else {
          if (document.activeElement === lastEl || !activeModalRef.current.contains(document.activeElement)) {
            e.preventDefault()
            firstEl.focus()
          }
        }
      }
    }

    if (pendingMode || showRollbackModal) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [pendingMode, showRollbackModal, isUpdatingMode, isRollingBack, handleCloseModeModal, handleCloseRollbackModal])

  const fetchShieldData = useCallback(async (isInitial = false) => {
    const requestId = ++latestRequestIdRef.current
    const reqGen = statusGenerationRef.current
    if (isInitial) setLoading(true)
    setError(null)

    const activeMode = getApiMode()

    try {
      const [statusData, rulesData] = await Promise.all([
        getProxyStatus(),
        getRules({ limit: 50, offset: 0 }),
      ])

      // Discard response if unmounted, superseded by a newer poll, initiated before/during a replay, or if replay is currently active
      if (
        !isMountedRef.current ||
        requestId !== latestRequestIdRef.current ||
        reqGen !== statusGenerationRef.current ||
        isReplayActiveRef.current
      ) {
        return
      }

      setProxyStatus(statusData)
      setRules(rulesData?.items || [])
      setIsLiveConnected(activeMode === 'real')
      setLastUpdated(new Date())
      setLoading(false)
      isReadinessUnverifiedRef.current = false
      setIsReadinessUnverified(false)
    } catch (err) {
      if (
        !isMountedRef.current ||
        requestId !== latestRequestIdRef.current ||
        reqGen !== statusGenerationRef.current ||
        isReplayActiveRef.current
      ) {
        return
      }

      setIsLiveConnected(false)
      setError(err)
      setLoading(false)
      isReadinessUnverifiedRef.current = true
      setIsReadinessUnverified(true)
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
  const handleRequestModeChange = (targetMode, e) => {
    setActionFeedback(null)

    if (targetMode === proxyStatus?.mode) return

    // Prevent transitions while already in flight or while replay/verification is pending
    if (isUpdatingMode || isRunningReplay || isVerifyingReadiness) return

    // Admin unlock check in real mode
    if (!hasAdminToken() && getApiMode() === 'real') {
      setActionFeedback({
        type: 'error',
        message: 'Admin Unlock Required: Please unlock the dashboard with your admin token in the top navigation before changing proxy modes.',
      })
      return
    }

    // Client-side Enforce Gate check (mirrors backend 409 gate with fail-closed readiness)
    if (targetMode === 'enforce' && !isReadyForEnforce) {
      setActionFeedback({
        type: 'error',
        message: isReadinessUnverified
          ? 'Replay Gate Locked: Proxy status verification is unverified. Please run replay again.'
          : 'Replay Gate Locked (409 Pre-check): ENFORCE mode requires a current passing replay test. Run the fixture evaluation on Rule #1 first.',
      })
      return
    }

    // Store trigger element for focus restoration
    triggerRef.current = e?.currentTarget || document.activeElement

    // Open confirmation modal for explicit user consent
    setPendingMode(targetMode)
  }

  // Mode change execution after user confirmation in modal
  const handleConfirmModeChange = async () => {
    if (!pendingMode || isUpdatingMode) return
    const modeToSet = pendingMode
    setIsUpdatingMode(true)
    setActionFeedback(null)

    try {
      const updatedStatus = await setProxyMode(modeToSet)
      if (isMountedRef.current) {
        setProxyStatus(updatedStatus)
        setPendingMode(null)
        setIsUpdatingMode(false)
        if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
          triggerRef.current.focus()
          triggerRef.current = null
        }
        setActionFeedback({
          type: 'success',
          message: isMockMode
            ? `[Demo Simulation] Proxy mode updated to ${modeToSet.toUpperCase()}. (Simulated in-memory state).`
            : `Proxy mode successfully transitioned to ${modeToSet.toUpperCase()} via backend confirmation.`,
        })
      }
    } catch (err) {
      if (isMountedRef.current) {
        setPendingMode(null)
        setIsUpdatingMode(false)
        if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
          triggerRef.current.focus()
          triggerRef.current = null
        }
        const errorDetail =
          err.code === 'REPLAY_REQUIRED' || err.status === 409
            ? `Replay Gate Failed (409): ${err.message}`
            : err.message || `Failed to transition proxy mode to ${modeToSet}.`
        setActionFeedback({
          type: 'error',
          message: errorDetail,
        })
      }
    }
  }

  // Open Rollback Confirmation Modal
  const handleOpenRollbackModal = (e) => {
    if (isRollingBack) return
    triggerRef.current = e?.currentTarget || document.activeElement
    setShowRollbackModal(true)
  }

  // Emergency Rollback handler
  const handleConfirmRollback = async () => {
    if (isRollingBack) return
    setIsRollingBack(true)
    setActionFeedback(null)

    try {
      const rollbackResponse = await rollbackProxy()
      if (isMountedRef.current) {
        // Refresh proxy status
        await fetchShieldData(false)
        setShowRollbackModal(false)
        setIsRollingBack(false)
        if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
          triggerRef.current.focus()
          triggerRef.current = null
        }
        setActionFeedback({
          type: 'success',
          message: isMockMode
            ? `[Demo Simulation] Emergency rollback complete: Mode restored to SHADOW.`
            : rollbackResponse.message || 'Emergency rollback confirmed: Enforcement disabled; Shadow logging restored.',
        })
      }
    } catch (err) {
      if (isMountedRef.current) {
        setShowRollbackModal(false)
        setIsRollingBack(false)
        if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
          triggerRef.current.focus()
          triggerRef.current = null
        }
        setActionFeedback({
          type: 'error',
          message: err.message || 'Failed to execute rollback to Shadow mode.',
        })
      }
    }
  }

  // Run Replay Test against harmless offline fixtures
  const handleRunReplay = async (ruleId) => {
    if (!ruleId || isRunningReplay || isVerifyingReadiness) return
    setIsRunningReplay(true)
    setIsVerifyingReadiness(true)
    isReplayActiveRef.current = true
    isReadinessUnverifiedRef.current = true
    // Advance generation counter and invalidate any pre-replay status polls
    const replayGen = ++statusGenerationRef.current
    latestRequestIdRef.current++
    // Fail-closed immediately upon replay initiation so stale ready_for_enforce cannot enable Enforce UI
    setIsReadinessUnverified(true)
    setActionFeedback(null)

    try {
      const result = await runRuleReplay(ruleId)
      if (isMountedRef.current && replayGen === statusGenerationRef.current) {
        setReplayResult(result)

        const isPassed = Boolean(result.passed)
        const benignTotal = Number(result.benign_total) || 0
        const benignMatches = Number(result.benign_matches) || 0
        const attackTotal = Number(result.attack_total) || 0
        const attackMatches = Number(result.attack_matches) || 0

        if (isPassed && benignMatches === 0) {
          // Fetch fresh proxy status directly and verify if ready_for_enforce is true
          let refreshedStatus = null
          let statusFetchError = false
          try {
            refreshedStatus = await getProxyStatus()
          } catch (statusErr) {
            statusFetchError = true
            refreshedStatus = null
          }

          if (!isMountedRef.current || replayGen !== statusGenerationRef.current) return

          if (statusFetchError || !refreshedStatus) {
            // Status refresh failed: fail-closed! Clear stale ready_for_enforce in local state
            setProxyStatus((prev) => (prev ? { ...prev, ready_for_enforce: false } : null))
            isReadinessUnverifiedRef.current = true
            setIsReadinessUnverified(true)
            setActionFeedback({
              type: 'error',
              message: `Rule #${ruleId} replay evaluation passed (0 FP, ${attackMatches}/${attackTotal} matched in replay). Global Enforce readiness unverified (proxy status check failed).`,
            })
          } else {
            // Authoritative fresh status received from backend
            setProxyStatus(refreshedStatus)
            isReadinessUnverifiedRef.current = false
            setIsReadinessUnverified(false)

            const isGlobalGateReady = Boolean(refreshedStatus?.ready_for_enforce)
            if (isGlobalGateReady) {
              setActionFeedback({
                type: 'success',
                message: isMockMode
                  ? `[Demo Fixture Replay] Rule #${ruleId} replay evaluation passed (0 FP, ${attackMatches}/${attackTotal} matched in replay). Demo fixture status: Enforce gate ready (simulated).`
                  : `Rule #${ruleId} replay evaluation passed (0 FP, ${attackMatches}/${attackTotal} matched in replay). Backend confirmed: Ready for Enforce.`,
              })
            } else {
              setActionFeedback({
                type: 'success',
                message: `Rule #${ruleId} replay evaluation passed (0 FP, ${attackMatches}/${attackTotal} matched in replay). Enforce gate status: Awaiting global policy confirmation.`,
              })
            }
          }
        } else {
          // Replay evaluation failed (FP > 0 or not passed)
          setProxyStatus((prev) => (prev ? { ...prev, ready_for_enforce: false } : null))
          isReadinessUnverifiedRef.current = true
          setIsReadinessUnverified(true)
          setActionFeedback({
            type: 'error',
            message: `Replay evaluation failed for Rule #${ruleId}. Benign: ${benignTotal} tested (${benignMatches} false positive${benignMatches === 1 ? '' : 's'}), Attack: ${attackTotal} tested (${attackMatches} matched in replay). Replay Gate locked.`,
          })
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        isReadinessUnverifiedRef.current = true
        setIsReadinessUnverified(true)
        setProxyStatus((prev) => (prev ? { ...prev, ready_for_enforce: false } : null))
        setActionFeedback({
          type: 'error',
          message: err.message || `Failed to execute rule #${ruleId} replay fixture evaluation.`,
        })
      }
    } finally {
      if (isMountedRef.current) {
        // Invalidate outstanding polling responses, including polls initiated DURING replay
        statusGenerationRef.current++
        latestRequestIdRef.current++
        isReplayActiveRef.current = false
        setIsRunningReplay(false)
        setIsVerifyingReadiness(false)
      }
    }
  }

  const currentMode = proxyStatus?.mode || 'shadow'
  const isEnforcePendingVerification = isRunningReplay || isVerifyingReadiness
  // FIX 1: Fail-closed global Enforce readiness
  const isReadyForEnforce = Boolean(
    !isEnforcePendingVerification &&
    !isReadinessUnverified &&
    proxyStatus?.ready_for_enforce
  )
  const isAnyModalOpen = Boolean(pendingMode || showRollbackModal)

  // Calculations for replay progress visualization with zero-denominator safety
  const benignTotal = Number(replayResult?.benign_total) || 0
  const benignMatches = Number(replayResult?.benign_matches) || 0
  const benignPassed = Math.max(0, benignTotal - benignMatches)
  const benignPassPct = benignTotal > 0 ? Math.round((benignPassed / benignTotal) * 100) : 0

  const attackTotal = Number(replayResult?.attack_total) || 0
  const attackMatches = Number(replayResult?.attack_matches) || 0
  const attackInterceptPct = attackTotal > 0 ? Math.round((attackMatches / attackTotal) * 100) : 0

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
        className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-8 text-center space-y-4 max-w-2xl mx-auto my-8 shadow-lg shadow-rose-950/20 backdrop-blur-md"
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
    <>
      {/* Background content wrapped with inert and aria-hidden during modal display */}
      <div
        className="space-y-6"
        inert={isAnyModalOpen ? '' : undefined}
        aria-hidden={isAnyModalOpen ? 'true' : undefined}
      >
        {/* 1. Header & Live Status Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-bold text-white tracking-tight">
                Zone 3 — Proxy Shield Controls
              </h2>
              {/* Mode badge */}
              <span
                className={`text-[10px] font-mono uppercase font-bold px-2.5 py-0.5 rounded border transition-colors ${
                  currentMode === 'enforce'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm shadow-rose-950/30'
                    : currentMode === 'shadow'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-950/30'
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
                className={`font-mono font-semibold text-[11px] px-2.5 py-0.5 rounded border transition-colors ${
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
            className="rounded-xl border border-sky-500/30 bg-sky-950/30 p-3.5 text-xs flex flex-wrap items-center justify-between gap-2.5 text-sky-200 shadow-sm backdrop-blur-sm"
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
            className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 text-xs flex flex-wrap items-center justify-between gap-2.5 text-emerald-200 shadow-sm backdrop-blur-sm"
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
            className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 text-xs flex flex-wrap items-center justify-between gap-2.5 text-amber-200 shadow-sm backdrop-blur-sm"
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
            className="p-3.5 rounded-xl text-xs flex items-center justify-between gap-3 bg-rose-500/10 text-rose-300 border border-rose-500/30 shadow-sm backdrop-blur-sm"
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
            className={`p-4 rounded-xl text-xs flex items-start justify-between gap-3 border shadow-sm backdrop-blur-sm ${
              actionFeedback.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 shadow-emerald-950/20'
                : 'bg-rose-500/10 text-rose-300 border-rose-500/30 shadow-rose-950/20'
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
          className="rounded-xl border border-slate-800/80 bg-slate-900/50 backdrop-blur-md p-6 space-y-5 shadow-lg shadow-slate-950/30"
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
              onClick={(e) => handleRequestModeChange('off', e)}
              disabled={isUpdatingMode || currentMode === 'off'}
              aria-pressed={currentMode === 'off'}
              className={`p-4 rounded-xl border text-left transition-all duration-200 relative flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                currentMode === 'off'
                  ? 'bg-slate-800/90 border-slate-500 text-white shadow-lg shadow-slate-950/40 ring-1 ring-slate-400/50'
                  : 'bg-slate-950/50 border-slate-800/80 text-slate-400 hover:border-slate-700 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold font-mono tracking-wider">OFF</span>
                  {currentMode === 'off' && (
                    <span className="text-[10px] font-mono bg-slate-700 text-slate-200 px-2 py-0.5 rounded font-bold border border-slate-600">
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
              onClick={(e) => handleRequestModeChange('shadow', e)}
              disabled={isUpdatingMode || currentMode === 'shadow'}
              aria-pressed={currentMode === 'shadow'}
              className={`p-4 rounded-xl border text-left transition-all duration-200 relative flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                currentMode === 'shadow'
                  ? 'bg-amber-500/10 border-amber-500/60 text-amber-200 shadow-lg shadow-amber-950/30 ring-1 ring-amber-500/50'
                  : 'bg-slate-950/50 border-slate-800/80 text-slate-400 hover:border-amber-500/40 hover:text-amber-300 hover:bg-slate-900/60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold font-mono tracking-wider text-amber-400">
                    SHADOW (Default)
                  </span>
                  {currentMode === 'shadow' && (
                    <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded font-bold">
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
              onClick={(e) => handleRequestModeChange('enforce', e)}
              disabled={isUpdatingMode || isEnforcePendingVerification || currentMode === 'enforce' || !isReadyForEnforce}
              aria-pressed={currentMode === 'enforce'}
              className={`p-4 rounded-xl border text-left transition-all duration-200 relative flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
                currentMode === 'enforce'
                  ? 'bg-rose-500/15 border-rose-500/60 text-rose-200 shadow-lg shadow-rose-950/40 ring-1 ring-rose-500/50'
                  : !isReadyForEnforce
                  ? 'bg-slate-950/30 border-slate-800/50 text-slate-500 cursor-not-allowed opacity-65'
                  : 'bg-slate-950/50 border-slate-800/80 text-slate-400 hover:border-rose-500/40 hover:text-rose-300 hover:bg-slate-900/60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold font-mono tracking-wider text-rose-400">
                    ENFORCE
                  </span>
                  {currentMode === 'enforce' ? (
                    <span className="text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded font-bold">
                      ACTIVE
                    </span>
                  ) : !isReadyForEnforce ? (
                    <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/30 font-bold">
                      {isEnforcePendingVerification
                        ? 'VERIFYING...'
                        : isReadinessUnverified
                        ? 'UNVERIFIED'
                        : 'GATED (REPLAY REQUIRED)'}
                    </span>
                  ) : null}
                </div>
                <h4 className="text-sm font-bold text-slate-200 mb-1">Active 403 Enforcement</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Actively intercepts requests matching verified rules, returning HTTP 403 Forbidden. Requires passing offline replay test.
                </p>
              </div>
              <span className="text-[10px] text-rose-400/80 mt-4 block pt-2 border-t border-slate-800/60 font-mono">
                {isReadyForEnforce
                  ? 'Action: Block matching (403)'
                  : isEnforcePendingVerification
                  ? 'Gate: Verification pending...'
                  : isReadinessUnverified
                  ? 'Gate: Status refresh unverified'
                  : 'Gate: Passing replay test required'}
              </span>
            </button>
          </div>
        </section>

        {/* 6. Emergency Rollback & Safety Card */}
        <section
          aria-label="Emergency rollback control"
          className="rounded-xl border border-amber-500/30 bg-amber-500/5 backdrop-blur-md p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
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
            onClick={handleOpenRollbackModal}
            disabled={isRollingBack}
            aria-busy={isRollingBack}
            className="shrink-0 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shadow-md shadow-amber-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:opacity-50"
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
          className="rounded-xl border border-slate-800/80 bg-slate-900/50 backdrop-blur-md p-6 space-y-4 shadow-lg shadow-slate-950/30"
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
          <div className="overflow-x-auto border border-slate-800/80 rounded-lg">
            <table className="w-full min-w-[640px] text-left text-xs border-collapse">
              <caption className="sr-only">Seeded security detection rules and replay verification state</caption>
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
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
                    // FIX 2: Latest replay result for this rule takes precedence over historic replay_passed.
                    // Historic rule.replay_passed is used only when there is no newer result for this rule.
                    const isThisRuleReplayed = replayResult && Number(replayResult.rule_id) === Number(rule.id)
                    const passed = isThisRuleReplayed
                      ? Boolean(replayResult.passed)
                      : Boolean(rule.replay_passed)
                    const failed = isThisRuleReplayed
                      ? !Boolean(replayResult.passed)
                      : false

                    return (
                      <tr key={rule.id} className="hover:bg-slate-800/40 transition-colors">
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
                            isReadyForEnforce ? (
                              <span className="inline-flex items-center space-x-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded">
                                <span>✓</span>
                                <span>Passed (Gate Ready)</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 text-[10px] font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/30 px-2.5 py-0.5 rounded">
                                <span>✓</span>
                                <span>Replay Passed (Pending Gate)</span>
                              </span>
                            )
                          ) : failed ? (
                            <span className="inline-flex items-center space-x-1 text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2.5 py-0.5 rounded">
                              <span>✕</span>
                              <span>Replay Failed</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 text-[10px] font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded">
                              <span>⏳</span>
                              <span>Replay Required</span>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleRunReplay(rule.id)}
                            disabled={isRunningReplay || isVerifyingReadiness}
                            aria-busy={isRunningReplay}
                            className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-600 text-white font-sans text-xs font-semibold transition-all duration-150 shadow-sm shadow-sky-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                          >
                            {isRunningReplay ? (
                              <span className="flex items-center space-x-1.5">
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

          {/* Replay Details Subcard with Calculated Progress Bars (FEATURE B) */}
          {replayResult && (
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-4 shadow-inner">
              <div className="flex flex-wrap items-center justify-between gap-2 text-slate-300">
                <div className="flex items-center space-x-2">
                  <span className={replayResult.passed ? 'text-emerald-400 font-bold text-sm' : 'text-rose-400 font-bold text-sm'}>
                    {replayResult.passed ? '✓' : '✕'}
                  </span>
                  <span className="font-bold text-white text-xs">
                    Replay Run #{replayResult.run_id} Results (Rule #{replayResult.rule_id}){' '}
                    <span className="text-slate-400 font-normal">
                      {isMockMode ? '(Simulated lab-v1 Fixture)' : '(Offline Fixture Evaluation)'}
                    </span>
                  </span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                      replayResult.passed
                        ? isReadyForEnforce
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                        : 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                    }`}
                  >
                    {replayResult.passed
                      ? isReadyForEnforce
                        ? '✓ GATE UNLOCKED'
                        : '✓ REPLAY PASSED (GATE LOCKED)'
                      : '❌ REPLAY FAILED (GATE LOCKED)'}
                  </span>
                </div>
                <span className="font-mono text-slate-400 text-[11px] tabular-nums">
                  Tested: {replayResult.tested_at}
                </span>
              </div>

              {/* Visual Progress Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-[11px]">
                {/* Benign Fixtures Count */}
                <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1.5">
                  <span className="text-slate-400 block text-[10px] font-sans">Benign Requests:</span>
                  <span className="text-white font-bold text-sm tabular-nums">{benignTotal}</span>
                  <span className="text-[10px] text-slate-500 block font-sans">Harmless lab baseline</span>
                </div>

                {/* Benign Pass Progress Bar */}
                <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-[10px] font-sans">Benign Pass Rate:</span>
                    <span className="text-emerald-400 font-bold tabular-nums">{benignPassPct}%</span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800/80">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                      style={{ width: `${benignPassPct}%` }}
                      role="progressbar"
                      aria-valuenow={benignPassPct}
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-label="Benign pass rate"
                    />
                  </div>
                  <span className="text-[10px] text-emerald-400/90 block font-sans">
                    {benignPassed} / {benignTotal} passed ({benignMatches} FP)
                  </span>
                </div>

                {/* Attack Markers Count */}
                <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1.5">
                  <span className="text-slate-400 block text-[10px] font-sans">Attack Markers:</span>
                  <span className="text-white font-bold text-sm tabular-nums">{attackTotal}</span>
                  <span className="text-[10px] text-slate-500 block font-sans">Tested fixture patterns</span>
                </div>

                {/* Attack Matches in Replay Progress Bar (FIX 1) */}
                <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-[10px] font-sans">Attack Detection:</span>
                    <span className="text-sky-400 font-bold tabular-nums">{attackInterceptPct}%</span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800/80">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-500"
                      style={{ width: `${attackInterceptPct}%` }}
                      role="progressbar"
                      aria-valuenow={attackInterceptPct}
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-label="Attack detection rate"
                    />
                  </div>
                  <span className="text-[10px] text-sky-400/90 block font-sans">
                    {attackMatches} / {attackTotal} matched in replay ({attackInterceptPct}%)
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* 8. Confirmation Modal: Mode Transition (OUTSIDE inert container, FIX 3) */}
      {pendingMode && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mode-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isUpdatingMode) {
              handleCloseModeModal()
            }
          }}
        >
          <div
            ref={modeModalRef}
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-slate-700 bg-[#0F172A] p-6 shadow-2xl space-y-4"
          >
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
                onClick={handleCloseModeModal}
                disabled={isUpdatingMode}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400 disabled:opacity-50"
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

      {/* 9. Confirmation Modal: Emergency Rollback (OUTSIDE inert container, FIX 3) */}
      {showRollbackModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rollback-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isRollingBack) {
              handleCloseRollbackModal()
            }
          }}
        >
          <div
            ref={rollbackModalRef}
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-amber-500/40 bg-[#0F172A] p-6 shadow-2xl shadow-amber-950/30 space-y-4"
          >
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
                onClick={handleCloseRollbackModal}
                disabled={isRollingBack}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRollback}
                disabled={isRollingBack}
                className="px-4 py-1.5 rounded-lg text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 transition shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-60"
              >
                {isRollingBack ? (
                  <span className="flex items-center space-x-1.5">
                    <span className="animate-spin inline-block">🔄</span>
                    <span>Rolling back...</span>
                  </span>
                ) : (
                  'Confirm Rollback'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
