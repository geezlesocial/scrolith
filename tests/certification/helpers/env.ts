import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const CERT_BASE_URL =
  process.env.CERT_BASE_URL ||
  process.env.P2115_BASE_URL ||
  'https://p2115---scrolith-frontend-25ysnpjdda-as.a.run.app';

export const CERT_STORAGE_STATE =
  process.env.CERT_STORAGE_STATE || join(here, '../fixtures/storage-state.json');

export const CERT_EMAIL = process.env.CERT_EMAIL || process.env.SCROLITH_CERT_EMAIL || '';
export const CERT_PASSWORD = process.env.CERT_PASSWORD || process.env.SCROLITH_CERT_PASSWORD || '';

export const FEED_IDENTITY_MS = Math.max(
  5_000,
  Number(process.env.CERT_FEED_IDENTITY_MS || 60_000) || 60_000
);

export const hasAuthStorage = () => existsSync(CERT_STORAGE_STATE);

export const hasAuthCredentials = () => Boolean(CERT_EMAIL && CERT_PASSWORD);

export const canRunAuthenticated = () => hasAuthStorage() || hasAuthCredentials();

export const requireAuthOrSkip = (test: { skip: (condition?: boolean, description?: string) => void }) => {
  if (!canRunAuthenticated()) {
    test.skip(
      true,
      'Authenticated cert requires CERT_STORAGE_STATE file or CERT_EMAIL + CERT_PASSWORD'
    );
  }
};
