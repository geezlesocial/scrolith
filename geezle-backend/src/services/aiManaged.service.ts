import prisma from '../utils/prismaClient';

const SETTINGS_SCOPE = 'scrolitha_managed_phase5';

const normalizeSettings = (value: any) => ({
  enabled: value?.enabled !== false,
  assistiveOnly: value?.assistiveOnly !== false,
  requireHumanApproval: value?.requireHumanApproval !== false,
  managedDeliveryEnabled: value?.managedDeliveryEnabled !== false
});

const cleanString = (value: unknown) => String(value || '').trim();
const toDate = (value?: string | null) => {
  const normalized = cleanString(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getScrolithaManagedSettings = async () => {
  const record = await prisma.appSetting.findUnique({ where: { scope: SETTINGS_SCOPE } });
  return normalizeSettings(record?.data || {});
};

export const updateScrolithaManagedSettings = async (input: any) => {
  const normalized = normalizeSettings(input || {});
  await prisma.appSetting.upsert({
    where: { scope: SETTINGS_SCOPE },
    create: { scope: SETTINGS_SCOPE, data: normalized },
    update: { data: normalized }
  });
  return normalized;
};

export const getScrolithaManagedSummary = async () => {
  const [aiOutputs, pendingReview, managedProjects, highRiskProjects, openMilestones, escalationRules] = await Promise.all([
    prisma.aiTaskOutput.count(),
    prisma.aiTaskOutput.count({ where: { humanOverrideState: 'PENDING_REVIEW' } }),
    prisma.managedProject.count({ where: { status: { not: 'ARCHIVED' } } }),
    prisma.managedProject.count({ where: { riskLevel: { in: ['HIGH', 'CRITICAL'] } } }),
    prisma.managedMilestone.count({ where: { status: { notIn: ['APPROVED', 'COMPLETED'] } } }),
    prisma.managedEscalationRule.count({ where: { isActive: true } })
  ]);
  return { aiOutputs, pendingReview, managedProjects, highRiskProjects, openMilestones, escalationRules };
};

export const listAiOutputs = async () =>
  prisma.aiTaskOutput.findMany({
    orderBy: [{ createdAt: 'desc' }],
    take: 200
  });

export const createAiOutput = async (input: any) =>
  prisma.aiTaskOutput.create({
    data: {
      moduleKey: cleanString(input.moduleKey),
      taskType: cleanString(input.taskType),
      entityType: cleanString(input.entityType),
      entityId: cleanString(input.entityId) || null,
      actorUserId: cleanString(input.actorUserId) || null,
      actorStaffId: cleanString(input.actorStaffId) || null,
      promptVersion: cleanString(input.promptVersion || 'v1'),
      confidence: input.confidence != null ? Number(input.confidence) : null,
      explanation: cleanString(input.explanation) || null,
      output: input.output || null,
      humanOverrideState: cleanString(input.humanOverrideState || 'PENDING_REVIEW').toUpperCase(),
      metadata: input.metadata || null
    }
  });

export const updateAiOutputReview = async (id: string, input: any) =>
  prisma.aiTaskOutput.update({
    where: { id },
    data: {
      humanOverrideState: cleanString(input.humanOverrideState || 'APPROVED').toUpperCase(),
      metadata: input.metadata || undefined
    }
  });

export const listManagedProjects = async () =>
  prisma.managedProject.findMany({
    include: {
      milestones: { orderBy: { createdAt: 'asc' } },
      assignments: { orderBy: { createdAt: 'asc' } }
    },
    orderBy: [{ createdAt: 'desc' }]
  });

export const saveManagedProject = async (input: any, id?: string) => {
  const title = cleanString(input.title);
  const entityType = cleanString(input.entityType);
  if (!title) throw new Error('title is required');
  if (!entityType) throw new Error('entityType is required');
  const data = {
    title,
    entityType,
    entityId: cleanString(input.entityId) || null,
    coordinatorStaffId: cleanString(input.coordinatorStaffId) || null,
    status: cleanString(input.status || 'ACTIVE').toUpperCase(),
    slaStatus: cleanString(input.slaStatus || 'ON_TRACK').toUpperCase(),
    riskLevel: cleanString(input.riskLevel || 'LOW').toUpperCase(),
    metadata: input.metadata || null
  };
  if (id) return prisma.managedProject.update({ where: { id }, data });
  return prisma.managedProject.create({ data });
};

export const saveManagedMilestone = async (input: any, id?: string) => {
  const managedProjectId = cleanString(input.managedProjectId);
  const title = cleanString(input.title);
  if (!managedProjectId) throw new Error('managedProjectId is required');
  if (!title) throw new Error('title is required');
  const data = {
    managedProjectId,
    title,
    description: cleanString(input.description) || null,
    status: cleanString(input.status || 'DRAFT').toUpperCase(),
    dueAt: toDate(input.dueAt),
    approvedAt: cleanString(input.status).toUpperCase() === 'APPROVED' ? new Date() : null,
    qaStatus: cleanString(input.qaStatus || 'PENDING').toUpperCase(),
    riskFlag: cleanString(input.riskFlag) || null,
    metadata: input.metadata || null
  };
  if (id) return prisma.managedMilestone.update({ where: { id }, data });
  return prisma.managedMilestone.create({ data });
};

export const saveManagedAssignment = async (input: any) => {
  const managedProjectId = cleanString(input.managedProjectId);
  const role = cleanString(input.role);
  if (!managedProjectId) throw new Error('managedProjectId is required');
  if (!role) throw new Error('role is required');
  return prisma.managedAssignment.create({
    data: {
      managedProjectId,
      assigneeStaffId: cleanString(input.assigneeStaffId) || null,
      role,
      status: cleanString(input.status || 'ACTIVE').toUpperCase(),
      metadata: input.metadata || null
    }
  });
};

export const listEscalationRules = async () =>
  prisma.managedEscalationRule.findMany({ orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] });

export const saveEscalationRule = async (input: any, id?: string) => {
  const code = cleanString(input.code);
  const name = cleanString(input.name);
  const triggerType = cleanString(input.triggerType);
  const targetRole = cleanString(input.targetRole);
  if (!code) throw new Error('code is required');
  if (!name) throw new Error('name is required');
  if (!triggerType) throw new Error('triggerType is required');
  if (!targetRole) throw new Error('targetRole is required');
  const data = {
    code,
    name,
    triggerType,
    threshold: input.threshold || null,
    targetRole,
    isActive: input.isActive !== false,
    metadata: input.metadata || null
  };
  if (id) return prisma.managedEscalationRule.update({ where: { id }, data });
  return prisma.managedEscalationRule.create({ data });
};
