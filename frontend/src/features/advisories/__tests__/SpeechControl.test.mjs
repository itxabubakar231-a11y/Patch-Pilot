/**
 * Portable Interaction Tests for SpeechControl.jsx
 * Mounts the real SpeechControl React 18 component and tests:
 * 1. Remote Listen does not call speak() before Allow.
 * 2. Allow starts playback exactly once.
 * 3. Cancel prevents playback.
 * 4. Changing advisory text or language requires fresh remote consent.
 * 5. Stop and unmount cancel playback.
 * 6. Delayed callbacks cannot corrupt newer speech state.
 * 7. Local voice, missing voice, and Roman Urdu fallback behavior.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

// Resolve paths portably relative to this test file
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const componentPath = path.resolve(__dirname, '../SpeechControl.jsx')
const utilsPath = path.resolve(__dirname, '../advisoryUtils.js')

// =============================================================================
// 1. Portable DOM Mock for Real React 18 Mounting & Event Bubbling
// =============================================================================
class MockDOMNode {
  constructor(nodeType = 1, tagName = 'div') {
    this.nodeType = nodeType
    this.tagName = tagName.toUpperCase()
    this.children = []
    this.childNodes = this.children
    this.attributes = {}
    this.style = {}
    this.listeners = {}
    this.textContent = ''
    this.parentNode = null
  }

  addEventListener(event, handler) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(handler)
  }

  removeEventListener(event, handler) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((h) => h !== handler)
    }
  }

  dispatchEvent(event) {
    event.target = event.target || this
    let curr = this
    while (curr) {
      event.currentTarget = curr
      const list = curr.listeners[event.type] || []
      for (const h of list) {
        h(event)
      }
      if (event.cancelBubble) break
      curr = curr.parentNode
    }
  }

  appendChild(child) {
    this.children.push(child)
    child.parentNode = this
    return child
  }

  removeChild(child) {
    const idx = this.children.indexOf(child)
    if (idx !== -1) this.children.splice(idx, 1)
    child.parentNode = null
    return child
  }

  insertBefore(newChild, refChild) {
    const idx = this.children.indexOf(refChild)
    if (idx !== -1) this.children.splice(idx, 0, newChild)
    else this.children.push(newChild)
    newChild.parentNode = this
    return newChild
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value)
  }

  getAttribute(name) {
    return this.attributes[name] ?? null
  }

  hasAttribute(name) {
    return name in this.attributes
  }

  removeAttribute(name) {
    delete this.attributes[name]
  }

  focus() {
    mockDoc.activeElement = this
  }

  click() {
    this.dispatchEvent({ type: 'click', bubbles: true, cancelable: true })
  }
}

const mockDoc = new MockDOMNode(9, '#document')
mockDoc.createElement = (tag) => new MockDOMNode(1, tag)
mockDoc.createElementNS = (ns, tag) => new MockDOMNode(1, tag)
mockDoc.createTextNode = (text) => {
  const n = new MockDOMNode(3, '#text')
  n.textContent = text
  return n
}
mockDoc.createComment = (text) => new MockDOMNode(8, '#comment')
mockDoc.documentElement = new MockDOMNode(1, 'html')
mockDoc.body = new MockDOMNode(1, 'body')
mockDoc.activeElement = null

// Setup global browser environment required by React and Web Speech API
global.HTMLInputElement = class {}
global.HTMLTextAreaElement = class {}
global.HTMLIFrameElement = class {}
global.HTMLDocument = class {}
global.HTMLElement = MockDOMNode
global.Element = MockDOMNode
global.Node = MockDOMNode

global.window = {
  document: mockDoc,
  HTMLInputElement: global.HTMLInputElement,
  HTMLTextAreaElement: global.HTMLTextAreaElement,
  HTMLIFrameElement: global.HTMLIFrameElement,
  HTMLElement: MockDOMNode,
  addEventListener: () => {},
  removeEventListener: () => {},
}
global.document = mockDoc
global.IS_REACT_ACT_ENVIRONMENT = true

// =============================================================================
// 2. Web Speech API Mock
// =============================================================================
const mockVoices = [
  { name: 'Microsoft David', lang: 'en-US', localService: true, default: true },
  { name: 'Google US English', lang: 'en-US', localService: false, default: false },
  { name: 'Microsoft Helena', lang: 'es-ES', localService: true, default: false },
  { name: 'Microsoft Hoda', lang: 'ar-SA', localService: true, default: false },
  { name: 'Remote Urdu Voice', lang: 'ur-PK', localService: false, default: false },
]

let mockVoicesList = [...mockVoices]
let voicesChangedListeners = []
let speakCalls = []
let cancelCalls = 0

function setMockVoices(voices) {
  mockVoicesList = voices
}

async function dispatchVoicesChanged() {
  await act(async () => {
    for (const h of voicesChangedListeners) {
      h()
    }
    if (typeof global.window.speechSynthesis.onvoiceschanged === 'function') {
      global.window.speechSynthesis.onvoiceschanged()
    }
  })
}

global.SpeechSynthesisUtterance = class MockSpeechSynthesisUtterance {
  constructor(text) {
    this.text = text
    this.voice = null
    this.lang = null
    this.rate = 1.0
    this.onstart = null
    this.onend = null
    this.onerror = null
  }
}

global.window.speechSynthesis = {
  getVoices: () => mockVoicesList,
  speak: (utt) => {
    speakCalls.push(utt)
  },
  cancel: () => {
    cancelCalls++
  },
  addEventListener: (event, handler) => {
    if (event === 'voiceschanged') {
      voicesChangedListeners.push(handler)
    }
  },
  removeEventListener: (event, handler) => {
    if (event === 'voiceschanged') {
      voicesChangedListeners = voicesChangedListeners.filter((h) => h !== handler)
    }
  },
  onvoiceschanged: null,
}

// =============================================================================
// 3. Load React & Component Under Test
// =============================================================================
const { default: React, act } = await import('react')
const { createRoot } = await import('react-dom/client')

// Bundle SpeechControl.jsx on the fly resolving .jsx dependencies while keeping React external
const bundledResult = esbuild.buildSync({
  entryPoints: [componentPath],
  bundle: true,
  format: 'esm',
  banner: { js: "import React from 'react';" },
  external: ['react', 'react-dom', 'react-dom/client'],
  write: false,
})

// Write to temp file in __tests__ so it can be dynamically imported
const tempTestModulePath = path.resolve(__dirname, './.SpeechControl.bundled.mjs')
fs.writeFileSync(tempTestModulePath, bundledResult.outputFiles[0].text, 'utf-8')

let SpeechControl
let prepareTextForSpeech
let findMatchingVoice

try {
  const mod = await import(`file://${tempTestModulePath.replace(/\\/g, '/')}`)
  SpeechControl = mod.default
  prepareTextForSpeech = mod.prepareTextForSpeech
  findMatchingVoice = mod.findMatchingVoice
} finally {
  if (fs.existsSync(tempTestModulePath)) {
    fs.unlinkSync(tempTestModulePath)
  }
}

// Tree search helpers
function findNode(node, predicate) {
  if (predicate(node)) return node
  for (const child of node.children) {
    const found = findNode(child, predicate)
    if (found) return found
  }
  return null
}

function findNodes(node, predicate) {
  const results = []
  if (predicate(node)) results.push(node)
  for (const child of node.children) {
    results.push(...findNodes(child, predicate))
  }
  return results
}

function getAllText(node) {
  let text = node.textContent || ''
  for (const child of node.children) {
    text += ' ' + getAllText(child)
  }
  return text.trim()
}

// Component mount helper
async function mountComponent(props) {
  const container = mockDoc.createElement('div')
  container.ownerDocument = mockDoc
  const root = createRoot(container)

  await act(async () => {
    root.render(React.createElement(SpeechControl, props))
  })

  return {
    container,
    root,
    rerender: async (newProps) => {
      await act(async () => {
        root.render(React.createElement(SpeechControl, newProps))
      })
    },
    unmount: async () => {
      await act(async () => {
        root.unmount()
      })
    },
    findButtonByText: (str) =>
      findNode(container, (n) => n.tagName === 'BUTTON' && getAllText(n).includes(str)),
    findAlertDialog: () =>
      findNode(container, (n) => n.getAttribute('role') === 'alertdialog'),
    findStatusText: () =>
      findNodes(container, (n) => n.getAttribute('role') === 'status').map(getAllText).join(' '),
  }
}

console.log('================================================================')
console.log('   RUNNING REAL REACT INTERACTION TESTS FOR SPEECHCONTROL')
console.log('================================================================\n')

// =============================================================================
// TEST 0: Text Formatting & Security Identifier Integrity
// =============================================================================
console.log('[TEST 0] Audio Text Formatting & Security Identifier Preservation...')
const rawText0 = 'PHP 8.3 notice for CVE-2026-109618. Review `disable_functions` in `php.ini`. Check memory_limit. Visit https://php.net/releases.'
const spoken0 = prepareTextForSpeech(rawText0)
assert(!spoken0.includes('`'), 'Must strip backtick delimiters')
assert(spoken0.includes('disable functions'), 'Must convert disable_functions to spoken words with spaces')
assert(spoken0.includes('memory limit'), 'Must convert memory_limit to spoken words with spaces')
assert(spoken0.includes('php.ini'), 'Must preserve php.ini verbatim')
assert(spoken0.includes('CVE-2026-109618'), 'Must preserve CVE identifier verbatim')
assert(spoken0.includes('PHP 8.3'), 'Must preserve PHP version verbatim')
assert(spoken0.includes('link php net releases.'), 'Must format URL and preserve trailing sentence period')
console.log('   ✓ Security identifiers (CVE, PHP version, config files) preserved verbatim while smoothing spoken formatting.')

// =============================================================================
// TEST 1: Remote Listen does not call speak() before Allow
// =============================================================================
console.log('[TEST 1] Remote Listen does not call speak() before Allow...')
speakCalls = []
cancelCalls = 0

const harness1 = await mountComponent({
  textToSpeak: 'PHP 8.3 Security Notice in Urdu',
  languageCode: 'ur',
  languageLabel: 'اردو',
})

const listenBtn1 = harness1.findButtonByText('Listen')
assert(listenBtn1 !== null, 'Listen button must be present')

// Click Listen on remote voice
await act(async () => {
  listenBtn1.click()
})

// Verify speak() was NOT called before consent
assert.equal(speakCalls.length, 0, 'Must NOT call speechSynthesis.speak() before user consent')
const consentDialog = harness1.findAlertDialog()
assert(consentDialog !== null, 'Consent alertdialog must be displayed')
console.log('   ✓ Remote Listen opens consent dialog and never calls speak() before Allow.')

// =============================================================================
// TEST 2: Allow starts playback exactly once & restores focus to Play button
// =============================================================================
console.log('\n[TEST 2] Allow starts playback exactly once...')
const allowBtn = harness1.findButtonByText('Allow & Play')
assert(allowBtn !== null, 'Allow & Play button must be visible in dialog')

await act(async () => {
  allowBtn.click()
})

assert.equal(speakCalls.length, 1, 'Must call speechSynthesis.speak() exactly once after Allow')
assert.equal(speakCalls[0].voice.name, 'Remote Urdu Voice', 'Utterance must be bound to Remote Urdu Voice')
assert.equal(speakCalls[0].lang, 'ur-PK', 'Utterance lang must match remote voice lang')
assert(harness1.findAlertDialog() === null, 'Consent dialog must be dismissed after Allow')
const playStopBtn = harness1.findButtonByText('Stop') || harness1.findButtonByText('Listen')
assert(playStopBtn !== null, 'Play/Stop button must be present in DOM')
assert.equal(mockDoc.activeElement, playStopBtn, 'Focus must be restored to Play/Stop button after Allow & Play (FIX 3)')
console.log('   ✓ Allow starts playback exactly once, dismisses dialog, and restores keyboard focus to Play/Stop button.')

await harness1.unmount()

// =============================================================================
// TEST 3: Cancel prevents playback & restores focus to Play button
// =============================================================================
console.log('\n[TEST 3] Cancel prevents playback...')
speakCalls = []
cancelCalls = 0

const harness3 = await mountComponent({
  textToSpeak: 'Second test notice',
  languageCode: 'ur',
  languageLabel: 'اردو',
})

const listenBtn3 = harness3.findButtonByText('Listen')
await act(async () => {
  listenBtn3.click()
})

const cancelBtn = harness3.findButtonByText('Cancel')
assert(cancelBtn !== null, 'Cancel button must be visible')

await act(async () => {
  cancelBtn.click()
})

assert.equal(speakCalls.length, 0, 'Cancel must NEVER trigger speak()')
assert(harness3.findAlertDialog() === null, 'Consent dialog must be dismissed on Cancel')
assert.equal(mockDoc.activeElement, listenBtn3, 'Focus must be restored to Play button after Cancel (FIX 3)')
console.log('   ✓ Cancel closes dialog, completely prevents playback, and restores keyboard focus.')

await harness3.unmount()

// =============================================================================
// TEST 4: Voice, Language, and Text Change Invalidation & Consent Scenarios (FIX 1 & 2)
// =============================================================================
console.log('\n[TEST 4] Voice, Language, and Text Change Invalidation & Consent Scenarios...')

// 4A: Advisory text change cancels speech & requires fresh consent
console.log('   [4A] Changing advisory text while speech is playing...')
speakCalls = []
cancelCalls = 0

const harness4a = await mountComponent({
  textToSpeak: 'Initial notice',
  languageCode: 'ur',
  languageLabel: 'اردو',
})

// Trigger remote consent and allow
await act(async () => {
  harness4a.findButtonByText('Listen').click()
})
await act(async () => {
  harness4a.findButtonByText('Allow & Play').click()
})
assert.equal(speakCalls.length, 1, 'Initial speech started')

// Now change textToSpeak
const prevTextCancelCount = cancelCalls
await harness4a.rerender({
  textToSpeak: 'Different advisory notice text',
  languageCode: 'ur',
  languageLabel: 'اردو',
})

// Verify speech cancelled on text change
assert(cancelCalls > prevTextCancelCount, 'Speech must be cancelled when advisory text changes')

// Click Listen again on the new text
await act(async () => {
  harness4a.findButtonByText('Listen').click()
})

// Verify that consent is NOT sticky: dialog must appear again, speak() must NOT be called
assert.equal(speakCalls.length, 1, 'Must NOT automatically speak without fresh consent')
assert(harness4a.findAlertDialog() !== null, 'Fresh consent dialog must be shown for changed text')
await harness4a.unmount()
console.log('   ✓ Changing text cancels speech and strictly requires fresh consent.')

// 4B: Language change cancels active speech and requires fresh consent
console.log('   [4B] Changing languageCode while speech is playing...')
speakCalls = []
cancelCalls = 0

const harness4b = await mountComponent({
  textToSpeak: 'Advisory text',
  languageCode: 'en',
  languageLabel: 'English',
})

// Start playback in English (local voice)
await act(async () => {
  harness4b.findButtonByText('Listen').click()
})
assert.equal(speakCalls.length, 1, 'English speech started')
assert(harness4b.findButtonByText('Stop') !== null, 'Button in Stop state')

const preLangCancel = cancelCalls
// Change languageCode to Urdu (remote voice)
await harness4b.rerender({
  textToSpeak: 'Advisory text',
  languageCode: 'ur',
  languageLabel: 'اردو',
})

// Verify speech cancelled immediately upon language change
assert(cancelCalls > preLangCancel, 'Speech must be cancelled when languageCode changes')
assert(harness4b.findButtonByText('Listen') !== null, 'Button reverted to Listen')

// Click Listen on Urdu: must require fresh remote consent
await act(async () => {
  harness4b.findButtonByText('Listen').click()
})
assert.equal(speakCalls.length, 1, 'Must NOT automatically speak in new language without fresh consent')
assert(harness4b.findAlertDialog() !== null, 'Fresh consent dialog must appear for new language')

await harness4b.unmount()
console.log('   ✓ Changing languageCode cancels speech and requires fresh consent.')

// 4C: Fire mocked voiceschanged event with a different selected voice while speech is playing
console.log('   [4C] voiceschanged with different selected voice cancels speech...')
speakCalls = []
cancelCalls = 0
setMockVoices([...mockVoices])

const harness4c = await mountComponent({
  textToSpeak: 'English security notice',
  languageCode: 'en',
  languageLabel: 'English',
})

// Start playback with Microsoft David
await act(async () => {
  harness4c.findButtonByText('Listen').click()
})
assert.equal(speakCalls.length, 1, 'Speech started with Microsoft David')
assert(harness4c.findButtonByText('Stop') !== null, 'Button in Stop state')

const preVoiceChangeCancel = cancelCalls

// Change available voices so English now resolves to Microsoft Mark instead of David
setMockVoices([
  { name: 'Microsoft Mark', lang: 'en-US', localService: true, default: true },
  { name: 'Microsoft Helena', lang: 'es-ES', localService: true, default: false },
  { name: 'Microsoft Hoda', lang: 'ar-SA', localService: true, default: false },
  { name: 'Remote Urdu Voice', lang: 'ur-PK', localService: false, default: false },
])

// Fire voiceschanged event
await dispatchVoicesChanged()

// Verify that speech was cancelled because the selected voice changed
assert(cancelCalls > preVoiceChangeCancel, 'Speech must be cancelled when selected voice changes via voiceschanged')
assert(harness4c.findButtonByText('Listen') !== null, 'Button must revert to Listen')
console.log('   ✓ Different selected voice via voiceschanged immediately cancels active speech.')

// 4D: Merely refreshing the same voice list does not cancel active speech
console.log('   [4D] voiceschanged with same voice list does not cancel speech...')

// Start playback with Microsoft Mark
await act(async () => {
  harness4c.findButtonByText('Listen').click()
})
assert.equal(speakCalls.length, 2, 'Speech started with Microsoft Mark')
assert(harness4c.findButtonByText('Stop') !== null, 'Button in Stop state')

const cancelBeforeRefresh = cancelCalls
// Dispatch voiceschanged with the exact same voice list (same voice identity)
setMockVoices([
  { name: 'Microsoft Mark', lang: 'en-US', localService: true, default: true },
  { name: 'Microsoft Helena', lang: 'es-ES', localService: true, default: false },
  { name: 'Microsoft Hoda', lang: 'ar-SA', localService: true, default: false },
  { name: 'Remote Urdu Voice', lang: 'ur-PK', localService: false, default: false },
])
await dispatchVoicesChanged()

// Verify cancelCalls did NOT increase
assert.equal(cancelCalls, cancelBeforeRefresh, 'Merely refreshing same voice list must NOT cancel active speech')
assert(harness4c.findButtonByText('Stop') !== null, 'Speech must remain active')

await harness4c.unmount()
console.log('   ✓ Same voice refresh does not unnecessarily interrupt active speech.')

// 4E: Change voices while remote consent is pending
console.log('   [4E] Change voices while remote consent is pending...')
speakCalls = []
cancelCalls = 0

// Reset voices to initial state
setMockVoices([...mockVoices])

const harness4e = await mountComponent({
  textToSpeak: 'Advisory notice for Urdu',
  languageCode: 'ur',
  languageLabel: 'اردو',
})

// Click Listen to trigger consent dialog for 'Remote Urdu Voice'
await act(async () => {
  harness4e.findButtonByText('Listen').click()
})
assert(harness4e.findAlertDialog() !== null, 'Pending remote consent dialog must be visible')
assert.equal(speakCalls.length, 0, 'No speech calls yet')

// Now change voices while consent dialog is pending: replacement voice with different name
setMockVoices([
  { name: 'Alternative Urdu Voice', lang: 'ur-PK', localService: false, default: false },
])
await dispatchVoicesChanged()

// Verify pending consent disappears because the voice it authorized is no longer the active voice!
assert(harness4e.findAlertDialog() === null, 'Pending consent dialog must disappear when voice changes')
assert.equal(speakCalls.length, 0, 'No speech was initiated')

// Verify remote playback cannot resume without fresh consent for the new voice
await act(async () => {
  harness4e.findButtonByText('Listen').click()
})
assert(harness4e.findAlertDialog() !== null, 'Fresh consent dialog must appear for Alternative Urdu Voice')
assert(getAllText(harness4e.findAlertDialog()).includes('Alternative Urdu Voice'), 'Dialog must cite the new voice name')
assert.equal(speakCalls.length, 0, 'Still no speech before user explicitly clicks Allow')

// Click Allow & Play for the new voice
await act(async () => {
  harness4e.findButtonByText('Allow & Play').click()
})
assert.equal(speakCalls.length, 1, 'Speech starts after explicit authorization for new voice')
assert.equal(speakCalls[0].voice.name, 'Alternative Urdu Voice', 'Utterance must be bound to the new voice')

await harness4e.unmount()
// Reset mock voices back to standard for subsequent tests
setMockVoices([...mockVoices])
console.log('   ✓ Changing voice while consent pending dismisses dialog and requires fresh consent.')

// =============================================================================
// TEST 5: Stop and unmount cancel playback
// =============================================================================
console.log('\n[TEST 5] Stop and unmount cancel playback...')
speakCalls = []
cancelCalls = 0

const harness5 = await mountComponent({
  textToSpeak: 'English security notice',
  languageCode: 'en',
  languageLabel: 'English',
})

const enListenBtn = harness5.findButtonByText('Listen')
await act(async () => {
  enListenBtn.click()
})

assert.equal(speakCalls.length, 1, 'Local voice speaks immediately')
const stopBtn = harness5.findButtonByText('Stop')
assert(stopBtn !== null, 'Button must toggle to Stop')

// Click Stop
const preStopCancel = cancelCalls
await act(async () => {
  stopBtn.click()
})
assert(cancelCalls > preStopCancel, 'Clicking Stop must call speechSynthesis.cancel()')
assert(harness5.findButtonByText('Listen') !== null, 'Button must toggle back to Listen')

// Start speech again, then unmount
await act(async () => {
  harness5.findButtonByText('Listen').click()
})
const preUnmountCancel = cancelCalls
await harness5.unmount()
assert(cancelCalls > preUnmountCancel, 'Unmounting must call speechSynthesis.cancel()')
console.log('   ✓ Stop button and unmount both cleanly cancel speech synthesis.')

// =============================================================================
// TEST 6: Delayed callbacks cannot corrupt newer speech state
// =============================================================================
console.log('\n[TEST 6] Delayed callbacks cannot corrupt newer speech state...')
speakCalls = []

const harness6 = await mountComponent({
  textToSpeak: 'Notice with race checks',
  languageCode: 'en',
  languageLabel: 'English',
})

// Start first playback
await act(async () => {
  harness6.findButtonByText('Listen').click()
})
const firstUtterance = speakCalls[0]

// Start second playback (which increments utteranceIdRef)
await act(async () => {
  harness6.findButtonByText('Stop').click()
})
await act(async () => {
  harness6.findButtonByText('Listen').click()
})
assert.equal(speakCalls.length, 2)

// Now simulate first utterance firing delayed onend
await act(async () => {
  if (firstUtterance.onend) {
    firstUtterance.onend({ type: 'end' })
  }
})

// Verify component still reflects active speaking state of second utterance
assert(harness6.findButtonByText('Stop') !== null, 'Stale onend must NOT stop active speech of newer utterance')
console.log('   ✓ Monotonic utterance ID safely isolated stale async callbacks.')

await harness6.unmount()

// =============================================================================
// TEST 7: Local voice, missing voice, and Roman Urdu fallback behavior
// =============================================================================
console.log('\n[TEST 7] Local voice, missing voice, and Roman Urdu fallback behavior...')

// 7.1 Local voice ('en'): Speaks immediately without remote prompt
speakCalls = []
const harnessLocal = await mountComponent({
  textToSpeak: 'Local advisory text',
  languageCode: 'en',
  languageLabel: 'English',
})
await act(async () => {
  harnessLocal.findButtonByText('Listen').click()
})
assert.equal(speakCalls.length, 1, 'Local voice starts playback immediately')
assert(harnessLocal.findAlertDialog() === null, 'Local voice must never show remote consent prompt')
await harnessLocal.unmount()
console.log('   ✓ Local voice executes immediately without remote warning.')

// 7.2 Missing voice ('de'): Renders voice unavailable status
const harnessMissing = await mountComponent({
  textToSpeak: 'Deutscher text',
  languageCode: 'de',
  languageLabel: 'Deutsch',
})
const missingText = harnessMissing.findStatusText()
assert(missingText.includes('Voice unavailable for Deutsch'), 'Must show voice unavailable message')
assert(harnessMissing.findButtonByText('Listen') === null, 'Must not show play button when voice unavailable')
await harnessMissing.unmount()
console.log('   ✓ Missing voice cleanly shows unavailable status.')

// 7.3 Roman Urdu ('ur-Latn'): English fallback with rate 0.9 and disclaimer
speakCalls = []
const harnessRoman = await mountComponent({
  textToSpeak: 'PHP runtime ko update karein',
  languageCode: 'ur-Latn',
  languageLabel: 'Roman Urdu',
})
const fallbackBtn = harnessRoman.findButtonByText('Listen (English fallback)')
assert(fallbackBtn !== null, 'Button must indicate English fallback')
assert(getAllText(harnessRoman.container).includes('Phonetic approximation'), 'Must show Phonetic approximation badge')

await act(async () => {
  fallbackBtn.click()
})
assert.equal(speakCalls.length, 1, 'Roman Urdu fallback speaks via English voice')
assert.equal(speakCalls[0].voice.name, 'Microsoft David', 'Must use English voice')
assert.equal(speakCalls[0].rate, 0.9, 'Must set speech rate to 0.9 for phonetic clarity')
await harnessRoman.unmount()
console.log('   ✓ Roman Urdu correctly uses English fallback with adjusted rate and disclaimer.')

console.log('\n================================================================')
console.log('   ALL 7 REAL REACT INTERACTION TESTS PASSED (0 FAILURES)!')
console.log('================================================================\n')
