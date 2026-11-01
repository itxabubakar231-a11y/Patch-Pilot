import { useState } from 'react'
import LanguageSelector, { SUPPORTED_LANGUAGES } from './LanguageSelector.jsx'
import SpeechControl from './SpeechControl.jsx'

/**
 * AdvisoryPanel Component (Zone 4)
 * Provides advisory analysis, multilingual summary display, and user-initiated voice output.
 * Conforms to docs/DESIGN.md and docs/API.md.
 */
export default function AdvisoryPanel({
  advisoryData,
  onAnalyze,
  loading = false,
}) {
  const [advisoryText, setAdvisoryText] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState('en')
  const [processingMode, setProcessingMode] = useState('fixture')

  const currentLangMeta = SUPPORTED_LANGUAGES.find((l) => l.code === selectedLanguage) || {
    dir: 'ltr',
  }

  // Active localization for currently selected language
  const activeLocalization = advisoryData?.localizations?.find(
    (loc) => loc.language_code === selectedLanguage
  ) || advisoryData?.localizations?.[0]

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!advisoryText.trim() || loading) return

    if (onAnalyze) {
      onAnalyze({
        advisory_text: advisoryText,
        languages: SUPPORTED_LANGUAGES.map((l) => l.code),
        processing_mode: processingMode,
      })
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Security Advisory & Intelligence
            </h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-mono font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
              SIMULATED DEMO
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Plain-language multilingual translation and actionable hardening guidance for self-hosted PHP servers.
          </p>
        </div>

        {/* Language Selector */}
        <LanguageSelector
          selectedLanguage={selectedLanguage}
          onSelectLanguage={setSelectedLanguage}
        />
      </div>

      {/* Advisory Submission Form */}
      <form onSubmit={handleSubmit} className="mb-6">
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
          Paste Security Notice / Advisory Text (Local Analysis Only):
        </label>
        <textarea
          rows={3}
          value={advisoryText}
          onChange={(e) => setAdvisoryText(e.target.value)}
          placeholder="e.g. PHP Security Release: Updates addressing CVE-2026-109618 released for PHP 8.2 and 8.3..."
          maxLength={12000}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
          <div className="flex items-center space-x-4 text-xs text-slate-400">
            <label className="flex items-center space-x-1.5 cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="fixture"
                checked={processingMode === 'fixture'}
                onChange={() => setProcessingMode('fixture')}
                className="text-sky-500 focus:ring-0"
              />
              <span>Deterministic Fixture (Safe)</span>
            </label>
            <label className="flex items-center space-x-1.5 text-slate-600 cursor-not-allowed" title="Sprint 1: Live LLM is disabled">
              <input
                type="radio"
                name="mode"
                value="llm"
                disabled
                className="text-slate-600 focus:ring-0"
              />
              <span>Live LLM (Phase 2)</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !advisoryText.trim()}
            className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-600 text-xs font-bold text-white transition shadow-sm"
          >
            {loading ? 'Analyzing...' : 'Analyze Advisory'}
          </button>
        </div>
      </form>

      {/* Structured Advisory Output Card */}
      {advisoryData ? (
        <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-5">
          {advisoryData.is_simulated && (
            <div className="mb-4 px-3 py-2 rounded bg-sky-500/10 border border-sky-500/20 text-[11px] text-sky-300 flex flex-wrap items-center justify-between gap-1">
              <span>ℹ️ <strong>Deterministic Demo Fixture:</strong> Displaying pre-canned simulation output. Input text was not processed by live AI.</span>
              <span className="font-mono text-[10px] uppercase font-bold text-sky-400 bg-sky-950/80 px-2 py-0.5 rounded border border-sky-800">
                Fixture Active
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800/60">
            <div className="flex items-center space-x-2">
              <span className="text-xs px-2 py-0.5 rounded font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                SEVERITY: {advisoryData.advisory?.severity?.toUpperCase() || 'UNKNOWN'}
              </span>
              <span className="text-xs px-2 py-0.5 rounded font-mono text-slate-400 bg-slate-800 border border-slate-700">
                MODE: {advisoryData.processing_mode || 'fixture'}
              </span>
            </div>

            <div className="flex items-center space-x-3">
              {activeLocalization && (
                <SpeechControl
                  textToSpeak={`${activeLocalization.title}. ${activeLocalization.summary} ${activeLocalization.recommended_action}`}
                  languageCode={selectedLanguage}
                />
              )}
              <span className="text-[11px] text-slate-500">
                Source: {advisoryData.advisory?.source_kind || 'demo'} (Simulated)
              </span>
            </div>
          </div>

          {/* Localized Body */}
          {activeLocalization ? (
            <div dir={currentLangMeta.dir} className="space-y-3">
              <h3 className="text-lg font-bold text-white">
                {activeLocalization.title}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                {activeLocalization.summary}
              </p>
              <div className="mt-4 p-3 rounded-lg bg-sky-500/5 border border-sky-500/20">
                <span className="block text-[11px] font-semibold text-sky-400 uppercase tracking-wider mb-1">
                  Recommended Action:
                </span>
                <p className="text-xs text-slate-200">
                  {activeLocalization.recommended_action}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              No translation available for selected language.
            </p>
          )}

          {/* Technical Note */}
          <div className="mt-4 pt-3 border-t border-slate-900 text-[11px] text-slate-500 flex items-center justify-between">
            <span dir="ltr">
              Generated: {advisoryData.advisory?.created_at || 'Just now'}
            </span>
            <span className="text-amber-500/80">
              ⚠️ Simulated guidance. Upgrading PHP runtime is the only complete fix.
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">
          Enter an advisory text above or select a sample notice to view localized explanations.
        </div>
      )}
    </div>
  )
}

