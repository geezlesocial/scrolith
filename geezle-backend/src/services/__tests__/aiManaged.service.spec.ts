export {};

const mockPrisma: any = {
  $transaction: jest.fn(),
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
    findUnique: jest.fn(),
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

const mockPublishIntegrationEvent = jest.fn();

jest.mock('../talentCloud.service', () => ({
  __esModule: true,
  publishIntegrationEvent: (...args: any[]) => mockPublishIntegrationEvent(...args)
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
    mockPrisma.$transaction.mockImplementation(async (operations: any[]) => Promise.all(operations));
    mockPrisma.managedProject.findUnique.mockResolvedValue({
      id: 'project-1',
      title: 'Managed project',
      entityType: 'CONTRACT',
      entityId: 'contract-1',
      status: 'ACTIVE',
      slaStatus: 'ON_TRACK',
      riskLevel: 'LOW',
      metadata: {},
      milestones: [],
      assignments: []
    });
    mockPrisma.managedProject.update.mockImplementation(async ({ where, data }: any) => ({
      id: where.id,
      title: 'Managed project',
      entityType: 'CONTRACT',
      entityId: 'contract-1',
      ...data
    }));
    mockPublishIntegrationEvent.mockResolvedValue({ matchedEndpointCount: 0, deliveryIds: [] });
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
    expect(mockPrisma.managedProject.update).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ status: 'APPROVED' }));
  });

  test('syncs managed project health from linked entity milestones', async () => {
    mockPrisma.managedProject.findMany.mockResolvedValue([
      {
        id: 'project-1',
        title: 'Managed project',
        entityType: 'CONTRACT',
        entityId: 'contract-1',
        status: 'ACTIVE',
        slaStatus: 'ON_TRACK',
        riskLevel: 'LOW',
        metadata: {},
        assignments: [{ id: 'assign-1' }],
        milestones: [
          {
            id: 'milestone-1',
            status: 'DRAFT',
            qaStatus: 'PENDING',
            metadata: { contractMilestoneId: 'contract-ms-1' }
          }
        ]
      }
    ]);
    mockPrisma.managedMilestone.update.mockResolvedValue({
      id: 'milestone-1',
      managedProjectId: 'project-1',
      status: 'APPROVED',
      qaStatus: 'PASSED',
      approvedAt: new Date('2026-06-22T00:00:00.000Z')
    });
    mockPrisma.managedProject.findUnique.mockResolvedValue({
      id: 'project-1',
      title: 'Managed project',
      entityType: 'CONTRACT',
      entityId: 'contract-1',
      status: 'ACTIVE',
      slaStatus: 'ON_TRACK',
      riskLevel: 'LOW',
      metadata: {},
      assignments: [{ id: 'assign-1' }],
      milestones: [
        {
          id: 'milestone-1',
          status: 'APPROVED',
          qaStatus: 'PASSED',
          approvedAt: new Date('2026-06-22T00:00:00.000Z'),
          metadata: { contractMilestoneId: 'contract-ms-1' }
        }
      ]
    });

    const service = await import('../aiManaged.service');
    const result = await service.syncManagedProjectsForEntity('contract', 'contract-1', {
      milestoneId: 'contract-ms-1',
      status: 'approved'
    });

    expect(mockPrisma.managedMilestone.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'milestone-1' },
        data: expect.objectContaining({
          status: 'APPROVED',
          qaStatus: 'PASSED'
        })
      })
    );
    expect(mockPrisma.managedProject.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'project-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          slaStatus: 'ACHIEVED'
        })
      })
    );
    expect(result).toHaveLength(1);
  });
});
