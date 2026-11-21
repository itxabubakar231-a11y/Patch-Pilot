/**
 * LiveDemoTrafficPanel Component (Zone 3 Extension)
 *
 * Provides in-dashboard live test traffic controls to demonstrate real HTTP 200/403
 * defensive reverse-proxy behavior without requiring a separate terminal window.
 *
 * Strict Environment Gating:
 * - Rendered ONLY in Vite development mode (import.meta.env.DEV)
 * - Rendered ONLY when VITE_DATA_MODE=real (getApiMode() === 'real')
 * - Rendered ONLY on local loopback (hostname === 'localhost' || hostname === '127.0.0.1')
 * - Completely omitted from production builds and Vercel deployments.
 *
 * Security Constraints:
 * - Narrowly scoped strictly to two harmless predefined GET requests:
 *   1. 'normal' -> GET / (Expected 200 when lab is online)
 *   2. 'marker' -> GET /?demo_attack=true (200 in Shadow, 403 in Enforce, 200 after Rollback)
 * - Zero arbitrary target URLs, paths, query parameters, headers, or payloads permitted.
 * - Does not modify proxy modes, replay state, or backend rules automatically.
 */

import { useState } from 'react'
import { getApiMode, sendDemoTraffic } from '../../services/apiClient.js'
import {
  IconGlobe,
  IconShieldAlert,
  IconCheckCircle,
  IconAlertTriangle,
  IconRefresh,
  IconClock,
  IconShieldCheck,
  IconShieldBan,
  IconInfo,
} from '../../components/Icons.jsx'

export default function LiveDemoTrafficPanel() {
  const isDev = Boolean(import.meta.env.DEV)
  const isReal = getApiMode() === 'real'
  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

  // Strict environment gating: completely hidden in production, mock mode, or non-local hosts (Vercel)
  if (!isDev || !isReal || !isLocalhost) {
    return null
  }

  const [isRunning, setIsRunning] = useState(false)
  const [activeType, setActiveType] = useState(null) // 'normal' | 'marker' | null
  const [lastResult, setLastResult] = useState(null)

  const handleSendTraffic = async (type) => {
    if (isRunning) return
    setIsRunning(true)
    setActiveType(type)

    const label = type === 'normal' ? 'Normal Request' : 'Demo Marker'
    const targetPath = type === 'normal' ? '/' : '/?demo_attack=true'
    const startTime = performance.now()

    try {
      const response = await sendDemoTraffic(type)
      const durationMs = Math.round(performance.now() - startTime)
      const status = response.status

      let description = ''
      let category = 'allowed'

      if (status === 200) {
        if (type === 'normal') {
          description = 'Permitted: Reverse proxy forwarded request to upstream lab (port 8081). Lab returned HTTP 200 OK.'
        } else {
          description = 'Observed: Harmless query marker demo_attack=true was permitted in Shadow Mode and forwarded to upstream lab.'
        }
        category = 'allowed'
      } else if (status === 403) {
        description = 'Blocked: Proxy shield intercepted query marker demo_attack=true in ENFORCE mode. Returned HTTP 403 Forbidden without reaching lab.'
        category = 'blocked'
      } else if (status === 502) {
        description = 'HTTP 502 Bad Gateway: Security proxy on port 8080 is online, but upstream lab server (port 8081) is unreachable.'
        category = 'error'
      } else {
        description = `HTTP ${status}: Received status code ${status} from security proxy.`
        category = 'error'
      }

      setLastResult({
        requestType: label,
        path: targetPath,
        method: 'GET',
        status,
        statusText: response.statusText || (status === 200 ? 'OK' : status === 403 ? 'Forbidden' : status === 502 ? 'Bad Gateway' : 'Response'),
        durationMs,
        timestamp: new Date(),
        description,
        category,
      })
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime)
      setLastResult({
        requestType: label,
        path: targetPath,
        method: 'GET',
        status: null,
        statusText: 'Connection Refused',
        durationMs,
        timestamp: new Date(),
        description: 'Connection failure: Unable to reach PatchPilot Security Proxy on 127.0.0.1:8080. Verify the proxy service is running.',
        category: 'error',
      })
    } finally {
      setIsRunning(false)
      setActiveType(null)
    }
  }

  // Format local clock time
  const formatTime = (date) => {
    if (!date) return '—'
    return date.toLocaleTimeString([], { hour12: false })
  }

  return (
    <section
      aria-label="Live Demo Traffic Controls"
      className="rounded-xl border border-emerald-500/25 bg-[#09151C]/90 backdrop-blur-md p-3.5 sm:p-4 space-y-3.5 shadow-sm"
    >
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <IconGlobe className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-[14px] sm:text-[15px] font-display font-semibold text-white tracking-tight">
              Live Demo Traffic Controls
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 font-sans">
              Dispatch real live loopback HTTP requests to the security proxy (port 8080) to demonstrate real-time defense posture.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[11px] font-mono font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>Target: 127.0.0.1:8080</span>
          </span>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
            Dev Mode Only
          </span>
        </div>
      </div>

      {/* Action Buttons Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-0.5">
        {/* Button 1: Send Normal Request */}
        <button
          type="button"
          onClick={() => handleSendTraffic('normal')}
          disabled={isRunning}
          aria-busy={isRunning && activeType === 'normal'}
          className="group relative rounded-lg border border-emerald-500/30 bg-[#061814]/80 hover:bg-[#08221c] p-3 text-left transition-all duration-150 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50 min-h-[72px]"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center space-x-2">
              <span className="w-6 h-6 rounded-md bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                <IconGlobe className={`w-3.5 h-3.5 ${isRunning && activeType === 'normal' ? 'animate-spin' : ''}`} />
              </span>
              <span className="text-xs sm:text-sm font-sans font-semibold text-white group-hover:text-emerald-300">
                {isRunning && activeType === 'normal' ? 'Sending request...' : 'Send Normal Request'}
              </span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 shrink-0">
              GET /
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-sans mt-1.5 leading-snug pl-8">
            Benign loopback request · Forwards to lab target · Expected: <strong className="text-emerald-300 font-mono">200 OK</strong>
          </p>
        </button>

        {/* Button 2: Send Demo Marker */}
        <button
          type="button"
          onClick={() => handleSendTraffic('marker')}
          disabled={isRunning}
          aria-busy={isRunning && activeType === 'marker'}
          className="group relative rounded-lg border border-cyan-500/30 bg-[#05171d]/80 hover:bg-[#072129] p-3 text-left transition-all duration-150 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-50 min-h-[72px]"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center space-x-2">
              <span className="w-6 h-6 rounded-md bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0">
                <IconShieldAlert className={`w-3.5 h-3.5 ${isRunning && activeType === 'marker' ? 'animate-spin' : ''}`} />
              </span>
              <span className="text-xs sm:text-sm font-sans font-semibold text-white group-hover:text-cyan-300">
                {isRunning && activeType === 'marker' ? 'Sending marker...' : 'Send Demo Marker'}
              </span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 shrink-0">
              ?demo_attack=true
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-sans mt-1.5 leading-snug pl-8">
            Harmless attack marker · <span className="text-emerald-400 font-mono font-medium">200</span> in Shadow · <span className="text-rose-400 font-mono font-medium">403</span> in Enforce · <span className="text-emerald-400 font-mono font-medium">200</span> on Rollback
          </p>
        </button>
      </div>

      {/* Last Test Result Display */}
      <div
        aria-label="Last test result"
        aria-live="polite"
        className="rounded-lg border border-white/[0.08] bg-[#040C10]/90 p-3 space-y-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.05] pb-2">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-sans font-semibold text-slate-300">Last Test Result:</span>
            {lastResult ? (
              <span className="text-xs font-mono font-medium text-white px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.1]">
                {lastResult.requestType} <span className="text-slate-400">({lastResult.path})</span>
              </span>
            ) : (
              <span className="text-xs font-sans text-slate-400 italic">No demo traffic dispatched in this session</span>
            )}
          </div>

          {lastResult && (
            <div className="flex items-center space-x-2">
              {/* HTTP Status Badge */}
              {lastResult.status === 200 && (
                <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>HTTP 200 OK</span>
                </span>
              )}
              {lastResult.status === 403 && (
                <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  <span>HTTP 403 Forbidden</span>
                </span>
              )}
              {lastResult.status === 502 && (
                <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>HTTP 502 Bad Gateway</span>
                </span>
              )}
              {lastResult.status !== 200 && lastResult.status !== 403 && lastResult.status !== 502 && (
                <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  <span>{lastResult.status ? `HTTP ${lastResult.status}` : 'Connection Refused'}</span>
                </span>
              )}

              {/* Latency & Timestamp */}
              <span className="text-[11px] font-mono text-slate-400 flex items-center space-x-1">
                <IconClock className="w-3 h-3 text-slate-400" />
                <span>{lastResult.durationMs}ms · {formatTime(lastResult.timestamp)}</span>
              </span>
            </div>
          )}
        </div>

        {/* Observed Result Description & Zone 2 Telemetry Notice */}
        {lastResult ? (
          <div className="space-y-1.5 pt-0.5">
            <div className="flex items-start space-x-2 text-xs">
              {lastResult.category === 'allowed' && (
                <IconCheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              )}
              {lastResult.category === 'blocked' && (
                <IconShieldBan className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              {lastResult.category === 'error' && (
                <IconAlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="text-slate-200 font-sans leading-relaxed">
                {lastResult.description}
              </div>
            </div>

            <div className="text-[11px] text-slate-400 font-sans pl-6 flex items-center space-x-1.5">
              <IconInfo className="w-3 h-3 text-cyan-400 shrink-0" />
              <span>
                Real-time audit log: Check <strong className="text-slate-200 font-medium">Zone 2 (Traffic Monitor)</strong> to view the newly recorded telemetry event.
              </span>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 font-sans pl-1">
            Click either button above to send a real HTTP request through the PatchPilot security proxy on port 8080.
          </p>
        )}
      </div>
    </section>
  )
}
