/**
 * Zone 4 Integration Test Suite
 * Mounts the ACTUAL React component tree:
 * AdvisoriesSection -> AdvisoryPanel -> LanguageSelector / SpeechControl
 * 
 * Verifies 8 Core Scenarios:
 * 1. Initial Render (Fixture pre-seeding and clear simulation disclosure)
 * 2. Advisory Submission (Safe sample submission and UI update)
 * 3. Loading State (Button text, disabled controls, preventing duplicate submits)
 * 4. Language Selection (All 5 languages, LTR/RTL typography, technical token isolation)
 * 5. Text-to-Speech (Local voice immediate play, remote voice privacy alert, cancellation on language switch)
 * 6. Fixture vs Live Mode Honesty (Prominent disclaimers, no false live claims)
 * 7. Error Handling (Auth required in real mode, 503 LLM_NOT_CONFIGURED, 401 UNAUTHORIZED, alert dismissal)
 * 8. Cleanup & Lifecycle (Component unmount cancel, stale callback isolation)
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// =============================================================================
// 1. Portable DOM Mock for Real React 18 Component Mounting
// =============================================================================

class MockDOMNode {
  constructor(nodeType = 1, tagName = 'div') {
    this.nodeType = nodeType
    this.tagName = tagName.toUpperCase()
    this.nodeName = this.tagName
    this.children = []
    this.childNodes = this.children
    this.attributes = {}
    this.style = {}
    this.listeners = {}
    this.textContent = ''
    this.parentNode = null
    this._value = ''
    this._checked = false
  }

  get nodeValue() {
    return this.textContent
  }

  set nodeValue(v) {
    this.textContent = String(v)
  }

  get data() {
    return this.textContent
  }

  set data(v) {
    this.textContent = String(v)
  }

  get value() {
    return this._value
  }

  set value(v) {
    this._value = String(v)
  }

  get checked() {
    return this._checked
  }

  set checked(c) {
    this._checked = Boolean(c)
  }

  get disabled() {
    return this.attributes['disabled'] === 'true' || this.attributes['disabled'] === ''
  }

  set disabled(d) {
    if (d) this.setAttribute('disabled', 'true')
    else this.removeAttribute('disabled')
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

class HTMLInputElement extends MockDOMNode {}
class HTMLTextAreaElement extends MockDOMNode {}
class HTMLButtonElement extends MockDOMNode {}
class HTMLFormElement extends MockDOMNode {}
class HTMLIFrameElement extends MockDOMNode {}
class HTMLDocument extends MockDOMNode {}

const mockDoc = new HTMLDocument(9, '#document')
mockDoc.createElement = (tag) => {
  const t = tag.toUpperCase()
  let el
  if (t === 'INPUT') el = new HTMLInputElement(1, tag)
  else if (t === 'TEXTAREA') el = new HTMLTextAreaElement(1, tag)
  else if (t === 'BUTTON') el = new HTMLButtonElement(1, tag)
  else if (t === 'FORM') el = new HTMLFormElement(1, tag)
  else el = new MockDOMNode(1, tag)
  el.ownerDocument = mockDoc
  return el
}
mockDoc.createElementNS = (ns, tag) => mockDoc.createElement(tag)
mockDoc.createTextNode = (text) => {
  const n = new MockDOMNode(3, '#text')
  n.textContent = text
  n.ownerDocument = mockDoc
  return n
}
mockDoc.createComment = (text) => {
  const n = new MockDOMNode(8, '#comment')
  n.ownerDocument = mockDoc
  return n
}
mockDoc.documentElement = new MockDOMNode(1, 'html')
mockDoc.body = new MockDOMNode(1, 'body')
mockDoc.defaultView = null
mockDoc.activeElement = null

global.HTMLInputElement = HTMLInputElement
global.HTMLTextAreaElement = HTMLTextAreaElement
global.HTMLButtonElement = HTMLButtonElement
global.HTMLFormElement = HTMLFormElement
global.HTMLIFrameElement = HTMLIFrameElement
global.HTMLDocument = HTMLDocument
global.HTMLElement = MockDOMNode
global.Element = MockDOMNode
global.Node = MockDOMNode

// =============================================================================
// 2. Web Speech API Mock
// =============================================================================

const mockVoices = [
  { name: 'Microsoft David', lang: 'en-US', localService: true, default: true },
  { name: 'Microsoft Helena', lang: 'es-ES', localService: true, default: false },
  { name: 'Microsoft Hoda', lang: 'ar-SA', localService: true, default: false },
  { name: 'Remote Urdu Voice', lang: 'ur-PK', localService: false, default: false },
]

let speakCalls = []
let cancelCalls = 0
let voicesChangedListeners = []

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

global.window = {
  document: mockDoc,
  HTMLInputElement,
  HTMLTextAreaElement,
  HTMLButtonElement,
  HTMLFormElement,
  HTMLIFrameElement,
  HTMLDocument,
  HTMLElement: MockDOMNode,
  addEventListener: () => {},
  removeEventListener: () => {},
  speechSynthesis: {
    getVoices: () => mockVoices,
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
  },
}
mockDoc.defaultView = global.window
global.document = mockDoc
global.IS_REACT_ACT_ENVIRONMENT = true

// =============================================================================
// 3. Compile & Bundle React Components Under Test
// =============================================================================

const { default: React, act } = await import('react')
const { createRoot } = await import('react-dom/client')

const bundledResult = esbuild.buildSync({
  stdin: {
    contents: `
      export { default as AdvisoriesSection } from '../dashboard/AdvisoriesSection.jsx';
      export * as apiClient from '../../services/apiClient.js';
    `,
    resolveDir: path.resolve(__dirname, '..'),
    sourcefile: 'zone4-test-entry.jsx',
    loader: 'jsx',
  },
  bundle: true,
  format: 'esm',
  banner: { js: "import React from 'react';" },
  define: {
    'import.meta.env': JSON.stringify({ VITE_DATA_MODE: 'mock' }),
  },
  external: ['react', 'react-dom', 'react-dom/client'],
  write: false,
})

const tempTestModulePath = path.resolve(__dirname, './.Zone4Integration.bundled.mjs')
fs.writeFileSync(tempTestModulePath, bundledResult.outputFiles[0].text, 'utf-8')

let AdvisoriesSection
let apiClient

try {
  const mod = await import(`file://${tempTestModulePath.replace(/\\/g, '/')}`)
  AdvisoriesSection = mod.AdvisoriesSection
  apiClient = mod.apiClient
} finally {
  if (fs.existsSync(tempTestModulePath)) {
    fs.unlinkSync(tempTestModulePath)
  }
}

// Tree search and inspection helpers
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
  return text.replace(/\s+/g, ' ').trim()
}

function simulateTextChange(textareaNode, text) {
  textareaNode.value = text
  const propsKey = Object.keys(textareaNode).find((k) => k.startsWith('__reactProps$'))
  if (propsKey && textareaNode[propsKey]?.onChange) {
    textareaNode[propsKey].onChange({ target: { value: text } })
  } else {
    textareaNode.dispatchEvent({ type: 'input', bubbles: true, target: textareaNode })
    textareaNode.dispatchEvent({ type: 'change', bubbles: true, target: textareaNode })
  }
}

function simulateRadioChange(radioNode, checkedValue) {
  radioNode.checked = Boolean(checkedValue)
  if (checkedValue) {
    const propsKey = Object.keys(radioNode).find((k) => k.startsWith('__reactProps$'))
    if (propsKey && typeof radioNode[propsKey]?.onChange === 'function') {
      radioNode[propsKey].onChange({ target: { checked: true, value: radioNode.value } })
    } else {
      radioNode.dispatchEvent({ type: 'change', bubbles: true, target: radioNode })
    }
  }
}

function simulateFormSubmit(formNode) {
  const propsKey = Object.keys(formNode).find((k) => k.startsWith('__reactProps$'))
  if (propsKey && formNode[propsKey]?.onSubmit) {
    formNode[propsKey].onSubmit({ preventDefault: () => {} })
  } else {
    formNode.dispatchEvent({ type: 'submit', bubbles: true, cancelable: true, preventDefault: () => {} })
  }
}

async function mountZone4() {
  const container = mockDoc.createElement('div')
  container.ownerDocument = mockDoc
  const root = createRoot(container)

  await act(async () => {
    root.render(React.createElement(AdvisoriesSection))
  })

  return {
    container,
    root,
    unmount: async () => {
      await act(async () => {
        root.unmount()
      })
    },
    getText: () => getAllText(container),
    findTextarea: () => findNode(container, (n) => n.tagName === 'TEXTAREA'),
    findSubmitButton: () => findNode(container, (n) => n.tagName === 'BUTTON' && (n.getAttribute('type') === 'submit' || getAllText(n).includes('Analyz'))),
    findForm: () => findNode(container, (n) => n.tagName === 'FORM'),
    findRadios: () => findNodes(container, (n) => n.tagName === 'INPUT' && n.getAttribute('type') === 'radio'),
    findLanguageButton: (label) => findNode(container, (n) => n.tagName === 'BUTTON' && getAllText(n) === label),
    findListenButton: () => findNode(container, (n) => n.tagName === 'BUTTON' && (getAllText(n).includes('Listen') || getAllText(n).includes('Stop'))),
    findAlertDialog: () => findNode(container, (n) => n.getAttribute('role') === 'alertdialog'),
    findErrorAlert: () => findNode(container, (n) => n.getAttribute('role') === 'alert' && getAllText(n).includes('Advisory Analysis Error')),
    findErrorDismissButton: () => findNode(container, (n) => n.tagName === 'BUTTON' && n.getAttribute('aria-label') === 'Dismiss error'),
    findLocalizedContainer: () => findNode(container, (n) => n.tagName === 'DIV' && n.hasAttribute('dir')),
    findBdiElements: () => findNodes(container, (n) => n.tagName === 'BDI'),
  }
}

console.log('================================================================')
console.log('   RUNNING ZONE 4 AI ADVISORY INTEGRATION TEST SUITE')
console.log('================================================================\n')

let passedCount = 0

// =============================================================================
// TEST 1 — INITIAL RENDER
// =============================================================================
console.log('[TEST 1] Initial Render & Pre-Seeded Simulation Disclosure...')
apiClient.setApiMode('mock')
apiClient.resetMockData()
const z1 = await mountZone4()

const text1 = z1.getText()
assert(text1.includes('Zone 4 — Security Advisory & AI Intelligence'), 'Must render main Zone 4 heading')
assert(text1.includes('DEMO-ADVISORY-001'), 'Must render pre-seeded demo identifier')
assert(text1.includes('SEVERITY: MEDIUM'), 'Must render severity level')
assert(text1.includes('Simulated Security Notice'), 'Must display initial English localization')
assert(text1.includes('Deterministic Demo Fixture'), 'Must prominently display fixture disclaimer')
assert(text1.includes('SIMULATED DEMO'), 'Must flag data as simulated demo')
assert(text1.includes('Fixture Active'), 'Must display Fixture Active indicator')

const textarea1 = z1.findTextarea()
assert(textarea1 !== null, 'Textarea must be present')
assert.equal(textarea1.value, '', 'Initial textarea must be empty')

const submit1 = z1.findSubmitButton()
assert(submit1 !== null, 'Analyze button must be present')
assert.equal(submit1.disabled, true, 'Submit button must be disabled when textarea is empty')

await z1.unmount()
passedCount++
console.log('   ✓ Zone 4 mounts cleanly with pre-seeded mock advisory and clear simulation labeling.')

// =============================================================================
// TEST 2 — ADVISORY SUBMISSION (OFFLINE FIXTURE ROUND-TRIP)
// =============================================================================
console.log('\n[TEST 2] Advisory Submission Flow (Offline Fixture Mode)...')
apiClient.setApiMode('mock')
const z2 = await mountZone4()

try {
  const textarea2 = z2.findTextarea()
  const submit2 = z2.findSubmitButton()
  const form2 = z2.findForm()

  // Enter safe advisory text
  await act(async () => {
    simulateTextChange(textarea2, 'PHP 8.3 Release: Resolving security flaw in request parsing.')
  })

  assert.equal(submit2.disabled, false, 'Submit button must become enabled with valid input')

  // Submit form
  await act(async () => {
    simulateFormSubmit(form2)
  })

  // Confirm fixture response rendered honestly without claiming real AI analysis
  const text2 = z2.getText()
  assert(text2.includes('Zone 4 — Security Advisory & AI Intelligence'), 'Zone 4 retains view after submission')
  assert(text2.includes('Deterministic Demo Fixture'), 'Retains simulation honesty disclosure')
  assert(text2.includes('Review official vendor bulletins'), 'Renders actionable hardening guidance from fixture')
  assert(text2.includes('SIMULATED DEMO'), 'Displays simulated demo badge')

  passedCount++
  console.log('   ✓ Advisory submission resolves via offline mock fixture round-trip without false AI claims.')
} finally {
  await z2.unmount()
}

// =============================================================================
// TEST 3 — LOADING STATE, REQUEST VERIFICATION & RESPONSE UPDATE
// =============================================================================
console.log('\n[TEST 3] Loading State, Request Verification & Response Update...')
const originalFetch3 = global.fetch
apiClient.setApiMode('real')
apiClient.setAdminToken('mock-admin-token-for-test3')

let resolveDeferred3
const deferredPromise3 = new Promise((resolve) => {
  resolveDeferred3 = resolve
})

let fetchCallCount3 = 0
let interceptedRequest3 = null
global.fetch = async (url, options) => {
  fetchCallCount3++
  interceptedRequest3 = { url, options }
  return deferredPromise3
}

let z3
try {
  z3 = await mountZone4()

  const textarea3 = z3.findTextarea()
  const form3 = z3.findForm()

  await act(async () => {
    simulateTextChange(textarea3, 'PHP Security Update: CVE-2026-109618')
  })

  // Verify that unique response content is NOT present prior to resolution
  assert(!z3.getText().includes('Resolved Notice'), 'Response title "Resolved Notice" must not appear before resolution')
  assert(!z3.getText().includes('Upgrade now'), 'Recommended action "Upgrade now" must not appear before resolution')

  // Trigger first submission
  await act(async () => {
    simulateFormSubmit(form3)
  })

  // Intercepted request verification
  assert.equal(fetchCallCount3, 1, 'First submission initiated fetch call')
  assert(interceptedRequest3 !== null, 'Intercepted request was captured')
  assert.equal(interceptedRequest3.url, '/api/v1/advisories/analyze', 'Request endpoint must be /api/v1/advisories/analyze')
  assert.equal(interceptedRequest3.options?.method, 'POST', 'HTTP method must be POST')

  const parsedBody3 = JSON.parse(interceptedRequest3.options?.body || '{}')
  assert.equal(parsedBody3.advisory_text, 'PHP Security Update: CVE-2026-109618', 'Submits exact advisory_text')
  assert.deepEqual(parsedBody3.languages, ['en', 'ur', 'ur-Latn', 'ar', 'es'], 'Submits complete supported languages array')
  assert.equal(parsedBody3.processing_mode, 'fixture', 'Submits selected processing_mode')

  const submit3 = z3.findSubmitButton()
  assert(submit3 !== null, 'Submit button present during loading')
  assert.equal(submit3.disabled, true, 'Submit button must be disabled during loading')
  assert(getAllText(submit3).includes('Analyzing...'), 'Button text must reflect active analysis')

  // Attempt duplicate submission while pending
  await act(async () => {
    simulateFormSubmit(form3)
  })
  assert.equal(fetchCallCount3, 1, 'Duplicate submission blocked while loading is active')

  // Still not visible while request is pending
  assert(!z3.getText().includes('Resolved Notice'), 'Response title still not present while request is pending')

  // Resolve deferred promise with unique response data
  await act(async () => {
    resolveDeferred3({
      ok: true,
      status: 200,
      headers: {
        get: (header) => (header.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({
        advisory: {
          id: 1,
          external_id: 'DEMO-ADVISORY-RESOLVED-001',
          title: 'Resolved Advisory Header',
          severity: 'medium',
          summary: 'Summary text',
          source_kind: 'demo',
          verified: false,
          generated_by: 'fixture',
          created_at: new Date().toISOString(),
        },
        localizations: [
          {
            language_code: 'en',
            title: 'Resolved Notice',
            summary: 'Resolved summary text',
            recommended_action: 'Upgrade now',
            generated_by: 'fixture',
          },
        ],
        processing_mode: 'fixture',
        is_simulated: true,
      }),
    })
  })

  assert.equal(submit3.disabled, false, 'Submit button re-enabled after completion')
  assert(getAllText(submit3).includes('Analyze Advisory'), 'Button text restored after completion')

  // Verify unique response title and recommended action become visible ONLY AFTER resolution
  assert(z3.getText().includes('Resolved Notice'), 'Unique response title "Resolved Notice" is now visible in DOM')
  assert(z3.getText().includes('Upgrade now'), 'Unique recommended action "Upgrade now" is now visible in DOM')

  passedCount++
  console.log('   ✓ Loading state enforces button disabling, verifies POST payload, and reveals updated response data only after resolution.')
} finally {
  if (z3) await z3.unmount()
  global.fetch = originalFetch3
  apiClient.setApiMode('mock')
  apiClient.clearAdminToken()
}

// =============================================================================
// TEST 4 — LANGUAGE SELECTION & DIRECTIONALITY
// =============================================================================
console.log('\n[TEST 4] Multilingual Selection & RTL Directionality...')
apiClient.setApiMode('mock')
const z4 = await mountZone4()

try {
  // 4.1 English (LTR)
  const enBtn = z4.findLanguageButton('English')
  assert(enBtn !== null, 'English tab must exist')
  await act(async () => {
    enBtn.click()
  })
  let locContainer = z4.findLocalizedContainer()
  assert.equal(locContainer.getAttribute('dir'), 'ltr', 'English must use LTR direction')
  assert(z4.getText().includes('Simulated Security Notice'), 'English title displayed')

  // 4.2 Urdu (RTL)
  const urBtn = z4.findLanguageButton('اردو')
  assert(urBtn !== null, 'Urdu tab must exist')
  await act(async () => {
    urBtn.click()
  })
  locContainer = z4.findLocalizedContainer()
  assert.equal(locContainer.getAttribute('dir'), 'rtl', 'Urdu must use RTL direction')
  assert(locContainer.getAttribute('class').includes('text-right'), 'Urdu must align text-right')
  assert(z4.getText().includes('نقلی سیکیورٹی اطلاع (ڈیمو)'), 'Urdu localized title displayed')

  // 4.3 Roman Urdu (LTR)
  const urLatnBtn = z4.findLanguageButton('Roman Urdu')
  assert(urLatnBtn !== null, 'Roman Urdu tab must exist')
  await act(async () => {
    urLatnBtn.click()
  })
  locContainer = z4.findLocalizedContainer()
  assert.equal(locContainer.getAttribute('dir'), 'ltr', 'Roman Urdu must use LTR direction')
  assert(z4.getText().includes('Simulated Security Ittila (Demo)'), 'Roman Urdu title displayed')

  // 4.4 Arabic (RTL)
  const arBtn = z4.findLanguageButton('العربية')
  assert(arBtn !== null, 'Arabic tab must exist')
  await act(async () => {
    arBtn.click()
  })
  locContainer = z4.findLocalizedContainer()
  assert.equal(locContainer.getAttribute('dir'), 'rtl', 'Arabic must use RTL direction')
  assert(locContainer.getAttribute('class').includes('text-right'), 'Arabic must align text-right')
  assert(z4.getText().includes('إشعار أمني محاكى (عرض توضيحي)'), 'Arabic localized title displayed')

  // 4.5 Spanish (LTR)
  const esBtn = z4.findLanguageButton('Español')
  assert(esBtn !== null, 'Spanish tab must exist')
  await act(async () => {
    esBtn.click()
  })
  locContainer = z4.findLocalizedContainer()
  assert.equal(locContainer.getAttribute('dir'), 'ltr', 'Spanish must use LTR direction')
  assert(z4.getText().includes('Aviso de seguridad simulado (Demostración)'), 'Spanish localized title displayed')

  // 4.6 Technical Token Isolation (<bdi dir="ltr">) in RTL Locales (Urdu & Arabic)
  const controlledBdiResponse = {
    advisory: {
      id: 99,
      external_id: 'CVE-2026-109618',
      title: 'PHP 8.3 Security Notice',
      severity: 'high',
      summary: 'RTL isolation test for CVE-2026-109618 and php.ini.',
      source_kind: 'demo',
      verified: false,
      generated_by: 'fixture',
      created_at: new Date().toISOString(),
    },
    localizations: [
      {
        language_code: 'en',
        title: 'Security Notice for CVE-2026-109618 on PHP 8.3',
        summary: 'Check php.ini for CVE-2026-109618 remediation.',
        recommended_action: 'Upgrade to PHP 8.3 now.',
        generated_by: 'fixture',
      },
      {
        language_code: 'ur',
        title: 'سیکیورٹی الرٹ برائے CVE-2026-109618 اور PHP 8.3',
        summary: 'فائل php.ini کی جانچ کریں اور CVE-2026-109618 کا تدارک کریں۔',
        recommended_action: 'فوری طور پر PHP 8.3 انسٹال کریں اور php.ini محفوظ بنائیں۔',
        generated_by: 'fixture',
      },
      {
        language_code: 'ar',
        title: 'إشعار أمني عاجل بشأن CVE-2026-109618 و PHP 8.3',
        summary: 'يرجى مراجعة ملف php.ini للحماية من ثغرة CVE-2026-109618 في الخادم.',
        recommended_action: 'قم بالترقية إلى PHP 8.3 وضبط إعدادات php.ini فوراً.',
        generated_by: 'fixture',
      },
      {
        language_code: 'ur-Latn',
        title: 'Security Notice for CVE-2026-109618 and PHP 8.3',
        summary: 'Check php.ini file.',
        recommended_action: 'Install PHP 8.3.',
        generated_by: 'fixture',
      },
      {
        language_code: 'es',
        title: 'Aviso de seguridad para CVE-2026-109618 y PHP 8.3',
        summary: 'Revise el archivo php.ini.',
        recommended_action: 'Actualice a PHP 8.3.',
        generated_by: 'fixture',
      },
    ],
    processing_mode: 'fixture',
    is_simulated: true,
  }

  const origFetch4 = global.fetch
  apiClient.setApiMode('real')
  apiClient.setAdminToken('mock-admin-token-for-test4-bdi')
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: {
      get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: async () => controlledBdiResponse,
  })

  try {
    // Enter advisory input and submit to load controlled BDI response
    await act(async () => {
      simulateTextChange(z4.findTextarea(), 'Security bulletin for CVE-2026-109618 affecting PHP 8.3 in php.ini')
    })
    await act(async () => {
      simulateFormSubmit(z4.findForm())
    })

    // Switch to Urdu and verify BDI isolation
    await act(async () => {
      urBtn.click()
    })
    const urBdiElements = z4.findBdiElements()
    assert(urBdiElements.length >= 3, 'Must render at least 3 BDI elements in Urdu localization')
    for (const bdi of urBdiElements) {
      assert.equal(bdi.getAttribute('dir'), 'ltr', 'Urdu technical token BDI must enforce dir="ltr"')
    }
    const urBdiTexts = urBdiElements.map((b) => getAllText(b))
    assert(urBdiTexts.includes('CVE-2026-109618'), 'Urdu BDI elements must preserve exact CVE-2026-109618 identifier')
    assert(urBdiTexts.includes('PHP 8.3'), 'Urdu BDI elements must preserve exact PHP 8.3 version string')
    assert(urBdiTexts.includes('php.ini'), 'Urdu BDI elements must preserve exact php.ini configuration filename')

    // Switch to Arabic and verify BDI isolation
    await act(async () => {
      arBtn.click()
    })
    const arBdiElements = z4.findBdiElements()
    assert(arBdiElements.length >= 3, 'Must render at least 3 BDI elements in Arabic localization')
    for (const bdi of arBdiElements) {
      assert.equal(bdi.getAttribute('dir'), 'ltr', 'Arabic technical token BDI must enforce dir="ltr"')
    }
    const arBdiTexts = arBdiElements.map((b) => getAllText(b))
    assert(arBdiTexts.includes('CVE-2026-109618'), 'Arabic BDI elements must preserve exact CVE-2026-109618 identifier')
    assert(arBdiTexts.includes('PHP 8.3'), 'Arabic BDI elements must preserve exact PHP 8.3 version string')
    assert(arBdiTexts.includes('php.ini'), 'Arabic BDI elements must preserve exact php.ini configuration filename')
  } finally {
    global.fetch = origFetch4
    apiClient.setApiMode('mock')
    apiClient.clearAdminToken()
  }

  passedCount++
  console.log('   ✓ All 5 languages update localized content, apply correct LTR/RTL directionality, and isolate technical tokens in <bdi dir="ltr">.')
} finally {
  await z4.unmount()
}

// =============================================================================
// TEST 5 — TEXT-TO-SPEECH THROUGH MOUNTED ZONE 4
// =============================================================================
console.log('\n[TEST 5] Text-to-Speech Integration & Voice Privacy Gate...')
apiClient.setApiMode('mock')
speakCalls = []
cancelCalls = 0
const z5 = await mountZone4()

// 5.1 Local voice in English: plays immediately
const listenBtn5 = z5.findListenButton()
assert(listenBtn5 !== null, 'Listen button must be mounted inside Zone 4')
assert(getAllText(listenBtn5).includes('Listen'), 'Initial button is Listen')

await act(async () => {
  listenBtn5.click()
})

assert.equal(speakCalls.length, 1, 'Local English voice speaks immediately')
assert.equal(speakCalls[0].voice.name, 'Microsoft David', 'Binds matched local voice')
assert(z5.findAlertDialog() === null, 'No remote consent alert for local voice')
assert(getAllText(listenBtn5).includes('Stop'), 'Button toggles to Stop')

// Stop playback
await act(async () => {
  listenBtn5.click()
})
assert(cancelCalls > 0, 'Clicking Stop cancels speech')
assert(getAllText(listenBtn5).includes('Listen'), 'Button toggles back to Listen')

// 5.2 Remote voice in Urdu: requires consent dialog
await act(async () => {
  z5.findLanguageButton('اردو').click()
})

speakCalls = []
const urListenBtn = z5.findListenButton()
await act(async () => {
  urListenBtn.click()
})

assert.equal(speakCalls.length, 0, 'Remote voice strictly blocked prior to consent')
const consentDialog5 = z5.findAlertDialog()
assert(consentDialog5 !== null, 'Remote voice alertdialog displayed')
assert(getAllText(consentDialog5).includes('Remote Urdu Voice'), 'Dialog names the remote voice')

// Click Allow & Play in consent dialog
const allowBtn = findNode(consentDialog5, (n) => n.tagName === 'BUTTON' && getAllText(n).includes('Allow & Play'))
assert(allowBtn !== null, 'Allow & Play button present')
await act(async () => {
  allowBtn.click()
})

assert.equal(speakCalls.length, 1, 'Speech initiates after Allow & Play')
assert.equal(speakCalls[0].voice.name, 'Remote Urdu Voice', 'Binds remote Urdu voice')

// 5.3 Language switch cancels active speech
const prevCancelCount = cancelCalls
await act(async () => {
  z5.findLanguageButton('English').click()
})
assert(cancelCalls > prevCancelCount, 'Switching language tab immediately cancels active speech')

await z5.unmount()
passedCount++
console.log('   ✓ TTS controls integrate seamlessly; local voice plays immediately and remote voice respects privacy gate.')

// =============================================================================
// TEST 6 — FIXTURE VS LIVE MODE HONESTY
// =============================================================================
console.log('\n[TEST 6] Fixture vs Live Mode UI Disclosures & Transparency...')
apiClient.setApiMode('mock')
const z6 = await mountZone4()

const radios = z6.findRadios()
assert.equal(radios.length, 2, 'Two mode radio buttons present')

const fixtureRadio = radios.find((r) => r.value === 'fixture')
const llmRadio = radios.find((r) => r.value === 'llm')

assert(fixtureRadio !== null, 'Fixture radio present')
assert(llmRadio !== null, 'Live LLM radio present')
assert.equal(fixtureRadio.checked, true, 'Fixture mode selected by default')

// Verify offline fixture disclosure
assert(z6.getText().includes('Offline Safe Mode: Fixture mode evaluates sample data completely offline on this server.'), 'Discloses offline evaluation')
assert(z6.getText().includes('Deterministic Demo Fixture'), 'Output flagged as fixture')

// Switch to Live AI mode
await act(async () => {
  simulateRadioChange(llmRadio, true)
  simulateRadioChange(fixtureRadio, false)
})

// Verify live AI warning and anti-credential disclosure
assert(z6.getText().includes('External AI Disclosure: Live AI analysis transmits submitted text to Groq Cloud API'), 'Prominently warns about external transmission')
assert(z6.getText().includes('Do not submit passwords, API keys, database credentials'), 'Warns against submitting secrets')
assert(z6.getText().includes('External Groq AI: Do NOT submit credentials or secrets'), 'Visible disclaimer banner rendered')

await z6.unmount()
passedCount++
console.log('   ✓ Component transparently distinguishes offline fixture mode from external Groq AI mode.')

// =============================================================================
// TEST 7 — ERROR HANDLING & ALERT DISMISSAL
// =============================================================================
console.log('\n[TEST 7] Error Handling & Alert Dismissal in Zone 4...')
const origFetch7 = global.fetch

try {
  // 7.1 Real mode without admin token shows unlock alert
  apiClient.setApiMode('real')
  apiClient.clearAdminToken()

  const z7a = await mountZone4()
  try {
    const textarea7a = z7a.findTextarea()
    const form7a = z7a.findForm()

    await act(async () => {
      simulateTextChange(textarea7a, 'Advisory test text')
    })
    await act(async () => {
      simulateFormSubmit(form7a)
    })

    assert(z7a.findErrorAlert() !== null, 'Error alert must be visible')
    assert(z7a.getText().includes('Admin Unlock Required: Please unlock the dashboard with your admin token'), 'Renders admin unlock error message')

    // Dismiss error alert
    const dismissBtn7a = z7a.findErrorDismissButton()
    assert(dismissBtn7a !== null, 'Dismiss button must be present')
    await act(async () => {
      dismissBtn7a.click()
    })
    assert(z7a.findErrorAlert() === null, 'Error alert dismissed upon clicking close')
  } finally {
    await z7a.unmount()
  }

  // 7.2 Real mode with 503 LLM_NOT_CONFIGURED error
  apiClient.setApiMode('real')
  apiClient.setAdminToken('test-token-7b')
  global.fetch = async () => ({
    ok: false,
    status: 503,
    headers: {
      get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: async () => ({
      error: {
        code: 'LLM_NOT_CONFIGURED',
        message: 'LLM provider not configured',
      },
    }),
  })

  const z7b = await mountZone4()
  try {
    const textarea7b = z7b.findTextarea()
    const form7b = z7b.findForm()

    await act(async () => {
      simulateTextChange(textarea7b, 'Advisory test text')
    })
    await act(async () => {
      simulateFormSubmit(form7b)
    })

    assert(z7b.findErrorAlert() !== null, 'Error alert rendered for 503')
    assert(z7b.getText().includes('Live AI Unavailable (503): The backend LLM provider (Groq) is not configured'), 'Displays 503 LLM guidance')

    // Dismiss error alert
    const dismissBtn7b = z7b.findErrorDismissButton()
    await act(async () => {
      dismissBtn7b.click()
    })
    assert(z7b.findErrorAlert() === null, '503 error alert cleanly dismissed')

    // 7.3 Real mode with 401 UNAUTHORIZED error from backend
    apiClient.setAdminToken('test-token-7c')
    global.fetch = async () => ({
      ok: false,
      status: 401,
      headers: {
        get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Admin token is invalid or expired',
        },
      }),
    })

    await act(async () => {
      simulateFormSubmit(form7b)
    })

    assert(z7b.findErrorAlert() !== null, 'Error alert rendered for 401')
    assert(z7b.getText().includes('Authentication Failed (401): Invalid or missing admin token'), 'Displays 401 auth failure guidance')

    // Dismiss error alert
    const dismissBtn7c = z7b.findErrorDismissButton()
    assert(dismissBtn7c !== null, 'Dismiss button for 401 error present')
    await act(async () => {
      dismissBtn7c.click()
    })
    assert(z7b.findErrorAlert() === null, '401 error alert cleanly dismissed')
  } finally {
    await z7b.unmount()
  }

  passedCount++
  console.log('   ✓ Error alerts for admin token, 503 unconfigured provider, and 401 auth failures render and dismiss cleanly.')
} finally {
  global.fetch = origFetch7
  apiClient.setApiMode('mock')
  apiClient.clearAdminToken()
}

// =============================================================================
// TEST 8 — CLEANUP & LIFECYCLE SAFETY
// =============================================================================
console.log('\n[TEST 8] Component Unmount & Delayed Callback Safety...')
cancelCalls = 0
speakCalls = []
const z8 = await mountZone4()

try {
  // Trigger speech
  await act(async () => {
    z8.findListenButton().click()
  })
  assert.equal(speakCalls.length, 1, 'Speech active')
  const activeUtt = speakCalls[0]

  // Unmount component while speech is active
  const preUnmountCancel = cancelCalls
  await z8.unmount()
  assert(cancelCalls > preUnmountCancel, 'Unmounting Zone 4 cancels speech synthesis immediately')

  // Stale delayed callback after unmount must not throw
  assert.doesNotThrow(() => {
    if (typeof activeUtt.onend === 'function') {
      activeUtt.onend({ type: 'end' })
    }
    if (typeof activeUtt.onerror === 'function') {
      activeUtt.onerror({ type: 'error', error: 'interrupted' })
    }
  }, 'Delayed callbacks after unmount are cleanly ignored without throwing or corrupting state')

  passedCount++
  console.log('   ✓ Unmounting immediately cancels active speech; late asynchronous callbacks do not throw errors.')
} finally {
  // Mock cleanup complete
}

// =============================================================================
// SUMMARY
// =============================================================================
console.log('\n================================================================')
console.log(`   ALL ${passedCount}/8 ZONE 4 INTEGRATION TESTS PASSED (0 FAILURES)!`)
console.log('================================================================\n')
