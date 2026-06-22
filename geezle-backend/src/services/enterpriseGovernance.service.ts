import { Request } from 'express';
import { createApprovalObservation } from './approvalPolicy.service';
import { extractRequestAuditMeta, writeAdminAuditEvent } from './adminAudit.service';

type RecordGovernedActionInput = {
  moduleKey: string;
  actionKey: string;
  entityType: string;
  entityId?: string | null;
  severity?: 'info' | 'warning' | 'critical' | string;
  status?: 'success' | 'denied' | 'error' | 'pending' | string;
  message?: string | null;
  metadata?: Record<string, any> | null;
  approvalActionKey?: string;
  approvalEntityType?: string;
  approvalTitle?: string;
  approvalSummary?: string | null;
  approvalPayload?: Record<string, any> | null;
};

export const recordGovernedAdminAction = async (req: Request, input: RecordGovernedActionInput) => {
  const requestMeta = await extractRequestAuditMeta(req);

  const auditEvent = await writeAdminAuditEvent({
    ...requestMeta,
    moduleKey: input.moduleKey,
    actionKey: input.actionKey,
    entityType: input.entityType,
    entityId: input.entityId || null,
    severity: input.severity,
    status: input.status,
    message: input.message || null,
    metadata: input.metadata || null
  });

  const approvalRecord =
    input.approvalActionKey || input.approvalEntityType || input.approvalTitle
      ? await createApprovalObservation({
          moduleKey: input.moduleKey,
          actionKey: input.approvalActionKey || input.actionKey,
          entityType: input.approvalEntityType || input.entityType,
          entityId: input.entityId || null,
          title: input.approvalTitle || input.message || `${input.moduleKey}:${input.actionKey}`,
          summary: input.approvalSummary || input.message || null,
          requestedByUserId: requestMeta.actorUserId,
          requestedByStaffId: requestMeta.actorStaffId,
          payload: input.approvalPayload || input.metadata || null,
          metadata: {
            auditEventId: auditEvent.id,
            ...(input.metadata || {})
          }
        })
      : null;

  return { auditEvent, approvalRecord };
};
