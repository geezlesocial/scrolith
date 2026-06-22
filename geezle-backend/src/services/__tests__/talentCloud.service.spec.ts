export {};

const mockPrisma: any = {
  appSetting: {
    findUnique: jest.fn(),
    upsert: jest.fn()
  },
  talentPool: {
    count: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  talentPoolMember: {
    count: jest.fn(),
    upsert: jest.fn()
  },
  vendorRequirement: {
    count: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  integrationEndpoint: {
    count: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn()
  },
  webhookDeliveryLog: {
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn()
  },
  apiCredential: {
    count: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn()
  }
};

jest.mock('../../utils/prismaClient', () => ({
  __esModule: true,
  default: mockPrisma
}));

describe('talentCloud.service', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockPrisma.appSetting.findUnique.mockResolvedValue({ data: { enabled: true, manualInvitesOnly: true, webhooksEnabled: true } });
    mockPrisma.talentPool.count.mockResolvedValue(0);
    mockPrisma.talentPoolMember.count.mockResolvedValue(0);
    mockPrisma.vendorRequirement.count.mockResolvedValue(0);
    mockPrisma.integrationEndpoint.count.mockResolvedValue(0);
    mockPrisma.integrationEndpoint.findMany.mockResolvedValue([]);
    mockPrisma.webhookDeliveryLog.count.mockResolvedValue(0);
    mockPrisma.webhookDeliveryLog.findMany.mockResolvedValue([]);
    mockPrisma.apiCredential.count.mockResolvedValue(0);
  });

  test('queues signed webhook deliveries for active endpoints', async () => {
    mockPrisma.integrationEndpoint.findUnique.mockResolvedValue({
      id: 'endpoint-1',
      secretHash: 'stored-secret',
      status: 'ACTIVE',
      metadata: {}
    });
    mockPrisma.webhookDeliveryLog.create.mockResolvedValue({
      id: 'delivery-1',
      status: 'QUEUED',
      signature: 'signature'
    });

    const service = await import('../talentCloud.service');
    const result = await service.queueWebhookDelivery('endpoint-1', 'invoice.approved', { hello: 'world' });

    expect(mockPrisma.webhookDeliveryLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          endpointId: 'endpoint-1',
          eventType: 'invoice.approved',
          status: 'QUEUED'
        })
      })
    );
    expect(result).toEqual(expect.objectContaining({ status: 'QUEUED' }));
  });

  test('moves webhook deliveries toward dead-letter after repeated retries', async () => {
    mockPrisma.webhookDeliveryLog.findUnique.mockResolvedValue({
      id: 'delivery-1',
      attempts: 4,
      status: 'FAILED'
    });
    mockPrisma.webhookDeliveryLog.update.mockResolvedValue({
      id: 'delivery-1',
      attempts: 5,
      status: 'DEAD_LETTER'
    });

    const service = await import('../talentCloud.service');
    const result = await service.retryWebhookDelivery('delivery-1');

    expect(mockPrisma.webhookDeliveryLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attempts: 5,
          status: 'DEAD_LETTER'
        })
      })
    );
    expect(result).toEqual(expect.objectContaining({ status: 'DEAD_LETTER' }));
  });

  test('dispatches queued webhook deliveries and marks them delivered', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200
    } as any);

    mockPrisma.webhookDeliveryLog.findUnique.mockResolvedValue({
      id: 'delivery-2',
      endpointId: 'endpoint-2',
      eventType: 'invoice.approved',
      payload: { ok: true },
      attempts: 0,
      signature: 'sig',
      endpoint: {
        id: 'endpoint-2',
        targetUrl: 'https://example.com/hook',
        status: 'ACTIVE',
        retryPolicy: { maxAttempts: 5, backoffMinutes: 15 },
        deadLetterEnabled: true,
        secretHash: 'stored-secret',
        metadata: { webhookSecret: 'enc::abcd' }
      }
    });
    mockPrisma.webhookDeliveryLog.update.mockResolvedValue({
      id: 'delivery-2',
      status: 'DELIVERED',
      attempts: 1,
      endpoint: {
        id: 'endpoint-2',
        metadata: { webhookSecret: 'enc::abcd' }
      }
    });

    const service = await import('../talentCloud.service');
    const result = await service.dispatchWebhookDelivery('delivery-2');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-scrolith-event': 'invoice.approved',
          'x-scrolith-delivery-id': 'delivery-2'
        })
      })
    );
    expect(result).toEqual(expect.objectContaining({ status: 'DELIVERED' }));
  });
});
