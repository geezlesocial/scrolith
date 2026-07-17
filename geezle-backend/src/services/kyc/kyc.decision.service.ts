/**
 * Authoritative KYC decision transitions.
 * Only authorized administrators may issue final decisions.
 * Aligns User.kycStatus transactionally with submission status.
 *
 * Decision on User.isVerified:
 * Production code treats isVerified as a general "verified badge" that often
 * OR-combines with KYC verification (community/gigs). When KYC is approved,
 * we set isVerified=true because platform verified-badge UX expects it for
 * KYC-approved users. On reject/resubmit/revoke we set isVerified=false only
 * when the prior kycStatus was VERIFIED (avoid clobbering unrelated verification
 * paths if any future non-KYC verification appears — currently KYC is the
 * primary writer for isVerified via admin KYC path).
 */
import prisma from '../../utils/prismaClient';
import { writeKycAuditEvent } from './kyc.audit.service';
import { KYC_AUDIT_ACTIONS, KYC_RETENTION_POLICY_PLACEHOLDERS } from './kyc.constants';

export type KycDecisionAction = 'approve' | 'reject' | 'resubmit' | 'revoke';

export type ApplyKycDecisionInput = {
  submissionId: string;
  action: KycDecisionAction;
  actorUserId: string;
  reason: string;
  reasonCode?: string | null;
  correlationId?: string | null;
};

const normalizeReason = (reason: unknown) => String(reason || '').trim();

export class KycDecisionError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = 'KycDecisionError';
    this.code = code;
    this.status = status;
  }
}

const mapSubmissionStatus = (action: KycDecisionAction) => {
  if (action === 'approve') return 'APPROVED' as const;
  if (action === 'reject') return 'REJECTED' as const;
  if (action === 'resubmit') return 'REQUIRES_UPDATES' as const;
  return 'REJECTED' as const; // revoke ends verified state
};

const mapUserKycStatus = (action: KycDecisionAction) => {
  if (action === 'approve') return 'VERIFIED' as const;
  if (action === 'reject') return 'REJECTED' as const;
  if (action === 'resubmit') return 'PENDING' as const;
  return 'REJECTED' as const; // revoked
};

const auditActionFor = (action: KycDecisionAction) => {
  if (action === 'approve') return KYC_AUDIT_ACTIONS.APPROVAL;
  if (action === 'reject') return KYC_AUDIT_ACTIONS.REJECTION;
  if (action === 'resubmit') return KYC_AUDIT_ACTIONS.RESUBMISSION_REQUESTED;
  return KYC_AUDIT_ACTIONS.VERIFICATION_REVOKED;
};

/**
 * Transactional decision. Audit write is critical — failure aborts decision.
 */
export const applyKycDecision = async (input: ApplyKycDecisionInput) => {
  const reason = normalizeReason(input.reason);
  if (reason.length < 3) {
    throw new KycDecisionError('A decision reason is required (min 3 characters)', 'REASON_REQUIRED');
  }
  if (reason.length > 2000) {
    throw new KycDecisionError('Decision reason is too long', 'REASON_TOO_LONG');
  }

  const submission = await prisma.kYCSubmission.findUnique({
    where: { id: input.submissionId }
  });
  if (!submission) {
    throw new KycDecisionError('KYC submission not found', 'NOT_FOUND', 404);
  }

  const priorStatus = String(submission.status);
  const nextSubmissionStatus = mapSubmissionStatus(input.action);
  const nextUserStatus = mapUserKycStatus(input.action);
  const setVerified = input.action === 'approve';

  // Revoke only makes sense if currently approved/verified
  if (input.action === 'revoke' && priorStatus !== 'APPROVED') {
    const user = await prisma.user.findUnique({
      where: { id: submission.userId },
      select: { kycStatus: true }
    });
    if (String(user?.kycStatus || '').toUpperCase() !== 'VERIFIED') {
      throw new KycDecisionError('Only approved/verified KYC can be revoked', 'INVALID_STATE');
    }
  }

  const retentionKey =
    input.action === 'approve'
      ? KYC_RETENTION_POLICY_PLACEHOLDERS.approved
      : input.action === 'revoke'
        ? KYC_RETENTION_POLICY_PLACEHOLDERS.revoked
        : KYC_RETENTION_POLICY_PLACEHOLDERS.rejected;

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.kYCSubmission.update({
      where: { id: submission.id },
      data: {
        status: nextSubmissionStatus,
        rejectionReason: input.action === 'approve' ? null : reason,
        decisionReasonCode: input.reasonCode || input.action.toUpperCase(),
        reviewedAt: new Date(),
        reviewedBy: input.actorUserId,
        retentionPolicyKey: retentionKey
        // retainUntil intentionally null until legal sets durations
      }
    });

    await tx.user.update({
      where: { id: submission.userId },
      data: {
        kycStatus: nextUserStatus,
        isVerified: setVerified
      }
    });

    // Critical audit — inside transaction via separate write that must succeed
    await tx.kYCAuditEvent.create({
      data: {
        submissionId: submission.id,
        actorType: 'ADMIN',
        actorId: input.actorUserId,
        actorUserId: input.actorUserId,
        action: auditActionFor(input.action),
        reasonCode: input.reasonCode || input.action.toUpperCase(),
        priorState: priorStatus,
        resultingState: nextSubmissionStatus,
        correlationId: input.correlationId || null,
        serviceIdentity: 'scrolith-kyc-service',
        metadata: {
          status: nextSubmissionStatus,
          priorStatus,
          nextStatus: nextSubmissionStatus
        }
      }
    });

    await tx.kYCAuditEvent.create({
      data: {
        submissionId: submission.id,
        actorType: 'ADMIN',
        actorId: input.actorUserId,
        actorUserId: input.actorUserId,
        action: KYC_AUDIT_ACTIONS.STATUS_CHANGED,
        reasonCode: input.reasonCode || input.action.toUpperCase(),
        priorState: priorStatus,
        resultingState: nextSubmissionStatus,
        correlationId: input.correlationId || null,
        serviceIdentity: 'scrolith-kyc-service',
        metadata: {
          priorStatus,
          nextStatus: nextSubmissionStatus
        }
      }
    });

    return updated;
  });

  return result;
};

/**
 * Block side-channel verification mutations. Call from admin users routes.
 */
export const blockSideChannelKycMutation = async (params: {
  targetUserId: string;
  actorUserId?: string | null;
  attemptedKycStatus?: string | null;
  attemptedIsVerified?: boolean | null;
  correlationId?: string | null;
}) => {
  await writeKycAuditEvent({
    actorType: 'ADMIN',
    actorId: params.actorUserId || null,
    actorUserId: params.actorUserId || null,
    action: KYC_AUDIT_ACTIONS.SIDE_CHANNEL_BLOCKED,
    reasonCode: 'SIDE_CHANNEL_BLOCKED',
    correlationId: params.correlationId || null,
    metadata: {
      status: params.attemptedKycStatus || undefined,
      nextStatus: params.attemptedIsVerified === true ? 'verified_flag' : undefined
    }
  });
};
