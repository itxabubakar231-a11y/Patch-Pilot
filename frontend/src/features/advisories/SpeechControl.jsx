import { useState, useEffect } from 'react'

/**
 * SpeechControl Component
 * Provides user-initiated text-to-speech using browser window.speechSynthesis.
 * Fallbacks gracefully if voice is unsupported or unavailable.
 * Conforms to docs/DESIGN.md (Sections 4 & 6).
 */
export default function SpeechControl({ textToSpeak, languageCode }) {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voiceAvailable, setVoiceAvailable] = useState(true)

  useEffect(() => {
    // Check speech synthesis support in the browser
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setVoiceAvailable(false)
      return
    }

    const checkVoices = () => {
      const voices = window.speechSynthesis.getVoices()
      // Map language codes to BCP 47 locales
      const localePrefix = languageCode === 'ur-Latn' ? 'ur' : languageCode
      const hasVoice = voices.some((v) => v.lang.startsWith(localePrefix))
      setVoiceAvailable(hasVoice || languageCode === 'en')
    }

    checkVoices()
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = checkVoices
    }

    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [languageCode])

  const handleToggleSpeak = () => {
    if (!('speechSynthesis' in window) || !textToSpeak) return

    if (isSpeaking) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
      return
    }

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(textToSpeak)
    const localeMap = {
      en: 'en-US',
      ur: 'ur-PK',
      'ur-Latn': 'en-US', // fallback voice for Roman Urdu
      ar: 'ar-SA',
      es: 'es-ES',
    }
    utterance.lang = localeMap[languageCode] || 'en-US'

    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)

    window.speechSynthesis.speak(utterance)
    setIsSpeaking(true)
  }

  if (!voiceAvailable) {
    return (
      <span className="text-[11px] text-slate-500 italic">
        Voice unavailable for this language
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={handleToggleSpeak}
      className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-semibold transition ${
        isSpeaking
          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
          : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
      }`}
    >
      <span>{isSpeaking ? '⏹ Stop' : '🔊 Listen'}</span>
    </button>
  )
}

