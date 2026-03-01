
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const publicBase = (env.VITE_PUBLIC_BASE || '/').trim() || '/';
  return {
    // scrolith.com serves the app at root; keep '/' unless explicitly overridden.
    base: publicBase.startsWith('/') ? publicBase : `/${publicBase}`,
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:5000',
          changeOrigin: true,
          secure: false,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }
      }
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': __dirname,
      }
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
    }
  };
});
