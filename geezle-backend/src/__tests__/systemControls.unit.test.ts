import { describe, expect, test } from '@jest/globals';
import {
  normalizeMaintenancePage,
  normalizeSystemControls,
  isAdminRole,
  isKycSatisfied
} from '../services/systemControls.service';
import { generateBase32Secret, generateTotp, verifyTotp, hashBackupCode } from '../services/totp.service';

describe('system controls normalize', () => {
  test('defaults and booleans', () => {
    const c = normalizeSystemControls({});
    expect(c.maintenanceMode).toBe(false);
    expect(c.registrationsEnabled).toBe(true);
    expect(c.kycEnforced).toBe(false);
    expect(c.admin2FA).toBe(false);
    expect(c.maintenancePage.slug).toBe('maintenance');
  });

  test('parses maintenance page', () => {
    const p = normalizeMaintenancePage({ title: 'Down', message: 'Wait', contact_email: 'a@b.c' });
    expect(p.title).toBe('Down');
    expect(p.contactEmail).toBe('a@b.c');
  });

  test('admin role + kyc helpers', () => {
    expect(isAdminRole('ADMIN')).toBe(true);
    expect(isAdminRole('user')).toBe(false);
    expect(isKycSatisfied({ isVerified: true })).toBe(true);
    expect(isKycSatisfied({ kycStatus: 'VERIFIED' })).toBe(true);
    expect(isKycSatisfied({ kycStatus: 'PENDING' })).toBe(false);
  });
});

describe('totp service', () => {
  test('generate and verify window', () => {
    const secret = generateBase32Secret(20);
    expect(secret.length).toBeGreaterThan(10);
    const code = generateTotp(secret);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, '000000')).toBe(false);
  });

  test('backup code hash stable', () => {
    expect(hashBackupCode('AbCd')).toBe(hashBackupCode('abcd'));
  });
});
