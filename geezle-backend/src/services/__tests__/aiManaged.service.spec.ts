export {};

const mockPrisma: any = {
  appSetting: {
    findUnique: jest.fn(),
    upsert: jest.fn()
  },
  aiTaskOutput: {
    count: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  managedProject: {
    count: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  managedMilestone: {
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  managedAssignment: {
    create: jest.fn(),
    upsert: jest.fn()
  },
  managedEscalationRule: {
    count: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  }
};

jest.mock('../../utils/prismaClient', () => ({
  __esModule: true,
  default: mockPrisma
}));

describe('aiManaged.service', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockPrisma.appSetting.findUnique.mockResolvedValue({ data: { enabled: true, assistiveOnly: true, requireHumanApproval: true, managedDeliveryEnabled: true } });
    mockPrisma.aiTaskOutput.count.mockResolvedValue(0);
    mockPrisma.managedProject.count.mockResolvedValue(0);
    mockPrisma.managedMilestone.count.mockResolvedValue(0);
    mockPrisma.managedEscalationRule.count.mockResolvedValue(0);
  });

  test('persists explainable AI outputs with review state', async () => {
    mockPrisma.aiTaskOutput.create.mockResolvedValue({
      id: 'ai-1',
      moduleKey: 'procurement',
      humanOverrideState: 'PENDING_REVIEW',
      promptVersion: 'v2'
    });

    const service = await import('../aiManaged.service');
    const result = await service.createAiOutput({
      moduleKey: 'procurement',
      taskType: 'invoice_summary',
      entityType: 'invoice',
      promptVersion: 'v2',
      explanation: 'Matched historical invoice patterns',
      humanOverrideState: 'pending_review'
    });

    expect(mockPrisma.aiTaskOutput.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          humanOverrideState: 'PENDING_REVIEW',
          promptVersion: 'v2'
        })
      })
    );
    expect(result).toEqual(expect.objectContaining({ id: 'ai-1' }));
  });

  test('marks managed milestones approved when review state changes', async () => {
    mockPrisma.managedMilestone.update.mockResolvedValue({
      id: 'ms-1',
      status: 'APPROVED',
      approvedAt: new Date('2026-06-22T00:00:00.000Z')
    });

    const service = await import('../aiManaged.service');
    const result = await service.saveManagedMilestone({
      managedProjectId: 'project-1',
      title: 'SLA checkpoint',
      status: 'approved'
    }, 'ms-1');

    expect(mockPrisma.managedMilestone.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED'
        })
      })
    );
    expect(result).toEqual(expect.objectContaining({ status: 'APPROVED' }));
  });
});
