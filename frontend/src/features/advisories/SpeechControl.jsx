import { useState, useEffect, useCallback } from 'react'

/**
 * SpeechControl Component
 * Provides user-initiated text-to-speech using browser window.speechSynthesis.
 * Fallbacks gracefully if voice is unsupported or unavailable.
 * Conforms to docs/DESIGN.md (Sections 4 & 6).
 */
export default function SpeechControl({ textToSpeak, languageCode }) {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voiceAvailable, setVoiceAvailable] = useState(true)

  const checkVoices = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setVoiceAvailable(false)
      return
    }

    const voices = window.speechSynthesis.getVoices()
    if (!voices || voices.length === 0) {
      // Voices not loaded yet; keep voiceAvailable true tentatively until voiceschanged fires
      setVoiceAvailable(true)
      return
    }

    // Map language codes to BCP 47 prefixes
    const localePrefix = languageCode === 'ur-Latn' ? 'en' : languageCode
    const hasVoice = voices.some((v) => {
      const vLang = (v.lang || '').toLowerCase()
      return vLang.startsWith(localePrefix.toLowerCase())
    })

    setVoiceAvailable(hasVoice)
  }, [languageCode])

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setVoiceAvailable(false)
      return
    }

    const synth = window.speechSynthesis

    // Cancel speech and reset state whenever language or text changes
    synth.cancel()
    setIsSpeaking(false)

    checkVoices()

    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', checkVoices)
    } else {
      synth.onvoiceschanged = checkVoices
    }

    return () => {
      synth.cancel()
      setIsSpeaking(false)
      if (typeof synth.removeEventListener === 'function') {
        synth.removeEventListener('voiceschanged', checkVoices)
      } else if (synth.onvoiceschanged === checkVoices) {
        synth.onvoiceschanged = null
      }
    }
  }, [languageCode, checkVoices])

  const handleToggleSpeak = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !textToSpeak) {
      return
    }

    const synth = window.speechSynthesis

    if (isSpeaking) {
      synth.cancel()
      setIsSpeaking(false)
      return
    }

    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(textToSpeak)
    const localeMap = {
      en: 'en-US',
      ur: 'ur-PK',
      'ur-Latn': 'en-US',
      ar: 'ar-SA',
      es: 'es-ES',
    }
    utterance.lang = localeMap[languageCode] || 'en-US'

    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)

    synth.speak(utterance)
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
