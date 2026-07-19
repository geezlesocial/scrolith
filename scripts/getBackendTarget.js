// Utility to derive backend target for dev/prod/CI
// Returns a string (without trailing slash). In production an env var is required.
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const loadEnvFile = (filename) => {
  const filePath = path.resolve(process.cwd(), filename);
  if (fs.existsSync(filePath)) {
    // Keep precedence aligned with Vite: later files override earlier ones.
    dotenv.config({ path: filePath, override: true });
  }
};

// Mimic Vite env loading order for build-time config scripts.
// Phase 20.11: treat `vite build` / npm run build as production so release
// bundles never inherit VITE_DEBUG / localhost from the developer .env.
loadEnvFile('.env');
loadEnvFile('.env.local');
const isBuild =
  process.argv.includes('build') || process.env.npm_lifecycle_event === 'build';
const mode = isBuild ? 'production' : (process.env.NODE_ENV || 'development');
loadEnvFile(`.env.${mode}`);
loadEnvFile(`.env.${mode}.local`);

const getBackendTarget = () => {
  const env = process.env.VITE_BACKEND_URL || process.env.BACKEND_URL || process.env.BACKEND;
  if (process.env.NODE_ENV === 'production' && !env) {
    throw new Error('VITE_BACKEND_URL or BACKEND_URL must be set in production');
  }
  // In development, fall back to localhost dev server. Centralize the fallback here
  // so other scripts and configs don't duplicate literals.
  const fallback = 'http://localhost:5000';
  return String((env || (process.env.NODE_ENV === 'production' ? undefined : fallback))).replace(/\/$/, '');
};

export default getBackendTarget;
