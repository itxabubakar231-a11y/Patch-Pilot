/**
 * AdminUnlock Component
 *
 * Gating mechanism for protected administrative management API endpoints.
 * Keeps bearer token strictly in module memory; never persists to storage or URLs.
 * Conforms to PRD.md (Section 5) and docs/DESIGN.md (Section 3).
 */

import { useState, useEffect } from 'react'
import {
  setAdminToken,
  clearAdminToken,
  hasAdminToken,
  subscribeAuthChange,
  getApiMode,
} from '../services/apiClient.js'

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
    // Demo-only quick unlock for local mock exploration
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
        <div className="inline-flex items-center space-x-2">
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>UNLOCKED</span>
          </span>
          <button
            type="button"
            onClick={handleLock}
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition focus:outline-none focus:ring-1 focus:ring-sky-500"
            title="Clear in-memory admin token and lock dashboard"
          >
            Lock
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
        >
          <span>🔒 Unlock Admin</span>
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
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-slate-800 bg-[#111C2F] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <span className="text-lg">🔐</span>
                <h2 id="unlock-dialog-title" className="text-base font-bold text-white tracking-tight">
                  Unlock Management API
                </h2>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close unlock dialog"
                className="text-slate-400 hover:text-white text-sm p-1.5 rounded-lg hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Administrative endpoints require a local bearer token (<code className="text-sky-400 font-mono">PATCHPILOT_ADMIN_TOKEN</code>). The token is kept in memory only and cleared on page refresh.
            </p>

            <form onSubmit={handleUnlock} className="space-y-4">
              <div>
                <label
                  htmlFor="admin-token-input"
                  className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5"
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
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-mono transition"
                />
                {errorMsg && (
                  <p className="mt-1.5 text-xs text-rose-400 font-medium">{errorMsg}</p>
                )}
              </div>

              {/* Mode-specific guidance */}
              {mode === 'mock' ? (
                <div className="p-3 rounded-lg bg-sky-500/10 border border-sky-500/20 text-xs text-sky-300 space-y-2">
                  <div className="flex items-center space-x-1.5">
                    <span>💡</span>
                    <span className="font-semibold">Mock Mode Active</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    You can enter any token or use the quick unlock button to test the simulated dashboard.
                  </p>
                  <button
                    type="button"
                    onClick={handleDemoUnlock}
                    className="w-full py-1.5 px-3 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-500/40 text-xs font-semibold transition"
                  >
                    ⚡ Quick Demo Unlock
                  </button>
                </div>
              ) : (
                <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400">
                  ℹ️ <strong>Live Mode:</strong> Enter the token configured in your backend environment (<code className="text-slate-300">PATCHPILOT_ADMIN_TOKEN</code>).
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!tokenInput.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-600 transition shadow-sm"
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
