/**
 * ZonePlaceholders Component
 *
 * Connects the implemented Zone 1 (Security Overview), Zone 2 (Traffic Monitor),
 * Zone 3 (Proxy Shield Controls), and Zone 4 (Security Advisories Integration)
 * components, while preserving clear Phase 2 placeholders for Scanner and Inventory.
 */

import SecurityOverview from './SecurityOverview.jsx'
import TrafficMonitor from './TrafficMonitor.jsx'
import ProxyShieldControls from './ProxyShieldControls.jsx'
import AdvisoriesSection from './AdvisoriesSection.jsx'
import { IconHourglass } from '../../components/Icons.jsx'

export { SecurityOverview, TrafficMonitor, ProxyShieldControls, AdvisoriesSection }

export function OverviewPlaceholder({ onNavigate }) {
  return <SecurityOverview onNavigate={onNavigate} />
}

export function TrafficPlaceholder() {
  return <TrafficMonitor />
}

export function ShieldPlaceholder() {
  return <ProxyShieldControls />
}

export function AdvisoriesPlaceholder() {
  return <AdvisoriesSection />
}

export function Phase2Placeholder({ title, description }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
          <p className="text-xs text-slate-400 mt-1">{description}</p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded font-mono font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
          Phase 2 — Coming soon
        </span>
      </div>

      <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-8 text-center space-y-3">
        <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
          <IconHourglass className="w-5 h-5 text-amber-400" />
        </div>
        <h3 className="text-sm font-bold text-slate-200">Feature Scheduled for Phase 2</h3>
        <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
          Per project rules and PRD.md (Section 3), this module is deferred to Phase 2 to prevent MVP scope creep. No simulated or unverified scanner findings are fabricated.
        </p>
      </div>
    </div>
  )
}
