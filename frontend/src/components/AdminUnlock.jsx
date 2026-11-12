/**
 * AdminUnlock Component
 *
 * Gating mechanism for protected administrative management API endpoints.
 * Keeps bearer token strictly in module memory; never persists to storage or URLs.
 * Conforms to PRD.md (Section 5) and docs/DESIGN.md (Section 3).
 * Clean, professional commercial SaaS styling with zero decorative emojis.
 */

import { useState, useEffect } from 'react'
import {
  setAdminToken,
  clearAdminToken,
  hasAdminToken,
  subscribeAuthChange,
  getApiMode,
} from '../services/apiClient.js'
import {
  IconLock,
  IconUnlock,
  IconKey,
  IconClose,
  IconInfo,
  IconCheckCircle,
} from './Icons.jsx'

export default function AdminUnlock({ onAuthChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(() => hasAdminToken())
  const mode = getApiMode()

  // Subscribe to reactive in-memory auth state transitions (401 invalidation, unlock, lock)
  useEffect(() => {
    setIsUnlocked(hasAdminToken())
    const unsubscribe = subscribeAuthChange((unlocked) => {
      setIsUnlocked(unlocked)
    })
    return () => unsubscribe()
  }, [])

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const handleOpen = () => {
    setTokenInput('')
    setErrorMsg('')
    setIsOpen(true)
  }

  const handleClose = () => {
    setTokenInput('')
    setErrorMsg('')
    setIsOpen(false)
  }

  const handleUnlock = (e) => {
    if (e) e.preventDefault()
    const trimmed = tokenInput.trim()

    if (!trimmed) {
      setErrorMsg('Please enter an admin token.')
      return
    }

    setAdminToken(trimmed)
    setTokenInput('')
    setErrorMsg('')
    setIsOpen(false)
    if (onAuthChange) onAuthChange(true)
  }

  const handleDemoUnlock = () => {
    setAdminToken('demo-local-admin-token')
    setTokenInput('')
    setErrorMsg('')
    setIsOpen(false)
    if (onAuthChange) onAuthChange(true)
  }

  const handleLock = () => {
    clearAdminToken()
    setTokenInput('')
    setErrorMsg('')
    if (onAuthChange) onAuthChange(false)
  }

  return (
    <div className="relative inline-flex items-center">
      {/* Trigger Button */}
      {isUnlocked ? (
        <div className="inline-flex items-center space-x-1.5 sm:space-x-2 shrink-0">
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[10px] sm:text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
            <IconCheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="hidden sm:inline">UNLOCKED</span>
            <span className="sm:hidden">ADMIN</span>
          </span>
          <button
            type="button"
            onClick={handleLock}
            className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[11px] sm:text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.08] transition focus:outline-none focus-visible:ring-1 focus-visible:ring-teal-400 shrink-0"
            title="Clear in-memory admin token and lock dashboard"
          >
            Lock
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center space-x-1 sm:space-x-1.5 px-2 py-1 sm:px-3 sm:py-1 rounded-md text-[11px] sm:text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 shrink-0"
        >
          <IconLock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="hidden sm:inline">Unlock Admin</span>
          <span className="sm:hidden">Unlock</span>
        </button>
      )}

      {/* Modal Dialog */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="unlock-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose()
          }}
        >
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-emerald-500/25 bg-[#0B1713] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/[0.08]">
              <div className="flex items-center space-x-2">
                <IconKey className="w-4 h-4 text-emerald-400" />
                <h2 id="unlock-dialog-title" className="text-base font-semibold text-white tracking-tight">
                  Unlock Management API
                </h2>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close unlock dialog"
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.06] transition"
              >
                <IconClose className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Administrative endpoints require a local bearer token (<code className="text-emerald-300 font-mono">PATCHPILOT_ADMIN_TOKEN</code>). The token is kept in memory only and cleared on page refresh.
            </p>

            <form onSubmit={handleUnlock} className="space-y-4">
              <div>
                <label
                  htmlFor="admin-token-input"
                  className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5"
                >
                  Admin Bearer Token:
                </label>
                <input
                  id="admin-token-input"
                  type="password"
                  value={tokenInput}
                  onChange={(e) => {
                    setTokenInput(e.target.value)
                    if (errorMsg) setErrorMsg('')
                  }}
                  placeholder="Enter local admin token..."
                  autoFocus
                  className="w-full rounded-lg bg-[#060D0A] border border-white/[0.1] px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 font-mono transition"
                />
                {errorMsg && (
                  <p className="mt-1.5 text-xs text-rose-400 font-medium">{errorMsg}</p>
                )}
              </div>

              {/* Mode-specific guidance */}
              {mode === 'mock' ? (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-200 space-y-2">
                  <div className="flex items-center space-x-1.5">
                    <IconInfo className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-semibold text-emerald-300">Mock Mode Active</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    You can enter any token or use the quick unlock button to test the simulated dashboard.
                  </p>
                  <button
                    type="button"
                    onClick={handleDemoUnlock}
                    className="w-full py-1.5 px-3 rounded-md bg-teal-500/15 hover:bg-teal-500/25 text-teal-200 border border-teal-500/30 text-xs font-medium transition"
                  >
                    Quick Demo Unlock
                  </button>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-[#090D16] border border-white/[0.08] text-[11px] text-slate-400 flex items-start space-x-2">
                  <IconInfo className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span><strong>Live Mode:</strong> Enter the token configured in your backend environment (<code className="text-slate-300">PATCHPILOT_ADMIN_TOKEN</code>).</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-3.5 py-1.5 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!tokenInput.trim()}
                  className="btn-primary px-4 py-1.5 rounded-md text-xs font-medium disabled:opacity-40 disabled:pointer-events-none transition"
                >
                  Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
