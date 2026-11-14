/**
 * TrafficMonitor Component (Zone 2)
 *
 * Real-time inspection log of HTTP traffic evaluated by the security proxy on port 8080.
 * Conforms strictly to docs/API.md (Section 3.G) and docs/DESIGN.md (Section 5).
 * Styled to exact visual parity with the approved Stage 1 Emerald-and-Black Design System:
 * - Deep black/charcoal backgrounds with subtle emerald borders and lighting.
 * - Stage 1 Zone Header with mode-aware provenance badge and honest telemetry labels.
 * - Four 140px summary metric cards (Total, Allowed, Shadow, Blocked) preserving legitimate 0s.
 * - Premium search and filter toolbar with exact rule ID search preservation (rule #1 strictly excludes rule #10).
 * - High-contrast audit table with semantic method/status badges and zero emojis (100% SVG outline icons).
 * - Fully responsive layout with mobile event cards at 390px preventing overflow.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { getTraffic, getApiMode } from '../../services/apiClient.js'
import {
  IconRefresh,
  IconSearch,
  IconClose,
  IconCheckCircle,
  IconEye,
  IconShieldBan,
  IconAlertTriangle,
  IconShield,
  IconShieldCheck,
  IconHourglass,
  IconInfo,
  IconLayers,
  IconClock,
} from '../../components/Icons.jsx'

export default function TrafficMonitor() {
  const [trafficData, setTrafficData] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLiveConnected, setIsLiveConnected] = useState(false)

  // Filters state
  const [actionFilter, setActionFilter] = useState('all')
  const [methodFilter, setMethodFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Race condition protection: track latest request ID to safely ignore stale async responses
  const isMountedRef = useRef(true)
  const latestRequestIdRef = useRef(0)

  const fetchTraffic = useCallback(async (isManual = false) => {
    const requestId = ++latestRequestIdRef.current
    if (isManual) setIsRefreshing(true)
    setError(null)

    const activeMode = getApiMode()

    try {
      const data = await getTraffic({ limit: 50, offset: 0 })

      // Discard response if component unmounted or a newer request was dispatched
      if (!isMountedRef.current || requestId !== latestRequestIdRef.current) {
        return
      }

      setTrafficData(data || { items: [], total: 0 })
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
    fetchTraffic(false)

    // 5-second automatic polling
    const intervalId = setInterval(() => {
      fetchTraffic(false)
    }, 5000)

    return () => {
      isMountedRef.current = false
      clearInterval(intervalId)
    }
  }, [fetchTraffic])

  const apiMode = getApiMode()
  const isMockMode = apiMode === 'mock'

  // Filter items client-side by Action, Method, and Path/Rule keyword search
  // Explicit rule searches (e.g. "rule #1", "#1", "rule 1") match exact numeric rule IDs
  // preventing substring collisions with higher rule IDs like Rule #10.
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return (trafficData.items || []).filter((item) => {
      // 1. Action filter
      if (actionFilter !== 'all' && item.action !== actionFilter) {
        return false
      }
      // 2. HTTP Method filter
      if (methodFilter !== 'all' && item.method?.toUpperCase() !== methodFilter) {
        return false
      }
      // 3. Search query filter
      if (q) {
        // Detect explicit rule-ID searches (e.g. "rule #1", "rule:1", "rule 1", "#1")
        const explicitRuleMatch = q.match(/^(?:rule\s*(?:#|:)?\s*|#\s*)(\d+)$/i)
        if (explicitRuleMatch) {
          const targetRuleId = parseInt(explicitRuleMatch[1], 10)
          // Filter EXCLUSIVELY by exact numeric rule ID.
          // A matching path NEVER overrides a mismatched rule ID (ensures Rule #1 strictly excludes Rule #10 even if path contains "rule #1")
          if (item.matched_rule_id !== targetRuleId) {
            return false
          }
        } else {
          // General keyword search across paths, methods, status codes, actions, and general rule text
          const matchesPath = item.path?.toLowerCase().includes(q)
          const matchesMethod = item.method?.toLowerCase().includes(q)
          const matchesStatus = String(item.status_code).includes(q)
          const matchesAction = item.action?.toLowerCase().includes(q)
          const matchesRuleGeneral = item.matched_rule_id != null && (
            `rule #${item.matched_rule_id}`.toLowerCase().includes(q) ||
            String(item.matched_rule_id) === q
          )
          if (!matchesPath && !matchesMethod && !matchesStatus && !matchesAction && !matchesRuleGeneral) {
            return false
          }
        }
      }
      return true
    })
  }, [trafficData.items, actionFilter, methodFilter, searchQuery])

  // Summary counts derived honestly from available telemetry data (preserving legitimate 0)
  const summaryCounts = useMemo(() => {
    const items = trafficData.items || []
    const total = trafficData.total != null ? trafficData.total : items.length
    let allowed = 0
    let shadow = 0
    let blocked = 0

    for (const item of items) {
      if (item.action === 'allowed') allowed++
      else if (item.action === 'shadow_match') shadow++
      else if (item.action === 'blocked') blocked++
    }

    return { total, allowed, shadow, blocked, loadedCount: items.length }
  }, [trafficData])

  // Reset all filters & search
  const handleResetFilters = () => {
    setActionFilter('all')
    setMethodFilter('all')
    setSearchQuery('')
  }

  // Format UTC ISO timestamp helper
  const formatTimestamp = (isoString) => {
    if (!isoString) return '—'
    try {
      const date = new Date(isoString)
      return date.toISOString().replace('T', ' ').replace('Z', ' UTC')
    } catch {
      return isoString
    }
  }

  // Format local client clock time
  const formatTimeOnly = (date) => {
    if (!date) return '—'
    return date.toLocaleTimeString([], { hour12: false })
  }

  // HTTP Method badge styling
  const getMethodBadgeClass = (method) => {
    switch (method?.toUpperCase()) {
      case 'GET':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/30'
      case 'POST':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      case 'PUT':
        return 'bg-amber-500/10 text-amber-300 border-amber-500/30'
      case 'DELETE':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30'
      case 'HEAD':
      case 'OPTIONS':
        return 'bg-purple-500/10 text-purple-300 border-purple-500/30'
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700'
    }
  }

  // Action badge styling conforming to docs/DESIGN.md Section 5 (100% SVG outline icons)
  const renderActionBadge = (action) => {
    switch (action) {
      case 'allowed':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 whitespace-nowrap shadow-[0_0_6px_rgba(16,185,129,0.15)]">
            <IconCheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
            <span>Allowed</span>
          </span>
        )
      case 'shadow_match':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/25 whitespace-nowrap shadow-[0_0_6px_rgba(245,158,11,0.15)]">
            <IconEye className="w-3 h-3 text-amber-400 shrink-0" />
            <span>Shadow Match</span>
          </span>
        )
      case 'blocked':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/25 whitespace-nowrap shadow-[0_0_6px_rgba(244,63,94,0.15)]">
            <IconShieldBan className="w-3 h-3 text-rose-400 shrink-0" />
            <span>Blocked (403)</span>
          </span>
        )
      case 'upstream_error':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/25 whitespace-nowrap">
            <IconAlertTriangle className="w-3 h-3 text-purple-400 shrink-0" />
            <span>Upstream Error (502)</span>
          </span>
        )
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700 whitespace-nowrap">
            {action || 'unknown'}
          </span>
        )
    }
  }

  // Status code color
  const getStatusCodeClass = (status) => {
    if (status >= 200 && status < 300) return 'text-emerald-400 font-bold'
    if (status >= 400 && status < 500) return 'text-rose-400 font-bold'
    if (status >= 500) return 'text-amber-400 font-bold'
    return 'text-slate-300 font-medium'
  }

  // Border color accent for mobile event cards
  const getCardBorderAccent = (action) => {
    switch (action) {
      case 'allowed':
        return 'border-l-emerald-400'
      case 'shadow_match':
        return 'border-l-amber-400'
      case 'blocked':
        return 'border-l-rose-500'
      case 'upstream_error':
        return 'border-l-purple-400'
      default:
        return 'border-l-slate-600'
    }
  }

  const isFiltered = actionFilter !== 'all' || methodFilter !== 'all' || searchQuery.trim() !== ''

  return (
    <div className="space-y-6">
      {/* 1. Zone Header & Live Telemetry Controls (Stage 1 Parity) */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-emerald-500/20">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-emerald-400 font-mono font-bold text-xs tracking-wider uppercase">
              ZONE 2
            </span>
            <span className="text-slate-600 text-xs">•</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold">
              Port 8080 Log
            </span>
            <span
              className={`text-[10px] font-mono uppercase font-semibold px-2 py-0.5 rounded border ${
                isMockMode
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
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

          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight leading-tight">
            Traffic Monitor
          </h1>

          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            Redacted request history from reverse proxy on port 8080. Query parameters, request bodies, and client IPs are strictly omitted.
          </p>
        </div>

        {/* Polling indicator & Manual Refresh Button */}
        <div className="flex items-center space-x-3 text-xs shrink-0">
          <div className="text-[11px] text-slate-400 hidden sm:flex items-center space-x-1.5" aria-live="polite">
            <IconClock className="w-3.5 h-3.5 text-slate-500" />
            <span>UI Polled:</span>
            <strong className="text-slate-300 font-mono tabular-nums">{formatTimeOnly(lastUpdated)}</strong>
            <span className="text-slate-500">(5s)</span>
          </div>

          <button
            type="button"
            onClick={() => fetchTraffic(true)}
            disabled={isRefreshing}
            aria-busy={isRefreshing}
            aria-label="Refresh traffic log"
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-[#0C1A14] hover:bg-[#12261F] text-slate-200 border border-emerald-500/25 text-xs font-semibold transition-all duration-150 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50 shadow-sm"
          >
            <IconRefresh className={`w-3.5 h-3.5 text-emerald-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 2. Mock vs Live Accuracy Disclosure Banner */}
      {isMockMode ? (
        <div
          role="note"
          aria-label="Demo traffic disclosure"
          className="rounded-xl border border-emerald-500/30 bg-[#0C1615]/90 p-3.5 text-xs flex flex-wrap items-center justify-between gap-2.5 text-emerald-200 shadow-sm backdrop-blur-md"
        >
          <div className="flex items-center space-x-2.5">
            <IconInfo className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <span className="font-bold text-emerald-300">SIMULATED TRAFFIC / DEMO DATA:</span>{' '}
              <span className="text-slate-300">
                Displaying deterministic benchmark traffic records for defensive evaluation. No live HTTP traffic has been intercepted in this mode.
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-700/60 uppercase">
            VITE_DATA_MODE=mock
          </span>
        </div>
      ) : isLiveConnected ? (
        <div
          role="note"
          aria-label="Live backend mode active"
          className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 text-xs flex flex-wrap items-center justify-between gap-2.5 text-emerald-200 shadow-sm backdrop-blur-md"
        >
          <div className="flex items-center space-x-2.5">
            <IconShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <span className="font-bold text-emerald-300">LIVE TRAFFIC FEED CONNECTED:</span>{' '}
              <span className="text-slate-300">
                Streaming inspected transaction records from SQLite database via FastAPI management service (<code className="text-white font-mono">127.0.0.1:8000</code>).
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-900/50 px-2 py-0.5 rounded border border-emerald-700/60 uppercase">
            Verified SQLite Feed
          </span>
        </div>
      ) : (
        <div
          role="note"
          aria-label="Real mode unverified"
          className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 text-xs flex flex-wrap items-center justify-between gap-2.5 text-amber-200 shadow-sm backdrop-blur-md"
        >
          <div className="flex items-center space-x-2.5">
            <IconHourglass className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <span className="font-bold text-amber-300">REAL MODE CONFIGURED (CONNECTION UNVERIFIED):</span>{' '}
              <span className="text-slate-300">
                Configured for live API, but an authenticated response from <code className="text-white font-mono">http://127.0.0.1:8000</code> has not been established yet.
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-amber-400 bg-amber-900/50 px-2 py-0.5 rounded border border-amber-700/60 uppercase">
            Awaiting 8000 Response
          </span>
        </div>
      )}

      {/* 3. Four Traffic Summary Metric Cards (Stage 1 Geometry: 140px high, Dark-Green Contrast) */}
      <section
        aria-label="Traffic summary indicators"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        {/* Card 1: Total Requests (Server Total) */}
        <div className="rounded-xl border border-emerald-500/20 bg-[#0C1615]/90 p-4 flex flex-col justify-between h-[140px] shadow-sm backdrop-blur-md hover:-translate-y-0.5 hover:border-emerald-400/50 hover:shadow-[0_4px_24px_rgba(16,185,129,0.22)] transition-all duration-200 ease-out motion-reduce:hover:translate-y-0 motion-reduce:transition-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <IconLayers className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-300 text-xs font-medium">Total Requests</span>
            </div>
            <span className="text-emerald-400 border border-emerald-500/40 bg-emerald-500/10 text-[10px] font-mono font-bold px-2 py-0.5 rounded">
              Server Total
            </span>
          </div>
          <div className="text-[24px] font-bold text-white tracking-tight flex items-baseline space-x-1.5 font-mono">
            <span>{loading && !trafficData.items.length ? '—' : summaryCounts.total}</span>
            <span className="text-slate-400 text-xs font-normal font-sans">events</span>
          </div>
          <div className="text-slate-400 text-xs leading-snug">
            {isMockMode
              ? `Server audit log (${summaryCounts.total} total recorded)`
              : `Server-wide proxy ingress audit (${summaryCounts.total} total)`}
          </div>
        </div>

        {/* Card 2: Allowed Requests (Loaded Window Scope) */}
        <div className="rounded-xl border border-emerald-500/20 bg-[#0C1615]/90 p-4 flex flex-col justify-between h-[140px] shadow-sm backdrop-blur-md hover:-translate-y-0.5 hover:border-emerald-400/50 hover:shadow-[0_4px_24px_rgba(16,185,129,0.22)] transition-all duration-200 ease-out motion-reduce:hover:translate-y-0 motion-reduce:transition-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <IconCheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-300 text-xs font-medium">Allowed Requests</span>
            </div>
            <span className="text-emerald-400 border border-emerald-500/40 bg-emerald-500/10 text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase">
              Loaded Window
            </span>
          </div>
          <div className="text-[24px] font-bold text-white tracking-tight flex items-baseline space-x-1.5 font-mono">
            <span>{loading && !trafficData.items.length ? '—' : summaryCounts.allowed}</span>
            <span className="text-slate-400 text-xs font-normal font-sans">forwarded</span>
          </div>
          <div className="text-slate-400 text-xs leading-snug">
            Forwarded (from {summaryCounts.loadedCount} loaded events)
          </div>
        </div>

        {/* Card 3: Shadow Matches (Loaded Window Scope) */}
        <div className="rounded-xl border border-emerald-500/20 bg-[#0C1615]/90 p-4 flex flex-col justify-between h-[140px] shadow-sm backdrop-blur-md hover:-translate-y-0.5 hover:border-emerald-400/50 hover:shadow-[0_4px_24px_rgba(16,185,129,0.22)] transition-all duration-200 ease-out motion-reduce:hover:translate-y-0 motion-reduce:transition-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <IconEye className="w-4 h-4 text-amber-400" />
              <span className="text-slate-300 text-xs font-medium">Shadow Matches</span>
            </div>
            <span className="text-amber-400 border border-amber-500/40 bg-amber-500/10 text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase">
              Loaded Window
            </span>
          </div>
          <div className="text-[24px] font-bold text-white tracking-tight flex items-baseline space-x-1.5 font-mono">
            <span>{loading && !trafficData.items.length ? '—' : summaryCounts.shadow}</span>
            <span className="text-slate-400 text-xs font-normal font-sans">matches</span>
          </div>
          <div className="text-slate-400 text-xs leading-snug">
            Observed query markers (from {summaryCounts.loadedCount} loaded events)
          </div>
        </div>

        {/* Card 4: Blocked Requests (Loaded Window Scope) */}
        <div className="rounded-xl border border-emerald-500/20 bg-[#0C1615]/90 p-4 flex flex-col justify-between h-[140px] shadow-sm backdrop-blur-md hover:-translate-y-0.5 hover:border-emerald-400/50 hover:shadow-[0_4px_24px_rgba(16,185,129,0.22)] transition-all duration-200 ease-out motion-reduce:hover:translate-y-0 motion-reduce:transition-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <IconShieldBan className="w-4 h-4 text-rose-400" />
              <span className="text-slate-300 text-xs font-medium">Blocked Requests</span>
            </div>
            <span className="text-rose-400 border border-rose-500/40 bg-rose-500/10 text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase">
              Loaded Window
            </span>
          </div>
          <div className="text-[24px] font-bold text-white tracking-tight flex items-baseline space-x-1.5 font-mono">
            <span>{loading && !trafficData.items.length ? '—' : summaryCounts.blocked}</span>
            <span className="text-slate-400 text-xs font-normal font-sans">intercepts</span>
          </div>
          <div className="text-slate-400 text-xs leading-snug">
            HTTP 403 intercepts (from {summaryCounts.loadedCount} loaded events)
          </div>
        </div>
      </section>

      {/* 4. Background Poll Error Alert (when cached traffic exists) */}
      {error && trafficData.items.length > 0 && (
        <div
          role="alert"
          aria-live="polite"
          className="p-3.5 rounded-xl text-xs flex items-center justify-between gap-3 bg-rose-500/10 text-rose-300 border border-rose-500/30 shadow-sm backdrop-blur-md"
        >
          <div className="flex items-center space-x-2">
            <IconAlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              {error.code === 'UNAUTHORIZED'
                ? 'Session expired: Admin token cleared. Please unlock the dashboard again in the top navigation.'
                : `Traffic refresh failed: ${error.message || 'Check backend connection.'}`}
            </span>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={() => fetchTraffic(true)}
              className="text-xs px-2.5 py-1 rounded bg-rose-900/40 hover:bg-rose-800 text-rose-200 border border-rose-700/60 transition"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-slate-400 hover:text-white text-xs p-1 rounded hover:bg-white/[0.06] transition"
              aria-label="Dismiss alert"
            >
              <IconClose className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 5. Filter Toolbar & Keyword Search (Sprint 3 Enhanced) */}
      <div className="rounded-xl border border-emerald-500/20 bg-[#0C1615]/90 p-4 space-y-3 shadow-sm backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Keyword Search Input */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <IconSearch className="w-3.5 h-3.5 text-emerald-400" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search path, rule ID (e.g. rule #1), or status..."
              aria-label="Search traffic events"
              className="w-full bg-[#070D0B] border border-emerald-500/20 rounded-lg pl-9 pr-8 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 transition-all duration-150 font-sans"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded hover:bg-white/[0.06] transition-colors duration-150"
                aria-label="Clear search input"
              >
                <IconClose className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Dropdown Filters & Reset */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Action Filter */}
            <div className="flex items-center space-x-1.5">
              <label htmlFor="action-filter-select" className="text-slate-400 font-semibold uppercase text-[10px]">
                Action:
              </label>
              <select
                id="action-filter-select"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="bg-[#070D0B] border border-emerald-500/20 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-400 font-medium cursor-pointer transition-colors duration-150"
              >
                <option value="all">All Actions</option>
                <option value="allowed">Allowed</option>
                <option value="shadow_match">Shadow Match</option>
                <option value="blocked">Blocked (403)</option>
                <option value="upstream_error">Upstream Error (502)</option>
              </select>
            </div>

            {/* HTTP Method Filter */}
            <div className="flex items-center space-x-1.5">
              <label htmlFor="method-filter-select" className="text-slate-400 font-semibold uppercase text-[10px]">
                Method:
              </label>
              <select
                id="method-filter-select"
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                className="bg-[#070D0B] border border-emerald-500/20 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-400 font-medium cursor-pointer transition-colors duration-150"
              >
                <option value="all">All Methods</option>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="HEAD">HEAD</option>
                <option value="OPTIONS">OPTIONS</option>
              </select>
            </div>

            {/* Active filter clear button */}
            {isFiltered && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 border border-emerald-500/30 transition-all duration-150 active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-emerald-400 shadow-sm flex items-center space-x-1"
              >
                <IconClose className="w-3 h-3" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>

        {/* Counter & Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-emerald-500/10 text-[11px] text-slate-400">
          <div aria-live="polite">
            <span>Showing </span>
            <strong className="text-white font-mono tabular-nums">{filteredItems.length}</strong>
            <span> of </span>
            <strong className="text-slate-300 font-mono tabular-nums">{trafficData.total}</strong>
            <span> recorded events</span>
            {isFiltered && <span className="text-emerald-400 ml-1.5 font-medium">(filtered)</span>}
          </div>
          <div className="text-[10px] text-slate-500">
            <span className="hidden md:inline">Desktop Table View</span>
            <span className="md:hidden">Responsive Mobile Card View</span>
          </div>
        </div>
      </div>

      {/* 6. Main Traffic Event Display (Table on Desktop, Cards on Mobile) */}
      <div className="rounded-xl border border-emerald-500/20 bg-[#0C1615]/90 shadow-sm backdrop-blur-md overflow-hidden">
        {/* Loading State Skeleton */}
        {loading && !trafficData.items.length ? (
          <div className="p-6 space-y-4 animate-pulse" aria-busy="true" aria-label="Loading traffic records">
            <div className="h-8 bg-emerald-950/20 rounded-md w-full border border-emerald-500/10"></div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-[#070D0B]/80 rounded-lg border border-emerald-500/10 flex items-center justify-between px-4">
                <div className="h-4 bg-emerald-950/30 rounded w-28"></div>
                <div className="h-4 bg-emerald-950/30 rounded w-14"></div>
                <div className="h-4 bg-emerald-950/30 rounded w-44"></div>
                <div className="h-4 bg-emerald-950/30 rounded w-20"></div>
                <div className="h-4 bg-emerald-950/30 rounded w-24"></div>
              </div>
            ))}
          </div>
        ) : error && !trafficData.items.length ? (
          /* Error State */
          <div
            role="alert"
            aria-live="assertive"
            className="p-8 text-center text-xs text-rose-300 bg-rose-500/5 space-y-3"
          >
            <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-300 flex items-center justify-center mx-auto text-lg font-bold border border-rose-500/30">
              <IconAlertTriangle className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <p className="font-bold text-sm text-white">Unable to Load Traffic Records</p>
              <p className="text-slate-300 text-[11px] max-w-md mx-auto mt-1 leading-relaxed">
                {error.code === 'UNAUTHORIZED' || error.status === 401
                  ? 'Authentication required. Unlock the dashboard using your local admin token in the top navigation.'
                  : error.message || 'FastAPI backend service is offline on http://127.0.0.1:8000.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchTraffic(true)}
              className="mt-2 px-3.5 py-1.5 rounded-lg bg-[#0C1A14] hover:bg-[#12261F] text-xs font-semibold text-slate-200 border border-emerald-500/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              Retry Connection
            </button>
          </div>
        ) : trafficData.items.length === 0 ? (
          /* Zero Traffic State */
          <div className="p-12 text-center text-xs text-slate-400 space-y-2">
            <IconLayers className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="font-semibold text-slate-200 text-sm">No Traffic Records Logged</p>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto leading-relaxed">
              {isMockMode
                ? 'Mock fixture dataset is empty.'
                : 'No HTTP transactions have traversed the security proxy on port 8080 yet. Send requests to http://127.0.0.1:8080/ to populate the audit log.'}
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          /* Empty Filter State */
          <div className="p-12 text-center text-xs text-slate-400 space-y-3">
            <IconSearch className="w-8 h-8 text-slate-600 mx-auto" />
            <div>
              <p className="font-semibold text-slate-200 text-sm">No Records Match Current Query</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">
                No events matched your search{' '}
                {searchQuery && <strong className="text-emerald-300">&quot;{searchQuery}&quot;</strong>}{' '}
                under Action &quot;<span className="text-slate-300">{actionFilter}</span>&quot; and Method &quot;<span className="text-slate-300">{methodFilter}</span>&quot;.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-3.5 py-1.5 rounded-lg bg-[#0C1A14] hover:bg-[#12261F] text-xs font-semibold text-emerald-400 border border-emerald-500/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 shadow-sm"
            >
              Clear Search & Filters
            </button>
          </div>
        ) : (
          <>
            {/* DESKTOP TABLE VIEW (>= 768px) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs border-collapse">
                <caption className="sr-only">Redacted HTTP proxy traffic events audit log</caption>
                <thead>
                  <tr className="border-b border-emerald-500/20 bg-[#080E0C]/90 text-[10px] text-slate-400 uppercase tracking-wider font-semibold font-mono">
                    <th scope="col" className="px-4 py-3">Timestamp (UTC)</th>
                    <th scope="col" className="px-4 py-3">Method</th>
                    <th scope="col" className="px-4 py-3">Redacted Path</th>
                    <th scope="col" className="px-4 py-3">Mode</th>
                    <th scope="col" className="px-4 py-3">Action</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3 text-right">Duration</th>
                    <th scope="col" className="px-4 py-3 text-right">Rule Match</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-500/10 font-mono text-slate-200">
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      className="group hover:bg-emerald-950/25 transition-colors duration-150 motion-reduce:transition-none"
                    >
                      {/* Timestamp */}
                      <td className="px-4 py-3 text-[11px] text-slate-400 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          <span className="tabular-nums">{formatTimestamp(item.created_at)}</span>
                          {isMockMode && (
                            <span
                              className="text-[9px] font-sans px-1 rounded bg-[#070D0B] text-slate-500 border border-emerald-500/20"
                              title="Pre-recorded benchmark fixture event"
                            >
                              Sample
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Method */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${getMethodBadgeClass(
                            item.method
                          )}`}
                        >
                          {item.method}
                        </span>
                      </td>

                      {/* Redacted Path (strictly without query string or body) */}
                      <td className="px-4 py-3 text-slate-200 font-medium">
                        <span
                          className="text-emerald-300 font-semibold truncate max-w-[220px] sm:max-w-xs md:max-w-sm inline-block align-middle group-hover:text-emerald-200 transition-colors"
                          title={item.path}
                        >
                          {item.path}
                        </span>
                      </td>

                      {/* Proxy Mode */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-[11px] text-slate-400 capitalize bg-[#070D0B] px-2 py-0.5 rounded border border-emerald-500/20">
                          {item.mode}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {renderActionBadge(item.action)}
                      </td>

                      {/* Status Code */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`tabular-nums ${getStatusCodeClass(item.status_code)}`}>
                          {item.status_code}
                        </span>
                      </td>

                      {/* Duration */}
                      <td className="px-4 py-3 text-right text-slate-400 text-[11px] whitespace-nowrap">
                        <span className="tabular-nums">
                          {typeof item.duration_ms === 'number' ? `${item.duration_ms.toFixed(1)} ms` : '—'}
                        </span>
                      </td>

                      {/* Matched Rule */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {item.matched_rule_id ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/25 shadow-[0_0_6px_rgba(245,158,11,0.15)]">
                            Rule #{item.matched_rule_id}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* RESPONSIVE MOBILE CARD VIEW (< 768px) */}
            <div className="md:hidden divide-y divide-emerald-500/10 p-3 space-y-3">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className={`bg-[#080E0C]/90 rounded-xl p-3.5 border border-emerald-500/20 hover:border-emerald-500/40 transition-colors duration-150 motion-reduce:transition-none ${getCardBorderAccent(
                    item.action
                  )} border-l-4 space-y-2.5 shadow-sm`}
                >
                  {/* Card Header: Method, Status, Action, Time */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getMethodBadgeClass(
                          item.method
                        )}`}
                      >
                        {item.method}
                      </span>
                      <span className={`tabular-nums text-xs font-mono ${getStatusCodeClass(item.status_code)}`}>
                        {item.status_code}
                      </span>
                    </div>
                    <div>
                      {renderActionBadge(item.action)}
                    </div>
                  </div>

                  {/* Redacted Path Box */}
                  <div className="bg-[#070D0B] px-2.5 py-1.5 rounded-lg border border-emerald-500/15 text-xs font-mono font-medium text-emerald-300 break-all">
                    {item.path}
                  </div>

                  {/* Card Details Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-400 pt-1 border-t border-emerald-500/10">
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-500">Mode:</span>
                      <span className="text-slate-300 capitalize">{item.mode}</span>
                      <span className="text-slate-600">•</span>
                      <span className="tabular-nums text-slate-300">
                        {typeof item.duration_ms === 'number' ? `${item.duration_ms.toFixed(1)} ms` : '—'}
                      </span>
                    </div>

                    <div>
                      {item.matched_rule_id ? (
                        <span className="text-amber-300 font-semibold">
                          Rule #{item.matched_rule_id}
                        </span>
                      ) : (
                        <span className="text-slate-500">No Rule Match</span>
                      )}
                    </div>
                  </div>

                  {/* Card Timestamp */}
                  <div className="text-[10px] font-mono text-slate-500 text-right">
                    {formatTimestamp(item.created_at)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Footer Info & Privacy Safeguard Bar */}
        <div className="bg-[#080E0C]/90 border-t border-emerald-500/20 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <div className="flex items-center space-x-2">
            <IconShield className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Privacy Safeguard: Query strings, request bodies, cookies, and client IPs are strictly omitted.</span>
          </div>
          <span className="font-mono text-slate-500 text-[10px]">
            {isMockMode ? 'Schema: SQLite traffic_events (Fixture)' : 'Backend: SQLite traffic_events'}
          </span>
        </div>
      </div>
    </div>
  )
}
