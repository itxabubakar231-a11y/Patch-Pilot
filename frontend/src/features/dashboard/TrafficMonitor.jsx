/**
 * TrafficMonitor Component (Zone 2)
 *
 * Real-time inspection log of HTTP traffic evaluated by the security proxy on port 8080.
 * Conforms to docs/API.md (Section 3.G) and docs/DESIGN.md (Section 5).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { getTraffic } from '../../services/apiClient.js'

export default function TrafficMonitor() {
  const [trafficData, setTrafficData] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [actionFilter, setActionFilter] = useState('all')
  const [methodFilter, setMethodFilter] = useState('all')
  const isMountedRef = useRef(true)

  const fetchTraffic = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true)
    setError(null)

    try {
      const data = await getTraffic({ limit: 50, offset: 0 })
      if (isMountedRef.current) {
        setTrafficData(data || { items: [], total: 0 })
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
    fetchTraffic(false)

    // 5-second polling interval
    const intervalId = setInterval(() => {
      fetchTraffic(false)
    }, 5000)

    return () => {
      isMountedRef.current = false
      clearInterval(intervalId)
    }
  }, [fetchTraffic])

  // Filter items client-side
  const filteredItems = (trafficData.items || []).filter((item) => {
    if (actionFilter !== 'all' && item.action !== actionFilter) {
      return false
    }
    if (methodFilter !== 'all' && item.method?.toUpperCase() !== methodFilter) {
      return false
    }
    return true
  })

  // Format timestamp helper (UTC ISO)
  const formatTimestamp = (isoString) => {
    if (!isoString) return '—'
    try {
      const date = new Date(isoString)
      return date.toISOString().replace('T', ' ').replace('Z', ' UTC')
    } catch {
      return isoString
    }
  }

  // Format time only for compact view
  const formatTimeOnly = (date) => {
    if (!date) return '—'
    return date.toLocaleTimeString([], { hour12: false })
  }

  // Method badge colors
  const getMethodBadgeClass = (method) => {
    switch (method?.toUpperCase()) {
      case 'GET':
        return 'bg-sky-500/15 text-sky-400 border-sky-500/30'
      case 'POST':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      case 'PUT':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
      case 'DELETE':
        return 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700'
    }
  }

  // Action badge styling
  const renderActionBadge = (action) => {
    switch (action) {
      case 'allowed':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
            <span>✓</span>
            <span>Allowed</span>
          </span>
        )
      case 'shadow_match':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 whitespace-nowrap">
            <span>👁</span>
            <span>Shadow Match</span>
          </span>
        )
      case 'blocked':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 whitespace-nowrap">
            <span>🛑</span>
            <span>Blocked (403)</span>
          </span>
        )
      case 'upstream_error':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20 whitespace-nowrap">
            <span>⚠️</span>
            <span>Upstream Error</span>
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
    if (status >= 200 && status < 300) return 'text-emerald-400 font-semibold'
    if (status >= 400 && status < 500) return 'text-rose-400 font-bold'
    if (status >= 500) return 'text-amber-400 font-bold'
    return 'text-slate-300'
  }

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Zone 2 — Traffic Monitor
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-bold">
              Port 8080 Log
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Redacted request history from the reverse proxy. Raw query strings, client IPs, and bodies are strictly omitted.
          </p>
        </div>

        {/* Refresh & Polling */}
        <div className="flex items-center space-x-3 text-xs">
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Updated: <strong className="text-slate-300 font-mono">{formatTimeOnly(lastUpdated)}</strong>
            <span className="text-slate-400 ml-1.5">(auto 5s)</span>
          </span>
          <button
            type="button"
            onClick={() => fetchTraffic(true)}
            disabled={isRefreshing}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50 shadow-sm"
          >
            <span className={isRefreshing ? 'animate-spin inline-block' : ''}>🔄</span>
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Background Poll Error Alert */}
      {error && trafficData.items.length > 0 && (
        <div
          role="alert"
          className="p-3.5 rounded-xl text-xs flex items-center justify-between gap-3 bg-rose-500/10 text-rose-300 border border-rose-500/30 shadow-sm"
        >
          <div className="flex items-center space-x-2">
            <span>⚠️</span>
            <span>
              {error.code === 'UNAUTHORIZED'
                ? 'Session expired: Admin token cleared. Please unlock the dashboard again.'
                : `Traffic refresh failed: ${error.message}`}
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

      {/* Filter Toolbar */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 flex flex-wrap items-center justify-between gap-4 text-xs shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Action Filter */}
          <div className="flex items-center space-x-1.5">
            <label htmlFor="action-filter-select" className="text-slate-400 font-semibold uppercase text-[11px]">
              Action:
            </label>
            <select
              id="action-filter-select"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-medium cursor-pointer"
            >
              <option value="all">All Actions</option>
              <option value="allowed">Allowed</option>
              <option value="shadow_match">Shadow Match</option>
              <option value="blocked">Blocked (403)</option>
              <option value="upstream_error">Upstream Error</option>
            </select>
          </div>

          {/* HTTP Method Filter */}
          <div className="flex items-center space-x-1.5">
            <label htmlFor="method-filter-select" className="text-slate-400 font-semibold uppercase text-[11px]">
              Method:
            </label>
            <select
              id="method-filter-select"
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-medium cursor-pointer"
            >
              <option value="all">All Methods</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
        </div>

        {/* Counter & Mobile Scroll Hint */}
        <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2">
          <span>Showing <strong className="text-white font-mono">{filteredItems.length}</strong> of <strong className="text-slate-300 font-mono">{trafficData.total}</strong> events</span>
          <span className="text-slate-600 hidden md:inline">•</span>
          <span className="text-[10px] text-slate-500 sm:hidden">← Swipe table to view all fields →</span>
        </div>
      </div>

      {/* Main Traffic Table Card */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 shadow-sm overflow-hidden">
        {/* Loading State */}
        {loading && !trafficData.items.length ? (
          <div className="p-12 text-center text-xs text-slate-400 space-y-2">
            <div className="w-8 h-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin mx-auto"></div>
            <p>Loading traffic log...</p>
          </div>
        ) : error && !trafficData.items.length ? (
          /* Error State */
          <div className="p-8 text-center text-xs text-rose-300 bg-rose-500/5 space-y-2">
            <p className="font-bold text-sm">Unable to load traffic records.</p>
            <p className="text-slate-400 text-[11px] max-w-md mx-auto">
              {error.code === 'UNAUTHORIZED'
                ? 'Authentication required. Unlock the dashboard using the admin token.'
                : error.message || 'FastAPI backend is offline on 127.0.0.1:8000.'}
            </p>
            <button
              type="button"
              onClick={() => fetchTraffic(true)}
              className="mt-2 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
            >
              Retry Connection
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          /* Empty Filter State */
          <div className="p-12 text-center text-xs text-slate-400 space-y-2">
            <span className="text-2xl block">🔍</span>
            <p className="font-semibold text-slate-300">No traffic records match your filter criteria.</p>
            <p className="text-[11px] text-slate-500">
              Try selecting "All Actions" and "All Methods" or send test requests to <code className="text-slate-400 font-mono">http://127.0.0.1:8080/</code>.
            </p>
          </div>
        ) : (
          /* Data Table */
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
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
              <tbody className="divide-y divide-slate-800/60 font-mono text-slate-200">
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    {/* Timestamp */}
                    <td className="px-4 py-3 text-[11px] text-slate-400 whitespace-nowrap">
                      {formatTimestamp(item.created_at)}
                    </td>

                    {/* Method */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getMethodBadgeClass(
                          item.method
                        )}`}
                      >
                        {item.method}
                      </span>
                    </td>

                    {/* Redacted Path */}
                    <td className="px-4 py-3 text-slate-200 font-medium">
                      <span
                        className="text-sky-300 font-bold truncate max-w-[220px] sm:max-w-xs md:max-w-sm inline-block align-middle"
                        title={item.path}
                      >
                        {item.path}
                      </span>
                    </td>

                    {/* Proxy Mode */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-[11px] text-slate-400 capitalize">
                        {item.mode}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {renderActionBadge(item.action)}
                    </td>

                    {/* Status Code */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={getStatusCodeClass(item.status_code)}>
                        {item.status_code}
                      </span>
                    </td>

                    {/* Duration */}
                    <td className="px-4 py-3 text-right text-slate-400 text-[11px] whitespace-nowrap">
                      {item.duration_ms ? `${item.duration_ms.toFixed(1)} ms` : '—'}
                    </td>

                    {/* Matched Rule */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {item.matched_rule_id ? (
                        <span className="text-amber-300 text-[11px] font-semibold">
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
        )}

        {/* Footer info bar */}
        <div className="bg-slate-950/60 border-t border-slate-800/80 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>🛡️ Redacted audit log: Query parameters, client IPs, cookies, and HTTP bodies are omitted by proxy design.</span>
          <span className="font-mono text-slate-500">SQLite: traffic_events</span>
        </div>
      </div>
    </div>
  )
}
