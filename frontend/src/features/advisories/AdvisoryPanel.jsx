import { useState } from 'react'
import LanguageSelector, { SUPPORTED_LANGUAGES } from './LanguageSelector.jsx'
import SpeechControl from './SpeechControl.jsx'

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
 * Strips trailing sentence punctuation from URLs while preserving valid URL characters
 * and balanced parentheses or brackets (such as in Wikipedia URLs).
 * Supports standard punctuation as well as Perso-Arabic punctuation (۔،؛؟).
 */
export function cleanUrlAndTrailingPunct(rawUrl) {
  let url = rawUrl
  let trailing = ''

  const punctuationList = [
    '.', ',', ';', ':', '!', '?',
    '\u06D4', // Urdu full stop (۔)
    '\u060C', // Arabic comma (،)
    '\u061B', // Arabic semicolon (؛)
    '\u061F', // Arabic question mark (؟)
    '"', "'", '”', '’', '»'
  ]

  while (url.length > 0) {
    const lastChar = url[url.length - 1]
    if (punctuationList.includes(lastChar)) {
      trailing = lastChar + trailing
      url = url.slice(0, -1)
    } else if (lastChar === ')') {
      const openCount = (url.match(/\(/g) || []).length
      const closeCount = (url.match(/\)/g) || []).length
      if (closeCount > openCount) {
        trailing = lastChar + trailing
        url = url.slice(0, -1)
      } else {
        break
      }
    } else if (lastChar === ']') {
      const openCount = (url.match(/\[/g) || []).length
      const closeCount = (url.match(/\]/g) || []).length
      if (closeCount > openCount) {
        trailing = lastChar + trailing
        url = url.slice(0, -1)
      } else {
        break
      }
    } else {
      break
    }
  }
  return { url, trailing }
}

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
          className="font-mono font-semibold text-sky-400 bg-sky-950/60 px-1 py-0.5 rounded border border-sky-800/60 inline-block align-baseline"
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
            className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-800 text-sky-300"
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
          className="font-mono text-xs text-sky-400 underline inline-block align-baseline"
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
          className="font-mono font-semibold text-emerald-400 bg-emerald-950/40 px-1 py-0.5 rounded border border-emerald-800/40 inline-block align-baseline"
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
            className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-800/90 text-amber-300"
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
            className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-800/90 text-sky-300"
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

  // Active localization for currently selected language (no fallback to default language)
  const activeLocalization = advisoryData?.localizations?.find(
    (loc) => loc.language_code === selectedLanguage
  ) || null

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
              {advisoryData?.processing_mode === 'llm' ? 'AI ANALYZED' : 'SIMULATED DEMO'}
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
        <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
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
          <div className="mb-2 p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200">
            <strong>External AI Disclosure:</strong> Live AI analysis transmits submitted text to Groq Cloud API for summarization. <strong>Do not submit passwords, API keys, database credentials, private keys, or confidential internal data.</strong>
          </div>
        ) : (
          <div className="mb-2 p-2.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
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
            <label className="flex items-center space-x-1.5 cursor-pointer">
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
            className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-600 text-xs font-bold text-white transition shadow-sm"
          >
            {loading ? 'Analyzing...' : 'Analyze Advisory'}
          </button>
        </div>
      </form>

      {/* Structured Advisory Output Card */}
      {advisoryData ? (
        <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-5">
          {/* Mode Distinction Disclaimers */}
          {advisoryData.is_simulated ? (
            <div className="mb-4 px-3 py-2 rounded bg-sky-500/10 border border-sky-500/20 text-[11px] text-sky-300 flex flex-wrap items-center justify-between gap-1">
              <span>ℹ️ <strong>Deterministic Demo Fixture:</strong> Displaying pre-canned simulation output. Input text was not processed by live AI.</span>
              <span className="font-mono text-[10px] uppercase font-bold text-sky-400 bg-sky-950/80 px-2 py-0.5 rounded border border-sky-800">
                Fixture Active
              </span>
            </div>
          ) : (
            <div className="mb-4 px-3 py-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300 flex flex-wrap items-center justify-between gap-1">
              <span>🤖 <strong>AI-Generated Analysis (Groq):</strong> Grounded in submitted text. Not official vendor verification.</span>
              <span className="font-mono text-[10px] uppercase font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                Groq AI Live
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
              {advisoryData.advisory?.external_id && (
                <span className="text-xs px-2 py-0.5 rounded font-mono text-sky-300 bg-sky-950 border border-sky-800" dir="ltr">
                  {advisoryData.advisory.external_id}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-3">
              {activeLocalization && (
                <SpeechControl
                  textToSpeak={`${activeLocalization.title}. ${activeLocalization.summary} ${activeLocalization.recommended_action}`}
                  languageCode={selectedLanguage}
                />
              )}
              <span className="text-[11px] text-slate-500">
                Source: {advisoryData.advisory?.source_kind || 'demo'} ({advisoryData.advisory?.generated_by || 'fixture'})
              </span>
            </div>
          </div>

          {/* Localized Body */}
          {activeLocalization ? (
            <div
              dir={currentLangMeta.dir}
              className={`space-y-3 ${currentLangMeta.dir === 'rtl' ? 'text-right' : 'text-left'}`}
            >
              <h3 className="text-lg font-bold text-white">
                {renderLocalizedContent(activeLocalization.title)}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                {renderLocalizedContent(activeLocalization.summary)}
              </p>
              <div className="mt-4 p-3 rounded-lg bg-sky-500/5 border border-sky-500/20">
                <span className="block text-[11px] font-semibold text-sky-400 uppercase tracking-wider mb-1">
                  Recommended Action:
                </span>
                <p className="text-xs text-slate-200">
                  {renderLocalizedContent(activeLocalization.recommended_action)}
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
              ⚠️ Advisory guidance: Follow official vendor remediation; avoid relying solely on temporary filtering.
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
