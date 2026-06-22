import prisma from '../utils/prismaClient';

const SETTINGS_SCOPE = 'compliance_phase3';

const DEFAULT_SETTINGS = {
  enabled: false,
  shadowMode: true,
  autoHoldHighConfidence: false,
  defaultSlaHours: 48
};

const cleanString = (value: unknown) => String(value || '').trim();
const toDate = (value?: string | null) => {
  const normalized = cleanString(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed) : fallback;
};

const normalizeSettings = (value: any) => ({
  enabled: value?.enabled !== false,
  shadowMode: value?.shadowMode !== false,
  autoHoldHighConfidence: value?.autoHoldHighConfidence === true,
  defaultSlaHours: Math.max(1, Math.min(720, Math.floor(Number(value?.defaultSlaHours || DEFAULT_SETTINGS.defaultSlaHours))))
});

const buildNumber = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

export const getComplianceSettings = async () => {
  const record = await prisma.appSetting.findUnique({ where: { scope: SETTINGS_SCOPE } });
  return normalizeSettings(record?.data || DEFAULT_SETTINGS);
};

export const updateComplianceSettings = async (input: any) => {
  const normalized = normalizeSettings(input || {});
  await prisma.appSetting.upsert({
    where: { scope: SETTINGS_SCOPE },
    create: { scope: SETTINGS_SCOPE, data: normalized },
    update: { data: normalized }
  });
  return normalized;
};

export const getComplianceSummary = async () => {
  const [casesOpen, appealsOpen, holdsActive, riskRules, highRiskEntities] = await Promise.all([
    prisma.complianceCase.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW', 'ESCALATED'] } } }),
    prisma.complianceAppeal.count({ where: { status: 'OPEN' } }),
    prisma.holdAction.count({ where: { status: 'ACTIVE' } }),
    prisma.riskRule.count({ where: { isActive: true } }),
    prisma.riskScoreSnapshot.count({ where: { level: { in: ['HIGH', 'CRITICAL'] } } })
  ]);
  return { casesOpen, appealsOpen, holdsActive, riskRules, highRiskEntities };
};

export const listRiskRules = async () =>
  prisma.riskRule.findMany({ where: {}, orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] });

export const saveRiskRule = async (input: any, id?: string) => {
  const code = cleanString(input.code);
  const name = cleanString(input.name);
  const entityType = cleanString(input.entityType);
  const signalType = cleanString(input.signalType);
  const action = cleanString(input.action);
  if (!code) throw new Error('code is required');
  if (!name) throw new Error('name is required');
  if (!entityType) throw new Error('entityType is required');
  if (!signalType) throw new Error('signalType is required');
  if (!action) throw new Error('action is required');

  const data = {
    code,
    name,
    entityType,
    signalType,
    action,
    mode: cleanString(input.mode || 'SHADOW').toUpperCase(),
    threshold: input.threshold || null,
    isActive: input.isActive !== false,
    metadata: input.metadata || null
  };

  if (id) return prisma.riskRule.update({ where: { id }, data });
  return prisma.riskRule.create({ data });
};

export const createRiskSnapshot = async (input: {
  entityType?: string;
  entityId?: string | null;
  subjectUserId?: string | null;
  signals?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
}) => {
  const signals = input.signals || {};
  const score = [
    Number(signals.unusualVelocity ? 25 : 0),
    Number(signals.repeatDisputes ? 20 : 0),
    Number(signals.deviceAnomalies ? 15 : 0),
    Number(signals.geoMismatch ? 15 : 0),
    Number(signals.suspiciousPaymentPatterns ? 15 : 0),
    Number(signals.highRiskListingKeywords ? 10 : 0)
  ].reduce((sum, part) => sum + part, 0);
  const level = score >= 70 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 20 ? 'MEDIUM' : 'LOW';
  return prisma.riskScoreSnapshot.create({
    data: {
      entityType: cleanString(input.entityType || 'generic') || 'generic',
      entityId: cleanString(input.entityId) || null,
      subjectUserId: cleanString(input.subjectUserId) || null,
      score,
      level,
      signals,
      metadata: input.metadata || null
    }
  });
};

export const listComplianceCases = async (params?: {
  status?: string;
  caseType?: string;
  assignedStaffId?: string;
  entityType?: string;
  query?: string;
  limit?: number;
}) =>
  prisma.complianceCase.findMany({
    where: {
      ...(cleanString(params?.status) ? { status: cleanString(params?.status).toUpperCase() } : {}),
      ...(cleanString(params?.caseType) ? { caseType: cleanString(params?.caseType).toUpperCase() } : {}),
      ...(cleanString(params?.assignedStaffId) ? { assignedStaffId: cleanString(params?.assignedStaffId) } : {}),
      ...(cleanString(params?.entityType) ? { entityType: cleanString(params?.entityType) } : {}),
      ...(cleanString(params?.query)
        ? {
            OR: [
              { caseNumber: { contains: cleanString(params?.query), mode: 'insensitive' } },
              { summary: { contains: cleanString(params?.query), mode: 'insensitive' } },
              { subjectUserId: { contains: cleanString(params?.query), mode: 'insensitive' } }
            ]
          }
        : {})
    },
    include: {
      evidence: true,
      decisions: { orderBy: { createdAt: 'desc' } },
      appeals: true,
      holds: true
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: Math.max(1, Math.min(200, Number(params?.limit || 50)))
  });

export const createComplianceCase = async (input: any) => {
  const settings = await getComplianceSettings();
  const caseType = cleanString(input.caseType);
  const entityType = cleanString(input.entityType);
  const summary = cleanString(input.summary);
  if (!caseType) throw new Error('caseType is required');
  if (!entityType) throw new Error('entityType is required');
  if (!summary) throw new Error('summary is required');
  return prisma.complianceCase.create({
    data: {
      caseNumber: buildNumber('CASE'),
      caseType: caseType.toUpperCase(),
      status: cleanString(input.status || 'OPEN').toUpperCase(),
      priority: cleanString(input.priority || 'MEDIUM').toUpperCase(),
      entityType,
      entityId: cleanString(input.entityId) || null,
      subjectUserId: cleanString(input.subjectUserId) || null,
      assignedStaffId: cleanString(input.assignedStaffId) || null,
      riskScore: input.riskScore != null ? toNumber(input.riskScore) : null,
      holdState: cleanString(input.holdState || 'NONE').toUpperCase(),
      slaDueAt: toDate(input.slaDueAt) || new Date(Date.now() + settings.defaultSlaHours * 60 * 60 * 1000),
      summary,
      metadata: input.metadata || null
    },
    include: { evidence: true, decisions: true, appeals: true, holds: true }
  });
};

export const addComplianceEvidence = async (caseId: string, input: any) =>
  prisma.complianceEvidence.create({
    data: {
      caseId,
      kind: cleanString(input.kind || 'note') || 'note',
      label: cleanString(input.label || 'Evidence'),
      fileUrl: cleanString(input.fileUrl) || null,
      payload: input.payload || null
    }
  });

export const addComplianceDecision = async (caseId: string, input: any) => {
  const action = cleanString(input.action).toUpperCase();
  if (!action) throw new Error('action is required');
  await prisma.complianceDecisionLog.create({
    data: {
      caseId,
      actorUserId: cleanString(input.actorUserId) || null,
      actorStaffId: cleanString(input.actorStaffId) || null,
      action,
      note: cleanString(input.note) || null,
      metadata: input.metadata || null
    }
  });
  if (input.nextStatus) {
    await prisma.complianceCase.update({
      where: { id: caseId },
      data: { status: cleanString(input.nextStatus).toUpperCase() }
    });
  }
  return prisma.complianceCase.findUnique({
    where: { id: caseId },
    include: { evidence: true, decisions: { orderBy: { createdAt: 'desc' } }, appeals: true, holds: true }
  });
};

export const applyHoldAction = async (input: any) => {
  const data = await prisma.holdAction.create({
    data: {
      caseId: cleanString(input.caseId) || null,
      entityType: cleanString(input.entityType || 'generic'),
      entityId: cleanString(input.entityId) || null,
      holdType: cleanString(input.holdType || 'MANUAL_REVIEW').toUpperCase(),
      status: 'ACTIVE',
      reason: cleanString(input.reason || 'Compliance hold'),
      metadata: input.metadata || null
    }
  });
  if (cleanString(input.caseId)) {
    await prisma.complianceCase.update({
      where: { id: cleanString(input.caseId) },
      data: { holdState: 'ACTIVE' }
    });
  }
  return data;
};

export const releaseHoldAction = async (id: string, metadata?: Record<string, any> | null) => {
  const hold = await prisma.holdAction.update({
    where: { id },
    data: {
      status: 'RELEASED',
      releasedAt: new Date(),
      metadata: metadata || undefined
    }
  });
  if (hold.caseId) {
    await prisma.complianceCase.update({
      where: { id: hold.caseId },
      data: { holdState: 'RELEASED' }
    });
  }
  return hold;
};

export const listAppeals = async () =>
  prisma.complianceAppeal.findMany({
    include: { case: true },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }]
  });

export const createAppeal = async (input: any) =>
  prisma.complianceAppeal.create({
    data: {
      caseId: cleanString(input.caseId),
      requesterUserId: cleanString(input.requesterUserId),
      statement: cleanString(input.statement),
      metadata: input.metadata || null
    }
  });

export const resolveAppeal = async (id: string, input: any) =>
  prisma.complianceAppeal.update({
    where: { id },
    data: {
      status: cleanString(input.status || 'RESOLVED').toUpperCase(),
      resolutionNote: cleanString(input.resolutionNote) || null,
      metadata: input.metadata || undefined
    }
  });
