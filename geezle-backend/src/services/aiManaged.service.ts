import prisma from '../utils/prismaClient';
import { publishIntegrationEvent } from './talentCloud.service';

const SETTINGS_SCOPE = 'scrolitha_managed_phase5';

const normalizeSettings = (value: any) => ({
  enabled: value?.enabled !== false,
  assistiveOnly: value?.assistiveOnly !== false,
  requireHumanApproval: value?.requireHumanApproval !== false,
  managedDeliveryEnabled: value?.managedDeliveryEnabled !== false
});

const cleanString = (value: unknown) => String(value || '').trim();
const normalizeEntityType = (value: unknown) => cleanString(value).toUpperCase();
const normalizeStatus = (value: unknown, fallback: string) => cleanString(value || fallback).toUpperCase();
const toDate = (value?: string | null) => {
  const normalized = cleanString(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildAutomationSnapshot = (project: any) => {
  const now = Date.now();
  const milestones = Array.isArray(project?.milestones) ? project.milestones : [];
  const assignments = Array.isArray(project?.assignments) ? project.assignments : [];
  const overdueMilestones = milestones.filter(
    (milestone: any) =>
      milestone?.dueAt &&
      new Date(milestone.dueAt).getTime() < now &&
      !['APPROVED', 'COMPLETED'].includes(normalizeStatus(milestone?.status, 'DRAFT'))
  );
  const blockedMilestones = milestones.filter((milestone: any) =>
    ['BLOCKED', 'REJECTED', 'FAILED'].includes(normalizeStatus(milestone?.qaStatus, 'PENDING'))
  );
  const allResolved = milestones.length > 0 && milestones.every((milestone: any) => {
    const status = normalizeStatus(milestone?.status, 'DRAFT');
    return status === 'APPROVED' || status === 'COMPLETED';
  });

  const riskLevel =
    blockedMilestones.length > 0 || overdueMilestones.length > 1 ? 'CRITICAL' :
    overdueMilestones.length > 0 ? 'HIGH' :
    milestones.some((milestone: any) => cleanString(milestone?.riskFlag)) ? 'MEDIUM' :
    'LOW';
  const slaStatus =
    overdueMilestones.length > 1 ? 'BREACHED' :
    overdueMilestones.length > 0 || blockedMilestones.length > 0 ? 'AT_RISK' :
    allResolved ? 'ACHIEVED' :
    'ON_TRACK';
  const status =
    allResolved ? 'COMPLETED' :
    assignments.length === 0 && milestones.length > 0 ? 'PLANNING' :
    'ACTIVE';

  return {
    status,
    riskLevel,
    slaStatus,
    metadata: {
      ...(project?.metadata && typeof project.metadata === 'object' && !Array.isArray(project.metadata) ? project.metadata : {}),
      automation: {
        lastEvaluatedAt: new Date().toISOString(),
        overdueMilestones: overdueMilestones.length,
        blockedMilestones: blockedMilestones.length,
        assignmentCount: assignments.length,
        allResolved
      }
    }
  };
};

export const runManagedProjectAutomation = async (managedProjectId: string, context?: Record<string, any> | null) => {
  const project = await prisma.managedProject.findUnique({
    where: { id: managedProjectId },
    include: {
      milestones: { orderBy: { createdAt: 'asc' } },
      assignments: { orderBy: { createdAt: 'asc' } }
    }
  });
  if (!project) throw new Error('Managed project not found');
  const next = buildAutomationSnapshot(project);
  const changed =
    next.status !== project.status ||
    next.riskLevel !== project.riskLevel ||
    next.slaStatus !== project.slaStatus ||
    JSON.stringify((project.metadata as any)?.automation || null) !== JSON.stringify((next.metadata as any)?.automation || null);
  if (!changed) return project;

  const updated = await prisma.managedProject.update({
    where: { id: managedProjectId },
    data: {
      status: next.status,
      riskLevel: next.riskLevel,
      slaStatus: next.slaStatus,
      metadata: next.metadata
    }
  });
  await publishIntegrationEvent('managed_delivery.project.automated', {
    projectId: updated.id,
    title: updated.title,
    status: updated.status,
    riskLevel: updated.riskLevel,
    slaStatus: updated.slaStatus,
    entityType: updated.entityType,
    entityId: updated.entityId
  }, context || null);
  return updated;
};

export const syncManagedProjectsForEntity = async (
  entityType: string,
  entityId: string,
  lifecycle: Record<string, any>
) => {
  const normalizedEntityType = normalizeEntityType(entityType);
  const normalizedEntityId = cleanString(entityId);
  if (!normalizedEntityType || !normalizedEntityId) return [];

  const projects = await prisma.managedProject.findMany({
    where: { entityType: normalizedEntityType, entityId: normalizedEntityId },
    include: {
      milestones: { orderBy: { createdAt: 'asc' } },
      assignments: { orderBy: { createdAt: 'asc' } }
    }
  });

  const lifecycleMilestoneId = cleanString(lifecycle?.milestoneId);
  const lifecycleStatus = normalizeStatus(lifecycle?.status, '');
  const updates: any[] = [];

  for (const project of projects) {
    if (lifecycleMilestoneId && lifecycleStatus) {
      const matchedMilestone = project.milestones.find((milestone: any) => {
        const metadata = milestone?.metadata && typeof milestone.metadata === 'object' && !Array.isArray(milestone.metadata)
          ? milestone.metadata as Record<string, any>
          : {};
        return cleanString(metadata.sourceMilestoneId || metadata.contractMilestoneId) === lifecycleMilestoneId;
      });
      if (matchedMilestone) {
        updates.push(
          prisma.managedMilestone.update({
            where: { id: matchedMilestone.id },
            data: {
              status: lifecycleStatus,
              approvedAt: lifecycleStatus === 'APPROVED' || lifecycleStatus === 'COMPLETED' ? new Date() : null,
              qaStatus:
                lifecycleStatus === 'APPROVED' || lifecycleStatus === 'COMPLETED'
                  ? 'PASSED'
                  : lifecycleStatus === 'SUBMITTED'
                    ? 'IN_REVIEW'
                    : matchedMilestone.qaStatus,
              metadata: {
                ...(matchedMilestone.metadata && typeof matchedMilestone.metadata === 'object' && !Array.isArray(matchedMilestone.metadata)
                  ? matchedMilestone.metadata
                  : {}),
                lifecycle
              }
            }
          })
        );
      }
    }
  }

  if (updates.length) {
    await prisma.$transaction(updates);
  }

  const automatedProjects = [];
  for (const project of projects) {
    automatedProjects.push(
      await runManagedProjectAutomation(project.id, {
        trigger: 'entity_lifecycle_sync',
        entityType: normalizedEntityType,
        entityId: normalizedEntityId,
        lifecycle
      })
    );
  }
  return automatedProjects;
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
  const entityType = normalizeEntityType(input.entityType);
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
  const project = id
    ? await prisma.managedProject.update({ where: { id }, data })
    : await prisma.managedProject.create({ data });
  await runManagedProjectAutomation(project.id, { trigger: id ? 'project_updated' : 'project_created' });
  return prisma.managedProject.findUnique({
    where: { id: project.id },
    include: { milestones: { orderBy: { createdAt: 'asc' } }, assignments: { orderBy: { createdAt: 'asc' } } }
  });
};

export const saveManagedMilestone = async (input: any, id?: string) => {
  const managedProjectId = cleanString(input.managedProjectId);
  const title = cleanString(input.title);
  if (!managedProjectId) throw new Error('managedProjectId is required');
  if (!title) throw new Error('title is required');
  const normalizedStatus = normalizeStatus(input.status || 'DRAFT', 'DRAFT');
  const normalizedQaStatus =
    normalizedStatus === 'APPROVED' || normalizedStatus === 'COMPLETED'
      ? 'PASSED'
      : normalizeStatus(input.qaStatus || 'PENDING', 'PENDING');
  const data = {
    managedProjectId,
    title,
    description: cleanString(input.description) || null,
    status: normalizedStatus,
    dueAt: toDate(input.dueAt),
    approvedAt: normalizedStatus === 'APPROVED' || normalizedStatus === 'COMPLETED' ? new Date() : null,
    qaStatus: normalizedQaStatus,
    riskFlag: cleanString(input.riskFlag) || null,
    metadata: input.metadata || null
  };
  const milestone = id
    ? await prisma.managedMilestone.update({ where: { id }, data })
    : await prisma.managedMilestone.create({ data });
  await runManagedProjectAutomation(milestone.managedProjectId, {
    trigger: id ? 'milestone_updated' : 'milestone_created',
    milestoneId: milestone.id,
    status: milestone.status
  });
  return milestone;
};

export const saveManagedAssignment = async (input: any) => {
  const managedProjectId = cleanString(input.managedProjectId);
  const role = cleanString(input.role);
  if (!managedProjectId) throw new Error('managedProjectId is required');
  if (!role) throw new Error('role is required');
  const assignment = await prisma.managedAssignment.create({
    data: {
      managedProjectId,
      assigneeStaffId: cleanString(input.assigneeStaffId) || null,
      role,
      status: cleanString(input.status || 'ACTIVE').toUpperCase(),
      metadata: input.metadata || null
    }
  });
  await runManagedProjectAutomation(assignment.managedProjectId, {
    trigger: 'assignment_updated',
    assignmentId: assignment.id,
    status: assignment.status
  });
  return assignment;
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
