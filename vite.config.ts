// C:\Projects\Scrolith\vite.config.ts
import { defineConfig, splitVendorChunkPlugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import getBackendTarget from './scripts/getBackendTarget'

// Chunk name suffix rotates after 2026-07-24 canary (immutable 404 cache poison).
const CHUNK_BUST = 'b24c'
const FRONTEND_CHUNK_RULES: Array<{ name: string; patterns: string[] }> = [
  {
    name: `react-core-${CHUNK_BUST}`,
    patterns: ['/node_modules/react/', '/node_modules/react-dom/', '/node_modules/scheduler/']
  },
  {
    name: `router-${CHUNK_BUST}`,
    patterns: ['/node_modules/react-router/', '/node_modules/react-router-dom/']
  },
  {
    name: `realtime-${CHUNK_BUST}`,
    patterns: ['/node_modules/socket.io-client/', '/node_modules/engine.io-client/']
  },
  {
    name: `charts-${CHUNK_BUST}`,
    patterns: ['/node_modules/recharts/', '/node_modules/d3-']
  },
  {
    name: `icons-${CHUNK_BUST}`,
    patterns: ['/node_modules/lucide-react/']
  },
  {
    name: `payments-${CHUNK_BUST}`,
    patterns: ['/node_modules/stripe/']
  },
  {
    name: `capacitor-${CHUNK_BUST}`,
    patterns: ['/node_modules/@capacitor/']
  }
]

const resolveManualChunk = (id: string) => {
  const normalized = id.replace(/\\/g, '/')

  for (const rule of FRONTEND_CHUNK_RULES) {
    if (rule.patterns.some((pattern) => normalized.includes(pattern))) {
      return rule.name
    }
  }

  if (!normalized.includes('/node_modules/')) return undefined

  return undefined
}

export default defineConfig({
  base: '/',
  plugins: [react(), splitVendorChunkPlugin()],
  server: (() => {
    const backendTarget = getBackendTarget();

    return {
    port: 3000,
    host: '127.0.0.1',
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path,
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              try {
                if (req && req.headers && req.headers.authorization) {
                  proxyReq.setHeader('authorization', req.headers.authorization)
                }
              } catch (e) {
                // ignore
              }
            })
          }
        },
        // Proxy only specific admin API paths (do NOT proxy '/admin' root otherwise
        // SPA admin routes will be forwarded to the backend and return "Route not found".
        '/admin/gigs-jobs': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('Vite /admin/gigs-jobs proxy error:', err)
            })
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              if (req && req.headers && req.headers.authorization) {
                proxyReq.setHeader('authorization', req.headers.authorization)
              }
            })
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('/admin/gigs-jobs proxy response:', proxyRes.statusCode, req.url)
            })
          }
        },
        '/socket.io': {
          target: backendTarget,
          changeOrigin: true,
          ws: true,
          secure: false,
          rewrite: (path) => path,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('Vite proxy error:', err)
            })
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('Proxy request:', req.method, req.url)
            })
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('Proxy response:', proxyRes.statusCode, req.url)
            })
          }
        }
      },
      hmr: {
        clientPort: 3000,
        protocol: 'ws',
        host: 'localhost'
      }
    };
  })(),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'src': path.resolve(__dirname, './src'), // Add this line
    }
  },
  css: {
    postcss: './postcss.config.cjs',
  },
  build: {
    modulePreload: {
      polyfill: true,
      resolveDependencies: (_filename, deps) =>
        deps.filter(
          (dep) => !/(^|\/)(maps|capacitor|realtime)(-b24c)?-[^/]+\.js$/.test(dep)
        )
    },
    cssCodeSplit: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: resolveManualChunk
      }
    }
  }
})


