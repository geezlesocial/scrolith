import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, jest, test, beforeEach } from '@jest/globals';

jest.mock('../utils/prismaClient', () => ({
  __esModule: true,
  default: { permissionDecisionLog: { create: jest.fn() } }
}));
jest.mock('../services/securityAlert.service', () => ({ createSecurityAlert: jest.fn() }));
jest.mock('../services/adminAudit.service', () => ({ writeAdminAuditEvent: jest.fn() }));
jest.mock('../services/rbac.service', () => ({
  ensureRbacSeeded: jest.fn(),
  getStaffContext: jest.fn(),
  isAdminRole: jest.fn(),
  ensureAdminStaffProfile: jest.fn()
}));
jest.mock('../services/humanVerification', () => ({
  HumanVerificationService: { updateSettings: jest.fn() }
}));

import { requireAnyPermission, requirePermission } from '../middleware/rbac.middleware';
import { updateHumanVerificationSettings } from '../controllers/admin.humanVerification.controller';
import { HumanVerificationService } from '../services/humanVerification';

const routeSource = readFileSync(join(__dirname, '../routes/admin/index.ts'), 'utf8');
const updateSettings = HumanVerificationService.updateSettings as any;

const makeRequest = (method: string, permissions: string[]) => ({
  method,
  path: '/security/human-verification/settings',
  originalUrl: `/api/admin/security/human-verification/settings`,
  headers: {},
  user: { id: 'staff-user', role: 'STAFF', email: 'staff@example.test' },
  staffContext: {
    isAdmin: false,
    staffId: 'staff-1',
    status: 'ACTIVE',
    roleActive: true,
    roleName: 'Settings Reviewer',
    permissions: new Set(permissions)
  }
});

const makeResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const executeWriteRoute = async (method: 'PATCH' | 'PUT', permissions: string[]) => {
  const req = makeRequest(method, permissions) as any;
  const res = makeResponse();
  const next = jest.fn(async () => updateHumanVerificationSettings(req, res));
  await requirePermission('settings.enterprise_change')(req, res, next as any);
  return { req, res, next };
};

describe('Human Verification admin settings route authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateSettings.mockImplementation(() => Promise.resolve({ masterEnabled: false }));
  });

  test('GET remains readable with settings.read while PATCH and PUT require the write permission only', () => {
    expect(routeSource).toMatch(/router\.get\(\s*'\/security\/human-verification\/settings',\s*requireAnyPermission\('settings\.read',\s*'settings\.enterprise_change'\),\s*getHumanVerificationSettings\s*\)/);
    for (const method of ['patch', 'put']) {
      const route = routeSource.match(new RegExp(`router\\.${method}\\(\\s*'\\/security\\/human-verification\\/settings',[\\s\\S]*?\\n\\);`));
      expect(route?.[0]).toContain("requirePermission('settings.enterprise_change')");
      expect(route?.[0]).not.toContain("settings.read");
      expect(route?.[0]).toContain('updateHumanVerificationSettings');
    }
  });

  test.each(['PATCH', 'PUT'] as const)('%s denies settings.read-only access before the update controller or service', async (method) => {
    const { res, next } = await executeWriteRoute(method, ['settings.read']);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  test.each(['PATCH', 'PUT'] as const)('%s permits active staff with settings.enterprise_change', async (method) => {
    const { res, next } = await executeWriteRoute(method, ['settings.enterprise_change']);
    expect(next).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { masterEnabled: false } });
  });

  test('GET read middleware permits an active settings.read user', async () => {
    const req = makeRequest('GET', ['settings.read']) as any;
    const res = makeResponse();
    const next = jest.fn();
    await requireAnyPermission('settings.read', 'settings.enterprise_change')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('inactive staff remains denied even with the write permission', async () => {
    const req = makeRequest('PATCH', ['settings.enterprise_change']) as any;
    req.staffContext.status = 'INACTIVE';
    const res = makeResponse();
    const next = jest.fn();
    await requirePermission('settings.enterprise_change')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(updateSettings).not.toHaveBeenCalled();
  });
});
