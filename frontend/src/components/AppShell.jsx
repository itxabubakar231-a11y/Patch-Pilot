/**
 * AppShell Component
 *
 * Responsive cyber command-center layout adhering to docs/DESIGN.md.
 * Clean, commercial dark-fintech styling inspired by Linear and Cloudflare.
 * Features genuinely visible ambient background gradients, outline SVG iconography,
 * accessible modal mobile drawer, and smooth zone-switching.
 */

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { getApiMode } from '../services/apiClient.js'
import EnvironmentBanner from './EnvironmentBanner.jsx'
import AdminUnlock from './AdminUnlock.jsx'
import {
  OverviewPlaceholder,
  TrafficPlaceholder,
  ShieldPlaceholder,
  AdvisoriesPlaceholder,
  Phase2Placeholder,
} from '../features/dashboard/ZonePlaceholders.jsx'
import {
  IconOverview,
  IconTraffic,
  IconShield,
  IconShieldCheck,
  IconLayers,
  IconSearch,
  IconServer,
  IconLock,
  IconInfo,
  IconMenu,
  IconClose,
} from './Icons.jsx'

const NAVIGATION_ITEMS = [
  { id: 'overview', label: 'Security Overview', Icon: IconOverview, zone: 'Zone 1' },
  { id: 'traffic', label: 'Traffic Monitor', Icon: IconTraffic, zone: 'Zone 2' },
  { id: 'shield', label: 'Shield Controls', Icon: IconShield, zone: 'Zone 3' },
  { id: 'advisories', label: 'AI Advisories', Icon: IconLayers, zone: 'Zone 4' },
  {
    id: 'scanner',
    label: 'File Scanner',
    Icon: IconSearch,
    isPhase2: true,
  },
  {
    id: 'inventory',
    label: 'Runtime Inventory',
    Icon: IconServer,
    isPhase2: true,
  },
]

function NavItem({ item, isActive, onClick, isMobile = false }) {
  const IconComponent = item.Icon

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={`group relative w-full flex items-center justify-between text-left rounded-xl transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
        isMobile ? 'px-3 py-2.5 text-sm' : 'px-3.5 py-2 text-[13px]'
      } ${
        isActive
          ? 'bg-[#0B2117] text-white font-semibold border border-emerald-500/70 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
          : 'text-slate-300 hover:text-white hover:bg-[#071510] border border-transparent font-medium'
      }`}
    >
      {/* Item Icon and Label */}
      <div className="flex items-center space-x-2.5 min-w-0">
        <span className={`shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-400 group-hover:text-emerald-400 transition-colors'}`}>
          <IconComponent className="w-4 h-4" />
        </span>
        <span className="truncate tracking-normal">{item.label}</span>
      </div>

      {/* Right Badge / Status Pill */}
      {item.isPhase2 ? (
        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/25 shrink-0">
          Phase 2
        </span>
      ) : (
        <span
          className={`text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 transition-colors duration-150 ${
            isActive
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-medium'
              : 'text-slate-400 bg-white/[0.03] border border-white/[0.08] group-hover:text-slate-300'
          }`}
        >
          {item.zone}
        </span>
      )}
    </button>
  )
}

export default function AppShell({ activeTab = 'overview', onTabChange, onAuthChange }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const hamburgerButtonRef = useRef(null)
  const drawerRef = useRef(null)
  const closeButtonRef = useRef(null)

  const closeMobileMenu = () => {
    setMobileMenuOpen(false)
    requestAnimationFrame(() => {
      if (hamburgerButtonRef.current && window.getComputedStyle(hamburgerButtonRef.current).display !== 'none') {
        hamburgerButtonRef.current.focus()
      } else {
        const activeDesktopButton = document.querySelector('aside nav button[aria-current="page"]')
        if (activeDesktopButton) {
          activeDesktopButton.focus()
        } else {
          document.getElementById('main-content')?.focus()
        }
      }
    })
  }

  const handleSelectTab = (tabId, fromMobile = false) => {
    if (onTabChange) onTabChange(tabId)
    if (fromMobile) {
      setMobileMenuOpen(false)
      requestAnimationFrame(() => {
        const main = document.getElementById('main-content')
        if (main) main.focus()
      })
    }
  }

  const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect
  useIsomorphicLayoutEffect(() => {
    if (!mobileMenuOpen) return

    if (closeButtonRef.current) {
      closeButtonRef.current.focus()
    } else if (drawerRef.current) {
      const firstFocusable = drawerRef.current.querySelector('button, [href], [tabindex]:not([tabindex="-1"])')
      firstFocusable?.focus()
    }
  }, [mobileMenuOpen])

  useEffect(() => {
    if (!mobileMenuOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeMobileMenu()
        return
      }

      if (e.key === 'Tab' && drawerRef.current) {
        const focusable = Array.from(
          drawerRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        )
        if (focusable.length === 0) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (!drawerRef.current.contains(document.activeElement)) {
          e.preventDefault()
          if (e.shiftKey) {
            last.focus()
          } else {
            first.focus()
          }
          return
        }

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileMenuOpen])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(min-width: 1024px)')
    const handleResize = (e) => {
      if (e.matches && mobileMenuOpen) {
        setMobileMenuOpen(false)
        requestAnimationFrame(() => {
          const activeDesktopButton = document.querySelector('aside nav button[aria-current="page"]')
          if (activeDesktopButton) {
            activeDesktopButton.focus()
          } else {
            const main = document.getElementById('main-content')
            if (main) main.focus()
          }
        })
      }
    }
    if (mql.addEventListener) {
      mql.addEventListener('change', handleResize)
      return () => mql.removeEventListener('change', handleResize)
    }
  }, [mobileMenuOpen])

  const activeItem = NAVIGATION_ITEMS.find((item) => item.id === activeTab) || NAVIGATION_ITEMS[0]

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewPlaceholder onNavigate={handleSelectTab} />
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
    <div className="min-h-screen bg-transparent text-slate-100 flex flex-col font-sans relative">
      {/* Background Application Shell (Ambient background gradients shine through) */}
      <div
        id="app-shell-root"
        inert={mobileMenuOpen ? '' : undefined}
        aria-hidden={mobileMenuOpen ? 'true' : undefined}
        className="flex-1 flex flex-col"
      >
        {/* Top Header Navigation (z-30) - EXACT 72px height matching reference */}
        <header className="h-[72px] border-b border-emerald-500/15 bg-[#060B08]/90 backdrop-blur-xl sticky top-0 z-30 px-3 sm:px-6 flex items-center transition-colors">
          <div className="w-full flex items-center justify-between gap-2 sm:gap-4 min-w-0">
            {/* Brand & Active Section Breadcrumb */}
            <div className="flex items-center space-x-1.5 sm:space-x-3 shrink-0 min-w-0">
              <button
                ref={hamburgerButtonRef}
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-emerald-500/10 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 shrink-0"
                aria-label="Toggle navigation menu"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <IconClose className="w-5 h-5 text-emerald-400" /> : <IconMenu className="w-5 h-5" />}
              </button>

              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <IconShieldCheck className="w-4 h-4" />
              </div>

              <div className="flex items-center space-x-2 min-w-0">
                <span className="font-bold text-sm sm:text-base tracking-tight text-white shrink-0">
                  PatchPilot
                </span>

                {/* Version badge - hidden on mobile < 640px */}
                <span className="hidden sm:inline text-[10px] px-2 py-0.5 rounded bg-[#0B1512] text-slate-400 font-mono border border-emerald-500/20 shrink-0">
                  v0.1.0-alpha
                </span>

                {/* Active Section Breadcrumb */}
                <span className="text-xs font-medium text-slate-300 hidden md:inline ml-1 shrink-0">
                  {activeItem.zone || 'Zone 1'}
                </span>
              </div>
            </div>

            {/* Right Header Badges and Controls */}
            <div className="flex items-center space-x-1.5 sm:space-x-3 shrink-0">
              {/* Mode-Aware Environment Pill - compact on mobile */}
              <span className="inline-flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="hidden sm:inline">
                  {getApiMode() === 'real' ? 'Local Lab / API Transport Mode' : 'Local Lab / Simulated Environment'}
                </span>
                <span className="sm:hidden">
                  {getApiMode() === 'real' ? 'API Mode' : 'Simulated'}
                </span>
              </span>

              {/* Loopback prototype notice */}
              <span className="text-xs text-slate-400 hidden 2xl:inline">
                Defensive prototype bound to loopback (127.0.0.1). Not a production WAF.
              </span>

              {/* Data Provenance Badge - distinguishes configured mode from verified connectivity */}
              <span className="hidden xl:inline-flex text-xs font-mono px-2.5 py-1 rounded-md bg-[#0A1820] text-cyan-400 border border-cyan-500/40">
                {getApiMode() === 'real' ? 'Transport: API (127.0.0.1:8000)' : 'Data: Mock Fixture'}
              </span>

              {/* Compact Port Indicators */}
              <span className="text-xs font-mono text-slate-500 hidden 2xl:inline">
                Ports: 5173 / 8000 / 8080 / 8081
              </span>

              <div className="shrink-0">
                <AdminUnlock onAuthChange={onAuthChange} />
              </div>
            </div>
          </div>
        </header>

        {/* 3. Main Body: Edge-to-edge layout matching reference geometry */}
        <div className="flex-1 w-full flex flex-col lg:flex-row relative">
          {/* Desktop Sidebar: EXACT 335px width matching reference */}
          <aside className="w-full lg:w-[335px] border-b lg:border-b-0 lg:border-r border-emerald-500/15 bg-[#060E11]/90 p-5 shrink-0 hidden lg:flex flex-col justify-between backdrop-blur-sm min-h-[calc(100vh-72px)]">
            <div className="space-y-6">
              <div className="space-y-1">
                <div className="px-2 pb-1.5">
                  <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                    Command Center
                  </span>
                </div>
                <nav aria-label="Command Center Zones" className="space-y-1 mt-1">
                  {NAVIGATION_ITEMS.filter((item) => !item.isPhase2).map((item) => (
                    <NavItem
                      key={item.id}
                      item={item}
                      isActive={activeTab === item.id}
                      onClick={() => handleSelectTab(item.id)}
                    />
                  ))}
                </nav>
              </div>

              <div className="space-y-1">
                <div className="px-2 pb-1.5">
                  <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                    Phase 2
                  </span>
                </div>
                <nav aria-label="Phase 2 Features" className="space-y-1 mt-1">
                  {NAVIGATION_ITEMS.filter((item) => item.isPhase2).map((item) => (
                    <NavItem
                      key={item.id}
                      item={item}
                      isActive={activeTab === item.id}
                      onClick={() => handleSelectTab(item.id)}
                    />
                  ))}
                </nav>
              </div>
            </div>

            {/* Defensive Scope Card in Sidebar */}
            <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-[#07130F] text-slate-300 text-[11px] space-y-2 mt-auto">
              <div className="font-semibold text-slate-200 text-xs flex items-center space-x-1.5">
                <IconInfo className="w-3.5 h-3.5 text-emerald-400" />
                <span>Defensive Scope</span>
              </div>
              <ul className="space-y-1.5 text-slate-300 text-[11px]">
                <li className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span>Target: <code className="text-emerald-300 font-mono">127.0.0.1:8081</code></span>
                </li>
                <li className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span>Proxy: Defensive query marker</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span>Replay required before Enforce</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span>Admin bearer auth on management</span>
                </li>
              </ul>
            </div>
          </aside>

          {/* Dynamic Zone Main Content Area with Smooth Transitions */}
          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 min-w-0 overflow-y-auto focus:outline-none"
          >
            <div key={activeTab} className="zone-transition-wrapper animate-zone-in">
              {renderContent()}
            </div>
          </main>
        </div>
      </div>

      {/* Modal Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div id="mobile-drawer-portal">
          <div
            className="lg:hidden fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none"
            onClick={closeMobileMenu}
            aria-hidden="true"
          />

          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation Menu"
            className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[#060A08]/95 border-b border-emerald-500/30 backdrop-blur-xl p-4 space-y-2 shadow-2xl rounded-b-xl animate-in slide-in-from-top-2 duration-150 motion-reduce:animate-none motion-reduce:transform-none"
          >
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/[0.08]">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-semibold text-white uppercase tracking-wider">
                  Command Center Zones
                </span>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeMobileMenu}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                aria-label="Close navigation menu"
              >
                <IconClose className="w-4 h-4" />
              </button>
            </div>

            <nav aria-label="Mobile Command Zones" className="space-y-1">
              {NAVIGATION_ITEMS.map((item) => (
                <NavItem
                  key={item.id}
                  item={item}
                  isActive={activeTab === item.id}
                  onClick={() => handleSelectTab(item.id, true)}
                  isMobile={true}
                />
              ))}
            </nav>

            <div className="pt-2 mt-2 border-t border-white/[0.08] text-[10px] text-slate-400 flex items-center justify-between">
              <span>Fixed Target: <code className="text-slate-300 font-mono">127.0.0.1:8081</code></span>
              <span className="font-mono text-teal-400">Loopback Isolated</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
