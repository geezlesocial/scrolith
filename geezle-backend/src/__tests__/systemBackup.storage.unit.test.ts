import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import { getSystemBackupRuntimeMeta } from '../services/systemBackup.service';

const KEYS = [
  'SYSTEM_BACKUP_STORAGE_DRIVER',
  'BACKUP_STORAGE_DRIVER',
  'UPLOAD_DRIVER',
  'STORAGE_DRIVER',
  'K_SERVICE',
  'GOOGLE_CLOUD_PROJECT',
  'NODE_ENV'
];

const snapshot: Record<string, string | undefined> = {};

describe('system backup durable storage selection', () => {
  beforeEach(() => {
    for (const key of KEYS) {
      snapshot[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    }
  });

  test('Cloud Run + GCS media defaults to durable database storage', () => {
    process.env.K_SERVICE = 'scrolith-backend';
    process.env.UPLOAD_DRIVER = 'gcs';
    process.env.NODE_ENV = 'production';
    const meta = getSystemBackupRuntimeMeta();
    expect(meta.storageDriver).toBe('database');
    expect(meta.durable).toBe(true);
    expect(meta.portable).toBe(true);
  });

  test('explicit local override still works for dev', () => {
    process.env.SYSTEM_BACKUP_STORAGE_DRIVER = 'local';
    process.env.K_SERVICE = 'scrolith-backend';
    const meta = getSystemBackupRuntimeMeta();
    expect(meta.storageDriver).toBe('local');
    expect(meta.durable).toBe(false);
  });

  test('explicit database driver', () => {
    process.env.SYSTEM_BACKUP_STORAGE_DRIVER = 'database';
    const meta = getSystemBackupRuntimeMeta();
    expect(meta.storageDriver).toBe('database');
    expect(meta.durable).toBe(true);
  });
});
