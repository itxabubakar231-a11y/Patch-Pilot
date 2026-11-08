/**
 * EnvironmentBanner Component
 *
 * Prominently displays the LOCAL LAB / SIMULATED ENVIRONMENT disclosure across all views.
 * Conforms strictly to PRD.md (Section 1) and docs/DESIGN.md (Section 2 & 5).
 */

import { getApiMode } from '../services/apiClient.js'

export default function EnvironmentBanner() {
  const mode = getApiMode()

  return (
    <div className="w-full bg-slate-900/90 border-b border-sky-500/20 px-4 py-2.5 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5 text-xs">
        {/* Left: Environment Badge & Disclosure */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full font-mono font-bold text-[11px] bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
            <span>LOCAL LAB / SIMULATED ENVIRONMENT</span>
          </span>
          <span className="text-slate-400 hidden sm:inline">
            Defensive prototype strictly bound to loopback (<code className="text-slate-300 font-mono">127.0.0.1</code>). Not a production WAF.
          </span>
        </div>

        {/* Right: Security & Data Mode Badges */}
        <div className="flex items-center space-x-2">
          <span
            className={`font-mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded border ${
              mode === 'mock'
                ? 'bg-sky-500/10 text-sky-400 border-sky-500/25'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
            }`}
          >
            {mode === 'mock' ? 'DATA: MOCK (FIXTURES)' : 'DATA: LIVE (FASTAPI)'}
          </span>
          <span className="font-mono text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60 hidden md:inline">
            PORTS: 5173 / 8000 / 8080 / 8081
          </span>
        </div>
      </div>
    </div>
  )
}
