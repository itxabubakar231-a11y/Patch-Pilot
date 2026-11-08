/**
 * AppShell Component
 *
 * Responsive cyber command-center layout adhering to docs/DESIGN.md.
 * Provides animated sidebar navigation, fully accessible modal mobile drawer,
 * top status bar, and content area with zone-switching.
 */

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
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

function NavItem({ item, isActive, onClick, isMobile = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={`group relative w-full flex items-center justify-between text-left rounded-xl transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111C2F] active:scale-[0.98] motion-reduce:transform-none ${
        isMobile ? 'px-3.5 py-3 text-sm' : 'px-3 py-2.5 text-xs'
      } ${
        isActive
          ? 'bg-gradient-to-r from-sky-500/20 via-sky-500/10 to-transparent text-white font-bold border border-sky-500/35 shadow-[0_0_15px_rgba(56,189,248,0.12)]'
          : 'text-slate-400 font-medium hover:text-slate-200 hover:bg-slate-800/50 border border-transparent hover:border-slate-700/60 hover:shadow-[inset_0_0_12px_rgba(56,189,248,0.04)]'
      }`}
    >
      {/* Left Active Accent Pip / Indicator */}
      <span
        aria-hidden="true"
        className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full transition-all duration-200 ${
          isActive
            ? 'h-5 bg-sky-400 shadow-[0_0_8px_#38BDF8] opacity-100'
            : 'h-0 bg-transparent opacity-0 group-hover:h-3 group-hover:bg-sky-400/50 group-hover:opacity-60'
        }`}
      />

      {/* Item Icon and Label */}
      <div className="flex items-center space-x-2.5 min-w-0">
        <span className="text-base leading-none shrink-0 transition-transform duration-200 group-hover:scale-110 motion-reduce:transform-none">
          {item.icon}
        </span>
        <span className="truncate tracking-wide">{item.label}</span>
      </div>

      {/* Right Badge / Status Pill */}
      {item.isPhase2 ? (
        <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/25 shrink-0">
          Phase 2
        </span>
      ) : (
        <span
          className={`text-[10px] font-mono px-2 py-0.5 rounded-full border shrink-0 transition-colors duration-200 ${
            isActive
              ? 'bg-sky-500/25 text-sky-200 border-sky-400/40 shadow-[0_0_6px_rgba(56,189,248,0.25)] font-semibold'
              : 'text-slate-500 bg-slate-800/40 border-slate-800 group-hover:text-slate-400 group-hover:border-slate-700'
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

  // FIX 1 & FIX 2: Close mobile menu and restore focus safely
  const closeMobileMenu = () => {
    setMobileMenuOpen(false)
    requestAnimationFrame(() => {
      // If hamburger button is visible in viewport, restore focus to it
      if (hamburgerButtonRef.current && window.getComputedStyle(hamburgerButtonRef.current).display !== 'none') {
        hamburgerButtonRef.current.focus()
      } else {
        // Desktop fallback: focus currently selected desktop navigation item or main content
        const activeDesktopButton = document.querySelector('aside nav button[aria-current="page"]')
        if (activeDesktopButton) {
          activeDesktopButton.focus()
        } else {
          document.getElementById('main-content')?.focus()
        }
      }
    })
  }

  // FIX 1: When selecting a zone from mobile drawer, close drawer and focus newly selected main content
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

  // FIX 1: Move focus promptly into drawer upon opening (no delayed timeout)
  const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect
  useIsomorphicLayoutEffect(() => {
    if (!mobileMenuOpen) return

    // Immediately shift focus into the drawer so it never remains inside the inert background region
    if (closeButtonRef.current) {
      closeButtonRef.current.focus()
    } else if (drawerRef.current) {
      const firstFocusable = drawerRef.current.querySelector('button, [href], [tabindex]:not([tabindex="-1"])')
      firstFocusable?.focus()
    }
  }, [mobileMenuOpen])

  // FIX 1: Accessible Modal Keyboard Trap & Escape Handling
  useEffect(() => {
    if (!mobileMenuOpen) return

    const handleKeyDown = (e) => {
      // Escape key to close
      if (e.key === 'Escape') {
        e.preventDefault()
        closeMobileMenu()
        return
      }

      // Tab key trapping & outside focus recovery
      if (e.key === 'Tab' && drawerRef.current) {
        const focusable = Array.from(
          drawerRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        )
        if (focusable.length === 0) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        // RECOVERY: If activeElement somehow is outside the drawer, redirect focus inside!
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

  // FIX 2: Desktop Resize Focus Recovery
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(min-width: 1024px)')
    const handleResize = (e) => {
      if (e.matches && mobileMenuOpen) {
        setMobileMenuOpen(false)
        // Move focus to visible, currently selected desktop navigation item or main content
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
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col font-sans relative">
      {/* FIX 1: Background Application Shell (Native inert & aria-hidden applied when mobile modal is active) */}
      <div
        id="app-shell-root"
        inert={mobileMenuOpen ? '' : undefined}
        aria-hidden={mobileMenuOpen ? 'true' : undefined}
        className="flex-1 flex flex-col"
      >
        {/* 1. Environment Banner across all views */}
        <EnvironmentBanner />

        {/* 2. Top Header Navigation (z-30) */}
        <header className="border-b border-slate-800/80 bg-[#111C2F]/90 backdrop-blur-md sticky top-0 z-30 px-3 sm:px-6 py-2.5 sm:py-3 transition-colors">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
            {/* Brand & Active Section Breadcrumb */}
            <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
              <button
                ref={hamburgerButtonRef}
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 active:bg-slate-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                aria-label="Toggle navigation menu"
                aria-expanded={mobileMenuOpen}
              >
                <span className="text-lg leading-none" aria-hidden="true">{mobileMenuOpen ? '✕' : '☰'}</span>
              </button>

              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center font-black text-white shadow-md shadow-sky-500/25 ring-1 ring-white/20 shrink-0">
                P
              </div>

              <div className="min-w-0 flex items-center space-x-2">
                <span className="font-extrabold text-sm sm:text-base tracking-tight text-white shrink-0">
                  PatchPilot
                </span>

                {/* Version badge: hidden on ultra-small mobile to prevent header crowding */}
                <span className="hidden min-[420px]:inline-flex text-[10px] px-2 py-0.5 rounded-full bg-slate-800/90 text-slate-400 font-mono border border-slate-700/80 shrink-0">
                  v0.1.0-alpha
                </span>

                {/* Active Section Breadcrumb */}
                <span className="text-slate-600 hidden md:inline">/</span>
                <span className="text-xs font-semibold text-sky-400 hidden md:inline truncate">
                  {activeItem.label}
                </span>
              </div>
            </div>

            {/* Right Header: Active Zone Pill (Mobile) + Admin Gate */}
            <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
              {/* On small mobile: accurate Zone or Phase 2 indicator */}
              <span
                className={`inline-flex sm:hidden text-[10px] font-mono px-2 py-0.5 rounded-md font-medium transition-colors ${
                  activeItem.isPhase2
                    ? 'bg-amber-500/10 text-amber-300 border border-amber-500/25 shadow-sm'
                    : 'bg-sky-500/10 text-sky-300 border border-sky-500/20'
                }`}
              >
                {activeItem.isPhase2 ? 'Phase 2' : activeItem.zone}
              </span>
              <AdminUnlock onAuthChange={onAuthChange} />
            </div>
          </div>
        </header>

        {/* 3. Main Body: Sidebar + Dynamic Zone Content Area */}
        <div className="flex-1 max-w-7xl w-full mx-auto flex flex-col lg:flex-row relative">
          {/* Desktop Sidebar */}
          <aside className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-slate-800/80 bg-[#111C2F]/40 p-4 lg:p-6 shrink-0 hidden lg:block">
            <div className="space-y-1 mb-6">
              <div className="flex items-center space-x-2 px-2 pb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_#38BDF8]" />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Command Zones
                </span>
              </div>
              <nav aria-label="Command Center Zones" className="space-y-1.5 mt-2">
                {NAVIGATION_ITEMS.map((item) => (
                  <NavItem
                    key={item.id}
                    item={item}
                    isActive={activeTab === item.id}
                    onClick={() => handleSelectTab(item.id)}
                  />
                ))}
              </nav>
            </div>

            {/* Architecture Reminder Card in Sidebar */}
            <div className="p-3.5 rounded-xl border border-slate-800/90 bg-[#0B1120]/70 text-slate-400 text-[11px] space-y-1.5 shadow-sm">
              <div className="font-bold text-slate-200 text-xs flex items-center space-x-1.5">
                <span>🔒</span>
                <span>Defensive Scope</span>
              </div>
              <ul className="space-y-1 text-slate-400 text-[10px]">
                <li>• Target: Fixed <code className="text-slate-300 font-mono">127.0.0.1:8081</code></li>
                <li>• Proxy: Harmless query marker</li>
                <li>• Replay required before Enforce</li>
                <li>• Admin bearer auth on management</li>
              </ul>
            </div>
          </aside>

          {/* Dynamic Zone Main Content Area with Smooth Transitions */}
          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto focus:outline-none"
          >
            <div key={activeTab} className="zone-transition-wrapper animate-zone-in">
              {renderContent()}
            </div>
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

      {/* FIX 1: Modal Mobile Navigation Drawer (OUTSIDE inert app-shell-root!) */}
      {mobileMenuOpen && (
        <div id="mobile-drawer-portal">
          {/* Backdrop: intercepts clicks, dims background, layered at z-40 */}
          <div
            className="lg:hidden fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none"
            onClick={closeMobileMenu}
            aria-hidden="true"
          />

          {/* Modal Dialog: top layer at z-50 */}
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation Menu"
            className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[#0F172A]/95 border-b border-sky-500/30 backdrop-blur-xl p-4 space-y-2 shadow-2xl rounded-b-2xl animate-in slide-in-from-top-3 duration-200 motion-reduce:animate-none motion-reduce:transform-none"
          >
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-800/80">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_6px_#38BDF8]" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Command Center Zones
                </span>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeMobileMenu}
                className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                aria-label="Close navigation menu"
              >
                ✕
              </button>
            </div>

            <nav aria-label="Mobile Command Zones" className="space-y-1.5">
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

            {/* Mobile Defensive Scope Reminder */}
            <div className="pt-2 mt-2 border-t border-slate-800/60 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Fixed Target: <code className="text-slate-300 font-mono">127.0.0.1:8081</code></span>
              <span className="font-mono text-sky-400">Loopback Isolated</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
