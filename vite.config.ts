// C:\Projects\geezle\vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import getBackendTarget from './scripts/getBackendTarget'

export default defineConfig({
  plugins: [react()],
  server: (() => {
    const backendTarget = getBackendTarget();

    return {
      port: 3000,
      host: true,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path,
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
  }
})
