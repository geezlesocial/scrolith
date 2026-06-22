jest.mock('../../utils/prismaClient', () => ({
  __esModule: true,
  default: {
    appSetting: {
      findUnique: jest.fn(),
      upsert: jest.fn()
    }
  }
}));

jest.mock('../../services/enterpriseGovernance.service', () => ({
  recordGovernedAdminAction: jest.fn()
}));

import prisma from '../../utils/prismaClient';
import { recordGovernedAdminAction } from '../../services/enterpriseGovernance.service';
import { updateSystemSettings } from '../admin.systemSettings.controller';

const mockPrisma = prisma as unknown as {
  appSetting: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
  };
};

const mockRecordGovernedAdminAction = recordGovernedAdminAction as jest.Mock;

const createResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('updateSystemSettings governance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.appSetting.findUnique.mockResolvedValue({
      scope: 'system',
      data: {
        maintenanceMode: false,
        registrationsEnabled: true,
        kycEnforced: false,
        admin2FA: false,
        currency: { baseCurrency: 'USD' },
        currencies: [{ code: 'USD', isActive: true }],
        email: { port: 587 },
        aiConfig: { safety: { maxTokens: 2048 } }
      }
    });
    mockPrisma.appSetting.upsert.mockImplementation(async ({ create, update }: any) => ({
      scope: 'system',
      data: update?.data || create?.data
    }));
    mockRecordGovernedAdminAction.mockResolvedValue({ auditEvent: { id: 'audit-1' } });
  });

  test('records governed admin action after a successful system settings mutation', async () => {
    const emit = jest.fn();
    const req: any = {
      body: {
        maintenanceMode: true,
        registrationsEnabled: false,
        currency: { baseCurrency: 'USD' },
        currencies: [{ code: 'USD', isActive: true }],
        email: { port: 587 },
        aiConfig: { safety: { maxTokens: 2048 } }
      },
      app: {
        get: jest.fn().mockImplementation((key: string) => (key === 'io' ? { emit } : undefined)),
        set: jest.fn()
      },
      user: {
        id: 'user-1',
        role: 'ADMIN'
      }
    };
    const res = createResponse();

    await updateSystemSettings(req as any, res as any);

    expect(mockPrisma.appSetting.upsert).toHaveBeenCalled();
    expect(mockRecordGovernedAdminAction).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        moduleKey: 'settings',
        actionKey: 'system_settings_update',
        entityType: 'system_settings'
      })
    );
    expect(emit).toHaveBeenCalledWith(
      'settings:updated',
      expect.objectContaining({ scope: 'system' })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true
      })
    );
  });
});
