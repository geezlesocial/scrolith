import express from 'express';
import { requirePermission } from '../../middleware/rbac.middleware';
import {
  createAiOutput,
  getScrolithaManagedSettings,
  getScrolithaManagedSummary,
  listAiOutputs,
  listEscalationRules,
  listManagedProjects,
  saveEscalationRule,
  saveManagedAssignment,
  saveManagedMilestone,
  saveManagedProject,
  updateAiOutputReview,
  updateScrolithaManagedSettings
} from '../../services/aiManaged.service';
import { recordGovernedAdminAction } from '../../services/enterpriseGovernance.service';
import { publishIntegrationEvent } from '../../services/talentCloud.service';

const router = express.Router();

const handleError = (res: express.Response, error: any, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const lower = String(message || '').toLowerCase();
  const status =
    lower.includes('not found') ? 404 :
    lower.includes('required') || lower.includes('invalid') ? 400 :
    500;
  if (status >= 500) console.error('[scrolitha-managed] request failed', error);
  return res.status(status).json({ success: false, error: message || fallback, code: status === 500 ? 'ERR_INTERNAL' : 'VALIDATION_ERROR' });
};

const emitEvent = (req: express.Request, event: string, payload: Record<string, any>) => {
  const io = req.app.get('io');
  io?.emit?.(event, payload);
};

router.get('/settings', requirePermission('scrolitha.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await getScrolithaManagedSettings() });
  } catch (error) {
    return handleError(res, error, 'Failed to load Scrolitha settings');
  }
});

router.put('/settings', requirePermission('scrolitha.manage'), async (req, res) => {
  try {
    const data = await updateScrolithaManagedSettings(req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'scrolitha',
      actionKey: 'settings_update',
      entityType: 'scrolitha_settings',
      entityId: 'scrolitha_managed_phase5',
      message: 'Scrolitha managed settings updated',
      metadata: { settings: data }
    });
    emitEvent(req, 'scrolitha:settings_updated', { settings: data });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to update Scrolitha settings');
  }
});

router.get('/summary', requirePermission('scrolitha.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await getScrolithaManagedSummary() });
  } catch (error) {
    return handleError(res, error, 'Failed to load Scrolitha summary');
  }
});

router.get('/ai-outputs', requirePermission('scrolitha.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await listAiOutputs() });
  } catch (error) {
    return handleError(res, error, 'Failed to load AI outputs');
  }
});

router.post('/ai-outputs', requirePermission('scrolitha.manage'), async (req, res) => {
  try {
    const data = await createAiOutput({
      ...req.body,
      actorUserId: req.user?.id || null,
      actorStaffId: req.staffContext?.staffId || null
    });
    await recordGovernedAdminAction(req, {
      moduleKey: 'scrolitha',
      actionKey: 'ai_output_create',
      entityType: 'ai_task_output',
      entityId: data.id,
      message: `AI output recorded for ${data.moduleKey}`,
      metadata: { aiOutput: data }
    });
    await publishIntegrationEvent('scrolitha.ai_output.created', {
      aiOutputId: data.id,
      moduleKey: data.moduleKey,
      taskType: data.taskType,
      entityType: data.entityType,
      entityId: data.entityId,
      humanOverrideState: data.humanOverrideState
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to create AI output');
  }
});

router.post('/ai-outputs/:id/review', requirePermission('scrolitha.manage'), async (req, res) => {
  try {
    const data = await updateAiOutputReview(req.params.id, req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'scrolitha',
      actionKey: 'ai_output_review',
      entityType: 'ai_task_output',
      entityId: data.id,
      message: `AI output review updated: ${data.humanOverrideState}`,
      metadata: { aiOutput: data }
    });
    await publishIntegrationEvent('scrolitha.ai_output.reviewed', {
      aiOutputId: data.id,
      moduleKey: data.moduleKey,
      taskType: data.taskType,
      entityType: data.entityType,
      entityId: data.entityId,
      humanOverrideState: data.humanOverrideState
    });
    emitEvent(req, 'scrolitha:review_updated', { aiOutputId: data.id, state: data.humanOverrideState });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to update AI output review');
  }
});

router.get('/projects', requirePermission('managed_delivery.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await listManagedProjects() });
  } catch (error) {
    return handleError(res, error, 'Failed to load managed projects');
  }
});

router.post('/projects', requirePermission('managed_delivery.manage'), async (req, res) => {
  try {
    const data = await saveManagedProject(req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'managed_delivery',
      actionKey: 'project_create',
      entityType: 'managed_project',
      entityId: data.id,
      message: `Managed project created: ${data.title}`,
      metadata: { project: data }
    });
    await publishIntegrationEvent('managed_delivery.project.created', {
      projectId: data.id,
      title: data.title,
      entityType: data.entityType,
      entityId: data.entityId,
      status: data.status,
      riskLevel: data.riskLevel
    });
    emitEvent(req, 'managed-delivery:project_updated', { projectId: data.id, status: data.status, riskLevel: data.riskLevel });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to create managed project');
  }
});

router.put('/projects/:id', requirePermission('managed_delivery.manage'), async (req, res) => {
  try {
    const data = await saveManagedProject(req.body || {}, req.params.id);
    await recordGovernedAdminAction(req, {
      moduleKey: 'managed_delivery',
      actionKey: 'project_update',
      entityType: 'managed_project',
      entityId: data.id,
      message: `Managed project updated: ${data.title}`,
      metadata: { project: data }
    });
    await publishIntegrationEvent('managed_delivery.project.updated', {
      projectId: data.id,
      title: data.title,
      entityType: data.entityType,
      entityId: data.entityId,
      status: data.status,
      riskLevel: data.riskLevel
    });
    emitEvent(req, 'managed-delivery:project_updated', { projectId: data.id, status: data.status, riskLevel: data.riskLevel });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to update managed project');
  }
});

router.post('/milestones', requirePermission('managed_delivery.manage'), async (req, res) => {
  try {
    const data = await saveManagedMilestone(req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'managed_delivery',
      actionKey: 'milestone_create',
      entityType: 'managed_milestone',
      entityId: data.id,
      message: `Managed milestone saved: ${data.title}`,
      metadata: { milestone: data }
    });
    await publishIntegrationEvent('managed_delivery.milestone.created', {
      milestoneId: data.id,
      managedProjectId: data.managedProjectId,
      title: data.title,
      status: data.status,
      qaStatus: data.qaStatus
    });
    emitEvent(req, 'managed-delivery:milestone_updated', { milestoneId: data.id, projectId: data.managedProjectId, status: data.status });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to create managed milestone');
  }
});

router.put('/milestones/:id', requirePermission('managed_delivery.manage'), async (req, res) => {
  try {
    const data = await saveManagedMilestone(req.body || {}, req.params.id);
    await recordGovernedAdminAction(req, {
      moduleKey: 'managed_delivery',
      actionKey: 'milestone_update',
      entityType: 'managed_milestone',
      entityId: data.id,
      message: `Managed milestone updated: ${data.title}`,
      metadata: { milestone: data }
    });
    await publishIntegrationEvent('managed_delivery.milestone.updated', {
      milestoneId: data.id,
      managedProjectId: data.managedProjectId,
      title: data.title,
      status: data.status,
      qaStatus: data.qaStatus
    });
    emitEvent(req, 'managed-delivery:milestone_updated', { milestoneId: data.id, projectId: data.managedProjectId, status: data.status });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to update managed milestone');
  }
});

router.post('/assignments', requirePermission('managed_delivery.manage'), async (req, res) => {
  try {
    const data = await saveManagedAssignment(req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'managed_delivery',
      actionKey: 'assignment_upsert',
      entityType: 'managed_assignment',
      entityId: data.id,
      message: `Managed assignment updated: ${data.role}`,
      metadata: { assignment: data }
    });
    await publishIntegrationEvent('managed_delivery.assignment.updated', {
      assignmentId: data.id,
      managedProjectId: data.managedProjectId,
      assigneeStaffId: data.assigneeStaffId,
      role: data.role,
      status: data.status
    });
    emitEvent(req, 'managed-delivery:assignment_updated', { assignmentId: data.id, projectId: data.managedProjectId, status: data.status });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to save managed assignment');
  }
});

router.get('/escalation-rules', requirePermission('managed_delivery.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await listEscalationRules() });
  } catch (error) {
    return handleError(res, error, 'Failed to load escalation rules');
  }
});

router.post('/escalation-rules', requirePermission('managed_delivery.manage'), async (req, res) => {
  try {
    const data = await saveEscalationRule(req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'managed_delivery',
      actionKey: 'escalation_rule_create',
      entityType: 'managed_escalation_rule',
      entityId: data.id,
      message: `Escalation rule created: ${data.code}`,
      metadata: { escalationRule: data }
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to create escalation rule');
  }
});

router.put('/escalation-rules/:id', requirePermission('managed_delivery.manage'), async (req, res) => {
  try {
    const data = await saveEscalationRule(req.body || {}, req.params.id);
    await recordGovernedAdminAction(req, {
      moduleKey: 'managed_delivery',
      actionKey: 'escalation_rule_update',
      entityType: 'managed_escalation_rule',
      entityId: data.id,
      message: `Escalation rule updated: ${data.code}`,
      metadata: { escalationRule: data }
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to update escalation rule');
  }
});

export default router;
