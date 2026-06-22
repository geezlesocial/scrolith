export {};

const mockPrisma: any = {
  appSetting: {
    findUnique: jest.fn(),
    upsert: jest.fn()
  },
  complianceCase: {
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn()
  },
  complianceAppeal: {
    count: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn()
  },
  holdAction: {
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  riskRule: {
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn()
  },
  riskScoreSnapshot: {
    count: jest.fn(),
    create: jest.fn()
  },
  complianceEvidence: {
    create: jest.fn()
  },
  complianceDecisionLog: {
    create: jest.fn()
  }
};

jest.mock('../../utils/prismaClient', () => ({
  __esModule: true,
  default: mockPrisma
}));

describe('compliance.service', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockPrisma.appSetting.findUnique.mockResolvedValue({ data: { enabled: true, shadowMode: true, autoHoldHighConfidence: true, defaultSlaHours: 24 } });
    mockPrisma.complianceCase.count.mockResolvedValue(0);
    mockPrisma.complianceAppeal.count.mockResolvedValue(0);
    mockPrisma.holdAction.count.mockResolvedValue(0);
    mockPrisma.riskRule.count.mockResolvedValue(0);
    mockPrisma.riskScoreSnapshot.count.mockResolvedValue(0);
    mockPrisma.riskRule.findMany.mockResolvedValue([]);
    mockPrisma.complianceAppeal.findMany.mockResolvedValue([]);
  });

  test('scores high risk entities based on signals', async () => {
    mockPrisma.riskScoreSnapshot.create.mockResolvedValue({
      id: 'risk-1',
      entityType: 'transaction',
      entityId: 'txn-1',
      score: 93,
      level: 'CRITICAL'
    });

    const service = await import('../compliance.service');
    const result = await service.createRiskSnapshot({
      entityType: 'transaction',
      entityId: 'txn-1',
      signals: {
        unusualVelocity: true,
        repeatDisputes: true,
        suspiciousPaymentPatterns: true,
        highRiskListingKeywords: true
      }
    });

    expect(mockPrisma.riskScoreSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          level: 'CRITICAL'
        })
      })
    );
    expect(result).toEqual(expect.objectContaining({ level: 'CRITICAL' }));
  });

  test('releases active holds with audit metadata preserved', async () => {
    mockPrisma.holdAction.update.mockResolvedValue({
      id: 'hold-1',
      status: 'RELEASED',
      metadata: { source: 'test' }
    });

    const service = await import('../compliance.service');
    const result = await service.releaseHoldAction('hold-1', { source: 'test' });

    expect(mockPrisma.holdAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'hold-1' },
        data: expect.objectContaining({
          status: 'RELEASED'
        })
      })
    );
    expect(result).toEqual(expect.objectContaining({ status: 'RELEASED' }));
  });
});
