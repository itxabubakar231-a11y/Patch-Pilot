/**
 * AdvisoriesSection Component (Zone 4)
 *
 * Integrates Member 4's AdvisoryPanel, LanguageSelector, and SpeechControl
 * into the main dashboard shell. Connects advisory analysis to apiClient.
 * Conforms strictly to docs/API.md (Section 3.I) and docs/DESIGN.md (Section 5).
 */

import { useState } from 'react'
import { AdvisoryPanel } from '../advisories/index.js'
import {
  analyzeAdvisory,
  hasAdminToken,
  getApiMode,
} from '../../services/apiClient.js'
import { mockAdvisories } from '../../mocks/index.js'

export default function AdvisoriesSection() {
  const mode = getApiMode()
  // In mock mode, pre-seed with mock advisory fixture so user sees the localized demo immediately
  const [advisoryData, setAdvisoryData] = useState(() =>
    mode === 'mock' ? mockAdvisories : null
  )
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

  const handleAnalyze = async (payload) => {
    setErrorMsg(null)

    // In real mode, check for admin token
    if (getApiMode() === 'real' && !hasAdminToken()) {
      setErrorMsg(
        'Admin Unlock Required: Please unlock the dashboard with your admin token in the top navigation before submitting advisories in Live mode.'
      )
      return
    }

    setLoading(true)
    try {
      const result = await analyzeAdvisory(payload)
      setAdvisoryData(result)
      setLoading(false)
    } catch (err) {
      setLoading(false)
      if (err.status === 503 || err.code === 'LLM_NOT_CONFIGURED') {
        setErrorMsg(
          'Live AI Unavailable (503): The backend LLM provider (Groq) is not configured. Please switch to "Deterministic Fixture" mode.'
        )
      } else if (err.status === 401 || err.code === 'UNAUTHORIZED') {
        setErrorMsg(
          'Authentication Failed (401): Invalid or missing admin token. Please unlock the dashboard with a valid token.'
        )
      } else {
        setErrorMsg(
          err.message || 'Failed to analyze advisory. Please check connection to 127.0.0.1:8000.'
        )
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Error alert if analysis fails */}
      {errorMsg && (
        <div
          role="alert"
          className="p-4 rounded-xl text-xs flex items-start justify-between gap-3 bg-rose-500/10 text-rose-300 border border-rose-500/30"
        >
          <div className="flex items-start space-x-2">
            <span className="text-base">⚠️</span>
            <div>
              <span className="font-semibold block">Advisory Analysis Error</span>
              <p className="text-[11px] leading-relaxed mt-0.5">{errorMsg}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-slate-400 hover:text-white text-xs p-1"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* Member 4's AdvisoryPanel (Zone 4) */}
      <AdvisoryPanel
        advisoryData={advisoryData}
        onAnalyze={handleAnalyze}
        loading={loading}
      />
    </div>
  )
}
