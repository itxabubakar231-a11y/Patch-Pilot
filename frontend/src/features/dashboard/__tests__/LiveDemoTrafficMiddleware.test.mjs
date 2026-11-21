/**
 * PatchPilot — Live Demo Traffic Vite Dev-Server Proxy Middleware Unit Tests
 *
 * Verifies the narrowly scoped development proxy middleware responsible for
 * forwarding harmless demo traffic to the local security proxy on port 8080:
 * 1. Normal request (GET /demo-traffic/normal) forwards strictly to '/' and returns HTTP 200 OK.
 * 2. Demo marker (GET /demo-traffic/marker) forwards strictly to '/?demo_attack=true' and returns HTTP 403 Forbidden.
 * 3. Query parameter injection attempt is strictly stripped (target remains '/').
 * 4. Non-GET methods (POST) are rejected with HTTP 405 Method Not Allowed.
 * 5. Proxy/upstream outage returns clean HTTP 502 Bad Gateway without hanging.
 * 6. Stalled proxy timeout returns clean HTTP 504 Gateway Timeout without ERR_HTTP_HEADERS_SENT.
 */

import http from 'node:http'
import assert from 'node:assert/strict'
import { createDemoTrafficMiddleware } from '../../../../vite.config.js'

console.log('================================================================')
console.log('   RUNNING VITE DEV-SERVER PROXY MIDDLEWARE TESTS')
console.log('================================================================')

async function runTests() {
  // Create an isolated dummy proxy server simulating the port 8080 reverse proxy
  let lastReceivedUrl = null
  const dummy8080 = http.createServer((req, res) => {
    lastReceivedUrl = req.url
    if (req.url === '/') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html')
      res.end('<html>Dummy Lab 200 OK</html>')
    } else if (req.url === '/?demo_attack=true') {
      res.statusCode = 403
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Forbidden', rule: 'demo_attack' }))
    } else {
      res.statusCode = 404
      res.end('Not Found')
    }
  })

  await new Promise((resolve) => dummy8080.listen(0, '127.0.0.1', resolve))
  const dummyPort = dummy8080.address().port
  console.log(`[SETUP] Isolated dummy security proxy listening on 127.0.0.1:${dummyPort}`)

  // Create an isolated test server using the middleware
  const dummyViteServer = http.createServer(createDemoTrafficMiddleware(dummyPort))
  await new Promise((resolve) => dummyViteServer.listen(0, '127.0.0.1', resolve))
  const vitePort = dummyViteServer.address().port
  console.log(`[SETUP] Isolated test Vite middleware server listening on 127.0.0.1:${vitePort}`)

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Normal request forwards to '/' and returns 200 OK
    // -------------------------------------------------------------------------
    console.log('\n[TEST 1] GET /demo-traffic/normal...')
    {
      const res = await fetch(`http://127.0.0.1:${vitePort}/demo-traffic/normal`)
      assert.equal(res.status, 200, 'Normal request must return HTTP 200')
      assert.equal(res.headers.get('x-demo-traffic-status'), '200')
      assert.equal(lastReceivedUrl, '/', 'Target URL must be forwarded strictly to "/"')
      const body = await res.text()
      assert(body.includes('Dummy Lab 200 OK'), 'Response body must contain upstream lab content')
      console.log('   ✓ Normal request forwarded to "/" and returned HTTP 200 OK')
    }

    // -------------------------------------------------------------------------
    // TEST 2: Demo marker forwards to '/?demo_attack=true' and returns 403
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] GET /demo-traffic/marker...')
    {
      const res = await fetch(`http://127.0.0.1:${vitePort}/demo-traffic/marker`)
      assert.equal(res.status, 403, 'Demo marker in enforce mode must return HTTP 403')
      assert.equal(res.headers.get('x-demo-traffic-status'), '403')
      assert.equal(lastReceivedUrl, '/?demo_attack=true', 'Target URL must include fixed demo marker')
      const json = await res.json()
      assert.equal(json.error, 'Forbidden', 'Response must indicate Forbidden')
      console.log('   ✓ Demo marker forwarded to "/?demo_attack=true" and returned HTTP 403 Forbidden')
    }

    // -------------------------------------------------------------------------
    // TEST 3: Query parameter injection attempt is strictly stripped
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3] Query injection attempt /demo-traffic/normal?injected=malicious...')
    {
      const res = await fetch(`http://127.0.0.1:${vitePort}/demo-traffic/normal?injected=malicious`)
      assert.equal(res.status, 200)
      assert.equal(lastReceivedUrl, '/', 'Must strip client-supplied query parameter and forward strictly to "/"')
      console.log('   ✓ Query injection safely stripped and target remained "/"')
    }

    // -------------------------------------------------------------------------
    // TEST 4: Disallowed HTTP method returns 405 Method Not Allowed
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4] POST /demo-traffic/normal returns 405 Method Not Allowed...')
    {
      const res = await fetch(`http://127.0.0.1:${vitePort}/demo-traffic/normal`, { method: 'POST', body: 'hello' })
      assert.equal(res.status, 405, 'Non-GET request must return HTTP 405')
      const json = await res.json()
      assert.equal(json.error, 'Method Not Allowed')
      assert.deepEqual(json.allowed, ['GET'])
      console.log('   ✓ Non-GET method rejected with HTTP 405 Method Not Allowed')
    }

    // -------------------------------------------------------------------------
    // TEST 5: Proxy offline returns 502 Bad Gateway
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5] Upstream proxy offline returns 502 Bad Gateway...')
    {
      // Point middleware to an unused closed port (e.g. 19999)
      const offlineViteServer = http.createServer(createDemoTrafficMiddleware(19999))
      await new Promise((resolve) => offlineViteServer.listen(0, '127.0.0.1', resolve))
      const offlinePort = offlineViteServer.address().port

      try {
        const res = await fetch(`http://127.0.0.1:${offlinePort}/demo-traffic/normal`)
        assert.equal(res.status, 502, 'Unreachable proxy must return HTTP 502')
        assert.equal(res.headers.get('x-demo-traffic-error'), 'proxy_unreachable', 'Must signal proxy_unreachable header')
        const json = await res.json()
        assert.equal(json.error, 'Security Proxy Unreachable')
        console.log('   ✓ Offline proxy truthfully returned HTTP 502 Bad Gateway with proxy_unreachable header')
      } finally {
        offlineViteServer.close()
      }
    }

    // -------------------------------------------------------------------------
    // TEST 6: Proxy timeout returns 504 Gateway Timeout without ERR_HTTP_HEADERS_SENT
    // -------------------------------------------------------------------------
    console.log('\n[TEST 6] Stalled proxy timeout returns 504 Gateway Timeout...')
    {
      // Create a stalled HTTP server that accepts connections but never responds
      const stalledServer = http.createServer((req, res) => {
        // Deliberately hold connection open without writing response
      })
      await new Promise((resolve) => stalledServer.listen(0, '127.0.0.1', resolve))
      const stalledPort = stalledServer.address().port

      // Create isolated test Vite server pointing to stalledPort with a short 200ms timeout
      const timeoutViteServer = http.createServer(createDemoTrafficMiddleware(stalledPort, 200))
      await new Promise((resolve) => timeoutViteServer.listen(0, '127.0.0.1', resolve))
      const timeoutVitePort = timeoutViteServer.address().port

      let uncaughtError = null
      const onUncaught = (err) => {
        uncaughtError = err
      }
      process.on('uncaughtException', onUncaught)

      try {
        const res = await fetch(`http://127.0.0.1:${timeoutVitePort}/demo-traffic/normal`)
        assert.equal(res.status, 504, 'Stalled proxy must return HTTP 504 Gateway Timeout')
        assert.equal(res.headers.get('x-demo-traffic-error'), 'proxy_timeout', 'Must signal proxy_timeout header')
        const json = await res.json()
        assert.equal(json.error, 'Gateway Timeout')

        // Wait an additional event loop turn to verify proxyReq.destroy() does not trigger ERR_HTTP_HEADERS_SENT
        await new Promise((resolve) => setTimeout(resolve, 100))
        assert.equal(uncaughtError, null, 'Must not throw uncaught ERR_HTTP_HEADERS_SENT after destroy()')
        console.log('   ✓ Stalled proxy returned HTTP 504 Gateway Timeout without uncaught exception')
      } finally {
        process.off('uncaughtException', onUncaught)
        timeoutViteServer.close()
        stalledServer.close()
      }
    }

    console.log('\n================================================================')
    console.log('   ALL 6 VITE PROXY MIDDLEWARE TESTS PASSED (0 FAILURES)!')
    console.log('================================================================\n')
  } finally {
    dummy8080.close()
    dummyViteServer.close()
  }
}

runTests().catch((err) => {
  console.error('\n[!] Middleware test failure:', err)
  process.exit(1)
})
