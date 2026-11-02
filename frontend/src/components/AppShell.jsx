/**
 * AppShell Component
 *
 * Responsive cyber command-center layout adhering to docs/DESIGN.md.
 * Provides sidebar navigation, responsive mobile drawer, top status bar,
 * and content area with zone-switching.
 */

import { useState } from 'react'
import EnvironmentBanner from './EnvironmentBanner.jsx'
import AdminUnlock from './AdminUnlock.jsx'
import {
  OverviewPlaceholder,
  TrafficPlaceholder,
  ShieldPlaceholder,
  AdvisoriesPlaceholder,
  Phase2Placeholder,
} from '../features/dashboard/ZonePlaceholders.jsx'

const NAVIGATION_ITEMS = [
  { id: 'overview', label: 'Security Overview', icon: '📊', zone: 'Zone 1' },
  { id: 'traffic', label: 'Traffic Monitor', icon: '📡', zone: 'Zone 2' },
  { id: 'shield', label: 'Shield Controls', icon: '🛡️', zone: 'Zone 3' },
  { id: 'advisories', label: 'Security Advisories', icon: '🌐', zone: 'Zone 4' },
  {
    id: 'scanner',
    label: 'File Scanner',
    icon: '🔍',
    isPhase2: true,
  },
  {
    id: 'inventory',
    label: 'Runtime Inventory',
    icon: '📋',
    isPhase2: true,
  },
]

export default function AppShell({ activeTab = 'overview', onTabChange, onAuthChange }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleSelectTab = (tabId) => {
    if (onTabChange) onTabChange(tabId)
    setMobileMenuOpen(false)
  }

  const activeItem = NAVIGATION_ITEMS.find((item) => item.id === activeTab) || NAVIGATION_ITEMS[0]

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewPlaceholder />
      case 'traffic':
        return <TrafficPlaceholder />
      case 'shield':
        return <ShieldPlaceholder />
      case 'advisories':
        return <AdvisoriesPlaceholder />
      case 'scanner':
        return (
          <Phase2Placeholder
            title="File Compromise Scanner"
            description="Read-only signature and Shannon entropy triage for local lab/www directory."
          />
        )
      case 'inventory':
        return (
          <Phase2Placeholder
            title="Runtime & Vendor Inventory"
            description="Local PHP version, SAPI, and vendor build verification."
          />
        )
      default:
        return <OverviewPlaceholder />
    }
  }

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col font-sans">
      {/* 1. Environment Banner across all views */}
      <EnvironmentBanner />

      {/* 2. Top Header Navigation */}
      <header className="border-b border-slate-800/80 bg-[#111C2F]/90 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Brand & Active Section Breadcrumb */}
          <div className="flex items-center space-x-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition focus:outline-none focus:ring-1 focus:ring-sky-500"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              <span className="text-lg leading-none">☰</span>
            </button>

            <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center font-black text-white shadow-md shadow-sky-500/20 shrink-0">
              P
            </div>

            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-base tracking-tight text-white">PatchPilot</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono border border-slate-700 shrink-0">
                  v0.1.0-alpha
                </span>
                <span className="text-slate-600 hidden sm:inline">/</span>
                <span className="text-xs font-semibold text-sky-400 hidden sm:inline truncate">
                  {activeItem.label}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium hidden md:block">
                Defensive Security Dashboard — Member 3
              </p>
            </div>
          </div>

          {/* Right Header: Admin Gate */}
          <div className="flex items-center space-x-3 shrink-0">
            <AdminUnlock onAuthChange={onAuthChange} />
          </div>
        </div>
      </header>

      {/* 3. Main Body: Sidebar + Dynamic Zone Content Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex flex-col lg:flex-row relative">
        {/* Desktop Sidebar */}
        <aside className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-slate-800/80 bg-[#111C2F]/40 p-4 lg:p-6 shrink-0 hidden lg:block">
          <div className="space-y-1 mb-6">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2">
              Command Zones
            </span>
            <nav aria-label="Command Center Zones" className="space-y-1 mt-2">
              {NAVIGATION_ITEMS.map((item) => {
                const isActive = activeTab === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectTab(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition ${
                      isActive
                        ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30 shadow-sm shadow-sky-500/10'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <span>{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.isPhase2 ? (
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                        Phase 2
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-500 shrink-0">
                        {item.zone}
                      </span>
                    )}
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Architecture Reminder Card in Sidebar */}
          <div className="p-3.5 rounded-xl border border-slate-800 bg-[#0B1120]/70 text-slate-400 text-[11px] space-y-1.5">
            <div className="font-bold text-slate-200 text-xs flex items-center space-x-1.5">
              <span>🔒</span>
              <span>Defensive Scope</span>
            </div>
            <ul className="space-y-1 text-slate-400 text-[10px]">
              <li>• Target: Fixed <code className="text-slate-300">127.0.0.1:8081</code></li>
              <li>• Proxy: Harmless query marker</li>
              <li>• Replay required before Enforce</li>
              <li>• Admin bearer auth on management</li>
            </ul>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <>
            <div
              className="lg:hidden fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />
            <div className="lg:hidden absolute top-0 left-0 right-0 z-40 bg-[#111C2F] border-b border-slate-800 p-4 space-y-1 shadow-2xl animate-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Select Command Zone
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-slate-400 hover:text-white text-xs p-1"
                  aria-label="Close menu"
                >
                  ✕
                </button>
              </div>
              {NAVIGATION_ITEMS.map((item) => {
                const isActive = activeTab === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectTab(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                      isActive
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                    {item.isPhase2 ? (
                      <span className="text-[9px] font-mono text-amber-400">Phase 2</span>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-500">{item.zone}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* Dynamic Zone Main Content Area */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto focus:outline-none"
        >
          {renderContent()}
        </main>
      </div>

      {/* 4. Footer */}
      <footer className="border-t border-slate-800/60 bg-[#111C2F]/30 px-6 py-3 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span>PatchPilot — Defensive Security Toolkit for Self-Hosted PHP Servers</span>
          <span className="font-mono text-slate-500">Loopback Isolated (127.0.0.1) • Hackathon Prototype</span>
        </div>
      </footer>
    </div>
  )
}
