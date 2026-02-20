// C:\Projects\Scrolith\vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import getBackendTarget from './scripts/getBackendTarget'

export default defineConfig({
  base: '/',
  plugins: [react()],
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
        ,
        // During local dev, forward requests for the root favicon to the backend
        // so admin-uploaded favicons (served from the backend uploads folder)
        // are available at /favicon.ico in the dev server.
        '/favicon.ico': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path,
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
    modulePreload: false,
    cssCodeSplit: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Disable custom chunk partitioning for now; the previous graph created
          // circular imports that broke React initialization in production.
          return undefined;
          const normalizedId = id.replace(/\\/g, '/');
          if (normalizedId.includes('/node_modules/')) {
            if (
              normalizedId.includes('/node_modules/react/') ||
              normalizedId.includes('/node_modules/react-dom/') ||
              normalizedId.includes('/node_modules/scheduler/')
            ) return 'vendor-react-core';
            if (
              normalizedId.includes('/node_modules/react-router/') ||
              normalizedId.includes('/node_modules/react-router-dom/')
            ) return 'vendor-router';
            if (normalizedId.includes('/node_modules/socket.io-client/')) return 'vendor-socket';
            if (normalizedId.includes('/node_modules/lucide-react/')) return 'vendor-icons';
            if (normalizedId.includes('/node_modules/react-icons/')) return 'vendor-icons';
            if (normalizedId.includes('/node_modules/recharts/')) return 'vendor-charts';
            if (normalizedId.includes('/node_modules/axios/')) return 'vendor-http';
            if (
              normalizedId.includes('/node_modules/dayjs/') ||
              normalizedId.includes('/node_modules/date-fns/') ||
              normalizedId.includes('/node_modules/moment/')
            ) return 'vendor-date';
            if (
              normalizedId.includes('/node_modules/lodash/') ||
              normalizedId.includes('/node_modules/lodash-es/')
            ) return 'vendor-utils';
            if (normalizedId.includes('/node_modules/@capacitor/') || normalizedId.includes('/node_modules/capacitor/')) return 'vendor-capacitor';
            return 'vendor';
          }

          if (normalizedId.includes('/src/dashboard/admin/ai-intelligence/')) {
            const sectionMatch = normalizedId.match(/\/src\/dashboard\/admin\/ai-intelligence\/([^/?#]+)\.(tsx|ts|jsx|js)$/);
            if (sectionMatch?.[1]) {
              const safeName = sectionMatch[1].replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
              return `app-admin-ai-${safeName}`;
            }
            return 'app-admin-ai-sections';
          }

          if (normalizedId.includes('/src/services/ai/')) {
            return 'app-admin-ai-services';
          }

          if (normalizedId.includes('/src/dashboard/admin/')) {
            const fileMatch = normalizedId.match(/\/src\/dashboard\/admin\/([^/?#]+)\.(tsx|ts|jsx|js)$/);
            if (fileMatch?.[1]) {
              const safeName = fileMatch[1].replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
              return `app-admin-${safeName}`;
            }
            return 'app-admin-core';
          }
          if (normalizedId.includes('/src/dashboard/freelancer/')) return 'app-dashboard-freelancer';
          if (normalizedId.includes('/src/dashboard/employer/')) return 'app-dashboard-employer';
          if (normalizedId.includes('/src/dashboard/shared/')) return 'app-dashboard-shared';
          if (normalizedId.includes('/src/dashboard/')) return 'app-dashboard-core';
          if (normalizedId.includes('/src/messages/')) return 'app-messages';
          if (normalizedId.includes('/src/community/')) return 'app-community';
          if (normalizedId.includes('/src/mobile/home/components/SearchScreen.')) return 'app-mobile-search';
          if (normalizedId.includes('/src/mobile/home/components/MobileHomeSheets.')) return 'app-mobile-sheets';
          if (normalizedId.includes('/src/mobile/')) return 'app-mobile';
        }
      }
    }
  }
})

