export {};

const mockPrisma: any = {
  approvalPolicy: {
    upsert: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn()
  },
  approvalRequest: {
    count: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn()
  },
  $transaction: jest.fn()
};

jest.mock('../../utils/prismaClient', () => ({
  __esModule: true,
  default: mockPrisma
}));

describe('approvalPolicy.service', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockPrisma.approvalPolicy.upsert.mockResolvedValue({});
    mockPrisma.approvalPolicy.findMany.mockResolvedValue([]);
    mockPrisma.approvalPolicy.count.mockResolvedValue(0);
    mockPrisma.approvalRequest.count.mockResolvedValue(0);
  });

  test('creates a custom approval policy', async () => {
    mockPrisma.approvalPolicy.create.mockResolvedValue({
      id: 'policy-1',
      moduleKey: 'settings',
      actionKey: 'enterprise_change',
      entityType: 'platform_settings',
      label: 'Platform changes',
      description: 'Govern platform setting updates',
      mode: 'AUDIT_ONLY',
      minApprovals: 2,
      isSystemPolicy: false,
      isActive: true,
      conditions: null,
      createdByStaffId: 'staff-1',
      updatedByStaffId: 'staff-1',
      createdAt: new Date('2026-06-22T00:00:00.000Z'),
      updatedAt: new Date('2026-06-22T00:00:00.000Z'),
      _count: { requests: 0 }
    });

    const service = await import('../approvalPolicy.service');
    const result = await service.saveApprovalPolicy(
      {
        moduleKey: 'settings',
        actionKey: 'enterprise_change',
        entityType: 'platform_settings',
        label: 'Platform changes',
        description: 'Govern platform setting updates',
        minApprovals: 2
      },
      'staff-1'
    );

    expect(mockPrisma.approvalPolicy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          moduleKey: 'settings',
          actionKey: 'enterprise_change',
          entityType: 'platform_settings',
          minApprovals: 2,
          createdByStaffId: 'staff-1'
        })
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'policy-1',
        label: 'Platform changes',
        minApprovals: 2
      })
    );
  });

  test('creates a pending approval request when the resolved policy is enforced', async () => {
    mockPrisma.approvalPolicy.findFirst.mockResolvedValue({
      id: 'policy-enforced',
      moduleKey: 'payouts',
      actionKey: 'release',
      entityType: 'payout',
      mode: 'ENFORCED'
    });
    mockPrisma.approvalRequest.create.mockResolvedValue({
      id: 'request-1',
      policyId: 'policy-enforced',
      moduleKey: 'payouts',
      actionKey: 'release',
      entityType: 'payout',
      entityId: 'po_1',
      status: 'PENDING',
      title: 'Payout release',
      summary: 'Release payout',
      requestedByUserId: 'user-1',
      requestedByStaffId: 'staff-1',
      decidedByStaffId: null,
      decisionReason: null,
      observedOnly: false,
      payload: { amount: 100 },
      metadata: { mode: 'ENFORCED' },
      requestedAt: new Date('2026-06-22T00:00:00.000Z'),
      decidedAt: null,
      createdAt: new Date('2026-06-22T00:00:00.000Z'),
      updatedAt: new Date('2026-06-22T00:00:00.000Z'),
      policy: { id: 'policy-enforced', label: 'Payout release', mode: 'ENFORCED', minApprovals: 1 }
    });

    const service = await import('../approvalPolicy.service');
    const result = await service.createApprovalObservation({
      moduleKey: 'payouts',
      actionKey: 'release',
      entityType: 'payout',
      entityId: 'po_1',
      title: 'Payout release',
      summary: 'Release payout',
      requestedByUserId: 'user-1',
      requestedByStaffId: 'staff-1',
      payload: { amount: 100 }
    });

    expect(mockPrisma.approvalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          observedOnly: false
        })
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'request-1',
        status: 'PENDING',
        observedOnly: false
      })
    );
  });
});
