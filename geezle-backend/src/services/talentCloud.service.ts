import crypto from 'crypto';
import prisma from '../utils/prismaClient';

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
  prisma.integrationEndpoint.findMany({
    include: { webhookDeliveries: { orderBy: { createdAt: 'desc' }, take: 10 } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }]
  });

export const saveIntegrationEndpoint = async (input: any, id?: string) => {
  const secretPlain = cleanString(input.secretPlain) || randomToken('whsec', 16);
  const data = {
    name: cleanString(input.name),
    type: cleanString(input.type || 'WEBHOOK').toUpperCase(),
    targetUrl: cleanString(input.targetUrl) || null,
    eventTypes: input.eventTypes || [],
    secretHash: hashValue(secretPlain),
    status: cleanString(input.status || 'ACTIVE').toUpperCase(),
    retryPolicy: input.retryPolicy || { maxAttempts: 5, backoffMinutes: 15 },
    deadLetterEnabled: input.deadLetterEnabled !== false,
    metadata: input.metadata || null
  };
  if (!data.name) throw new Error('name is required');
  const endpoint = id
    ? await prisma.integrationEndpoint.update({ where: { id }, data })
    : await prisma.integrationEndpoint.create({ data });
  return { ...endpoint, secretPlain };
};

export const queueWebhookDelivery = async (endpointId: string, eventType: string, payload: any) => {
  const endpoint = await prisma.integrationEndpoint.findUnique({ where: { id: endpointId } });
  if (!endpoint) throw new Error('Integration endpoint not found');
  const secretPlain = cleanString(payload?.secretPlain);
  const signature = signPayload(payload, secretPlain || endpoint.secretHash || 'scrolith');
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
  prisma.webhookDeliveryLog.findMany({
    include: { endpoint: true },
    orderBy: [{ createdAt: 'desc' }],
    take: 200
  });

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
