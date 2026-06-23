import crypto from 'crypto';
import prisma from '../utils/prismaClient';
import { encryptSecret, maybeDecryptSecret } from '../utils/secretCipher';

const SETTINGS_SCOPE = 'talent_cloud_phase4';

const DEFAULT_SETTINGS = {
  enabled: false,
  manualInvitesOnly: true,
  webhooksEnabled: true
};

const cleanString = (value: unknown) => String(value || '').trim();
const randomToken = (prefix: string, size = 24) => `${prefix}_${crypto.randomBytes(size).toString('hex')}`;
const hashValue = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const signPayload = (payload: any, secret: string) =>
  crypto.createHmac('sha256', secret).update(JSON.stringify(payload || {})).digest('hex');
const WEBHOOK_SECRET_KEY = 'webhookSecret';
const CONNECTOR_SHARED_SECRET_KEY = 'connectorSharedSecret';
const CONNECTOR_API_KEY_KEY = 'connectorApiKey';
const GLOBAL_WEBHOOK_EVENT = '*';

const stripWebhookSecret = (metadata: any) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return metadata || null;
  const next = { ...(metadata || {}) };
  delete next[WEBHOOK_SECRET_KEY];
  delete next[CONNECTOR_SHARED_SECRET_KEY];
  delete next[CONNECTOR_API_KEY_KEY];
  return next;
};

const sanitizeEndpoint = (endpoint: any) => {
  if (!endpoint) return endpoint;
  return {
    ...endpoint,
    metadata: stripWebhookSecret(endpoint.metadata)
  };
};

const getStoredWebhookSecret = (endpoint: any) =>
  maybeDecryptSecret(endpoint?.metadata?.[WEBHOOK_SECRET_KEY]) || '';

const getStoredConnectorSharedSecret = (endpoint: any) =>
  maybeDecryptSecret(endpoint?.metadata?.[CONNECTOR_SHARED_SECRET_KEY]) || '';

const getStoredConnectorApiKey = (endpoint: any) =>
  maybeDecryptSecret(endpoint?.metadata?.[CONNECTOR_API_KEY_KEY]) || '';

const toEventTypes = (value: any): string[] =>
  Array.isArray(value)
    ? value.map((entry) => cleanString(entry)).filter(Boolean)
    : [];

const eventMatches = (eventType: string, subscriptions: string[]) => {
  const normalizedEvent = cleanString(eventType).toLowerCase();
  if (!normalizedEvent) return false;
  if (!subscriptions.length) return true;
  return subscriptions.some((entry) => {
    const candidate = cleanString(entry).toLowerCase();
    if (!candidate) return false;
    if (candidate === GLOBAL_WEBHOOK_EVENT) return true;
    if (candidate.endsWith('.*')) return normalizedEvent.startsWith(candidate.slice(0, -1));
    return candidate === normalizedEvent;
  });
};

export const getTalentCloudSettings = async () => {
  const record = await prisma.appSetting.findUnique({ where: { scope: SETTINGS_SCOPE } });
  return {
    enabled: record?.data?.enabled !== false,
    manualInvitesOnly: record?.data?.manualInvitesOnly !== false,
    webhooksEnabled: record?.data?.webhooksEnabled !== false
  };
};

export const updateTalentCloudSettings = async (input: any) => {
  const normalized = {
    enabled: input?.enabled !== false,
    manualInvitesOnly: input?.manualInvitesOnly !== false,
    webhooksEnabled: input?.webhooksEnabled !== false
  };
  await prisma.appSetting.upsert({
    where: { scope: SETTINGS_SCOPE },
    create: { scope: SETTINGS_SCOPE, data: normalized },
    update: { data: normalized }
  });
  return normalized;
};

export const getTalentCloudSummary = async () => {
  const [pools, members, requirements, integrations, deliveriesQueued, apiKeys] = await Promise.all([
    prisma.talentPool.count({ where: { isActive: true } }),
    prisma.talentPoolMember.count({ where: { status: 'ACTIVE' } }),
    prisma.vendorRequirement.count({ where: { isActive: true } }),
    prisma.integrationEndpoint.count({ where: { status: 'ACTIVE' } }),
    prisma.webhookDeliveryLog.count({ where: { status: { in: ['QUEUED', 'RETRYING'] } } }),
    prisma.apiCredential.count({ where: { status: 'ACTIVE' } })
  ]);
  return { pools, members, requirements, integrations, deliveriesQueued, apiKeys };
};

export const listTalentPools = async () =>
  prisma.talentPool.findMany({
    include: { members: true, privateAccessRules: true },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }]
  });

export const saveTalentPool = async (input: any, id?: string) => {
  const name = cleanString(input.name);
  const slug = cleanString(input.slug);
  if (!name) throw new Error('name is required');
  if (!slug) throw new Error('slug is required');
  const data = {
    name,
    slug,
    description: cleanString(input.description) || null,
    visibility: cleanString(input.visibility || 'PRIVATE').toUpperCase(),
    isActive: input.isActive !== false,
    metadata: input.metadata || null
  };
  if (id) return prisma.talentPool.update({ where: { id }, data });
  return prisma.talentPool.create({ data });
};

export const saveTalentPoolMember = async (input: any) => {
  const poolId = cleanString(input.poolId);
  const userId = cleanString(input.userId);
  if (!poolId) throw new Error('poolId is required');
  if (!userId) throw new Error('userId is required');
  return prisma.talentPoolMember.upsert({
    where: { poolId_userId: { poolId, userId } },
    create: {
      poolId,
      userId,
      membershipType: cleanString(input.membershipType || 'APPROVED').toUpperCase(),
      status: cleanString(input.status || 'ACTIVE').toUpperCase(),
      invitedByStaffId: cleanString(input.invitedByStaffId) || null,
      tags: input.tags || null,
      scorecard: input.scorecard || null,
      internalNotes: cleanString(input.internalNotes) || null
    },
    update: {
      membershipType: cleanString(input.membershipType || 'APPROVED').toUpperCase(),
      status: cleanString(input.status || 'ACTIVE').toUpperCase(),
      invitedByStaffId: cleanString(input.invitedByStaffId) || null,
      tags: input.tags || null,
      scorecard: input.scorecard || null,
      internalNotes: cleanString(input.internalNotes) || null
    }
  });
};

export const savePrivateAccessRule = async (input: any) =>
  prisma.privateOpportunityAccess.create({
    data: {
      entityType: cleanString(input.entityType),
      entityId: cleanString(input.entityId),
      poolId: cleanString(input.poolId),
      visibilityScope: cleanString(input.visibilityScope || 'POOL_ONLY').toUpperCase(),
      metadata: input.metadata || null
    }
  });

export const listPrivateAccessRules = async () =>
  prisma.privateOpportunityAccess.findMany({
    include: { pool: true },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
  });

export const updatePrivateAccessRule = async (id: string, input: any) => {
  const accessRuleId = cleanString(id);
  if (!accessRuleId) throw new Error('access rule id is required');
  return prisma.privateOpportunityAccess.update({
    where: { id: accessRuleId },
    data: {
      entityType: cleanString(input.entityType),
      entityId: cleanString(input.entityId),
      poolId: cleanString(input.poolId),
      visibilityScope: cleanString(input.visibilityScope || 'POOL_ONLY').toUpperCase(),
      metadata: input.metadata || null
    },
    include: { pool: true }
  });
};

export const listVendorRequirements = async () =>
  prisma.vendorRequirement.findMany({ where: {}, orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] });

export const saveVendorRequirement = async (input: any, id?: string) => {
  const code = cleanString(input.code);
  const name = cleanString(input.name);
  if (!code) throw new Error('code is required');
  if (!name) throw new Error('name is required');
  const data = {
    code,
    name,
    requiredDocuments: input.requiredDocuments || null,
    requiredKycTier: cleanString(input.requiredKycTier) || null,
    requiredComplianceChecks: input.requiredComplianceChecks || null,
    requireContractAcceptance: input.requireContractAcceptance === true,
    isActive: input.isActive !== false,
    metadata: input.metadata || null
  };
  if (id) return prisma.vendorRequirement.update({ where: { id }, data });
  return prisma.vendorRequirement.create({ data });
};

export const listIntegrationEndpoints = async () =>
  (await prisma.integrationEndpoint.findMany({
    include: { webhookDeliveries: { orderBy: { createdAt: 'desc' }, take: 10 } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }]
  })).map(sanitizeEndpoint);

export const saveIntegrationEndpoint = async (input: any, id?: string) => {
  const secretPlain = cleanString(input.secretPlain) || randomToken('whsec', 16);
  const previous = id ? await prisma.integrationEndpoint.findUnique({ where: { id } }) : null;
  const existingMetadata =
    previous?.metadata && typeof previous.metadata === 'object' && !Array.isArray(previous.metadata)
      ? { ...(previous.metadata as Record<string, any>) }
      : {};
  const inputMetadata =
    input?.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? { ...(input.metadata as Record<string, any>) }
      : {};
  const data = {
    name: cleanString(input.name),
    type: cleanString(input.type || 'WEBHOOK').toUpperCase(),
    targetUrl: cleanString(input.targetUrl) || null,
    eventTypes: input.eventTypes || [],
    secretHash: hashValue(secretPlain),
    status: cleanString(input.status || 'ACTIVE').toUpperCase(),
    retryPolicy: input.retryPolicy || { maxAttempts: 5, backoffMinutes: 15 },
    deadLetterEnabled: input.deadLetterEnabled !== false,
    metadata: {
      ...existingMetadata,
      ...inputMetadata,
      [WEBHOOK_SECRET_KEY]: encryptSecret(secretPlain)
    }
  };
  if (!data.name) throw new Error('name is required');
  const endpoint = id
    ? await prisma.integrationEndpoint.update({ where: { id }, data })
    : await prisma.integrationEndpoint.create({ data });
  return { ...sanitizeEndpoint(endpoint), secretPlain };
};

const sanitizeEventType = (value: unknown) =>
  cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9.*:_-]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '');

const sanitizeConnectorMetadata = (input: any, previous?: any) => {
  const existingMetadata =
    previous?.metadata && typeof previous.metadata === 'object' && !Array.isArray(previous.metadata)
      ? { ...(previous.metadata as Record<string, any>) }
      : {};
  const inputMetadata =
    input?.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? { ...(input.metadata as Record<string, any>) }
      : {};
  return { ...existingMetadata, ...inputMetadata };
};

export const listInboundConnectors = async () =>
  (await prisma.integrationEndpoint.findMany({
    where: { type: 'INBOUND_CONNECTOR' },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }]
  })).map(sanitizeEndpoint);

export const saveInboundConnector = async (input: any, id?: string) => {
  const previous = id ? await prisma.integrationEndpoint.findUnique({ where: { id } }) : null;
  const metadata = sanitizeConnectorMetadata(input, previous);
  const rotateCredentials = input?.rotateCredentials === true;
  const sharedSecretPlain = cleanString(input?.sharedSecretPlain) || (rotateCredentials || !previous ? randomToken('connsec', 16) : '');
  const apiKeyPlain = cleanString(input?.apiKeyPlain) || (rotateCredentials || !previous ? randomToken('connkey', 16) : '');
  const providerKey = cleanString(input?.providerKey || metadata.providerKey || 'custom')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-');
  const authMode = cleanString(input?.authMode || metadata.authMode || 'bearer').toUpperCase();
  const authHeaderName = cleanString(input?.authHeaderName || metadata.authHeaderName || 'x-scrolith-connector-key');
  const data = {
    name: cleanString(input?.name || previous?.name),
    type: 'INBOUND_CONNECTOR',
    targetUrl: cleanString(input?.targetUrl || previous?.targetUrl) || null,
    eventTypes: toEventTypes(input?.eventTypes ?? previous?.eventTypes),
    secretHash: hashValue([providerKey, sharedSecretPlain || getStoredConnectorSharedSecret(previous), apiKeyPlain || getStoredConnectorApiKey(previous)].join(':')),
    status: cleanString(input?.status || previous?.status || 'ACTIVE').toUpperCase(),
    retryPolicy: input?.retryPolicy || previous?.retryPolicy || { mode: 'ACK_ONLY', maxAttempts: 1 },
    deadLetterEnabled: input?.deadLetterEnabled === true,
    metadata: {
      ...metadata,
      providerKey,
      authMode,
      authHeaderName,
      lastReceivedAt: metadata.lastReceivedAt || null,
      lastEventType: metadata.lastEventType || null,
      receivedCount: Number(metadata.receivedCount || 0),
      [CONNECTOR_SHARED_SECRET_KEY]: sharedSecretPlain
        ? encryptSecret(sharedSecretPlain)
        : previous?.metadata?.[CONNECTOR_SHARED_SECRET_KEY] || null,
      [CONNECTOR_API_KEY_KEY]: apiKeyPlain
        ? encryptSecret(apiKeyPlain)
        : previous?.metadata?.[CONNECTOR_API_KEY_KEY] || null
    }
  };
  if (!data.name) throw new Error('name is required');
  const connector = previous
    ? await prisma.integrationEndpoint.update({ where: { id: previous.id }, data })
    : await prisma.integrationEndpoint.create({ data });
  return {
    ...sanitizeEndpoint(connector),
    sharedSecretPlain: sharedSecretPlain || undefined,
    apiKeyPlain: apiKeyPlain || undefined
  };
};

const readHeaderValue = (headers: Record<string, any>, name: string) => {
  const normalizedName = cleanString(name).toLowerCase();
  const direct = headers?.[normalizedName] ?? headers?.[name];
  return Array.isArray(direct) ? cleanString(direct[0]) : cleanString(direct);
};

const verifyInboundConnectorAuth = (endpoint: any, headers: Record<string, any>) => {
  const metadata = endpoint?.metadata || {};
  const authMode = cleanString(metadata.authMode || 'bearer').toUpperCase();
  const sharedSecret = getStoredConnectorSharedSecret(endpoint);
  const apiKey = getStoredConnectorApiKey(endpoint);
  if (authMode === 'HEADER') {
    const headerName = cleanString(metadata.authHeaderName || 'x-scrolith-connector-key');
    const provided = readHeaderValue(headers, headerName);
    if (!provided || provided !== apiKey) throw new Error('Invalid connector API key');
    return;
  }
  const authorization = readHeaderValue(headers, 'authorization');
  const token = authorization.replace(/^bearer\s+/i, '').trim();
  if (!token || (token !== apiKey && token !== sharedSecret)) throw new Error('Invalid connector bearer token');
};

export const ingestInboundConnectorEvent = async (endpointId: string, headers: Record<string, any>, payload: any) => {
  const endpoint = await prisma.integrationEndpoint.findUnique({ where: { id: endpointId } });
  if (!endpoint || cleanString(endpoint.type).toUpperCase() !== 'INBOUND_CONNECTOR') {
    throw new Error('Inbound connector not found');
  }
  if (cleanString(endpoint.status).toUpperCase() !== 'ACTIVE') throw new Error('Inbound connector is not active');

  verifyInboundConnectorAuth(endpoint, headers || {});

  const providerKey = cleanString(endpoint?.metadata?.providerKey || endpoint.name || 'custom')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-');
  const rawEventType =
    cleanString(payload?.eventType || payload?.type || readHeaderValue(headers || {}, 'x-scrolith-event') || 'event.received');
  const normalizedEventType = sanitizeEventType(rawEventType) || 'event.received';
  if (endpoint.eventTypes?.length && !eventMatches(normalizedEventType, toEventTypes(endpoint.eventTypes))) {
    throw new Error('Connector event type is not allowed');
  }

  const metadata = {
    ...(endpoint.metadata && typeof endpoint.metadata === 'object' && !Array.isArray(endpoint.metadata)
      ? (endpoint.metadata as Record<string, any>)
      : {}),
    lastReceivedAt: new Date().toISOString(),
    lastEventType: normalizedEventType,
    receivedCount: Number((endpoint.metadata as any)?.receivedCount || 0) + 1,
    lastPayloadSample:
      payload && typeof payload === 'object'
        ? JSON.parse(JSON.stringify(payload)).data || payload
        : payload || null
  };

  await prisma.integrationEndpoint.update({
    where: { id: endpoint.id },
    data: { metadata }
  });

  const forwardedEventType = `connector.${providerKey}.${normalizedEventType}`;
  await publishIntegrationEvent(forwardedEventType, {
    connectorId: endpoint.id,
    connectorName: endpoint.name,
    providerKey,
    sourceEventType: normalizedEventType,
    payload: payload || null
  });
  await publishIntegrationEvent('integrations.connector.ingested', {
    connectorId: endpoint.id,
    connectorName: endpoint.name,
    providerKey,
    sourceEventType: normalizedEventType
  });

  return {
    accepted: true,
    connectorId: endpoint.id,
    providerKey,
    sourceEventType: normalizedEventType,
    forwardedEventType
  };
};

export const queueWebhookDelivery = async (endpointId: string, eventType: string, payload: any) => {
  const endpoint = await prisma.integrationEndpoint.findUnique({ where: { id: endpointId } });
  if (!endpoint) throw new Error('Integration endpoint not found');
  if (cleanString(endpoint.status).toUpperCase() !== 'ACTIVE') throw new Error('Integration endpoint is not active');
  const secretPlain = cleanString(payload?.secretPlain);
  const storedSecret = getStoredWebhookSecret(endpoint);
  const signature = signPayload(payload, secretPlain || storedSecret || endpoint.secretHash || 'scrolith');
  return prisma.webhookDeliveryLog.create({
    data: {
      endpointId,
      eventType: cleanString(eventType),
      payload: payload || null,
      signature,
      status: 'QUEUED',
      attempts: 0,
      nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000)
    }
  });
};

export const publishIntegrationEvent = async (
  eventType: string,
  payload: any,
  metadata?: Record<string, any> | null
) => {
  const normalizedEvent = cleanString(eventType);
  if (!normalizedEvent) throw new Error('eventType is required');

  const endpoints = await prisma.integrationEndpoint.findMany({
    where: { status: 'ACTIVE', type: 'WEBHOOK' },
    orderBy: [{ createdAt: 'asc' }]
  });

  const matched = endpoints.filter((endpoint) => eventMatches(normalizedEvent, toEventTypes(endpoint.eventTypes)));
  const deliveries = [];
  for (const endpoint of matched) {
    deliveries.push(
      await queueWebhookDelivery(endpoint.id, normalizedEvent, {
        ...(payload || {}),
        _event: {
          type: normalizedEvent,
          emittedAt: new Date().toISOString(),
          metadata: metadata || null
        }
      })
    );
  }

  return {
    eventType: normalizedEvent,
    matchedEndpointCount: matched.length,
    deliveryIds: deliveries.map((delivery) => delivery.id)
  };
};

export const retryWebhookDelivery = async (id: string) => {
  const row = await prisma.webhookDeliveryLog.findUnique({ where: { id } });
  if (!row) throw new Error('Webhook delivery not found');
  const attempts = Number(row.attempts || 0) + 1;
  return prisma.webhookDeliveryLog.update({
    where: { id },
    data: {
      attempts,
      status: attempts >= 5 ? 'DEAD_LETTER' : 'RETRYING',
      nextAttemptAt: attempts >= 5 ? null : new Date(Date.now() + attempts * 15 * 60 * 1000),
      lastError: attempts >= 5 ? 'Moved to dead letter queue' : row.lastError
    }
  });
};

export const listWebhookDeliveries = async () =>
  (await prisma.webhookDeliveryLog.findMany({
    include: { endpoint: true },
    orderBy: [{ createdAt: 'desc' }],
    take: 200
  })).map((delivery) => ({
    ...delivery,
    endpoint: sanitizeEndpoint(delivery.endpoint)
  }));

export const dispatchWebhookDelivery = async (id: string) => {
  const row = await prisma.webhookDeliveryLog.findUnique({
    where: { id },
    include: { endpoint: true }
  });
  if (!row) throw new Error('Webhook delivery not found');
  if (!row.endpoint) throw new Error('Webhook endpoint not found');

  const endpoint = row.endpoint;
  if (cleanString(endpoint.status).toUpperCase() !== 'ACTIVE') {
    return prisma.webhookDeliveryLog.update({
      where: { id },
      data: {
        status: 'FAILED',
        lastError: 'Endpoint is inactive',
        nextAttemptAt: null
      },
      include: { endpoint: true }
    });
  }

  const retryPolicy =
    endpoint.retryPolicy && typeof endpoint.retryPolicy === 'object' && !Array.isArray(endpoint.retryPolicy)
      ? (endpoint.retryPolicy as Record<string, any>)
      : {};
  const maxAttempts = Math.max(1, Number(retryPolicy.maxAttempts || 5));
  const backoffMinutes = Math.max(1, Number(retryPolicy.backoffMinutes || 15));
  const targetUrl = cleanString(endpoint.targetUrl);
  if (!targetUrl) throw new Error('Webhook endpoint target URL is required');

  const secret = getStoredWebhookSecret(endpoint);
  const signature = signPayload(row.payload || {}, secret || row.signature || endpoint.secretHash || 'scrolith');
  const nextAttemptNumber = Number(row.attempts || 0) + 1;

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-scrolith-event': cleanString(row.eventType),
        'x-scrolith-signature': signature,
        'x-scrolith-delivery-id': row.id
      },
      body: JSON.stringify(row.payload || {})
    });

    if (!response.ok) {
      throw new Error(`Webhook delivery failed with status ${response.status}`);
    }

    return prisma.webhookDeliveryLog.update({
      where: { id: row.id },
      data: {
        status: 'DELIVERED',
        attempts: nextAttemptNumber,
        deliveredAt: new Date(),
        nextAttemptAt: null,
        lastError: null,
        signature
      },
      include: { endpoint: true }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook delivery failed';
    const shouldDeadLetter = nextAttemptNumber >= maxAttempts || endpoint.deadLetterEnabled === false;
    return prisma.webhookDeliveryLog.update({
      where: { id: row.id },
      data: {
        attempts: nextAttemptNumber,
        status: shouldDeadLetter ? 'DEAD_LETTER' : 'RETRYING',
        deliveredAt: null,
        lastError: message,
        nextAttemptAt: shouldDeadLetter ? null : new Date(Date.now() + backoffMinutes * nextAttemptNumber * 60 * 1000),
        signature
      },
      include: { endpoint: true }
    });
  }
};

export const dispatchQueuedWebhookDeliveries = async (limit = 10) => {
  const rows = await prisma.webhookDeliveryLog.findMany({
    where: {
      status: { in: ['QUEUED', 'RETRYING'] },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }]
    },
    include: { endpoint: true },
    orderBy: [{ createdAt: 'asc' }],
    take: Math.max(1, Math.min(50, Number(limit || 10)))
  });

  const results = [];
  for (const row of rows) {
    const delivery = await dispatchWebhookDelivery(row.id);
    results.push({
      ...delivery,
      endpoint: sanitizeEndpoint((delivery as any).endpoint)
    });
  }
  return results;
};

export const createApiCredential = async (input: any) => {
  const name = cleanString(input.name);
  if (!name) throw new Error('name is required');
  const plain = randomToken('sk');
  return {
    record: await prisma.apiCredential.create({
      data: {
        name,
        keyPrefix: plain.slice(0, 12),
        secretHash: hashValue(plain),
        scopes: input.scopes || [],
        status: cleanString(input.status || 'ACTIVE').toUpperCase(),
        metadata: input.metadata || null
      }
    }),
    plainKey: plain
  };
};

export const listApiCredentials = async () =>
  prisma.apiCredential.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] });

export const updateApiCredential = async (id: string, input: any) => {
  const credentialId = cleanString(id);
  const name = cleanString(input?.name);
  if (!credentialId) throw new Error('api credential id is required');
  if (!name) throw new Error('name is required');
  return prisma.apiCredential.update({
    where: { id: credentialId },
    data: {
      name,
      scopes: input?.scopes || [],
      status: cleanString(input?.status || 'ACTIVE').toUpperCase(),
      metadata: input?.metadata || null
    }
  });
};

export const seedTalentCloudDemoExamples = async () => {
  const settings = await updateTalentCloudSettings({
    ...(await getTalentCloudSettings()),
    enabled: true,
    manualInvitesOnly: true,
    webhooksEnabled: true
  });

  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: [{ createdAt: 'asc' }],
    take: 6,
    select: { id: true, name: true, email: true }
  });

  const poolA = await prisma.talentPool.upsert({
    where: { slug: 'acme-preferred-designers' },
    create: {
      name: 'Acme Preferred Designers',
      slug: 'acme-preferred-designers',
      description: 'Invite-only design partners approved for Acme enterprise briefs.',
      visibility: 'PRIVATE',
      isActive: true,
      metadata: { example: true, buyerOrg: 'Acme Logistics' }
    },
    update: {
      name: 'Acme Preferred Designers',
      description: 'Invite-only design partners approved for Acme enterprise briefs.',
      visibility: 'PRIVATE',
      isActive: true,
      metadata: { example: true, buyerOrg: 'Acme Logistics' }
    }
  });

  const poolB = await prisma.talentPool.upsert({
    where: { slug: 'nova-compliance-vendors' },
    create: {
      name: 'Nova Compliance Vendors',
      slug: 'nova-compliance-vendors',
      description: 'Curated vendors cleared for regulated delivery work and compliance reviews.',
      visibility: 'PRIVATE',
      isActive: true,
      metadata: { example: true, buyerOrg: 'Nova Health' }
    },
    update: {
      name: 'Nova Compliance Vendors',
      description: 'Curated vendors cleared for regulated delivery work and compliance reviews.',
      visibility: 'PRIVATE',
      isActive: true,
      metadata: { example: true, buyerOrg: 'Nova Health' }
    }
  });

  for (const [index, user] of users.slice(0, 4).entries()) {
    await prisma.talentPoolMember.upsert({
      where: { poolId_userId: { poolId: index % 2 === 0 ? poolA.id : poolB.id, userId: user.id } },
      create: {
        poolId: index % 2 === 0 ? poolA.id : poolB.id,
        userId: user.id,
        membershipType: 'APPROVED',
        status: 'ACTIVE',
        internalNotes: `Example member seeded for ${index % 2 === 0 ? 'Acme' : 'Nova'} private network.`,
        tags: ['example', index % 2 === 0 ? 'design' : 'compliance'],
        scorecard: { reliability: 4 + (index % 2), communication: 5, delivery: 4 }
      },
      update: {
        membershipType: 'APPROVED',
        status: 'ACTIVE',
        internalNotes: `Example member seeded for ${index % 2 === 0 ? 'Acme' : 'Nova'} private network.`,
        tags: ['example', index % 2 === 0 ? 'design' : 'compliance'],
        scorecard: { reliability: 4 + (index % 2), communication: 5, delivery: 4 }
      }
    });
  }

  const existingAccessA = await prisma.privateOpportunityAccess.findFirst({
    where: { entityType: 'job', entityId: 'demo-job-acme-brand-refresh', poolId: poolA.id }
  });
  const accessRuleA = existingAccessA
    ? await prisma.privateOpportunityAccess.update({
        where: { id: existingAccessA.id },
        data: {
          visibilityScope: 'POOL_ONLY',
          metadata: { example: true, title: 'Acme Brand Refresh Job' }
        },
        include: { pool: true }
      })
    : await prisma.privateOpportunityAccess.create({
        data: {
          entityType: 'job',
          entityId: 'demo-job-acme-brand-refresh',
          poolId: poolA.id,
          visibilityScope: 'POOL_ONLY',
          metadata: { example: true, title: 'Acme Brand Refresh Job' }
        },
        include: { pool: true }
      });

  const existingAccessB = await prisma.privateOpportunityAccess.findFirst({
    where: { entityType: 'listing', entityId: 'demo-listing-nova-regulatory-audit', poolId: poolB.id }
  });
  const accessRuleB = existingAccessB
    ? await prisma.privateOpportunityAccess.update({
        where: { id: existingAccessB.id },
        data: {
          visibilityScope: 'POOL_ONLY',
          metadata: { example: true, title: 'Nova Regulatory Audit Listing' }
        },
        include: { pool: true }
      })
    : await prisma.privateOpportunityAccess.create({
        data: {
          entityType: 'listing',
          entityId: 'demo-listing-nova-regulatory-audit',
          poolId: poolB.id,
          visibilityScope: 'POOL_ONLY',
          metadata: { example: true, title: 'Nova Regulatory Audit Listing' }
        },
        include: { pool: true }
      });

  const requirementA = await prisma.vendorRequirement.upsert({
    where: { code: 'REQ_KYC_TIER2' },
    create: {
      code: 'REQ_KYC_TIER2',
      name: 'Tier 2 KYC + NDA',
      requiredDocuments: ['Government ID', 'Signed NDA'],
      requiredKycTier: 'TIER_2',
      requiredComplianceChecks: ['sanctions', 'geo_review'],
      requireContractAcceptance: true,
      isActive: true,
      metadata: { example: true }
    },
    update: {
      name: 'Tier 2 KYC + NDA',
      requiredDocuments: ['Government ID', 'Signed NDA'],
      requiredKycTier: 'TIER_2',
      requiredComplianceChecks: ['sanctions', 'geo_review'],
      requireContractAcceptance: true,
      isActive: true,
      metadata: { example: true }
    }
  });

  const requirementB = await prisma.vendorRequirement.upsert({
    where: { code: 'REQ_PORTFOLIO_INSURANCE' },
    create: {
      code: 'REQ_PORTFOLIO_INSURANCE',
      name: 'Portfolio + Liability Insurance',
      requiredDocuments: ['Portfolio URL', 'Insurance Certificate'],
      requiredKycTier: 'TIER_1',
      requiredComplianceChecks: ['identity_review'],
      requireContractAcceptance: false,
      isActive: true,
      metadata: { example: true }
    },
    update: {
      name: 'Portfolio + Liability Insurance',
      requiredDocuments: ['Portfolio URL', 'Insurance Certificate'],
      requiredKycTier: 'TIER_1',
      requiredComplianceChecks: ['identity_review'],
      requireContractAcceptance: false,
      isActive: true,
      metadata: { example: true }
    }
  });

  const existingWebhook = await prisma.integrationEndpoint.findFirst({
    where: { type: 'WEBHOOK', name: 'Acme Procurement Webhook' }
  });
  const webhookSecret = randomToken('whsec', 16);
  const webhookEndpoint = existingWebhook
    ? await prisma.integrationEndpoint.update({
        where: { id: existingWebhook.id },
        data: {
          targetUrl: 'https://example.invalid/acme/procurement/webhooks',
          eventTypes: ['talent_cloud.*', 'vendor.*'],
          status: 'ACTIVE',
          retryPolicy: { maxAttempts: 5, backoffMinutes: 15 },
          deadLetterEnabled: true,
          secretHash: hashValue(webhookSecret),
          metadata: {
            ...(existingWebhook.metadata && typeof existingWebhook.metadata === 'object' && !Array.isArray(existingWebhook.metadata)
              ? existingWebhook.metadata
              : {}),
            example: true,
            [WEBHOOK_SECRET_KEY]: encryptSecret(webhookSecret)
          }
        }
      })
    : await prisma.integrationEndpoint.create({
        data: {
          name: 'Acme Procurement Webhook',
          type: 'WEBHOOK',
          targetUrl: 'https://example.invalid/acme/procurement/webhooks',
          eventTypes: ['talent_cloud.*', 'vendor.*'],
          status: 'ACTIVE',
          retryPolicy: { maxAttempts: 5, backoffMinutes: 15 },
          deadLetterEnabled: true,
          secretHash: hashValue(webhookSecret),
          metadata: {
            example: true,
            [WEBHOOK_SECRET_KEY]: encryptSecret(webhookSecret)
          }
        }
      });

  const connector = await saveInboundConnector({
    name: 'Acme ERP Connector',
    providerKey: 'acme-erp',
    authMode: 'HEADER',
    authHeaderName: 'x-scrolith-connector-key',
    eventTypes: ['invoice.*', 'vendor.*', 'talent_pool.*'],
    status: 'ACTIVE'
  }, (await prisma.integrationEndpoint.findFirst({
    where: { type: 'INBOUND_CONNECTOR', name: 'Acme ERP Connector' }
  }))?.id);

  const existingQueued = await prisma.webhookDeliveryLog.findFirst({
    where: {
      endpointId: webhookEndpoint.id,
      eventType: 'talent_cloud.pool.created',
      status: { in: ['QUEUED', 'RETRYING'] }
    }
  });
  if (!existingQueued) {
    await queueWebhookDelivery(webhookEndpoint.id, 'talent_cloud.pool.created', {
      poolId: poolA.id,
      name: poolA.name,
      slug: poolA.slug,
      example: true
    });
  }

  return {
    settings,
    pools: [poolA, poolB],
    requirements: [requirementA, requirementB],
    accessRules: [accessRuleA, accessRuleB],
    webhookEndpoint: sanitizeEndpoint(webhookEndpoint),
    connector: sanitizeEndpoint(connector),
    usersSeeded: users.slice(0, 4).map((user) => ({ id: user.id, name: user.name, email: user.email }))
  };
};
