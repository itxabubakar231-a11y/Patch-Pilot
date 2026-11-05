import { useState, useEffect, useCallback, useRef } from 'react'
import { SUPPORTED_LANGUAGES } from './LanguageSelector.jsx'
import { prepareTextForSpeech, findMatchingVoice } from './advisoryUtils.js'

export { prepareTextForSpeech, findMatchingVoice }

/**
 * Compares two SpeechSynthesisVoice objects by their functional identity.
 */
function isSameVoice(v1, v2) {
  if (!v1 && !v2) return true
  if (!v1 || !v2) return false
  return (
    v1.name === v2.name &&
    v1.lang === v2.lang &&
    Boolean(v1.localService) === Boolean(v2.localService)
  )
}

/**
 * SpeechControl Component (Zone 4)
 * Provides user-initiated text-to-speech using the browser Web Speech API.
 * 
 * Security & Correctness Guarantees:
 * - Fresh explicit user consent is mandatory for every remote/network voice playback.
 * - Never calls speechSynthesis.speak() for a remote voice before the user clicks "Allow & Play".
 * - Cancel dismisses dialog and never initiates speech.
 * - Cancels speech and dismisses pending consent on language switch, text change, Stop, voice change, and unmount.
 * - Detects voiceschanged events and only cancels if the selected voice has actually changed.
 * - Restores keyboard focus to Play/Stop button upon dialog dismissal or authorization.
 * - Explicitly binds matched SpeechSynthesisVoice object to utterance.voice.
 * - Roman Urdu uses English voice strictly as a clearly labeled phonetic approximation fallback.
 * - Holds active utterance in useRef to prevent Chromium garbage collection speech-freeze bug.
 * - Monotonic utterance ID counter prevents stale async onend/onerror callbacks from corrupting newer state.
 * - Full WCAG keyboard and screen reader accessibility (aria-label, aria-pressed, role="alertdialog", role="status").
 */
export default function SpeechControl({ textToSpeak, languageCode, languageLabel }) {
  const isSpeechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  // Initial voice evaluation
  const getInitialMatch = () => {
    if (!isSpeechSupported) {
      return { available: false, voice: null, isLocal: false, isFallback: false, loading: false }
    }
    const voices = window.speechSynthesis.getVoices()
    if (!voices || voices.length === 0) {
      // Voices not loaded yet (Chromium initializes voices asynchronously)
      return { available: false, voice: null, isLocal: false, isFallback: languageCode === 'ur-Latn', loading: true }
    }
    const match = findMatchingVoice(voices, languageCode)
    return {
      available: Boolean(match.voice),
      voice: match.voice,
      isLocal: match.isLocal,
      isFallback: match.isFallback,
      loading: false,
    }
  }

  const [matchState, setMatchState] = useState(getInitialMatch)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [showRemoteConsent, setShowRemoteConsent] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [statusMessage, setStatusMessage] = useState('')

  const activeUtteranceRef = useRef(null)
  const utteranceIdRef = useRef(0)
  const selectedVoiceRef = useRef(matchState.voice)
  const playButtonRef = useRef(null)
  const allowButtonRef = useRef(null)

  // Language metadata lookup
  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === languageCode)
  const effectiveLabel = languageLabel || currentLang?.label || languageCode

  /**
   * Immediately stops active speech playback and invalidates in-flight utterance callbacks.
   */
  const stopSpeech = useCallback(() => {
    utteranceIdRef.current++
    if (isSpeechSupported) {
      try {
        window.speechSynthesis.cancel()
      } catch (err) {
        // Silently ignore browser cancel exceptions
      }
    }
    activeUtteranceRef.current = null
    setIsSpeaking(false)
  }, [isSpeechSupported])

  /**
   * Handles browser voiceschanged events.
   * Only cancels speech and dismisses pending consent if the selected voice has ACTUALLY changed.
   * If the voice list is merely refreshed with the same voice, speech continues without interruption.
   */
  const handleVoicesChanged = useCallback(() => {
    if (!isSpeechSupported) return

    const voices = window.speechSynthesis.getVoices()
    if (!voices || voices.length === 0) {
      if (selectedVoiceRef.current !== null) {
        // Voice was previously available but is now lost
        stopSpeech()
        setShowRemoteConsent(false)
        selectedVoiceRef.current = null
        setMatchState({
          available: false,
          voice: null,
          isLocal: false,
          isFallback: languageCode === 'ur-Latn',
          loading: true,
        })
      }
      return
    }

    const newMatch = findMatchingVoice(voices, languageCode)
    const previousVoice = selectedVoiceRef.current
    const voiceChanged = !isSameVoice(previousVoice, newMatch.voice)

    if (voiceChanged) {
      // Selected voice actually changed: cancel speech, invalidate callbacks, dismiss consent
      stopSpeech()
      setShowRemoteConsent(false)
      setErrorMessage(null)
      selectedVoiceRef.current = newMatch.voice
      setMatchState({
        available: Boolean(newMatch.voice),
        voice: newMatch.voice,
        isLocal: newMatch.isLocal,
        isFallback: newMatch.isFallback,
        loading: false,
      })
    } else {
      // Voice identity unchanged: do not cancel active speech or dismiss pending consent
      selectedVoiceRef.current = newMatch.voice
      setMatchState((prev) => {
        if (
          prev.available === Boolean(newMatch.voice) &&
          prev.isLocal === newMatch.isLocal &&
          prev.isFallback === newMatch.isFallback &&
          !prev.loading &&
          prev.voice === newMatch.voice
        ) {
          return prev
        }
        return {
          available: Boolean(newMatch.voice),
          voice: newMatch.voice,
          isLocal: newMatch.isLocal,
          isFallback: newMatch.isFallback,
          loading: false,
        }
      })
    }
  }, [isSpeechSupported, languageCode, stopSpeech])

  // Attach voiceschanged event listener to browser speech synthesis
  useEffect(() => {
    if (!isSpeechSupported) return

    const synth = window.speechSynthesis
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', handleVoicesChanged)
    } else {
      synth.onvoiceschanged = handleVoicesChanged
    }

    return () => {
      if (typeof synth.removeEventListener === 'function') {
        synth.removeEventListener('voiceschanged', handleVoicesChanged)
      } else if (synth.onvoiceschanged === handleVoicesChanged) {
        synth.onvoiceschanged = null
      }
    }
  }, [isSpeechSupported, handleVoicesChanged])

  // Lifecycle: cancel speech, dismiss pending consent, and re-evaluate voice when languageCode or textToSpeak changes
  useEffect(() => {
    stopSpeech()
    setErrorMessage(null)
    setShowRemoteConsent(false)

    if (!isSpeechSupported) {
      selectedVoiceRef.current = null
      setMatchState({ available: false, voice: null, isLocal: false, isFallback: false, loading: false })
      return
    }

    const voices = window.speechSynthesis.getVoices()
    if (!voices || voices.length === 0) {
      selectedVoiceRef.current = null
      setMatchState({ available: false, voice: null, isLocal: false, isFallback: languageCode === 'ur-Latn', loading: true })
    } else {
      const match = findMatchingVoice(voices, languageCode)
      selectedVoiceRef.current = match.voice
      setMatchState({
        available: Boolean(match.voice),
        voice: match.voice,
        isLocal: match.isLocal,
        isFallback: match.isFallback,
        loading: false,
      })
    }

    return () => {
      stopSpeech()
      setShowRemoteConsent(false)
    }
  }, [languageCode, textToSpeak, isSpeechSupported, stopSpeech])

  // Move keyboard focus to Allow button when remote consent dialog appears
  useEffect(() => {
    if (showRemoteConsent && allowButtonRef.current) {
      allowButtonRef.current.focus()
    }
  }, [showRemoteConsent])

  /**
   * Internal routine to execute speech playback once voice is confirmed and consented.
   */
  const executePlayback = (voiceToUse) => {
    if (!isSpeechSupported || !textToSpeak || !voiceToUse) return

    stopSpeech()
    setErrorMessage(null)

    const thisUtteranceId = ++utteranceIdRef.current
    const spokenText = prepareTextForSpeech(textToSpeak)

    try {
      const utterance = new SpeechSynthesisUtterance(spokenText)

      // Explicitly assign matched voice object and language code
      utterance.voice = voiceToUse
      utterance.lang = voiceToUse.lang || 'en-US'

      // For Roman Urdu phonetic approximation, adjust rate slightly for clarity
      if (languageCode === 'ur-Latn') {
        utterance.rate = 0.9
      } else {
        utterance.rate = 1.0
      }

      // Store in ref to protect from Chromium garbage collection bug
      activeUtteranceRef.current = utterance

      utterance.onstart = () => {
        if (utteranceIdRef.current === thisUtteranceId) {
          setIsSpeaking(true)
          setStatusMessage(
            matchState.isFallback
              ? 'Reading advisory aloud using English voice fallback (phonetic approximation).'
              : `Reading advisory aloud in ${effectiveLabel}.`
          )
        }
      }

      utterance.onend = () => {
        if (utteranceIdRef.current === thisUtteranceId) {
          activeUtteranceRef.current = null
          setIsSpeaking(false)
          setStatusMessage('Speech playback completed.')
        }
      }

      utterance.onerror = (event) => {
        if (utteranceIdRef.current === thisUtteranceId) {
          activeUtteranceRef.current = null
          setIsSpeaking(false)
          if (event.error && event.error !== 'canceled' && event.error !== 'interrupted') {
            const errText = `Speech synthesis failed: ${event.error}`
            setErrorMessage(errText)
            setStatusMessage(errText)
          } else {
            setStatusMessage('Speech playback stopped.')
          }
        }
      }

      window.speechSynthesis.speak(utterance)
      setIsSpeaking(true)
    } catch (err) {
      activeUtteranceRef.current = null
      setIsSpeaking(false)
      const errText = 'Failed to initiate speech playback.'
      setErrorMessage(errText)
      setStatusMessage(errText)
    }
  }

  /**
   * Handles user click on Play/Stop button.
   */
  const handleToggleSpeak = () => {
    if (!isSpeechSupported || !textToSpeak) return

    if (isSpeaking) {
      stopSpeech()
      setStatusMessage('Speech playback stopped.')
      return
    }

    if (!matchState.voice) {
      setErrorMessage(`No matching voice found for ${effectiveLabel}.`)
      return
    }

    // PRIVACY GATE (Requirement 5 & Fix 1):
    // For remote voices, never call speak() without fresh explicit user consent for this playback.
    if (!matchState.isLocal) {
      setShowRemoteConsent(true)
      setStatusMessage(`Confirmation required to use remote voice for ${effectiveLabel}.`)
      return
    }

    // Local voice can be played immediately
    executePlayback(matchState.voice)
  }

  /**
   * User explicitly allowed remote voice playback for this playback.
   */
  const handleAllowRemote = () => {
    setShowRemoteConsent(false)
    // Restore keyboard focus to the Play/Stop button (FIX 3)
    if (playButtonRef.current) {
      playButtonRef.current.focus()
    }
    if (matchState.voice) {
      executePlayback(matchState.voice)
    }
  }

  /**
   * User explicitly cancelled remote voice playback.
   */
  const handleCancelRemote = () => {
    setShowRemoteConsent(false)
    setStatusMessage('Remote speech playback cancelled by user.')
    // Restore keyboard focus to the Play/Stop button (FIX 3)
    if (playButtonRef.current) {
      playButtonRef.current.focus()
    }
  }

  // Keyboard navigation for consent dialog (Escape to cancel)
  const handleConsentKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelRemote()
    }
  }

  // 1. Browser unsupported fallback
  if (!isSpeechSupported) {
    return (
      <span className="text-[11px] text-slate-500 italic" role="status">
        Speech synthesis not supported in this browser
      </span>
    )
  }

  // 2. Voices loading status (Chromium asynchronous voice loading)
  if (matchState.loading) {
    return (
      <span className="text-[11px] text-slate-400 italic" role="status">
        Loading speech voices...
      </span>
    )
  }

  // 3. Voice unavailable fallback for requested language
  if (!matchState.available || !matchState.voice) {
    return (
      <span className="text-[11px] text-amber-500/80 italic" role="status">
        Voice unavailable for {effectiveLabel}
      </span>
    )
  }

  // Accessible ARIA labels
  const ariaLabel = isSpeaking
    ? `Stop reading advisory in ${effectiveLabel}`
    : matchState.isFallback
    ? `Read advisory aloud using English voice fallback (phonetic approximation for Roman Urdu)`
    : `Read advisory aloud in ${effectiveLabel}`

  return (
    <div className="flex flex-col space-y-1.5">
      <div className="flex items-center space-x-2">
        <button
          ref={playButtonRef}
          type="button"
          onClick={handleToggleSpeak}
          aria-label={ariaLabel}
          aria-pressed={isSpeaking}
          className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-950 ${
            isSpeaking
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
          }`}
        >
          <span>
            {isSpeaking
              ? '⏹ Stop'
              : matchState.isFallback
              ? '🔊 Listen (English fallback)'
              : '🔊 Listen'}
          </span>
        </button>

        {/* Roman Urdu phonetic disclaimer badge */}
        {matchState.isFallback && !isSpeaking && (
          <span className="text-[10px] text-sky-400/80 bg-sky-950/40 border border-sky-800/40 px-1.5 py-0.5 rounded">
            Phonetic approximation
          </span>
        )}

        {/* Voice Origin Label */}
        {matchState.isLocal ? (
          <span className="text-[10px] text-emerald-400/80 bg-emerald-950/40 border border-emerald-800/40 px-1.5 py-0.5 rounded">
            System Voice
          </span>
        ) : (
          <span className="text-[10px] text-amber-400/80 bg-amber-950/40 border border-amber-800/40 px-1.5 py-0.5 rounded">
            Remote Voice
          </span>
        )}
      </div>

      {/* Fresh Remote Voice Consent Alert Dialog (Requirements 5, 10 & Fix 1) */}
      {showRemoteConsent && matchState.voice && (
        <div
          role="alertdialog"
          aria-labelledby="remote-voice-title"
          aria-describedby="remote-voice-desc"
          onKeyDown={handleConsentKeyDown}
          className="p-3 rounded bg-amber-500/10 border border-amber-500/40 text-xs text-amber-200 mt-1 max-w-sm space-y-2.5 shadow-lg"
        >
          <div id="remote-voice-title" className="font-semibold text-amber-300 flex items-center space-x-1.5">
            <span>⚠️</span>
            <span>External Speech Service Notice</span>
          </div>
          <p id="remote-voice-desc" className="text-[11px] leading-relaxed text-amber-200/90">
            Only a remote network voice (<code className="text-amber-300 font-mono text-[10px]">{matchState.voice.name}</code>) is available for{' '}
            <strong>{effectiveLabel}</strong>. Spoken advisory text will be transmitted to your browser&apos;s external speech service.
          </p>
          <div className="flex items-center space-x-2 pt-0.5">
            <button
              ref={allowButtonRef}
              type="button"
              onClick={handleAllowRemote}
              className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-1 focus:ring-offset-slate-900"
            >
              Allow &amp; Play
            </button>
            <button
              type="button"
              onClick={handleCancelRemote}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Synthesis Error Display */}
      {errorMessage && (
        <span
          className="text-[11px] text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800/60 inline-block"
          role="alert"
        >
          {errorMessage}
        </span>
      )}

      {/* Live region for screen readers */}
      <div className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </div>
    </div>
  )
}
