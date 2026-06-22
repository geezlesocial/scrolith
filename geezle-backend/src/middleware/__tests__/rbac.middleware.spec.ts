jest.mock('../../utils/prismaClient', () => ({
  __esModule: true,
  default: {
    permissionDecisionLog: {
      create: jest.fn()
    }
  }
}));

jest.mock('../../services/securityAlert.service', () => ({
  createSecurityAlert: jest.fn()
}));

jest.mock('../../services/adminAudit.service', () => ({
  writeAdminAuditEvent: jest.fn()
}));

jest.mock('../../services/rbac.service', () => ({
  ensureRbacSeeded: jest.fn().mockResolvedValue(undefined),
  getStaffContext: jest.fn(),
  isAdminRole: jest.fn().mockReturnValue(false),
  ensureAdminStaffProfile: jest.fn().mockResolvedValue('staff-1')
}));

import prisma from '../../utils/prismaClient';
import { createSecurityAlert } from '../../services/securityAlert.service';
import { writeAdminAuditEvent } from '../../services/adminAudit.service';
import { getStaffContext } from '../../services/rbac.service';
import { requirePermission } from '../rbac.middleware';

const mockPrisma = prisma as unknown as {
  permissionDecisionLog: { create: jest.Mock };
};

const mockGetStaffContext = getStaffContext as jest.Mock;
const mockCreateSecurityAlert = createSecurityAlert as jest.Mock;
const mockWriteAdminAuditEvent = writeAdminAuditEvent as jest.Mock;

const createResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('requirePermission deny-path governance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStaffContext.mockResolvedValue({
      isAdmin: false,
      staffId: 'staff-1',
      status: 'ACTIVE',
      roleActive: true,
      roleName: 'Finance Admin',
      permissions: new Set<string>()
    });
    mockWriteAdminAuditEvent.mockResolvedValue({ id: 'audit-1' });
    mockCreateSecurityAlert.mockResolvedValue({ id: 'alert-1' });
  });

  test('logs denied sensitive access and raises a security alert', async () => {
    const req: any = {
      method: 'GET',
      path: '/api/admin/audit/events',
      originalUrl: '/api/admin/audit/events',
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'jest',
        'x-forwarded-for': '127.0.0.1'
      },
      user: {
        id: 'user-1',
        role: 'ADMIN'
      }
    };
    const res = createResponse();
    const next = jest.fn();

    await requirePermission('audit.read')(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.permissionDecisionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          permissionKey: 'audit.read',
          decision: 'DENY'
        })
      })
    );
    expect(mockWriteAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleKey: 'rbac',
        actionKey: 'audit.read',
        status: 'denied'
      })
    );
    expect(mockCreateSecurityAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'RBAC_DENIED_ACTION',
        entityType: 'admin_route'
      })
    );
  });
});
