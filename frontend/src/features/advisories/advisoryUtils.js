/**
 * Shared Advisory Utilities (Team B - Member 4)
 * Contains URL cleanup, speech sanitization, and voice matching routines.
 * Shared between AdvisoryPanel.jsx and SpeechControl.jsx to prevent circular dependencies.
 */

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
 * Sanitizes and formats advisory text for natural, clear speech synthesis without
 * modifying original advisory text or corrupting technical identifiers.
 * - Strips markdown backticks (e.g. `disable_functions` -> "disable functions")
 * - Converts underscores in technical configuration directives to spaces for natural speech
 * - Cleans URLs for smooth auditory reading while preserving trailing sentence punctuation pauses
 * - Strips markdown bold, italic, headers and list bullets
 * - Normalizes spacing
 */
export function prepareTextForSpeech(text) {
  if (!text || typeof text !== 'string') return ''

  let s = text

  // 1. Convert backticked code spans into clean spoken tokens
  s = s.replace(/`([^`]+)`/g, (_, code) => {
    return code.replace(/_/g, ' ')
  })

  // 2. Clean URLs for auditory reading, preserving sentence punctuation pauses
  s = s.replace(/https?:\/\/[^\s]+/gi, (match) => {
    const { url, trailing } = cleanUrlAndTrailingPunct(match)
    const cleanHostPath = url.replace(/^https?:\/\//i, '').replace(/[._/]/g, ' ')
    return `link ${cleanHostPath}${trailing ? trailing + ' ' : ' '}`
  })

  // 3. For any remaining unquoted snake_case configuration directives, replace underscores with spaces
  s = s.replace(/\b([a-z0-9]+)_([a-z0-9]+(?:_[a-z0-9]+)*)\b/gi, (match) => {
    return match.replace(/_/g, ' ')
  })

  // 4. Strip markdown formatting: bold/italic (*, _), headings (#), list bullets (- *)
  s = s.replace(/[*#]/g, ' ')
  s = s.replace(/^\s*[-•]\s+/gm, '. ')

  // 5. Normalize whitespace and ensure periods have space
  s = s.replace(/\s+/g, ' ').trim()

  return s
}

/**
 * Locates the optimal SpeechSynthesisVoice for a given language code:
 * - English ('en'): matches 'en-*'
 * - Urdu ('ur'): matches 'ur-*' (e.g. 'ur-PK', 'ur-IN')
 * - Arabic ('ar'): matches 'ar-*' (e.g. 'ar-SA', 'ar-EG')
 * - Spanish ('es'): matches 'es-*' (e.g. 'es-ES', 'es-MX')
 * - Roman Urdu ('ur-Latn'): fallback to 'en-*' with explicit disclaimer
 *
 * Prefers local system voices (voice.localService === true) over network voices.
 * Returns { voice, isLocal, isFallback, totalMatches }
 */
export function findMatchingVoice(voices, languageCode) {
  if (!voices || voices.length === 0) {
    return { voice: null, isLocal: false, isFallback: false, totalMatches: 0 }
  }

  const isRomanUrdu = languageCode === 'ur-Latn'
  const targetPrefix = isRomanUrdu ? 'en' : languageCode.toLowerCase()

  const matchingVoices = voices.filter((v) => {
    const vLang = (v.lang || '').toLowerCase().replace('_', '-')
    return vLang.startsWith(targetPrefix) || vLang.startsWith(targetPrefix.split('-')[0])
  })

  if (matchingVoices.length === 0) {
    return { voice: null, isLocal: false, isFallback: isRomanUrdu, totalMatches: 0 }
  }

  // Prioritize on-device local voices (voice.localService === true)
  const localVoice = matchingVoices.find((v) => v.localService === true)
  const defaultVoice = matchingVoices.find((v) => v.default === true)
  const chosenVoice = localVoice || defaultVoice || matchingVoices[0]

  return {
    voice: chosenVoice,
    isLocal: chosenVoice.localService === true,
    isFallback: isRomanUrdu,
    totalMatches: matchingVoices.length,
  }
}

