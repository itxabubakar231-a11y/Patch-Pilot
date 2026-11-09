/**
 * PatchPilot API Client & Data Adapter
 *
 * Implements authenticated HTTP calls via Vite proxy to the FastAPI backend (127.0.0.1:8000).
 * Supports both VITE_DATA_MODE=real and VITE_DATA_MODE=mock (default).
 * Strictly conforms to docs/API.md, docs/DESIGN.md, and docs/DEVELOPMENT_PLAN.md.
 */

import {
  mockOverview as initialOverview,
  mockProxyStatus as initialProxyStatus,
  mockRules as initialRules,
  mockTraffic as initialTraffic,
  mockAdvisories as initialAdvisories,
} from '../mocks/index.js'

// ============================================================================
// 1. In-Memory Token & State Management (No localStorage/sessionStorage)
// ============================================================================

let inMemoryToken = null
const authChangeListeners = new Set()

/**
 * Broadcast in-memory authentication status to active subscribers.
 * Strictly boolean payload; never emits token values.
 * @param {boolean} isUnlocked
 */
function notifyAuthChange(isUnlocked) {
  authChangeListeners.forEach((listener) => {
    try {
      listener(isUnlocked)
    } catch (err) {
      console.error('[apiClient] Error in auth change listener:', err)
    }
  })
}

/**
 * Subscribe to in-memory authentication state transitions (e.g. 401 invalidation, unlock, lock).
 * Returns an unsubscribe cleanup callback.
 * @param {(isUnlocked: boolean) => void} listener
 * @returns {() => void}
 */
export function subscribeAuthChange(listener) {
  if (typeof listener !== 'function') return () => {}
  authChangeListeners.add(listener)
  return () => {
    authChangeListeners.delete(listener)
  }
}

/**
 * Set the local demo admin bearer token in JavaScript memory.
 * Never persists to browser storage or URLs.
 * @param {string|null} token
 */
export function setAdminToken(token) {
  inMemoryToken = token ? String(token).trim() : null
  notifyAuthChange(Boolean(inMemoryToken))
}

/**
 * Clear the admin token from module memory (e.g. on 401 or logout).
 */
export function clearAdminToken() {
  inMemoryToken = null
  notifyAuthChange(false)
}


/**
 * Check if an admin token is currently set.
 * @returns {boolean}
 */
export function hasAdminToken() {
  return Boolean(inMemoryToken)
}

// ============================================================================
// 2. API Mode Configuration
// ============================================================================

let currentMode = (import.meta.env.VITE_DATA_MODE || 'mock').toLowerCase()

/**
 * Get active data mode ('mock' or 'real').
 * @returns {'mock'|'real'}
 */
export function getApiMode() {
  return currentMode === 'real' ? 'real' : 'mock'
}

/**
 * Switch data mode programmatically ('mock' or 'real').
 * @param {'mock'|'real'} mode
 */
export function setApiMode(mode) {
  if (mode === 'real' || mode === 'mock') {
    currentMode = mode
  }
}

// ============================================================================
// 3. Custom Error Representation
// ============================================================================

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, code?: string, details?: any }} [options]
   */
  constructor(message, { status = 0, code = 'API_ERROR', details = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

// ============================================================================
// 4. Mock State Store (Realistic, Consistent Mutations)
// ============================================================================

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

let mockOverviewState = deepClone(initialOverview)
let mockProxyStatusState = deepClone(initialProxyStatus)
let mockRulesState = deepClone(initialRules)
let mockTrafficState = deepClone(initialTraffic)
let mockAdvisoriesState = deepClone(initialAdvisories)
let mockReplayRunCounter = 5

/**
 * Reset mock state back to initial fixtures.
 */
export function resetMockData() {
  mockOverviewState = deepClone(initialOverview)
  mockProxyStatusState = deepClone(initialProxyStatus)
  mockRulesState = deepClone(initialRules)
  mockTrafficState = deepClone(initialTraffic)
  mockAdvisoriesState = deepClone(initialAdvisories)
  mockReplayRunCounter = 5
}

// ============================================================================
// 5. Network Request Handler (Real Mode)
// ============================================================================

async function fetchFromBackend(path, { method = 'GET', body = null, isProtected = true } = {}) {
  const headers = {
    Accept: 'application/json',
  }

  if (body !== null) {
    headers['Content-Type'] = 'application/json'
  }

  if (isProtected) {
    if (!inMemoryToken) {
      throw new ApiError('Admin token is required. Please unlock the demo first.', {
        status: 401,
        code: 'UNAUTHORIZED',
      })
    }
    headers['Authorization'] = `Bearer ${inMemoryToken}`
  }

  let response
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body !== null ? JSON.stringify(body) : undefined,
    })
  } catch (networkErr) {
    throw new ApiError('Backend unavailable or network error. Check if the backend is running on 127.0.0.1:8000.', {
      status: 0,
      code: 'NETWORK_ERROR',
      details: networkErr?.message || 'Network request failed',
    })
  }

  let responseData = null
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      responseData = await response.json()
    } catch {
      responseData = null
    }
  }

  if (!response.ok) {
    // If unauthorized, clear invalid token from memory to force re-unlock
    if (response.status === 401) {
      clearAdminToken()
    }

    const errorCode =
      responseData?.error?.code ||
      (response.status === 401
        ? 'UNAUTHORIZED'
        : response.status === 409
        ? 'CONFLICT'
        : response.status === 502
        ? 'UPSTREAM_ERROR'
        : `HTTP_${response.status}`)

    const errorMessage =
      responseData?.error?.message ||
      responseData?.detail ||
      (response.status === 502
        ? 'Lab server is unreachable or offline (502 Bad Gateway).'
        : `Request failed with HTTP status ${response.status}.`)

    throw new ApiError(errorMessage, {
      status: response.status,
      code: errorCode,
      details: responseData,
    })
  }

  return responseData
}

// ============================================================================
// 6. Documented API Endpoint Methods
// ============================================================================

/**
 * GET /health
 * Public baseline health check. Unauthenticated.
 */
export async function getHealth() {
  if (getApiMode() === 'real') {
    return await fetchFromBackend('/health', { isProtected: false })
  }
  return {
    status: 'ok',
    service: 'PatchPilot Backend',
    version: '0.1.0',
  }
}

/**
 * GET /api/v1/overview
 * Overall security dashboard status (Zone 1). Protected.
 */
export async function getOverview() {
  if (getApiMode() === 'real') {
    return await fetchFromBackend('/api/v1/overview', { isProtected: true })
  }
  return deepClone(mockOverviewState)
}

/**
 * GET /api/v1/proxy/status
 * Current security proxy runtime mode and enforcement readiness (Zone 3). Protected.
 */
export async function getProxyStatus() {
  if (getApiMode() === 'real') {
    return await fetchFromBackend('/api/v1/proxy/status', { isProtected: true })
  }
  return deepClone(mockProxyStatusState)
}

/**
 * GET /api/v1/rules?limit=50&offset=0
 * List configured security rules and their replay status. Protected.
 * Accepts either { limit, offset } or separate (limit, offset) arguments.
 */
export async function getRules(params = {}) {
  let limit = 50
  let offset = 0

  if (typeof params === 'number') {
    limit = params
    offset = typeof arguments[1] === 'number' ? arguments[1] : 0
  } else if (params && typeof params === 'object') {
    limit = params.limit ?? 50
    offset = params.offset ?? 0
  }

  if (getApiMode() === 'real') {
    return await fetchFromBackend(`/api/v1/rules?limit=${limit}&offset=${offset}`, {
      isProtected: true,
    })
  }

  const items = mockRulesState.items.slice(offset, offset + limit)
  return {
    items: deepClone(items),
    total: mockRulesState.items.length,
    limit,
    offset,
  }
}

/**
 * POST /api/v1/rules/{rule_id}/replay
 * Run deterministic offline fixture evaluation against a security rule. Protected.
 * @param {number|string} ruleId
 */
export async function runRuleReplay(ruleId) {
  if (!ruleId) {
    throw new ApiError('Rule ID is required to run a replay evaluation.', {
      status: 422,
      code: 'VALIDATION_ERROR',
    })
  }

  if (getApiMode() === 'real') {
    return await fetchFromBackend(`/api/v1/rules/${ruleId}/replay`, {
      method: 'POST',
      isProtected: true,
    })
  }

  const numericId = Number(ruleId)
  const rule = mockRulesState.items.find((r) => r.id === numericId)
  if (!rule) {
    throw new ApiError(`Rule with id ${ruleId} not found.`, {
      status: 404,
      code: 'NOT_FOUND',
    })
  }

  const testedAt = new Date().toISOString()
  const replayResult = {
    run_id: mockReplayRunCounter++,
    rule_id: numericId,
    fixture_version: 'lab-v1',
    benign_total: 5,
    benign_matches: 0,
    attack_total: 1,
    attack_matches: 1,
    passed: true,
    tested_at: testedAt,
  }

  // Update mock state consistently
  rule.replay_passed = true
  mockProxyStatusState.ready_for_enforce = true
  mockProxyStatusState.last_replay_at = testedAt
  mockProxyStatusState.updated_at = testedAt
  mockOverviewState.proxy.ready_for_enforce = true

  return replayResult
}

/**
 * GET /api/v1/traffic?limit=50&offset=0
 * Query recent redacted traffic events (Zone 2). Protected.
 * Accepts either { limit, offset } or separate (limit, offset) arguments.
 */
export async function getTraffic(params = {}) {
  let limit = 50
  let offset = 0

  if (typeof params === 'number') {
    limit = params
    offset = typeof arguments[1] === 'number' ? arguments[1] : 0
  } else if (params && typeof params === 'object') {
    limit = params.limit ?? 50
    offset = params.offset ?? 0
  }

  if (getApiMode() === 'real') {
    return await fetchFromBackend(`/api/v1/traffic?limit=${limit}&offset=${offset}`, {
      isProtected: true,
    })
  }

  const items = mockTrafficState.items.slice(offset, offset + limit)
  return {
    items: deepClone(items),
    total: mockTrafficState.items.length,
    limit,
    offset,
  }
}

/**
 * PUT /api/v1/proxy/mode
 * Update the proxy mode: 'off' | 'shadow' | 'enforce'. Protected.
 * Requires a current passing replay before entering 'enforce'.
 * @param {'off'|'shadow'|'enforce'} mode
 */
export async function setProxyMode(mode) {
  const validModes = ['off', 'shadow', 'enforce']
  if (!validModes.includes(mode)) {
    throw new ApiError(`Invalid mode '${mode}'. Mode must be one of: ${validModes.join(', ')}.`, {
      status: 422,
      code: 'VALIDATION_ERROR',
    })
  }

  if (getApiMode() === 'real') {
    return await fetchFromBackend('/api/v1/proxy/mode', {
      method: 'PUT',
      body: { mode },
      isProtected: true,
    })
  }

  // Mock enforcement gate check
  if (mode === 'enforce' && !mockProxyStatusState.ready_for_enforce) {
    throw new ApiError('Enforce mode requires a current passing replay.', {
      status: 409,
      code: 'REPLAY_REQUIRED',
    })
  }

  const now = new Date().toISOString()
  mockProxyStatusState.mode = mode
  mockProxyStatusState.updated_at = now
  mockOverviewState.proxy.mode = mode

  return deepClone(mockProxyStatusState)
}

/**
 * POST /api/v1/proxy/rollback
 * Instantly revert the proxy mode to 'shadow'. Protected. Idempotent.
 */
export async function rollbackProxy() {
  if (getApiMode() === 'real') {
    return await fetchFromBackend('/api/v1/proxy/rollback', {
      method: 'POST',
      isProtected: true,
    })
  }

  const now = new Date().toISOString()
  mockProxyStatusState.mode = 'shadow'
  mockProxyStatusState.updated_at = now
  mockOverviewState.proxy.mode = 'shadow'

  return {
    mode: 'shadow',
    rolled_back: true,
    message: 'Enforcement disabled; shadow logging continues.',
  }
}

/**
 * POST /api/v1/advisories/analyze
 * Analyze security advisory text (Zone 4 integration). Protected.
 * @param {{ advisory_text: string, languages?: string[], processing_mode?: 'fixture'|'llm' }} payload
 */
export async function analyzeAdvisory(payload) {
  if (!payload || !payload.advisory_text) {
    throw new ApiError('Advisory text is required for analysis.', {
      status: 422,
      code: 'VALIDATION_ERROR',
    })
  }

  if (getApiMode() === 'real') {
    return await fetchFromBackend('/api/v1/advisories/analyze', {
      method: 'POST',
      body: payload,
      isProtected: true,
    })
  }

  return deepClone(mockAdvisoriesState)
}

// Default export bundled object
export default {
  // Token management
  setAdminToken,
  clearAdminToken,
  hasAdminToken,
  subscribeAuthChange,

  // Mode configuration
  getApiMode,
  setApiMode,
  resetMockData,

  // Documented API methods
  getHealth,
  getOverview,
  getProxyStatus,
  getRules,
  runRuleReplay,
  getTraffic,
  setProxyMode,
  rollbackProxy,
  analyzeAdvisory,

  // Error class
  ApiError,
}
