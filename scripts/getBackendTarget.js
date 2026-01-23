// Utility to derive backend target for dev/prod/CI
// Returns a string (without trailing slash). In production an env var is required.

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
