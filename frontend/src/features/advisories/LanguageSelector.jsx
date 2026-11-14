/**
 * LanguageSelector Component (Zone 4)
 * Supports English, Urdu (اردو), Roman Urdu, Arabic (العربية), and Spanish (Español).
 * Styled to exact visual parity with the approved Stage 1 & Stage 2 Emerald Design System.
 */

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ur', label: 'اردو', dir: 'rtl' },
  { code: 'ur-Latn', label: 'Roman Urdu', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'es', label: 'Español', dir: 'ltr' },
]

export default function LanguageSelector({ selectedLanguage, onSelectLanguage }) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">
        Language:
      </span>
      <div className="flex flex-wrap gap-1 bg-[#070D0B] p-1 rounded-lg border border-emerald-500/20">
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isSelected = selectedLanguage === lang.code
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => onSelectLanguage(lang.code)}
              aria-pressed={isSelected}
              className={`px-3 py-1 rounded text-xs font-medium transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400 ${
                isSelected
                  ? 'bg-[#10B981] text-black font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-emerald-950/30'
              }`}
            >
              {lang.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
