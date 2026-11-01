/**
 * LanguageSelector Component
 * Supports English, Urdu (اردو), Roman Urdu, Arabic (العربية), and Spanish (Español).
 * Conforms to docs/DESIGN.md.
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
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        Language:
      </span>
      <div className="flex flex-wrap gap-1.5 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isSelected = selectedLanguage === lang.code
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => onSelectLanguage(lang.code)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                isSelected
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
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

