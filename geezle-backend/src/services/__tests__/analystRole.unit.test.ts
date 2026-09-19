import {
  ANALYST_PERMISSION_KEYS,
  isAnalystPermission,
  isAnalystMfaRequiredByPolicy,
  isAnalystRole
} from '../analystRole';
import { isAdminRole } from '../rbac.service';
import { Role } from '@prisma/client';
import { buildAuthClaims } from '../authClaims';

describe('runtime ANALYST role policy', () => {
  test('recognizes ANALYST without classifying it as ADMIN', () => {
    expect(isAnalystRole('ANALYST')).toBe(true);
    expect(isAnalystRole(' analyst ')).toBe(true);
    expect(isAnalystRole('ADMIN')).toBe(false);
    expect(isAdminRole('ANALYST')).toBe(false);
  });

  test('does not change existing application-role classification boundaries', () => {
    for (const role of ['MODERATOR', 'EMPLOYER', 'FREELANCER', 'USER', 'GUEST']) {
      expect(isAnalystRole(role)).toBe(false);
      expect(isAdminRole(role)).toBe(false);
    }
    expect(isAdminRole('ADMIN')).toBe(true);
  });

  test('preserves ANALYST in issued authentication claims', () => {
    expect(buildAuthClaims({ id: 'synthetic-id', email: 'analyst@example.invalid', role: Role.ANALYST })).toEqual({
      id: 'synthetic-id',
      email: 'analyst@example.invalid',
      role: Role.ANALYST
    });
  });

  test('preserves existing role claims without remapping', () => {
    for (const role of [Role.ADMIN, Role.MODERATOR, Role.EMPLOYER, Role.FREELANCER, Role.USER]) {
      expect(buildAuthClaims({ id: 'synthetic-id', email: 'user@example.invalid', role }).role).toBe(role);
    }
  });

  test('requires MFA for Analyst only through the explicit analyst policy', () => {
    expect(isAnalystMfaRequiredByPolicy('ANALYST', true)).toBe(true);
    expect(isAnalystMfaRequiredByPolicy('ANALYST', false)).toBe(false);
    expect(isAnalystMfaRequiredByPolicy('MODERATOR', true)).toBe(false);
  });

  test('issues a bounded read-only governance/analytics permission set', () => {
    expect(ANALYST_PERMISSION_KEYS).toContain('audit.read');
    expect(ANALYST_PERMISSION_KEYS).toContain('budgets.read');
    expect(ANALYST_PERMISSION_KEYS).toContain('security.alerts.read');
    expect(ANALYST_PERMISSION_KEYS.every((key) => key.endsWith('.read'))).toBe(true);
  });

  test('denies administrative, moderation, financial mutation, secret, and destructive permissions', () => {
    for (const denied of [
      'users.update',
      'users.delete',
      'users.moderate',
      'rbac.roles.update',
      'community.posts.moderate',
      'payouts.release',
      'users.wallets.manage',
      'api_keys.read',
      'api_keys.manage',
      'config.write',
      'config.rollback',
      'settings.update',
      'security.alerts.manage'
    ]) {
      expect(isAnalystPermission(denied)).toBe(false);
    }
  });
});
