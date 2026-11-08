import { useState } from 'react'
import LanguageSelector, { SUPPORTED_LANGUAGES } from './LanguageSelector.jsx'
import SpeechControl from './SpeechControl.jsx'
import AIOrb from './AIOrb.jsx'
import { cleanUrlAndTrailingPunct } from './advisoryUtils.js'

export { cleanUrlAndTrailingPunct }

/**
 * Regular expression matching unquoted and quoted technical tokens:
 * - Backtick code spans (`...`)
 * - URLs (http:// or https://)
 * - CVE identifiers (CVE-YYYY-NNNN)
 * - PHP version numbers (e.g. PHP 8.3, PHP 8.2.14, v8.3.0)
 * - File paths and config filenames (e.g. /etc/php/..., php.ini)
 * - Configuration directives & technical identifiers (e.g. memory_limit, disable_functions)
 */
const TECHNICAL_TOKEN_REGEX = new RegExp(
  '(' +
    '`[^`]+`' +
    '|' +
    'https?:\\/\\/[^\\s]+' +
    '|' +
    '\\bCVE-\\d{4}-\\d{4,}\\b' +
    '|' +
    '\\bPHP\\s+\\d+(?:\\.\\d+)*(?:-[a-zA-Z0-9.]+)?\\b' +
    '|' +
    '\\bv\\d+(?:\\.\\d+)*(?:-[a-zA-Z0-9.]+)?\\b' +
    '|' +
    '(?<=[\\s(]|^)\\/(?:[a-zA-Z0-9_.-]+\\/)+[a-zA-Z0-9_.-]+' +
    '|' +
    '(?<=[\\s(]|^)\\/(?:[a-zA-Z0-9_.-]+\\/)*[a-zA-Z0-9_.-]+\\.[a-zA-Z0-9]+' +
    '|' +
    '\\b[a-zA-Z0-9_][\\w.-]*\\.(?:ini|php|conf|log|so|json|ya?ml|xml|sh|txt)\\b' +
    '|' +
    '\\b(?:php-fpm|php8\\.[0-9]-fpm)\\b' +
    '|' +
    '\\b(?:memory_limit|disable_functions|allow_url_fopen|allow_url_include|open_basedir|display_errors|max_execution_time|post_max_size|upload_max_filesize|auto_prepend_file|auto_append_file)\\b' +
    '|' +
    '\\b(?:session|opcache|mysqli|pdo_mysql)\\.[a-z_]+\\b' +
    '|' +
    '\\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\\b' +
    '|' +
    '\\b[a-z_][a-z0-9_]*\\(\\)' +
  ')',
  'gi'
)

/**
 * Renders localized text with bidirectional isolation (<bdi dir="ltr">)
 * for technical tokens (CVEs, PHP versions, config directives, paths, URLs, code spans)
 * so they remain strictly readable left-to-right inside RTL sentences (Urdu, Arabic).
 * React text nodes are used exclusively to guarantee complete XSS safety.
 */
export function renderLocalizedContent(text) {
  if (!text || typeof text !== 'string') return text

  const parts = text.split(TECHNICAL_TOKEN_REGEX)
  if (parts.length === 1) return text

  const elements = []
  parts.forEach((part, index) => {
    if (!part) return

    // 1. CVE Identifier (e.g. CVE-2026-109618)
    if (/^CVE-\d{4}-\d{4,}$/i.test(part)) {
      elements.push(
        <bdi
          key={`cve-${index}`}
          dir="ltr"
          className="font-mono font-semibold text-sky-400 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-800/60 inline-block align-baseline"
        >
          {part}
        </bdi>
      )
      return
    }

    // 2. Backtick code span (e.g. `eval()`)
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      elements.push(
        <bdi key={`code-${index}`} dir="ltr" className="inline-block align-baseline">
          <code
            dir="ltr"
            className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 border border-slate-700/60"
          >
            {part.slice(1, -1)}
          </code>
        </bdi>
      )
      return
    }

    // 3. URLs (handling trailing sentence punctuation)
    if (/^https?:\/\//i.test(part)) {
      const { url, trailing } = cleanUrlAndTrailingPunct(part)
      elements.push(
        <bdi
          key={`url-${index}`}
          dir="ltr"
          className="font-mono text-xs text-sky-400 underline inline-block align-baseline hover:text-sky-300"
        >
          {url}
        </bdi>
      )
      if (trailing) {
        elements.push(trailing)
      }
      return
    }

    // 4. PHP version strings (e.g. PHP 8.3, PHP 8.2.14, v8.3)
    if (/^(?:PHP\s+\d+(?:\.\d+)*(?:-[a-zA-Z0-9.]+)?|v\d+(?:\.\d+)*(?:-[a-zA-Z0-9.]+)?)$/i.test(part)) {
      elements.push(
        <bdi
          key={`phpver-${index}`}
          dir="ltr"
          className="font-mono font-semibold text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-800/40 inline-block align-baseline"
        >
          {part}
        </bdi>
      )
      return
    }

    // 5. File paths or filenames (e.g. /etc/php/..., php.ini)
    if (/^(?:(?:\/(?:[a-zA-Z0-9_.-]+\/)+[a-zA-Z0-9_.-]+|\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+)|[a-zA-Z0-9_][\w.-]*\.(?:ini|php|conf|log|so|json|ya?ml|xml|sh|txt))$/i.test(part)) {
      elements.push(
        <bdi key={`path-${index}`} dir="ltr" className="inline-block align-baseline">
          <code
            dir="ltr"
            className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-800/90 text-amber-300 border border-slate-700/60"
          >
            {part}
          </code>
        </bdi>
      )
      return
    }

    // 6. Configuration directives, snake_case identifiers, php-fpm, or function calls
    if (/^(?:(?:memory_limit|disable_functions|allow_url_fopen|allow_url_include|open_basedir|display_errors|max_execution_time|post_max_size|upload_max_filesize|auto_prepend_file|auto_append_file)|(?:session|opcache|mysqli|pdo_mysql)\.[a-z_]+|(?:php-fpm|php8\.[0-9]-fpm)|[a-z][a-z0-9]*(?:_[a-z0-9]+)+|[a-z_][a-z0-9_]*\(\))$/i.test(part)) {
      elements.push(
        <bdi key={`ident-${index}`} dir="ltr" className="inline-block align-baseline">
          <code
            dir="ltr"
            className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-800/90 text-sky-300 border border-slate-700/60"
          >
            {part}
          </code>
        </bdi>
      )
      return
    }

    // Standard text node (React auto-escapes all text, neutralizing any untrusted HTML-like tags)
    elements.push(part)
  })

  return elements
}

/**
 * AdvisoryPanel Component (Zone 4)
 * Provides advisory analysis, multilingual summary display, and user-initiated voice output.
 * Features futuristic AIOrb state indicator derived honestly from actual request lifecycle.
 * Conforms to docs/DESIGN.md and docs/API.md.
 */
export default function AdvisoryPanel({
  advisoryData,
  onAnalyze,
  loading = false,
  requestStatus = 'idle',
  error = null,
  completedAnalysis = null,
}) {
  const [advisoryText, setAdvisoryText] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState('en')
  const [processingMode, setProcessingMode] = useState('fixture')

  const currentLangMeta = SUPPORTED_LANGUAGES.find((l) => l.code === selectedLanguage) || {
    dir: 'ltr',
    label: selectedLanguage,
  }

  // Active localization for currently selected language (no fallback to default language)
  const activeLocalization = advisoryData?.localizations?.find(
    (loc) => loc.language_code === selectedLanguage
  ) || null

  // Honest LLM verification: Must have valid data, not simulated, and processing_mode === 'llm'
  const isActualLlm = Boolean(
    advisoryData &&
    !advisoryData.is_simulated &&
    advisoryData.processing_mode === 'llm'
  )

  // FIX 2: Derive AIOrb state strictly from component request lifecycle
  const orbState = loading || requestStatus === 'analyzing'
    ? 'analyzing'
    : error || requestStatus === 'error'
    ? 'error'
    : requestStatus === 'success'
    ? 'success'
    : 'idle'

  const isPreloadedFixture = requestStatus === 'idle' && Boolean(advisoryData)

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

  const severity = advisoryData?.advisory?.severity?.toUpperCase() || 'UNKNOWN'
  const severityBadgeClass =
    severity === 'CRITICAL'
      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm shadow-rose-950/30'
      : severity === 'HIGH'
      ? 'bg-orange-500/20 text-orange-300 border-orange-500/40 shadow-sm shadow-orange-950/30'
      : severity === 'MEDIUM'
      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-950/30'
      : severity === 'LOW'
      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 shadow-sm shadow-sky-950/30'
      : 'bg-slate-800 text-slate-300 border-slate-700'

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 backdrop-blur-md p-6 shadow-lg shadow-slate-950/30 space-y-6">
      {/* Header with Futuristic AI Orb */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
        <div className="flex items-center space-x-4">
          {/* Glowing Futuristic AI Orb */}
          <AIOrb state={orbState} size="md" />

          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-bold text-white tracking-tight">
                Zone 4 — Security Advisory & AI Intelligence
              </h2>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-mono font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30">
                {isActualLlm ? 'AI ANALYZED (GROQ)' : 'SIMULATED DEMO'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Plain-language multilingual translation and actionable hardening guidance for self-hosted PHP servers.
            </p>

            {/* AI Agent Status Pill (FIX 2) */}
            <div className="flex items-center space-x-2 mt-1.5">
              <span className="text-[11px] font-mono text-slate-400">AI Agent:</span>
              <span
                className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded border transition-colors ${
                  orbState === 'analyzing'
                    ? 'bg-sky-500/15 text-sky-300 border-sky-500/40 animate-pulse'
                    : orbState === 'error'
                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                    : orbState === 'success'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {orbState === 'analyzing'
                  ? '⚡ ANALYZING ADVISORY'
                  : orbState === 'error'
                  ? '⚠️ ANALYSIS FAILED'
                  : orbState === 'success'
                  ? (!completedAnalysis?.isSimulated && completedAnalysis?.processingMode === 'llm')
                    ? '✓ GROQ AI ANALYSIS COMPLETE'
                    : '✓ DEMO FIXTURE ANALYSIS COMPLETE'
                  : isPreloadedFixture
                  ? 'STANDBY (PRELOADED DEMO FIXTURE)'
                  : 'STANDBY (IDLE)'}
              </span>
            </div>

            {/* Accessible screen reader status announcement (FIX 2) */}
            <div className="sr-only" role="status" aria-live="polite">
              {orbState === 'analyzing'
                ? 'AI Security Advisor: Actively analyzing submitted notice...'
                : orbState === 'error'
                ? 'AI Security Advisor: Analysis request failed or service unreachable.'
                : orbState === 'success'
                ? (!completedAnalysis?.isSimulated && completedAnalysis?.processingMode === 'llm')
                  ? 'AI Security Advisor: Live Groq AI analysis completed.'
                  : 'AI Security Advisor: Deterministic fixture analysis completed.'
                : isPreloadedFixture
                ? 'AI Security Advisor: Standby. Preloaded local demo fixture available.'
                : 'AI Security Advisor: Standby and ready for input.'}
            </div>
          </div>
        </div>

        {/* Language Selector */}
        <LanguageSelector
          selectedLanguage={selectedLanguage}
          onSelectLanguage={setSelectedLanguage}
        />
      </div>

      {/* Advisory Submission Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Paste Security Notice / Advisory Text:
          </label>
          <span className="text-[11px]">
            {processingMode === 'llm' ? (
              <span className="text-amber-400 font-medium">
                ⚠️ External Groq AI: Do NOT submit credentials or secrets
              </span>
            ) : (
              <span className="text-sky-400 font-medium">
                🔒 Offline Fixture: Evaluated locally on this server
              </span>
            )}
          </span>
        </div>

        {processingMode === 'llm' ? (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 backdrop-blur-sm shadow-sm">
            <strong>External AI Disclosure:</strong> Live AI analysis transmits submitted text to Groq Cloud API for summarization. <strong>Do not submit passwords, API keys, database credentials, private keys, or confidential internal data.</strong>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 backdrop-blur-sm shadow-sm">
            <strong>Offline Safe Mode:</strong> Fixture mode evaluates sample data completely offline on this server. No data is sent to an external AI provider.
          </div>
        )}

        <textarea
          rows={3}
          value={advisoryText}
          onChange={(e) => setAdvisoryText(e.target.value)}
          placeholder={
            processingMode === 'llm'
              ? "Paste public security bulletin text for Groq AI analysis (e.g. PHP Security Release notice)..."
              : "e.g. PHP Security Release: Updates addressing CVE-2026-109618 released for PHP 8.2 and 8.3..."
          }
          maxLength={12000}
          className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40 transition shadow-inner"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center space-x-4 text-xs text-slate-400">
            <label className="flex items-center space-x-1.5 cursor-pointer hover:text-slate-200 transition">
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
            <label className="flex items-center space-x-1.5 cursor-pointer hover:text-slate-200 transition">
              <input
                type="radio"
                name="mode"
                value="llm"
                checked={processingMode === 'llm'}
                onChange={() => setProcessingMode('llm')}
                className="text-sky-500 focus:ring-0"
              />
              <span>Live AI Analysis (Groq)</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !advisoryText.trim()}
            className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-600 text-xs font-bold text-white transition-all duration-150 shadow-md shadow-sky-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            {loading ? (
              <span className="flex items-center space-x-1.5">
                <span className="animate-spin inline-block">🔄</span>
                <span>Analyzing...</span>
              </span>
            ) : (
              'Analyze Advisory'
            )}
          </button>
        </div>
      </form>

      {/* Structured Advisory Output Card */}
      {advisoryData ? (
        <div className="rounded-xl border border-slate-800/90 bg-slate-950/70 p-5 shadow-xl backdrop-blur-md animate-zone-in space-y-4">
          {/* Mode Distinction Disclaimers */}
          {advisoryData.is_simulated ? (
            <div className="px-3.5 py-2.5 rounded-lg bg-sky-500/10 border border-sky-500/25 text-[11px] text-sky-300 flex flex-wrap items-center justify-between gap-1 shadow-sm">
              <span>ℹ️ <strong>Deterministic Demo Fixture:</strong> Displaying pre-canned simulation output. Input text was not processed by live AI.</span>
              <span className="font-mono text-[10px] uppercase font-bold text-sky-400 bg-sky-950/80 px-2 py-0.5 rounded border border-sky-800">
                Fixture Active
              </span>
            </div>
          ) : (
            <div className="px-3.5 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-[11px] text-emerald-300 flex flex-wrap items-center justify-between gap-1 shadow-sm">
              <span>🤖 <strong>AI-Generated Analysis (Groq):</strong> Grounded in submitted text. Not official vendor verification.</span>
              <span className="font-mono text-[10px] uppercase font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                Groq AI Live
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs px-2.5 py-0.5 rounded font-mono font-bold border ${severityBadgeClass}`}>
                SEVERITY: {severity}
              </span>
              <span className="text-xs px-2 py-0.5 rounded font-mono text-slate-300 bg-slate-800 border border-slate-700">
                MODE: {advisoryData.processing_mode || 'fixture'}
              </span>
              {advisoryData.advisory?.external_id && (
                <span className="text-xs px-2.5 py-0.5 rounded font-mono text-sky-300 bg-sky-950 border border-sky-800" dir="ltr">
                  {advisoryData.advisory.external_id}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-3">
              {activeLocalization && (
                <SpeechControl
                  textToSpeak={`${activeLocalization.title}. ${activeLocalization.summary} ${activeLocalization.recommended_action}`}
                  languageCode={selectedLanguage}
                  languageLabel={currentLangMeta.label}
                />
              )}
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                Source: {advisoryData.advisory?.source_kind || 'demo'} ({advisoryData.advisory?.generated_by || 'fixture'})
              </span>
            </div>
          </div>

          {/* Localized Body */}
          {activeLocalization ? (
            <div
              dir={currentLangMeta.dir}
              className={`space-y-3 pt-1 ${currentLangMeta.dir === 'rtl' ? 'text-right' : 'text-left'}`}
            >
              <h3 className="text-lg font-bold text-white tracking-tight">
                {renderLocalizedContent(activeLocalization.title)}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                {renderLocalizedContent(activeLocalization.summary)}
              </p>
              <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-sky-950/30 to-slate-900/40 border border-sky-500/30 shadow-sm">
                <span className="block text-[11px] font-semibold text-sky-400 uppercase tracking-wider mb-1">
                  Recommended Action:
                </span>
                <p className="text-xs text-slate-200 leading-relaxed">
                  {renderLocalizedContent(activeLocalization.recommended_action)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 py-4 text-center">
              No translation available for selected language.
            </p>
          )}

          {/* Technical Note & Timestamp */}
          <div className="pt-3 border-t border-slate-900 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
            <span dir="ltr">
              Generated: {advisoryData.advisory?.created_at || 'Just now'}
            </span>
            <span className="text-amber-500/80">
              ⚠️ Advisory guidance: Follow official vendor remediation; avoid relying solely on temporary filtering.
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500 bg-slate-950/30">
          Enter an advisory text above or select a sample notice to view localized explanations.
        </div>
      )}
    </div>
  )
}
