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
  privateOpportunityAccess: {
    findMany: jest.fn()
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
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn()
  }
};

jest.mock('../../utils/prismaClient', () => ({
  __esModule: true,
  default: mockPrisma
}));

describe('talentCloud.service', () => {
  beforeEach(() => {
    process.env.WEBHOOK_ALLOWED_HOSTS = 'example.com';
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
    mockPrisma.apiCredential.findFirst.mockResolvedValue(null);
    mockPrisma.apiCredential.findMany.mockResolvedValue([]);
    mockPrisma.privateOpportunityAccess.findMany.mockResolvedValue([]);
  });

  test('queues signed webhook deliveries for active endpoints', async () => {
    mockPrisma.integrationEndpoint.findUnique.mockResolvedValue({
      id: 'endpoint-1',
      secretHash: 'hash-only',
      status: 'ACTIVE',
      metadata: { webhookSecret: 'stored-secret' }
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

  test('sanitizes event types with bounded linear parsing', async () => {
    const service = await import('../talentCloud.service');
    expect(service.sanitizeEventType('invoice...approved')).toBe('invoice.approved');
    expect(service.sanitizeEventType('invoice <script> approved')).toBe('invoice.script.approved');
    expect(service.sanitizeEventType('.'.repeat(20_000))).toBe('');
    expect(service.sanitizeEventType('a'.repeat(2_000))).toHaveLength(128);
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
      expect.any(URL),
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

  test('publishes integration events to matching endpoints using wildcards', async () => {
    mockPrisma.integrationEndpoint.findMany.mockResolvedValue([
      {
        id: 'endpoint-a',
        status: 'ACTIVE',
        type: 'WEBHOOK',
        eventTypes: ['procurement.*'],
        secretHash: 'hash-a',
        metadata: { webhookSecret: 'secret-a' }
      },
      {
        id: 'endpoint-b',
        status: 'ACTIVE',
        type: 'WEBHOOK',
        eventTypes: ['managed_delivery.project.created'],
        secretHash: 'hash-b',
        metadata: { webhookSecret: 'secret-b' }
      }
    ]);
    mockPrisma.integrationEndpoint.findUnique.mockImplementation(async ({ where }: any) => ({
      id: where.id,
      status: 'ACTIVE',
      type: 'WEBHOOK',
      secretHash: `hash-${where.id}`,
      metadata: { webhookSecret: 'secret-forwarder' }
    }));
    mockPrisma.webhookDeliveryLog.create
      .mockResolvedValueOnce({ id: 'delivery-a' })
      .mockResolvedValueOnce({ id: 'delivery-b' });

    const service = await import('../talentCloud.service');
    const result = await service.publishIntegrationEvent('procurement.invoice.approved', { invoiceId: 'inv-1' });

    expect(mockPrisma.webhookDeliveryLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.webhookDeliveryLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          endpointId: 'endpoint-a',
          eventType: 'procurement.invoice.approved'
        })
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        matchedEndpointCount: 1,
        deliveryIds: ['delivery-a']
      })
    );
  });

  test('accepts inbound connector events and forwards them into webhook delivery', async () => {
    mockPrisma.integrationEndpoint.findUnique.mockResolvedValue({
      id: 'connector-1',
      name: 'ERP Connector',
      type: 'INBOUND_CONNECTOR',
      status: 'ACTIVE',
      eventTypes: ['invoice.*'],
      secretHash: 'hash-connector',
      metadata: {
        providerKey: 'erp',
        authMode: 'HEADER',
        authHeaderName: 'x-scrolith-connector-key',
        connectorApiKey: 'abcd',
        connectorSharedSecret: 'shared-secret',
        receivedCount: 0
      }
    });
    mockPrisma.integrationEndpoint.findUnique.mockImplementation(async ({ where }: any) => where.id === 'connector-1'
      ? { id: 'connector-1', name: 'ERP Connector', type: 'INBOUND_CONNECTOR', status: 'ACTIVE', eventTypes: ['invoice.*'], secretHash: 'hash-connector', metadata: { providerKey: 'erp', authMode: 'HEADER', authHeaderName: 'x-scrolith-connector-key', connectorApiKey: 'abcd', connectorSharedSecret: 'shared-secret', receivedCount: 0 } }
      : { id: where.id, status: 'ACTIVE', type: 'WEBHOOK', secretHash: 'hash-forwarder', metadata: { webhookSecret: 'secret-forwarder' } });
    mockPrisma.integrationEndpoint.findMany.mockResolvedValue([
      {
        id: 'endpoint-forwarder',
        status: 'ACTIVE',
        type: 'WEBHOOK',
        eventTypes: ['connector.erp.*', 'integrations.connector.ingested'],
        secretHash: 'hash-forwarder',
        metadata: { webhookSecret: 'secret-forwarder' }
      }
    ]);
    mockPrisma.integrationEndpoint.update.mockResolvedValue({
      id: 'connector-1',
      metadata: { receivedCount: 1 }
    });
    mockPrisma.webhookDeliveryLog.create
      .mockResolvedValueOnce({ id: 'delivery-connector-event' })
      .mockResolvedValueOnce({ id: 'delivery-connector-audit' });

    const service = await import('../talentCloud.service');
    const result = await service.ingestInboundConnectorEvent(
      'connector-1',
      { 'x-scrolith-connector-key': 'abcd' },
      { eventType: 'invoice.approved', invoiceId: 'inv-4' }
    );

    expect(mockPrisma.integrationEndpoint.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'connector-1' },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            lastEventType: 'invoice.approved',
            receivedCount: 1
          })
        })
      })
    );
    expect(mockPrisma.webhookDeliveryLog.create).toHaveBeenCalledTimes(2);
    expect(result).toEqual(
      expect.objectContaining({
        accepted: true,
        providerKey: 'erp',
        forwardedEventType: 'connector.erp.invoice.approved'
      })
    );
  });

  test('stamps lastUsedAt when inbound connector ingestion uses an API credential', async () => {
    mockPrisma.integrationEndpoint.findUnique.mockResolvedValue({
      id: 'connector-2',
      name: 'ERP Connector',
      type: 'INBOUND_CONNECTOR',
      status: 'ACTIVE',
      eventTypes: ['invoice.*'],
      secretHash: 'hash-connector',
      metadata: {
        providerKey: 'erp',
        authMode: 'HEADER',
        authHeaderName: 'x-scrolith-connector-key',
        connectorApiKey: 'abcd',
        connectorSharedSecret: 'shared-secret',
        receivedCount: 0
      }
    });
    mockPrisma.apiCredential.findFirst.mockResolvedValue({
      id: 'cred-live-1',
      name: 'Enterprise Ingest Key',
      keyPrefix: 'sk_123456789',
      secretHash: 'stored-hash',
      scopes: ['talent_cloud.manage'],
      status: 'ACTIVE',
      metadata: {}
    });
    mockPrisma.apiCredential.update.mockResolvedValue({
      id: 'cred-live-1',
      name: 'Enterprise Ingest Key',
      keyPrefix: 'sk_123456789',
      secretHash: 'stored-hash',
      scopes: ['talent_cloud.manage'],
      status: 'ACTIVE',
      lastUsedAt: new Date('2026-06-24T12:00:00.000Z'),
      metadata: {}
    });
    mockPrisma.integrationEndpoint.findUnique.mockImplementation(async ({ where }: any) => where.id === 'connector-2'
      ? { id: 'connector-2', name: 'ERP Connector', type: 'INBOUND_CONNECTOR', status: 'ACTIVE', eventTypes: ['invoice.*'], secretHash: 'hash-connector', metadata: { providerKey: 'erp', authMode: 'HEADER', authHeaderName: 'x-scrolith-connector-key', connectorApiKey: 'abcd', connectorSharedSecret: 'shared-secret', receivedCount: 0 } }
      : { id: where.id, status: 'ACTIVE', type: 'WEBHOOK', secretHash: 'hash-forwarder', metadata: { webhookSecret: 'secret-forwarder' } });
    mockPrisma.integrationEndpoint.findMany.mockResolvedValue([
      {
        id: 'endpoint-forwarder',
        status: 'ACTIVE',
        type: 'WEBHOOK',
        eventTypes: ['connector.erp.*', 'integrations.connector.ingested'],
        secretHash: 'hash-forwarder',
        metadata: { webhookSecret: 'secret-forwarder' }
      }
    ]);
    mockPrisma.integrationEndpoint.update.mockResolvedValue({
      id: 'connector-2',
      metadata: { receivedCount: 1 }
    });
    mockPrisma.webhookDeliveryLog.create
      .mockResolvedValueOnce({ id: 'delivery-connector-event' })
      .mockResolvedValueOnce({ id: 'delivery-connector-audit' });

    const service = await import('../talentCloud.service');
    const result = await service.ingestInboundConnectorEvent(
      'connector-2',
      { 'x-scrolith-api-key': 'sk_1234567890abcdefghijklmnop' },
      { eventType: 'invoice.approved', invoiceId: 'inv-8' }
    );

    expect(mockPrisma.apiCredential.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          keyPrefix: 'sk_123456789'
        })
      })
    );
    expect(mockPrisma.apiCredential.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cred-live-1' },
        data: expect.objectContaining({
          lastUsedAt: expect.any(Date)
        })
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        accepted: true,
        connectorId: 'connector-2'
      })
    );
  });

  test('rejects API credentials without ingest scope', async () => {
    mockPrisma.apiCredential.findFirst.mockResolvedValue({
      id: 'cred-live-2',
      name: 'Read Only Key',
      keyPrefix: 'sk_readonly1',
      secretHash: 'stored-hash',
      scopes: ['talent_cloud.read'],
      status: 'ACTIVE',
      metadata: { webhookSecret: 'secret-connector' }
    });

    const service = await import('../talentCloud.service');

    await expect(
      service.authenticateApiCredential('sk_readonly1234567890abcdef', ['integrations.ingest', 'integrations.manage', 'talent_cloud.manage'])
    ).rejects.toThrow('API credential scope is not allowed');
  });

  test('returns inbound connector status for read-scoped API credentials and stamps usage', async () => {
    mockPrisma.apiCredential.findFirst.mockResolvedValue({
      id: 'cred-read-1',
      name: 'Read Status Key',
      keyPrefix: 'sk_status1234',
      secretHash: 'stored-hash',
      scopes: ['talent_cloud.read'],
      status: 'ACTIVE',
      metadata: { webhookSecret: 'secret-forwarder' }
    });
    mockPrisma.apiCredential.update.mockResolvedValue({
      id: 'cred-read-1',
      name: 'Read Status Key',
      keyPrefix: 'sk_status1234',
      secretHash: 'stored-hash',
      scopes: ['talent_cloud.read'],
      status: 'ACTIVE',
      lastUsedAt: new Date('2026-06-24T14:00:00.000Z'),
      metadata: { webhookSecret: 'secret-forwarder' }
    });
    mockPrisma.integrationEndpoint.findUnique.mockResolvedValue({
      id: 'connector-read-1',
      name: 'ERP Connector',
      type: 'INBOUND_CONNECTOR',
      status: 'ACTIVE',
      eventTypes: ['invoice.*', 'refund.*'],
      updatedAt: new Date('2026-06-24T13:30:00.000Z'),
      metadata: {
        providerKey: 'erp',
        authMode: 'HEADER',
        authHeaderName: 'x-scrolith-connector-key',
        lastReceivedAt: '2026-06-24T13:00:00.000Z',
        lastEventType: 'invoice.approved',
        receivedCount: 7
      }
    });

    const service = await import('../talentCloud.service');
    const result = await service.getInboundConnectorStatus('connector-read-1', {
      'x-scrolith-api-key': 'sk_status1234abcdefghijklmnop'
    });

    expect(mockPrisma.apiCredential.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cred-read-1' },
        data: expect.objectContaining({
          lastUsedAt: expect.any(Date)
        })
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'connector-read-1',
        providerKey: 'erp',
        authMode: 'HEADER',
        allowedEventTypes: ['invoice.*', 'refund.*'],
        lastEventType: 'invoice.approved',
        receivedCount: 7
      })
    );
  });

  test('returns an enterprise talent cloud snapshot for read-scoped API credentials', async () => {
    mockPrisma.apiCredential.findFirst.mockResolvedValue({
      id: 'cred-read-2',
      name: 'Enterprise Snapshot Key',
      keyPrefix: 'sk_snapshot1',
      secretHash: 'stored-hash',
      scopes: ['talent_cloud.read'],
      status: 'ACTIVE',
      metadata: { webhookSecret: 'secret-forwarder' }
    });
    mockPrisma.apiCredential.update.mockResolvedValue({
      id: 'cred-read-2',
      name: 'Enterprise Snapshot Key',
      keyPrefix: 'sk_snapshot1',
      secretHash: 'stored-hash',
      scopes: ['talent_cloud.read'],
      status: 'ACTIVE',
      lastUsedAt: new Date('2026-06-24T15:00:00.000Z'),
      metadata: {}
    });
    mockPrisma.talentPool.findMany.mockResolvedValue([
      {
        id: 'pool-1',
        name: 'Acme Preferred Designers',
        slug: 'acme-preferred-designers',
        visibility: 'PRIVATE',
        isActive: true,
        members: [],
        privateAccessRules: []
      }
    ]);
    mockPrisma.vendorRequirement.findMany.mockResolvedValue([
      {
        id: 'vr-1',
        code: 'KYC-2',
        name: 'KYC Tier 2',
        isActive: true
      }
    ]);
    mockPrisma.privateOpportunityAccess.findMany.mockResolvedValue([
      {
        id: 'access-1',
        entityType: 'job',
        entityId: 'job-1',
        poolId: 'pool-1',
        visibilityScope: 'POOL_ONLY',
        pool: { id: 'pool-1', name: 'Acme Preferred Designers' }
      }
    ]);

    const service = await import('../talentCloud.service');
    const result = await service.getEnterpriseTalentCloudSnapshot({
      'x-scrolith-api-key': 'sk_snapshot1abcdefghijklmnop'
    });

    expect(mockPrisma.apiCredential.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cred-read-2' },
        data: expect.objectContaining({
          lastUsedAt: expect.any(Date)
        })
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        credential: expect.objectContaining({
          id: 'cred-read-2',
          name: 'Enterprise Snapshot Key',
          keyPrefix: 'sk_snapshot1'
        }),
        summary: expect.objectContaining({
          pools: expect.any(Number)
        }),
        settings: expect.objectContaining({
          enabled: expect.any(Boolean)
        }),
        pools: expect.any(Array),
        vendorRequirements: expect.any(Array),
        accessRules: expect.any(Array)
      })
    );
  });

  test('creates API credentials with creator metadata and rotation timestamp', async () => {
    mockPrisma.apiCredential.create.mockImplementation(async ({ data }: any) => ({
      id: 'cred-1',
      ...data,
      createdAt: '2026-06-24T12:00:00.000Z',
      updatedAt: '2026-06-24T12:00:00.000Z'
    }));

    const service = await import('../talentCloud.service');
    const result = await service.createApiCredential({
      name: 'Acme API',
      scopes: ['talent_cloud.read'],
      metadata: {
        createdBy: {
          id: 'admin-1',
          email: 'admin@example.com',
          name: 'Admin User'
        }
      }
    });

    expect(mockPrisma.apiCredential.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Acme API',
          metadata: expect.objectContaining({
            createdBy: expect.objectContaining({
              id: 'admin-1',
              email: 'admin@example.com'
            }),
            lastRotatedAt: expect.any(String)
          })
        })
      })
    );
    expect(result.record).toEqual(
      expect.objectContaining({
        createdBy: expect.objectContaining({
          id: 'admin-1',
          email: 'admin@example.com'
        }),
        lastRotatedAt: expect.any(String)
      })
    );
    expect(result.plainKey).toEqual(expect.stringMatching(/^sk_/));
  });

  test('lists API credentials with masked history metadata', async () => {
    mockPrisma.apiCredential.findMany.mockResolvedValue([
      {
        id: 'cred-2',
        name: 'Finance Connector',
        keyPrefix: 'sk_abcd1234',
        secretHash: 'hash',
        scopes: ['talent_cloud.read'],
        status: 'ACTIVE',
        lastUsedAt: '2026-06-23T10:00:00.000Z',
        metadata: {
          createdBy: {
            id: 'admin-2',
            email: 'ops@example.com',
            name: 'Ops Admin'
          },
          lastRotatedAt: '2026-06-22T08:00:00.000Z'
        }
      }
    ]);

    const service = await import('../talentCloud.service');
    const result = await service.listApiCredentials();

    expect(result).toEqual([
      expect.objectContaining({
        id: 'cred-2',
        createdBy: expect.objectContaining({
          id: 'admin-2',
          email: 'ops@example.com'
        }),
        lastRotatedAt: '2026-06-22T08:00:00.000Z',
        lastUsedAt: '2026-06-23T10:00:00.000Z'
      })
    ]);
  });
});
