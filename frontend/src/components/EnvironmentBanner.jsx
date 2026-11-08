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
    <div className="w-full bg-[#0B1120]/95 border-b border-slate-800/80 px-4 py-2 backdrop-blur-md transition-colors">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Left: Environment Badge & Disclosure */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full font-mono font-bold text-[10px] sm:text-[11px] bg-amber-500/10 text-amber-300 border border-amber-500/25 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse motion-reduce:animate-none"></span>
            <span>LOCAL LAB / SIMULATED ENVIRONMENT</span>
          </span>
          <span className="text-slate-400 text-[11px] hidden sm:inline">
            Defensive prototype bound to loopback (<code className="text-slate-300 font-mono">127.0.0.1</code>). Not a production WAF.
          </span>
        </div>

        {/* Right: Security & Data Mode Badges */}
        <div className="flex items-center space-x-2">
          <span
            className={`font-mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded border transition-colors ${
              mode === 'mock'
                ? 'bg-sky-500/10 text-sky-400 border-sky-500/25'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
            }`}
          >
            {mode === 'mock' ? 'DATA: MOCK (FIXTURES)' : 'DATA: LIVE (FASTAPI)'}
          </span>
          <span className="font-mono text-[10px] text-slate-500 bg-slate-900/60 px-2 py-0.5 rounded border border-slate-800 hidden md:inline">
            PORTS: 5173 / 8000 / 8080 / 8081
          </span>
        </div>
      </div>
    </div>
  )
}
