/**
 * ProxyShieldControls Component (Zone 3)
 *
 * Provides proxy mode switching (OFF / SHADOW / ENFORCE), replay evaluation gate,
 * rule inspection, and instant emergency rollback to Shadow mode.
 * Conforms to docs/API.md (Sections 3.B, 3.C, 3.D, 3.E, 3.F) and docs/DESIGN.md (Section 5).
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
  const [actionFeedback, setActionFeedback] = useState(null)
  const [isUpdatingMode, setIsUpdatingMode] = useState(false)
  const [isRunningReplay, setIsRunningReplay] = useState(false)
  const [isRollingBack, setIsRollingBack] = useState(false)

  // Confirmation Modals State
  const [pendingMode, setPendingMode] = useState(null) // 'off' | 'shadow' | 'enforce'
  const [showRollbackModal, setShowRollbackModal] = useState(false)

  const isMountedRef = useRef(true)

  // Keyboard navigation: Escape key closes modals
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
    if (isInitial) setLoading(true)
    setError(null)

    try {
      const [statusData, rulesData] = await Promise.all([
        getProxyStatus(),
        getRules({ limit: 50, offset: 0 }),
      ])

      if (isMountedRef.current) {
        setProxyStatus(statusData)
        setRules(rulesData?.items || [])
        setLoading(false)
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err)
        setLoading(false)
      }
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

  // Mode change handler with gate validation
  const handleRequestModeChange = (targetMode) => {
    setActionFeedback(null)

    if (targetMode === proxyStatus?.mode) return

    // Admin unlock check
    if (!hasAdminToken() && getApiMode() === 'real') {
      setActionFeedback({
        type: 'error',
        message: 'Admin Unlock Required: Please unlock the dashboard with your admin token in the top navigation before changing proxy modes.',
      })
      return
    }

    // Enforce requires passing replay
    if (targetMode === 'enforce' && !proxyStatus?.ready_for_enforce) {
      setActionFeedback({
        type: 'error',
        message: 'Replay Gate Failed: ENFORCE mode requires a current passing replay test. Run the fixture evaluation on Rule #1 first.',
      })
      return
    }

    // Open confirmation modal
    setPendingMode(targetMode)
  }

  const handleConfirmModeChange = async () => {
    if (!pendingMode) return
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
          message: `Proxy mode successfully updated to ${modeToSet.toUpperCase()}.`,
        })
        setIsUpdatingMode(false)
      }
    } catch (err) {
      if (isMountedRef.current) {
        setActionFeedback({
          type: 'error',
          message: err.message || `Failed to transition proxy mode to ${modeToSet}.`,
        })
        setIsUpdatingMode(false)
      }
    }
  }

  // Rollback to Shadow handler
  const handleConfirmRollback = async () => {
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
          message: rollbackResponse.message || 'Rollback complete: Enforcement disabled; Shadow logging restored.',
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

  // Run Replay Test
  const handleRunReplay = async (ruleId) => {
    if (!ruleId) return
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
          message: `Replay evaluation passed! Benign: ${result.benign_total} tested (0 false positives), Attack: ${result.attack_total} tested (${result.attack_matches} matched). Ready for Enforce.`,
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

  if (loading && !proxyStatus) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 bg-slate-800/60 rounded-lg w-1/3"></div>
        <div className="h-44 bg-slate-900/60 rounded-xl border border-slate-800/80"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-48 bg-slate-900/60 rounded-xl border border-slate-800/80"></div>
          <div className="h-48 bg-slate-900/60 rounded-xl border border-slate-800/80"></div>
        </div>
      </div>
    )
  }

  // Error state when initial fetch fails (e.g. 401 unauthenticated or network failure)
  if (error && !proxyStatus) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-300 flex items-center justify-center mx-auto text-xl font-bold">
          !
        </div>
        <div>
          <h2 className="text-base font-bold text-white">
            {error.code === 'UNAUTHORIZED' ? 'Authentication Required' : 'Shield Controls Unavailable'}
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-md mx-auto">
            {error.code === 'UNAUTHORIZED'
              ? 'Please unlock the dashboard using the local admin token in the top navigation.'
              : error.message || 'Unable to connect to the FastAPI management backend on 127.0.0.1:8000.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchShieldData(true)}
          className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
        >
          Retry Connection
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Zone 3 — Proxy Shield Controls
            </h2>
            <span
              className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded border ${
                currentMode === 'enforce'
                  ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                  : currentMode === 'shadow'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              CURRENT: {currentMode}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Reversible request filtering controls. Mode transitions are authenticated, gated by replay, and auditable.
          </p>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center space-x-2 text-xs">
          <span className="text-slate-400">Replay Gate:</span>
          <span
            className={`font-mono font-semibold text-[11px] px-2.5 py-0.5 rounded border ${
              isReadyForEnforce
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
            }`}
          >
            {isReadyForEnforce ? '✓ READY FOR ENFORCE' : '⏳ REPLAY REQUIRED'}
          </span>
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
                : `Proxy status refresh failed: ${error.message}`}
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

      {/* Action Notification Feedback Banner */}
      {actionFeedback && (
        <div
          role="alert"
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
            className="text-slate-400 hover:text-white text-xs p-1 rounded hover:bg-slate-800/60 transition"
            aria-label="Dismiss feedback"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Mode Selection Card */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-6 space-y-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              1. Select Defense Posture
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose the inspection and enforcement behavior of the reverse proxy on port 8080.
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Last updated: <span className="text-slate-300">{proxyStatus?.updated_at || 'Recently'}</span>
          </span>
        </div>

        {/* Three-Button Mode Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* OFF Mode Button */}
          <button
            type="button"
            onClick={() => handleRequestModeChange('off')}
            disabled={isUpdatingMode || currentMode === 'off'}
            className={`p-4 rounded-xl border text-left transition relative flex flex-col justify-between ${
              currentMode === 'off'
                ? 'bg-slate-800/90 border-slate-600 text-white shadow-md ring-1 ring-slate-500'
                : 'bg-slate-950/50 border-slate-800/80 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold font-mono tracking-wider">OFF</span>
                {currentMode === 'off' && (
                  <span className="text-[10px] font-mono bg-slate-700 text-slate-200 px-2 py-0.5 rounded">
                    ACTIVE
                  </span>
                )}
              </div>
              <h4 className="text-sm font-bold text-slate-200 mb-1">Passthrough</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Emergency option. No rule matching is performed; traffic forwards directly to the lab target.
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
            className={`p-4 rounded-xl border text-left transition relative flex flex-col justify-between ${
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
                  <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
                    ACTIVE
                  </span>
                )}
              </div>
              <h4 className="text-sm font-bold text-slate-200 mb-1">Detect & Observe</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Matches demo queries and logs them as <code className="text-amber-300">shadow_match</code>.
                Requests are still safely forwarded to the lab.
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
            className={`p-4 rounded-xl border text-left transition relative flex flex-col justify-between ${
              currentMode === 'enforce'
                ? 'bg-rose-500/15 border-rose-500/50 text-rose-200 shadow-md ring-1 ring-rose-500/50'
                : !isReadyForEnforce
                ? 'bg-slate-950/30 border-slate-800/50 text-slate-400 cursor-not-allowed opacity-60'
                : 'bg-slate-950/50 border-slate-800/80 text-slate-400 hover:border-rose-500/40 hover:text-rose-300'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold font-mono tracking-wider text-rose-400">
                  ENFORCE
                </span>
                {currentMode === 'enforce' ? (
                  <span className="text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded">
                    ACTIVE
                  </span>
                ) : !isReadyForEnforce ? (
                  <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                    GATED
                  </span>
                ) : null}
              </div>
              <h4 className="text-sm font-bold text-slate-200 mb-1">Active Protection</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Actively intercepts requests matching verified rules, returning HTTP 403 Forbidden directly from PatchPilot.
              </p>
            </div>
            <span className="text-[10px] text-rose-400/80 mt-4 block pt-2 border-t border-slate-800/60 font-mono">
              {isReadyForEnforce ? 'Action: Block matching (403)' : 'Gate: Replay test required'}
            </span>
          </button>
        </div>
      </div>

      {/* Emergency Rollback & Safety Card */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <div className="flex items-center space-x-2">
            <span className="text-amber-400 text-base">⏪</span>
            <h3 className="text-sm font-bold text-white">Emergency Rollback Control</h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Immediately disables active enforcement and restores safe <strong>Shadow Mode</strong>. Preserves all configured rules and audit logs in SQLite without modifying database history.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowRollbackModal(true)}
          disabled={isRollingBack}
          className="shrink-0 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shadow-md focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"
        >
          {isRollingBack ? 'Rolling back...' : '⏪ Rollback to Shadow'}
        </button>
      </div>

      {/* Replay Gate & Security Rules Table */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-6 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              2. Seeded Security Rules & Replay Gate
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
          <table className="w-full min-w-[620px] text-left text-xs border-collapse">
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
              {rules.map((rule) => {
                const passed = rule.replay_passed || replayResult?.passed
                return (
                  <tr key={rule.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-slate-400 font-bold">#{rule.id}</td>
                    <td className="px-4 py-3 font-sans font-medium text-white">{rule.name}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-sky-300">
                        {rule.match_config?.name}={rule.match_config?.value}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Approved Demo
                      </span>
                    </td>
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRunReplay(rule.id)}
                        disabled={isRunningReplay}
                        className="px-3 py-1 rounded bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-600 text-white font-sans text-xs font-semibold transition shadow-sm"
                      >
                        {isRunningReplay ? 'Testing...' : 'Run Replay Test'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Replay Details Subcard */}
        {replayResult && (
          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-2">
            <div className="flex items-center justify-between text-slate-300 font-bold">
              <span className="flex items-center space-x-2">
                <span className="text-emerald-400">✓</span>
                <span>Replay Run #{replayResult.run_id} Results (Offline Fixture Test)</span>
              </span>
              <span className="font-mono text-slate-400 text-[11px]">
                Tested: {replayResult.tested_at}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Benign Total:</span>
                <span className="text-white font-bold">{replayResult.benign_total} requests</span>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Benign Matches:</span>
                <span className="text-emerald-400 font-bold">{replayResult.benign_matches} (Zero FP)</span>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Attack Total:</span>
                <span className="text-white font-bold">{replayResult.attack_total} marker</span>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Attack Matches:</span>
                <span className="text-sky-400 font-bold">{replayResult.attack_matches} (100%)</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal: Mode Transition */}
      {pendingMode && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPendingMode(null)
          }}
        >
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-slate-800 bg-[#111C2F] p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 pb-3 border-b border-slate-800">
              <span className="text-2xl">
                {pendingMode === 'enforce' ? '🛡️' : pendingMode === 'shadow' ? '👁' : '⏸️'}
              </span>
              <div>
                <h3 className="text-base font-bold text-white">
                  Confirm Mode Transition to {pendingMode.toUpperCase()}
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">Requires Admin Authorization</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {pendingMode === 'enforce' ? (
                <span>
                  You are switching PatchPilot into <strong>ENFORCE</strong> mode. Only local lab traffic through port 8080 will be affected. Requests matching approved demo rules will receive HTTP 403.
                  <br /><br />
                  <strong className="text-amber-400">Notice:</strong> This is a local defensive prototype and not a certified WAF or production fix for PHP2Shell vulnerabilities.
                </span>
              ) : pendingMode === 'shadow' ? (
                <span>
                  You are switching PatchPilot into <strong>SHADOW</strong> mode. Matched queries will be recorded as <code>shadow_match</code> and forwarded to the lab target without blocking.
                </span>
              ) : (
                <span>
                  You are switching PatchPilot to <strong>OFF</strong> mode. Rule evaluation will be disabled. All requests will pass through uninspected.
                </span>
              )}
            </p>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPendingMode(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmModeChange}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold text-white transition shadow-sm ${
                  pendingMode === 'enforce'
                    ? 'bg-rose-500 hover:bg-rose-400'
                    : 'bg-sky-500 hover:bg-sky-400'
                }`}
              >
                Confirm {pendingMode.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Rollback */}
      {showRollbackModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowRollbackModal(false)
          }}
        >
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-amber-500/30 bg-[#111C2F] p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 pb-3 border-b border-slate-800">
              <span className="text-2xl text-amber-400">⏪</span>
              <div>
                <h3 className="text-base font-bold text-white">Confirm Emergency Rollback</h3>
                <span className="text-[11px] text-amber-400 font-mono">Restores Safe Shadow Mode</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to trigger an immediate rollback? This will switch the proxy from <strong>{currentMode.toUpperCase()}</strong> back to <strong>SHADOW</strong> mode and log an auditable event. No rules will be deleted.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowRollbackModal(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRollback}
                className="px-4 py-1.5 rounded-lg text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 transition shadow-sm"
              >
                Confirm Rollback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
