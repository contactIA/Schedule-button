import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function buildRes(nodeRes) {
  let statusCode = 200

  const json = (data) => {
    if (!nodeRes.headersSent) {
      nodeRes.writeHead(statusCode, { 'Content-Type': 'application/json' })
    }
    nodeRes.end(JSON.stringify(data))
  }

  nodeRes.status = (code) => {
    statusCode = code
    return { json }
  }
  nodeRes.json = json
  return nodeRes
}

function localApiPlugin() {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/clinicorp')) return next()

        buildRes(res)

        // Parse query string
        const urlObj = new URL(req.url, 'http://localhost')
        req.query = Object.fromEntries(urlObj.searchParams)

        // Parse JSON body for POST
        if (req.method === 'POST') {
          req.body = await new Promise((resolve) => {
            let raw = ''
            req.on('data', chunk => { raw += chunk })
            req.on('end', () => {
              try { resolve(JSON.parse(raw)) } catch { resolve({}) }
            })
          })
        }

        try {
          // Usa URL absoluta (file://) para garantir resolução correta em ESM
          const handlerUrl = pathToFileURL(resolve(__dirname, 'api/clinicorp.js')).href
          const { default: handler } = await import(handlerUrl)
          await handler(req, res)
        } catch (err) {
          console.error('[local-api] Erro no handler Clinicorp:', err)
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.message }))
          }
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), localApiPlugin()],
  server: {
    port: 5175,
    proxy: {
      '/api/core': {
        target: 'https://api.wts.chat',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },
      '/api/crm': {
        target: 'https://api.wts.chat',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
