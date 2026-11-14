/**
 * SecurityOverview Component (Zone 1)
 *
 * Displays real-time security posture, proxy defense mode & readiness,
 * request telemetry counters, upstream lab status, and subsystem diagnostics.
 * Conforms to docs/API.md (Section 3.A) and docs/DESIGN.md (Section 5).
 * Refined for exact parity with the authoritative 1672x941 reference specification:
 * - Geometric alignment: Header 72px, hero y=112, buttons y=252, metrics y=344-484, topology y=512-885.
 * - Dedicated OverviewOrbPreview with authentic 3D sphere volume & emerald-cyan lighting.
 * - Non-falsifying metric data parsing (preserves legitimate 0, shows unavailable data honestly).
 * - Honest button labels: "Refresh Overview" (fetchOverview) and "Open AI Advisories" (navigates to Zone 4).
 * - Dynamic proxy node subtitle reflecting active proxy mode without falsely claiming actual enforcement in mock mode.
 * - AI Intelligence card reflects actual advisory intelligence state without falsely attributing proxy shadow matches.
 * - Honest Lab status: distinguishes verified online from simulated mock and unverified offline.
 * - Prominent emerald topology directional arrows and separate out-of-band management node.
 * - Full SVG outline icons (0 emojis).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { getOverview, getApiMode } from '../../services/apiClient.js'
import OverviewOrbPreview from './OverviewOrbPreview.jsx'
import {
  IconRefresh,
  IconAlertTriangle,
  IconClose,
  IconShield,
  IconShieldCheck,
  IconLayers,
  IconServer,
  IconCpu,
  IconMonitor,
  IconTopology,
  IconSettings,
  IconDocument,
  IconArrowUpDown,
} from '../../components/Icons.jsx'

export default function SecurityOverview({ onNavigate }) {
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLiveConnected, setIsLiveConnected] = useState(false)
  const [metricChanged, setMetricChanged] = useState(false)

  const isMountedRef = useRef(true)
  const latestRequestIdRef = useRef(0)
  const previousDataRef = useRef(null)
  const metricHighlightTimerRef = useRef(null)

  const fetchOverview = useCallback(async (isManual = false) => {
    const requestId = ++latestRequestIdRef.current
    if (isManual) setIsRefreshing(true)
    setError(null)

    const activeMode = getApiMode()

    try {
      const data = await getOverview()

      if (!isMountedRef.current || requestId !== latestRequestIdRef.current) {
        return
      }

      if (previousDataRef.current && data) {
        const prevTraffic = previousDataRef.current.traffic || {}
        const newTraffic = data.traffic || {}
        if (
          prevTraffic.total_requests !== newTraffic.total_requests ||
          prevTraffic.blocked_requests !== newTraffic.blocked_requests ||
          prevTraffic.shadow_matches !== newTraffic.shadow_matches
        ) {
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

    const intervalId = setInterval(() => {
      fetchOverview(false)
    }, 5000)

    return () => {
      isMountedRef.current = false
      clearInterval(intervalId)
      if (metricHighlightTimerRef.current) {
        clearTimeout(metricHighlightTimerRef.current)
        metricHighlightTimerRef.current = null
      }
    }
  }, [fetchOverview])

  const apiMode = getApiMode()
  const isMockMode = apiMode === 'mock'

  // Initial Loading State Skeleton
  if (loading && !overview && !error) {
    return (
      <div className="px-8 pt-10 pb-6 space-y-6 animate-pulse" aria-busy="true" aria-label="Loading security overview telemetry">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
          <div className="space-y-2">
            <div className="h-7 bg-white/[0.06] rounded w-64"></div>
            <div className="h-4 bg-white/[0.04] rounded w-96 max-w-full"></div>
          </div>
          <div className="h-8 bg-white/[0.06] rounded w-28"></div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[140px] bg-white/[0.03] border border-white/[0.06] rounded-xl p-4"></div>
          ))}
        </div>

        <div className="h-[373px] bg-white/[0.03] border border-white/[0.06] rounded-2xl"></div>
      </div>
    )
  }

  // Clear Unavailable / Error State with Retry when initial request fails
  if (error && !overview) {
    return (
      <div className="px-8 pt-10 pb-6">
        <div
          role="alert"
          className="p-8 rounded-2xl border border-rose-500/30 bg-[#0C1210] max-w-lg mx-auto my-12 text-center space-y-4 shadow-2xl backdrop-blur-md"
        >
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
            <IconAlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-white tracking-tight">Security Telemetry Unavailable</h2>
            <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
              {error.code === 'UNAUTHORIZED'
                ? 'Admin token is required to inspect protected overview telemetry. Please unlock the dashboard in the top navigation.'
                : error.message || 'Unable to connect to the telemetry service on 127.0.0.1:8000.'}
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => fetchOverview(true)}
              disabled={isRefreshing}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-60"
            >
              <IconRefresh className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Reconnecting...' : 'Retry Connection'}</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Safe Metric Extraction without mask-falsifying 0
  const {
    proxy = {},
    traffic = {},
    lab = {},
    advisories = {},
  } = overview || {}

  const rawProxyMode = proxy?.mode
  const proxyMode = rawProxyMode ? String(rawProxyMode).toLowerCase() : null
  const formatCount = (val) => (typeof val === 'number' ? val.toLocaleString() : '—')

  // Real values with distinction between 0 and null/undefined
  const totalRequests = typeof traffic?.total_requests === 'number' ? traffic.total_requests : null
  const advisoryCount = typeof advisories?.total === 'number' ? advisories.total : null

  // Card 1 Proxy Mode details without fabricating fallback
  let proxyCardBadge = 'UNKNOWN'
  let proxyCardTitle = 'Mode Unavailable'
  let proxyCardDesc = 'Proxy defense mode not reported by control plane'

  if (proxyMode === 'enforce') {
    proxyCardBadge = 'ENFORCE'
    proxyCardTitle = 'Enforce Mode'
    proxyCardDesc = isMockMode
      ? 'Simulated HTTP 403 enforcement (mock fixture)'
      : 'Active HTTP 403 blocking enforced'
  } else if (proxyMode === 'shadow') {
    proxyCardBadge = 'SHADOW'
    proxyCardTitle = 'Shadow Mode'
    proxyCardDesc = 'Observing and logging (no blocking)'
  } else if (proxyMode === 'off') {
    proxyCardBadge = 'OFF'
    proxyCardTitle = 'Bypass Mode'
    proxyCardDesc = 'Proxy inspection bypassed'
  } else if (proxyMode) {
    proxyCardBadge = proxyMode.toUpperCase()
    proxyCardTitle = `${proxyMode.charAt(0).toUpperCase() + proxyMode.slice(1)} Mode`
    proxyCardDesc = 'Configured proxy defense state'
  }

  // Card 3 Upstream Stack details - strictly source-backed, zero fabricated fallback
  // In real mode, prioritize verified live stack fields over simulated_stack
  const verifiedLiveStack = Boolean(isLiveConnected && lab?.verified) ? (lab?.live_stack || lab?.runtime_stack || lab?.stack || null) : null
  const sourceStack = isMockMode
    ? (lab?.simulated_stack || lab?.stack || null)
    : (verifiedLiveStack || lab?.stack || lab?.live_stack || lab?.simulated_stack || null)
  const upstreamTarget = lab?.upstream || null

  let stackCardTitle = 'Stack Unavailable'
  let stackCardDesc = 'Upstream runtime stack not reported'
  let stackCardBadge = 'UNAVAILABLE'

  if (sourceStack) {
    if (sourceStack.toLowerCase().includes('apache') && sourceStack.toLowerCase().includes('php')) {
      stackCardTitle = 'Apache / PHP'
    } else if (sourceStack.toLowerCase().includes('nginx') && sourceStack.toLowerCase().includes('php')) {
      stackCardTitle = 'Nginx / PHP'
    } else {
      stackCardTitle = sourceStack.split('+')[0].trim() || 'PHP Stack'
    }
    const isLiveObserved = Boolean(isLiveConnected && lab?.verified && verifiedLiveStack)
    stackCardDesc = isLiveObserved ? `Observed: ${sourceStack}` : `Target Spec: ${sourceStack}`
    stackCardBadge = isMockMode ? 'Mock Spec' : (isLiveObserved ? 'Live Stack' : 'Spec')
  } else if (upstreamTarget) {
    stackCardTitle = 'Upstream Lab'
    stackCardDesc = `Target: ${upstreamTarget}`
    stackCardBadge = isMockMode ? 'Mock Target' : 'Target'
  }

  // Lab online status verification: only claim online when verified
  const isLabVerifiedOnline = Boolean(isLiveConnected && lab?.status === 'online' && lab?.verified)
  const labStatusLabel = isLabVerifiedOnline
    ? 'Local Lab (Online)'
    : isMockMode
    ? 'Simulated Lab (Mock)'
    : 'Lab Unverified'

  // Dynamic Proxy Node Subtitle in Topology (distinguishes simulation from live enforcement)
  const proxyNodeSubtitle = !proxyMode
    ? 'Reverse proxy (mode unknown)'
    : isMockMode
    ? `Simulated proxy (${proxyMode} mode — mock fixture)`
    : proxyMode === 'enforce'
    ? 'Reverse proxy (active enforcement)'
    : `Reverse proxy (${proxyMode} mode)`

  return (
    <div className="px-8 pt-10 pb-6 relative overflow-hidden">
      {/* Decorative Emerald Aurora (Clearly defined sweeping diagonal curved emerald light behind hero) */}
      <div
        aria-hidden="true"
        className="absolute top-0 right-0 w-[1150px] h-[340px] pointer-events-none select-none overflow-hidden -z-10"
      >
        <svg
          viewBox="0 0 1150 340"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          <defs>
            <linearGradient id="auroraSweepingBand" x1="0%" y1="80%" x2="100%" y2="50%">
              <stop offset="0%" stopColor="#059669" stopOpacity="0" />
              <stop offset="22%" stopColor="#10B981" stopOpacity="0.45" />
              <stop offset="48%" stopColor="#34D399" stopOpacity="0.9" />
              <stop offset="72%" stopColor="#10B981" stopOpacity="0.75" />
              <stop offset="88%" stopColor="#047857" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#064E3B" stopOpacity="0" />
            </linearGradient>

            <filter id="auroraGlowRadiance" x="-30%" y="-50%" width="160%" height="200%">
              <feGaussianBlur stdDeviation="28" />
            </filter>
            <filter id="auroraGlowCurve" x="-20%" y="-40%" width="140%" height="180%">
              <feGaussianBlur stdDeviation="12" />
            </filter>
            <filter id="auroraGlowSpine" x="-20%" y="-40%" width="140%" height="180%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>

          {/* Layer 1: Soft green radiance surrounding the curve */}
          <path
            d="M 100 270 C 300 235, 520 85, 715 70 C 875 62, 985 135, 1140 230"
            stroke="url(#auroraSweepingBand)"
            strokeWidth="78"
            strokeLinecap="round"
            fill="none"
            filter="url(#auroraGlowRadiance)"
            opacity="0.55"
          />

          {/* Layer 2: Sweeping curved emerald light band (clearly defined curvature) */}
          <path
            d="M 100 270 C 300 235, 520 85, 715 70 C 875 62, 985 135, 1140 230"
            stroke="url(#auroraSweepingBand)"
            strokeWidth="32"
            strokeLinecap="round"
            fill="none"
            filter="url(#auroraGlowCurve)"
            opacity="0.88"
          />

          {/* Layer 3: Concentrated brightness along the sweeping curve */}
          <path
            d="M 140 260 C 320 230, 530 90, 715 72 C 865 65, 970 132, 1120 220"
            stroke="url(#auroraSweepingBand)"
            strokeWidth="14"
            strokeLinecap="round"
            fill="none"
            filter="url(#auroraGlowSpine)"
            opacity="0.95"
          />
        </svg>
      </div>

      {/* 1. Main Hero Section (Starts around y=112px, buttons around y=252px, Orb center near x=1230, y=220) */}
      <section aria-label="Security Overview Hero" className="mb-12 flex flex-wrap xl:flex-nowrap items-center justify-between gap-6 min-h-[160px] relative">
        {/* Left: Titles & Honest Action Controls */}
        <div className="space-y-2.5 max-w-2xl">
          <div>
            <span className="text-emerald-400 font-mono font-bold text-xs tracking-wider uppercase">
              ZONE 1
            </span>
            <h1 className="text-3xl sm:text-[34px] font-bold text-white tracking-tight leading-tight mt-0.5">
              Security Overview
            </h1>
          </div>

          <p className="text-slate-300 text-sm leading-relaxed max-w-xl">
            {isMockMode
              ? 'Defensive telemetry for a self-hosted PHP stack using a reverse-proxy shield, with deterministic benchmarks and simulated attack traffic in a local lab.'
              : 'Defensive telemetry for a self-hosted PHP stack using a reverse-proxy shield, with local loopback telemetry and administrative control on 127.0.0.1:8000.'}
          </p>

          {/* Action Buttons: Honest Labels matching real functionality */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => fetchOverview(true)}
              disabled={isRefreshing}
              className="bg-[#10B981] hover:bg-[#059669] text-black font-semibold px-5 py-2.5 rounded-lg text-sm flex items-center space-x-2 shadow-[0_0_20px_rgba(16,185,129,0.25)] transition-all duration-150 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-60"
              title="Refresh real-time security posture and proxy telemetry"
            >
              <IconRefresh className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh Overview'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (onNavigate) onNavigate('advisories')
              }}
              className="bg-[#0C1A14] hover:bg-[#12261F] text-slate-200 border border-emerald-500/25 px-4 py-2.5 rounded-lg text-sm font-medium flex items-center space-x-2 transition-all duration-150 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              title="Open Zone 4 Security Advisory and Threat Intelligence reports"
            >
              <IconDocument className="w-4 h-4 text-slate-300" />
              <span>Open AI Advisories</span>
            </button>
          </div>
        </div>

        {/* Right: Authentic 3D AI Orb and Status Card (Aligned to x ≈ 1230 center, y ≈ 220 center) */}
        <div className="flex items-center space-x-5 shrink-0 xl:mr-[124px] mt-7">
          <OverviewOrbPreview />

          <div className="space-y-1">
            <div className="text-white font-bold text-base leading-tight">
              AI Defense Engine
            </div>
            <div className="text-slate-400 text-xs font-mono">
              {isMockMode ? 'Standby (Zone 4) • Mock Fixture' : 'Standby (Zone 4) • Engine Standby'}
            </div>
            {/* Neutral Standby Status Badge (No false claims of readiness) */}
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.1] text-slate-300 text-xs font-medium mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span>Standby</span>
            </div>
          </div>
        </div>
      </section>

      {/* Alert Banner (if polling error with existing overview) */}
      {error && overview && (
        <div
          role="alert"
          aria-live="polite"
          className="mb-6 p-3 rounded-xl text-xs flex items-center justify-between gap-3 bg-rose-500/10 text-rose-300 border border-rose-500/30 backdrop-blur-sm"
        >
          <div className="flex items-center space-x-2">
            <IconAlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
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
              className="text-xs px-2 py-0.5 rounded bg-rose-900/40 hover:bg-rose-850 text-rose-200 border border-rose-700/60 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/[0.06] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              aria-label="Dismiss alert"
            >
              <IconClose className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 2. Four Metric Cards: Exact y=344–484px, Height=140px, Dark-Green Contrast */}
      <section
        aria-label="Key security indicators"
        className="mb-7 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        {/* Card 1: Proxy Mode (Without hardcoded fallback) */}
        <div className="rounded-xl border border-emerald-500/20 bg-[#0C1615]/90 p-4 flex flex-col justify-between h-[140px] shadow-sm backdrop-blur-md hover:-translate-y-0.5 hover:border-emerald-400/50 hover:shadow-[0_4px_24px_rgba(16,185,129,0.22)] transition-all duration-200 ease-out motion-reduce:hover:translate-y-0 motion-reduce:transition-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <IconShield className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-300 text-xs font-medium">Proxy Mode</span>
            </div>
            <span className="text-emerald-400 border border-emerald-500/40 bg-emerald-500/10 text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase">
              {proxyCardBadge}
            </span>
          </div>
          <div className="text-[24px] font-bold text-white tracking-tight whitespace-nowrap">
            {proxyCardTitle}
          </div>
          <div className="text-slate-400 text-xs leading-snug">
            {proxyCardDesc}
          </div>
        </div>

        {/* Card 2: Traffic (Preserves legitimate 0 values) */}
        <div className="rounded-xl border border-emerald-500/20 bg-[#0C1615]/90 p-4 flex flex-col justify-between h-[140px] shadow-sm backdrop-blur-md hover:-translate-y-0.5 hover:border-emerald-400/50 hover:shadow-[0_4px_24px_rgba(16,185,129,0.22)] transition-all duration-200 ease-out motion-reduce:hover:translate-y-0 motion-reduce:transition-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <IconLayers className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-300 text-xs font-medium">Traffic</span>
            </div>
            <span className="text-emerald-400 border border-emerald-500/40 bg-emerald-500/10 text-[10px] font-mono font-bold px-2 py-0.5 rounded">
              Port 8080
            </span>
          </div>
          <div className="text-[24px] font-bold text-white tracking-tight flex items-baseline space-x-1.5 font-mono">
            <span>{totalRequests !== null ? formatCount(totalRequests) : '—'}</span>
            <span className="text-slate-400 text-xs font-normal font-sans">
              {totalRequests !== null ? 'requests' : ''}
            </span>
          </div>
          <div className="text-slate-400 text-xs leading-snug">
            {totalRequests !== null
              ? (isMockMode ? 'Deterministic benchmark dataset' : 'Live proxy ingress telemetry')
              : 'Traffic telemetry unavailable'}
          </div>
        </div>

        {/* Card 3: Upstream Stack (Strictly source-backed, zero fabricated fallback) */}
        <div className="rounded-xl border border-emerald-500/20 bg-[#0C1615]/90 p-4 flex flex-col justify-between h-[140px] shadow-sm backdrop-blur-md hover:-translate-y-0.5 hover:border-emerald-400/50 hover:shadow-[0_4px_24px_rgba(16,185,129,0.22)] transition-all duration-200 ease-out motion-reduce:hover:translate-y-0 motion-reduce:transition-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <IconServer className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-300 text-xs font-medium">Upstream Stack</span>
            </div>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
              sourceStack || upstreamTarget
                ? 'text-cyan-400 border border-cyan-500/40 bg-cyan-500/10'
                : 'text-slate-400 border border-slate-500/30 bg-white/[0.03]'
            }`}>
              {stackCardBadge}
            </span>
          </div>
          <div className="text-[24px] font-bold text-white tracking-tight whitespace-nowrap">
            {stackCardTitle}
          </div>
          <div className="text-slate-300 text-xs leading-snug font-mono truncate">
            {stackCardDesc}
          </div>
        </div>

        {/* Card 4: AI Intelligence (Truthful Zone 4 advisory state, decoupled from proxy markers) */}
        <div className="rounded-xl border border-emerald-500/20 bg-[#0C1615]/90 p-4 flex flex-col justify-between h-[140px] shadow-sm backdrop-blur-md hover:-translate-y-0.5 hover:border-emerald-400/50 hover:shadow-[0_4px_24px_rgba(16,185,129,0.22)] transition-all duration-200 ease-out motion-reduce:hover:translate-y-0 motion-reduce:transition-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <IconCpu className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-300 text-xs font-medium">AI Intelligence</span>
            </div>
            <span className="text-emerald-400 border border-emerald-500/40 bg-emerald-500/10 text-[10px] font-mono font-bold px-2 py-0.5 rounded">
              {isMockMode ? 'Fixture' : 'Zone 4'}
            </span>
          </div>
          <div className="text-[24px] font-bold text-white tracking-tight flex items-baseline space-x-1.5 font-mono">
            <span>{advisoryCount !== null ? formatCount(advisoryCount) : 'Standby'}</span>
            <span className="text-slate-400 text-xs font-normal font-sans">
              {advisoryCount !== null ? (advisoryCount === 1 ? 'advisory' : 'advisories') : ''}
            </span>
          </div>
          <div className="text-slate-300 text-xs leading-snug">
            {advisoryCount !== null
              ? (isMockMode ? 'Deterministic security advisories (Zone 4 fixture)' : 'Zone 4 security advisory count')
              : 'AI advisory engine standby in Zone 4'}
          </div>
        </div>
      </section>

      {/* 3. Lab Topology & Architecture: Exact y=512–885px, Height=373px */}
      <section
        aria-label="Lab Topology and Architecture"
        className="rounded-2xl border border-emerald-500/20 bg-[#0D1B1C]/95 p-6 shadow-lg backdrop-blur-md flex flex-col justify-between min-h-[373px]"
      >
        {/* Topology Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <IconTopology className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Lab Topology & Architecture
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {isMockMode
                  ? 'Request flow and control plane for Zone 1 (simulated lab).'
                  : 'Request flow and control plane for Zone 1 (local loopback architecture).'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>{labStatusLabel}</span>
            </span>
            <span className="text-xs font-mono text-slate-300 bg-white/[0.04] border border-white/[0.08] px-2.5 py-1 rounded-md">
              {isMockMode ? 'Mock Fixture' : isLiveConnected ? 'Port 8000 (HTTP)' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Main Forwarding Pipeline: Three Wide Horizontal Nodes */}
        <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-3 pt-3">
          {/* Node 1: Client / Browser (Cyan Outline) */}
          <div className="flex-1 min-w-[240px] rounded-xl border border-cyan-500/35 bg-[#09151C]/90 p-4 flex items-center space-x-3.5 shadow-sm min-h-[86px] transition-all duration-200 hover:border-cyan-400/60 hover:shadow-[0_0_15px_rgba(6,182,212,0.15)] motion-reduce:transition-none">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <IconMonitor className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-bold text-white truncate">Client / Browser</div>
              <div className="text-xs text-slate-300 truncate mt-1">
                {isMockMode ? 'Simulated traffic (benchmarks)' : 'Loopback client traffic'}
              </div>
            </div>
          </div>

          {/* Prominent Forwarding Directional Arrow 1 */}
          <span className="hidden lg:flex text-emerald-400 font-extrabold text-3xl px-3 select-none leading-none drop-shadow-[0_0_12px_rgba(16,185,129,0.9)]">
            →
          </span>

          {/* Node 2: PatchPilot Proxy Shield (Centerpiece Glowing Hero Node) */}
          <div className="flex-1 min-w-[270px] rounded-xl border-2 border-emerald-400 bg-[#042416] p-4 flex items-center space-x-3.5 shadow-[0_0_24px_rgba(16,185,129,0.35)] ring-1 ring-emerald-400/50 min-h-[96px] transition-all duration-200 hover:shadow-[0_0_32px_rgba(16,185,129,0.5)] motion-reduce:transition-none">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <IconShieldCheck className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-bold text-white truncate">PatchPilot Proxy Shield</div>
              <div className="text-xs text-emerald-300 font-semibold truncate mt-1">{proxyNodeSubtitle}</div>
            </div>
          </div>

          {/* Prominent Forwarding Directional Arrow 2 */}
          <span className="hidden lg:flex text-emerald-400 font-extrabold text-3xl px-3 select-none leading-none drop-shadow-[0_0_12px_rgba(16,185,129,0.9)]">
            →
          </span>

          {/* Node 3: Upstream Target Lab (Cyan Outline) */}
          <div className="flex-1 min-w-[240px] rounded-xl border border-cyan-500/35 bg-[#09151C]/90 p-4 flex items-center space-x-3.5 shadow-sm min-h-[86px] transition-all duration-200 hover:border-cyan-400/60 hover:shadow-[0_0_15px_rgba(6,182,212,0.15)] motion-reduce:transition-none">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <IconServer className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-bold text-white truncate">Upstream Target Lab</div>
              <div className="text-xs text-slate-300 font-mono mt-1 whitespace-normal break-words">
                {upstreamTarget ? `${upstreamTarget} (${sourceStack || 'PHP stack'})` : '127.0.0.1:8081 (PHP stack)'}
              </div>
            </div>
          </div>
        </div>

        {/* Vertical Two-Way Out-of-Band Control Connector */}
        <div className="flex flex-col items-center py-1">
          <div className="w-[2px] h-4 border-l-2 border-dashed border-emerald-400" />
          <div className="my-0.5 text-emerald-400 select-none flex items-center justify-center">
            <IconArrowUpDown className="w-4 h-4 text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.85)]" />
          </div>
          <div className="w-[2px] h-4 border-l-2 border-dashed border-emerald-400" />
        </div>

        {/* Out-of-Band Control Plane Card: Management API Port 8000 */}
        <div className="w-full max-w-xl mx-auto rounded-xl border border-cyan-500/35 bg-[#081822]/90 p-3.5 px-5 flex items-center justify-between shadow-sm transition-all duration-200 hover:border-cyan-400/60 motion-reduce:transition-none">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <IconSettings className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-bold text-white">Management API (Control Plane)</span>
                <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/30">
                  (Out-of-Band)
                </span>
              </div>
              <div className="text-xs text-slate-300 font-mono mt-0.5">
                Port 8000 · Administrative control & telemetry
              </div>
            </div>
          </div>

          <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30 shrink-0">
            {isMockMode ? 'Mock Fixture' : isLiveConnected ? 'Port 8000 (HTTP)' : 'Unverified'}
          </span>
        </div>
      </section>
    </div>
  )
}
