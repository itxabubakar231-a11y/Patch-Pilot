import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import http from 'node:http'

/**
 * Core HTTP proxy middleware handler for live demo traffic.
 *
 * Real destination is fixed to 127.0.0.1:8080 by default.
 * Dynamic target ports are accepted exclusively for isolated automated unit tests.
 *
 * @param {number} [targetPort=8080] Destination port on 127.0.0.1
 * @returns {import('node:http').RequestListener} Connect/Vite-compatible middleware
 */
export function createDemoTrafficMiddleware(targetPort = 8080) {
  return (req, res, next) => {
    const urlPath = (req.url || '').split('?')[0]
    if (urlPath !== '/demo-traffic/normal' && urlPath !== '/demo-traffic/marker') {
      if (typeof next === 'function') {
        return next()
      }
      res.statusCode = 404
      res.end('Not Found')
      return
    }

    if (req.method !== 'GET') {
      res.statusCode = 405
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Method Not Allowed', allowed: ['GET'] }))
      return
    }

    const targetPath = urlPath === '/demo-traffic/normal' ? '/' : '/?demo_attack=true'
    const options = {
      hostname: '127.0.0.1',
      port: targetPort,
      path: targetPath,
      method: 'GET',
      headers: {
        'User-Agent': 'PatchPilot-LiveDemo/1.0',
        'Accept': 'text/html,application/json,*/*',
      },
      timeout: 4000,
    }

    const proxyReq = http.request(options, (proxyRes) => {
      res.statusCode = proxyRes.statusCode || 500
      res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'text/plain')
      res.setHeader('X-Demo-Traffic-Status', String(proxyRes.statusCode || 500))
      proxyRes.pipe(res)
    })

    proxyReq.on('timeout', () => {
      proxyReq.destroy()
      res.statusCode = 504
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('X-Demo-Traffic-Error', 'proxy_timeout')
      res.end(JSON.stringify({
        error: 'Gateway Timeout',
        message: `Proxy request timed out on 127.0.0.1:${targetPort}`,
        target: `127.0.0.1:${targetPort}`,
      }))
    })

    proxyReq.on('error', (err) => {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('X-Demo-Traffic-Error', 'proxy_unreachable')
      res.end(JSON.stringify({
        error: 'Security Proxy Unreachable',
        message: err.message,
        target: `127.0.0.1:${targetPort}`,
      }))
    })

    proxyReq.end()
  }
}

/**
 * Narrowly scoped Vite dev-server proxy plugin for Live Demo Traffic Controls.
 * Forwards strictly two predefined, harmless GET requests to the local security proxy on 127.0.0.1:8080:
 * 1. /demo-traffic/normal -> http://127.0.0.1:8080/
 * 2. /demo-traffic/marker -> http://127.0.0.1:8080/?demo_attack=true
 *
 * Real destination is strictly fixed to 127.0.0.1:8080.
 */
export function demoTrafficPlugin(targetPort = 8080) {
  return {
    name: 'patchpilot-demo-traffic-proxy',
    configureServer(server) {
      server.middlewares.use(createDemoTrafficMiddleware(targetPort))
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), demoTrafficPlugin()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
