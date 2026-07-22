process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.APP_RUNTIME = process.env.APP_RUNTIME || 'test';
process.env.DISABLE_BACKGROUND_WORKERS = process.env.DISABLE_BACKGROUND_WORKERS || 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'local_test_jwt_secret';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
process.env.FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
process.env.NOTIFICATION_DIGEST_CRON_ENABLED = process.env.NOTIFICATION_DIGEST_CRON_ENABLED || 'false';
process.env.NOTIFICATION_RETENTION_PURGE_ENABLED = process.env.NOTIFICATION_RETENTION_PURGE_ENABLED || 'false';

try {
  require('dotenv').config({ path: '.env.test', override: false });
} catch {
  // dotenv is best-effort for local test runs.
}
